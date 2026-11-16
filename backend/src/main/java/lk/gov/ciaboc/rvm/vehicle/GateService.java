package lk.gov.ciaboc.rvm.vehicle;

import jakarta.validation.constraints.*;
import lk.gov.ciaboc.rvm.audit.AuditService;
import lk.gov.ciaboc.rvm.common.ApiException;
import lk.gov.ciaboc.rvm.common.CurrentUser;
import lk.gov.ciaboc.rvm.common.Details;
import lk.gov.ciaboc.rvm.config.AppProperties;
import lk.gov.ciaboc.rvm.masterdata.SettingsService;
import lk.gov.ciaboc.rvm.security.Role;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional
public class GateService {
    private final VehicleRepository vehicles;
    private final VehicleMovementRepository movements;
    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final SettingsService settings;
    private final AppProperties props;

    public GateService(VehicleRepository vehicles, VehicleMovementRepository movements, JdbcTemplate jdbc,
                       AuditService audit, SettingsService settings, AppProperties props) {
        this.vehicles = vehicles;
        this.movements = movements;
        this.jdbc = jdbc;
        this.audit = audit;
        this.settings = settings;
        this.props = props;
    }

    // ---------------------------------------------------------------- DTOs
    public record VehicleRequest(@NotBlank @Size(max = 20) String plateNo,
                                 @NotBlank @Pattern(regexp = "STAFF|VISITOR|OFFICIAL|CONTRACTOR") String ownerType,
                                 @Size(max = 200) String ownerName, Long staffId,
                                 @Size(max = 100) String makeModel, @Size(max = 40) String colour) {}

    public record FlagRequest(boolean flagged, boolean blocked, @Size(max = 500) String reason) {}

    public record MovementRequest(@NotNull Long vehicleId,
                                  @NotBlank @Pattern(regexp = "ENTRY|EXIT") String direction,
                                  @NotBlank @Pattern(regexp = "ADMITTED|DENIED") String decision,
                                  @Size(max = 500) String reason, Long visitId,
                                  @Size(max = 200) String driverName, @Size(max = 50) String gate) {}

    public record MovementView(Long id, Long vehicleId, String plateNo, String ownerName, boolean flagged,
                               String direction, String decision, String reason, String driverName, String gate,
                               Instant occurredAt, String recordedBy) {}

    public record InsideVehicle(Long vehicleId, String plateNo, String ownerType, String ownerName,
                                boolean flagged, boolean blocked, Instant since, long minutesInside, boolean overstay) {}

    public record Lookup(String normalisedPlate, Vehicle vehicle, boolean inside, Instant insideSince,
                         List<MovementView> recent) {}

    // ---------------------------------------------------------------- screen 10
    @Transactional(readOnly = true)
    public Lookup lookup(String plate) {
        String p = Vehicle.normalisePlate(plate);
        if (p.length() < 2) throw ApiException.badRequest("Enter a vehicle number");
        Vehicle v = vehicles.findByPlateNo(p).orElse(null);
        if (v == null) return new Lookup(p, null, false, null, List.of());
        Instant since = insideSince(v.getId());
        List<MovementView> recent = movements.findByVehicleIdOrderByOccurredAtDescIdDesc(v.getId(), PageRequest.of(0, 10))
                .stream().map(m -> view(m, v)).toList();
        return new Lookup(p, v, since != null, since, recent);
    }

    public Vehicle register(VehicleRequest r) {
        String p = Vehicle.normalisePlate(r.plateNo());
        if (p.length() < 2) throw ApiException.badRequest("Enter a valid vehicle number");
        if (vehicles.findByPlateNo(p).isPresent()) throw ApiException.conflict("Vehicle " + p + " is already registered");
        Vehicle v = new Vehicle();
        v.setPlateNo(p);
        v.setOwnerType(r.ownerType());
        v.setOwnerName(blank(r.ownerName()));
        v.setStaffId(r.staffId());
        v.setMakeModel(blank(r.makeModel()));
        v.setColour(blank(r.colour()));
        v.setCreatedBy(CurrentUser.email());
        vehicles.save(v);
        audit.record("VEHICLE_REGISTERED", "VEHICLE", v.getId(), Details.of("plate", p, "ownerType", r.ownerType()));
        return v;
    }

    public Vehicle flag(Long id, FlagRequest r) {
        Vehicle v = vehicles.findById(id).orElseThrow(() -> ApiException.notFound("Vehicle"));
        if ((r.flagged() || r.blocked()) && (r.reason() == null || r.reason().isBlank()))
            throw ApiException.badRequest("Give a reason for flagging or blocking");
        v.setFlagged(r.flagged() || r.blocked());
        v.setBlocked(r.blocked());
        v.setFlagReason(v.isFlagged() ? r.reason().trim() : null);
        audit.record("VEHICLE_FLAG_CHANGED", "VEHICLE", v.getId(),
                Details.of("flagged", v.isFlagged(), "blocked", v.isBlocked(), "reason", v.getFlagReason()));
        return v;
    }

    public MovementView record(MovementRequest r) {
        Vehicle v = vehicles.findById(r.vehicleId()).orElseThrow(() -> ApiException.notFound("Vehicle"));
        boolean inside = insideSince(v.getId()) != null;
        String reason = blank(r.reason());

        if (VehicleMovement.ENTRY.equals(r.direction())) {
            if (VehicleMovement.ADMITTED.equals(r.decision())) {
                if (inside) throw ApiException.conflict(v.getPlateNo() + " is already recorded as inside. Record its exit first.");
                if (v.isBlocked()) {
                    if (!CurrentUser.hasRole(Role.SECURITY_SUPERVISOR))
                        throw ApiException.forbidden("This vehicle is blocked. Only a Security Supervisor can override.");
                    if (reason == null) throw ApiException.badRequest("Give the reason for overriding the block");
                } else if (v.isFlagged() && reason == null) {
                    throw ApiException.badRequest("This vehicle is flagged. Record why it is being admitted.");
                }
            } else if (reason == null) {
                throw ApiException.badRequest("Give the reason for denying entry");
            }
        } else {
            if (!VehicleMovement.ADMITTED.equals(r.decision())) throw ApiException.badRequest("An exit is always recorded as admitted");
            if (!inside) throw ApiException.conflict(v.getPlateNo() + " is not recorded as inside");
        }

        VehicleMovement m = new VehicleMovement();
        m.setVehicleId(v.getId());
        m.setDirection(r.direction());
        m.setDecision(r.decision());
        m.setReason(reason);
        m.setVisitId(r.visitId());
        m.setDriverName(blank(r.driverName()));
        m.setGate(blank(r.gate()));
        m.setRecordedBy(CurrentUser.email());
        movements.save(m);
        audit.record("VEHICLE_" + r.direction() + "_" + r.decision(), "VEHICLE", v.getId(),
                Details.of("plate", v.getPlateNo(), "reason", reason, "gate", m.getGate(),
                        "override", v.isBlocked() && VehicleMovement.ENTRY.equals(r.direction())
                                && VehicleMovement.ADMITTED.equals(r.decision())));
        return view(m, v);
    }

    // ---------------------------------------------------------------- screen 11
    @Transactional(readOnly = true)
    public List<InsideVehicle> inside() {
        int maxHours = settings.getInt(SettingsService.VEHICLE_MAX_STAY_HOURS);
        Map<Long, Instant> since = new LinkedHashMap<>();
        jdbc.query("""
                SELECT vehicle_id, occurred_at FROM (
                    SELECT DISTINCT ON (vehicle_id) vehicle_id, direction, occurred_at
                    FROM vehicle_movement WHERE decision = 'ADMITTED'
                    ORDER BY vehicle_id, occurred_at DESC, id DESC) last
                WHERE direction = 'ENTRY' ORDER BY occurred_at
                """, rs -> {
            since.put(rs.getLong(1), rs.getTimestamp(2).toInstant());
        });
        Map<Long, Vehicle> byId = vehicles.findAllById(since.keySet()).stream()
                .collect(Collectors.toMap(Vehicle::getId, Function.identity()));
        Instant now = Instant.now();
        return since.entrySet().stream().map(e -> {
            Vehicle v = byId.get(e.getKey());
            long minutes = Duration.between(e.getValue(), now).toMinutes();
            return new InsideVehicle(v.getId(), v.getPlateNo(), v.getOwnerType(), v.getOwnerName(), v.isFlagged(),
                    v.isBlocked(), e.getValue(), minutes, minutes > maxHours * 60L);
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<MovementView> movementsToday(int limit) {
        List<VehicleMovement> list = movements.findByOccurredAtGreaterThanEqualOrderByOccurredAtDescIdDesc(
                props.startOfToday(), PageRequest.of(0, Math.min(Math.max(limit, 1), 500)));
        Map<Long, Vehicle> byId = vehicles.findAllById(list.stream().map(VehicleMovement::getVehicleId).distinct().toList())
                .stream().collect(Collectors.toMap(Vehicle::getId, Function.identity()));
        return list.stream().map(m -> view(m, byId.get(m.getVehicleId()))).toList();
    }

    @Transactional(readOnly = true)
    public List<Vehicle> watchList() {
        return vehicles.findByFlaggedTrueOrBlockedTrueOrderByPlateNoAsc();
    }

    // ---------------------------------------------------------------- helpers
    private Instant insideSince(Long vehicleId) {
        List<VehicleMovement> last = movements.findByVehicleIdOrderByOccurredAtDescIdDesc(vehicleId, PageRequest.of(0, 20));
        for (VehicleMovement m : last) {
            if (!VehicleMovement.ADMITTED.equals(m.getDecision())) continue;
            return VehicleMovement.ENTRY.equals(m.getDirection()) ? m.getOccurredAt() : null;
        }
        return null;
    }

    private static MovementView view(VehicleMovement m, Vehicle v) {
        return new MovementView(m.getId(), m.getVehicleId(), v == null ? null : v.getPlateNo(),
                v == null ? null : v.getOwnerName(), v != null && v.isFlagged(), m.getDirection(), m.getDecision(),
                m.getReason(), m.getDriverName(), m.getGate(), m.getOccurredAt(), m.getRecordedBy());
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
