package lk.gov.ciaboc.rvm.dashboard;

import lk.gov.ciaboc.rvm.common.ApiException;
import lk.gov.ciaboc.rvm.config.AppProperties;
import lk.gov.ciaboc.rvm.device.DeviceCustody;
import lk.gov.ciaboc.rvm.device.DeviceCustodyRepository;
import lk.gov.ciaboc.rvm.masterdata.SettingsService;
import lk.gov.ciaboc.rvm.vehicle.GateService;
import lk.gov.ciaboc.rvm.vehicle.GateService.InsideVehicle;
import lk.gov.ciaboc.rvm.vehicle.GateService.MovementView;
import lk.gov.ciaboc.rvm.vehicle.VehicleMovement;
import lk.gov.ciaboc.rvm.visit.Visit;
import lk.gov.ciaboc.rvm.visit.VisitDtos.VisitSummary;
import lk.gov.ciaboc.rvm.visit.VisitRepository;
import lk.gov.ciaboc.rvm.visit.VisitStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Date;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

/** Screens 02, 11 and 13. Everything is computed live from the database - no cached or sample figures. */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private final VisitRepository visits;
    private final DeviceCustodyRepository devices;
    private final GateService gate;
    private final SettingsService settings;
    private final AppProperties props;
    private final JdbcTemplate jdbc;

    public DashboardController(VisitRepository visits, DeviceCustodyRepository devices, GateService gate,
                               SettingsService settings, AppProperties props, JdbcTemplate jdbc) {
        this.visits = visits;
        this.devices = devices;
        this.gate = gate;
        this.settings = settings;
        this.props = props;
        this.jdbc = jdbc;
    }

    public record Alert(String severity, String message, Long visitId) {}

    public record WaitingVisit(VisitSummary visit, long minutesWaiting) {}

    public record ReceptionDashboard(LocalDate date, Map<VisitStatus, Long> counts, long total, long devicesHeld,
                                     List<WaitingVisit> waiting, List<Alert> alerts, int hostTimeoutMinutes) {}

    public record GateDashboard(long insideCount, long entriesToday, long exitsToday, long deniedToday,
                                int maxStayHours, List<InsideVehicle> inside, List<MovementView> exceptions,
                                List<MovementView> recent, long watchListCount) {}

    public record DayCount(LocalDate day, long total, long completed, long declined, long cancelled) {}
    public record NamedCount(String name, long count) {}
    public record VehicleDay(LocalDate day, long entries, long denied) {}

    public record ManagementDashboard(LocalDate from, LocalDate to, long totalVisits, long uniqueVisitors,
                                      Double avgHostResponseMinutes, Double avgVisitMinutes,
                                      List<DayCount> visitsByDay, List<NamedCount> byCategory,
                                      List<NamedCount> byDepartment, List<NamedCount> outcomes,
                                      List<VehicleDay> vehiclesByDay, long vehicleEntries, long vehicleDenials) {}

    // ------------------------------------------------------------------ 02 reception
    @GetMapping("/reception")
    @PreAuthorize("hasRole('RECEPTIONIST')")
    @Transactional(readOnly = true)
    public ReceptionDashboard reception() {
        LocalDate today = props.today();
        Instant now = Instant.now();
        int timeout = settings.getInt(SettingsService.HOST_RESPONSE_TIMEOUT_MINUTES);
        List<Visit> todays = visits.findByVisitDateOrderByIdAsc(today);

        Map<VisitStatus, Long> counts = new EnumMap<>(VisitStatus.class);
        for (VisitStatus s : VisitStatus.values()) counts.put(s, 0L);
        todays.forEach(v -> counts.merge(v.getStatus(), 1L, Long::sum));

        List<WaitingVisit> waiting = new ArrayList<>();
        List<Alert> alerts = new ArrayList<>();
        for (Visit v : todays) {
            if (v.getStatus() == VisitStatus.WAITING || v.getStatus() == VisitStatus.DELAYED) {
                Instant from = v.getSignedAt() == null ? v.getCreatedAt() : v.getSignedAt();
                long mins = Duration.between(from, now).toMinutes();
                waiting.add(new WaitingVisit(VisitSummary.of(v), mins));
                if (v.getStatus() == VisitStatus.WAITING && mins >= timeout) {
                    alerts.add(new Alert("warning", "Token " + v.getTokenNo() + ": " + v.getHost().getFullName()
                            + " has not responded for " + mins + " min", v.getId()));
                }
                if (v.getStatus() == VisitStatus.DELAYED && v.getDelayUntil() != null && v.getDelayUntil().isBefore(now)) {
                    alerts.add(new Alert("warning", "Token " + v.getTokenNo() + ": the host's delay has expired", v.getId()));
                }
            }
            if (v.getStatus() == VisitStatus.ACCEPTED) {
                alerts.add(new Alert("info", "Token " + v.getTokenNo() + " accepted by " + v.getHost().getFullName()
                        + " - approve entry", v.getId()));
            }
        }
        for (Visit v : visits.findByStatusOrderByEntryApprovedAtAsc(VisitStatus.IN_PREMISES)) {
            if (v.getVisitDate().isBefore(today)) {
                alerts.add(new Alert("serious", v.getVisitor().getFullName() + " (visit of " + v.getVisitDate()
                        + ") was never checked out", v.getId()));
            }
        }
        waiting.sort(Comparator.comparingLong(WaitingVisit::minutesWaiting).reversed());
        long held = devices.findByStatusOrderByReceivedAtAsc(DeviceCustody.HELD).size();
        return new ReceptionDashboard(today, counts, todays.size(), held, waiting, alerts, timeout);
    }

    // ------------------------------------------------------------------ 11 gate
    @GetMapping("/gate")
    @PreAuthorize("hasAnyRole('GATE_OFFICER','SECURITY_SUPERVISOR')")
    @Transactional(readOnly = true)
    public GateDashboard gate() {
        List<InsideVehicle> inside = gate.inside();
        List<MovementView> today = gate.movementsToday(500);
        long entries = today.stream().filter(m -> m.direction().equals(VehicleMovement.ENTRY)
                && m.decision().equals(VehicleMovement.ADMITTED)).count();
        long exits = today.stream().filter(m -> m.direction().equals(VehicleMovement.EXIT)).count();
        long denied = today.stream().filter(m -> m.decision().equals(VehicleMovement.DENIED)).count();
        List<MovementView> exceptions = today.stream()
                .filter(m -> m.decision().equals(VehicleMovement.DENIED) || m.flagged()).toList();
        return new GateDashboard(inside.size(), entries, exits, denied,
                settings.getInt(SettingsService.VEHICLE_MAX_STAY_HOURS), inside, exceptions,
                today.stream().limit(15).toList(), gate.watchList().size());
    }

    // ------------------------------------------------------------------ 13 management (aggregates only)
    @GetMapping("/management")
    @PreAuthorize("hasRole('MANAGEMENT')")
    @Transactional(readOnly = true)
    public ManagementDashboard management(@RequestParam(defaultValue = "30") int days) {
        if (days < 1 || days > 366) throw ApiException.badRequest("Choose between 1 and 366 days");
        LocalDate to = props.today();
        LocalDate from = to.minusDays(days - 1L);
        Date f = Date.valueOf(from), t = Date.valueOf(to);
        Instant fi = from.atStartOfDay(props.zone()).toInstant();
        Instant ti = to.plusDays(1).atStartOfDay(props.zone()).toInstant();

        List<DayCount> byDay = jdbc.query("""
                SELECT visit_date, count(*),
                       count(*) FILTER (WHERE status = 'COMPLETED' AND entry_approved_at IS NOT NULL),
                       -- a declined visitor is checked out without ever entering
                       count(*) FILTER (WHERE status = 'DECLINED' OR (status = 'COMPLETED' AND entry_approved_at IS NULL)),
                       count(*) FILTER (WHERE status = 'CANCELLED')
                FROM visit WHERE visit_date BETWEEN ? AND ? GROUP BY visit_date ORDER BY visit_date
                """, (rs, i) -> new DayCount(rs.getDate(1).toLocalDate(), rs.getLong(2), rs.getLong(3), rs.getLong(4), rs.getLong(5)), f, t);

        List<NamedCount> byCategory = jdbc.query("""
                SELECT c.name, count(*) FROM visit v JOIN visitor_category c ON c.id = v.category_id
                WHERE v.visit_date BETWEEN ? AND ? GROUP BY c.name ORDER BY count(*) DESC
                """, (rs, i) -> new NamedCount(rs.getString(1), rs.getLong(2)), f, t);

        List<NamedCount> byDepartment = jdbc.query("""
                SELECT coalesce(s.department, 'Not set'), count(*) FROM visit v JOIN staff_user s ON s.id = v.host_id
                WHERE v.visit_date BETWEEN ? AND ? GROUP BY 1 ORDER BY count(*) DESC
                """, (rs, i) -> new NamedCount(rs.getString(1), rs.getLong(2)), f, t);

        List<NamedCount> outcomes = jdbc.query("""
                SELECT status, count(*) FROM visit WHERE visit_date BETWEEN ? AND ? GROUP BY status ORDER BY count(*) DESC
                """, (rs, i) -> new NamedCount(rs.getString(1), rs.getLong(2)), f, t);

        Map<String, Object> totals = jdbc.queryForMap("""
                SELECT count(*) AS total, count(DISTINCT visitor_id) AS unique_visitors,
                       avg(extract(epoch FROM host_responded_at - signed_at) / 60)
                           FILTER (WHERE host_responded_at IS NOT NULL AND signed_at IS NOT NULL) AS avg_response,
                       avg(extract(epoch FROM checked_out_at - entry_approved_at) / 60)
                           FILTER (WHERE checked_out_at IS NOT NULL AND entry_approved_at IS NOT NULL) AS avg_visit
                FROM visit WHERE visit_date BETWEEN ? AND ?
                """, f, t);

        List<VehicleDay> vehiclesByDay = jdbc.query("""
                SELECT (occurred_at AT TIME ZONE ?)::date AS d,
                       count(*) FILTER (WHERE direction = 'ENTRY' AND decision = 'ADMITTED'),
                       count(*) FILTER (WHERE decision = 'DENIED')
                FROM vehicle_movement WHERE occurred_at >= ? AND occurred_at < ? GROUP BY d ORDER BY d
                """, (rs, i) -> new VehicleDay(rs.getDate(1).toLocalDate(), rs.getLong(2), rs.getLong(3)),
                props.zone().getId(), java.sql.Timestamp.from(fi), java.sql.Timestamp.from(ti));

        return new ManagementDashboard(from, to,
                ((Number) totals.get("total")).longValue(),
                ((Number) totals.get("unique_visitors")).longValue(),
                round(totals.get("avg_response")), round(totals.get("avg_visit")),
                byDay, byCategory, byDepartment, outcomes, vehiclesByDay,
                vehiclesByDay.stream().mapToLong(VehicleDay::entries).sum(),
                vehiclesByDay.stream().mapToLong(VehicleDay::denied).sum());
    }

    private static Double round(Object o) {
        if (o == null) return null;
        return Math.round(((Number) o).doubleValue() * 10) / 10.0;
    }
}
