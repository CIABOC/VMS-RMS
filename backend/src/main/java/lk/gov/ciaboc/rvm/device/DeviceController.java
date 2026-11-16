package lk.gov.ciaboc.rvm.device;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lk.gov.ciaboc.rvm.audit.AuditService;
import lk.gov.ciaboc.rvm.common.ApiException;
import lk.gov.ciaboc.rvm.common.CurrentUser;
import lk.gov.ciaboc.rvm.common.Details;
import lk.gov.ciaboc.rvm.config.AppProperties;
import lk.gov.ciaboc.rvm.visit.Visit;
import lk.gov.ciaboc.rvm.visit.VisitRepository;
import lk.gov.ciaboc.rvm.visit.VisitStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Screen 12 - device custody (phones, laptops, recorders handed in at reception). */
@RestController
@RequestMapping("/api/devices")
@PreAuthorize("hasRole('RECEPTIONIST')")
public class DeviceController {
    private static final Set<VisitStatus> CAN_HAND_OVER =
            EnumSet.of(VisitStatus.WAITING, VisitStatus.DELAYED, VisitStatus.ACCEPTED, VisitStatus.IN_PREMISES);

    private final DeviceCustodyRepository devices;
    private final VisitRepository visits;
    private final AuditService audit;
    private final AppProperties props;

    public DeviceController(DeviceCustodyRepository devices, VisitRepository visits, AuditService audit, AppProperties props) {
        this.devices = devices;
        this.visits = visits;
        this.audit = audit;
        this.props = props;
    }

    public record HandOver(@NotNull Long visitId, @NotBlank @Size(max = 30) String tagNo,
                           @NotBlank @Size(max = 50) String deviceType, @Size(max = 300) String description) {}

    public record DeviceView(Long id, String tagNo, String deviceType, String description, String status,
                             Instant receivedAt, String receivedBy, Instant returnedAt, String returnedBy,
                             Long visitId, Integer tokenNo, String visitorName, VisitStatus visitStatus) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<DeviceView> list(@RequestParam(defaultValue = "HELD") String status) {
        List<DeviceCustody> list = DeviceCustody.RETURNED.equals(status)
                ? devices.findByStatusAndReturnedAtGreaterThanEqualOrderByReturnedAtDesc(DeviceCustody.RETURNED, props.startOfToday())
                : devices.findByStatusOrderByReceivedAtAsc(DeviceCustody.HELD);
        Map<Long, Visit> byId = visits.findAllById(list.stream().map(DeviceCustody::getVisitId).distinct().toList())
                .stream().collect(Collectors.toMap(Visit::getId, Function.identity()));
        return list.stream().map(d -> view(d, byId.get(d.getVisitId()))).toList();
    }

    @PostMapping
    @Transactional
    public DeviceView handOver(@Valid @RequestBody HandOver r) {
        Visit v = visits.findById(r.visitId()).orElseThrow(() -> ApiException.notFound("Visit"));
        if (!CAN_HAND_OVER.contains(v.getStatus())) {
            throw ApiException.conflict("Devices can only be taken for visitors who have signed in and not left");
        }
        DeviceCustody d = new DeviceCustody();
        d.setVisitId(v.getId());
        d.setTagNo(r.tagNo().trim().toUpperCase());
        d.setDeviceType(r.deviceType().trim());
        d.setDescription(r.description() == null || r.description().isBlank() ? null : r.description().trim());
        d.setReceivedBy(CurrentUser.email());
        devices.saveAndFlush(d);   // flush now so a duplicate tag fails here with a clear message
        audit.record("DEVICE_RECEIVED", "VISIT", v.getId(), Details.of("tag", d.getTagNo(), "type", d.getDeviceType()));
        return view(d, v);
    }

    @PostMapping("/{id}/return")
    @Transactional
    public DeviceView returnDevice(@PathVariable Long id) {
        DeviceCustody d = devices.findById(id).orElseThrow(() -> ApiException.notFound("Device"));
        if (!DeviceCustody.HELD.equals(d.getStatus())) throw ApiException.conflict("This device has already been returned");
        d.setStatus(DeviceCustody.RETURNED);
        d.setReturnedAt(Instant.now());
        d.setReturnedBy(CurrentUser.email());
        audit.record("DEVICE_RETURNED", "VISIT", d.getVisitId(), Details.of("tag", d.getTagNo()));
        return view(d, visits.findById(d.getVisitId()).orElse(null));
    }

    private static DeviceView view(DeviceCustody d, Visit v) {
        return new DeviceView(d.getId(), d.getTagNo(), d.getDeviceType(), d.getDescription(), d.getStatus(),
                d.getReceivedAt(), d.getReceivedBy(), d.getReturnedAt(), d.getReturnedBy(), d.getVisitId(),
                v == null ? null : v.getTokenNo(), v == null ? null : v.getVisitor().getFullName(),
                v == null ? null : v.getStatus());
    }
}
