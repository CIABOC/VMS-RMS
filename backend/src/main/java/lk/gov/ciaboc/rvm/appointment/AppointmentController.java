package lk.gov.ciaboc.rvm.appointment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lk.gov.ciaboc.rvm.audit.AuditService;
import lk.gov.ciaboc.rvm.common.ApiException;
import lk.gov.ciaboc.rvm.common.CurrentUser;
import lk.gov.ciaboc.rvm.common.Details;
import lk.gov.ciaboc.rvm.security.Role;
import lk.gov.ciaboc.rvm.staff.StaffUser;
import lk.gov.ciaboc.rvm.staff.StaffUserRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Screen 09 - appointments. Receptionists manage every host's calendar;
 * host officers see and manage only their own.
 */
@RestController
@RequestMapping("/api/appointments")
@PreAuthorize("hasAnyRole('RECEPTIONIST','HOST_OFFICER')")
public class AppointmentController {
    private final AppointmentRepository appointments;
    private final StaffUserRepository staff;
    private final AuditService audit;

    public AppointmentController(AppointmentRepository appointments, StaffUserRepository staff, AuditService audit) {
        this.appointments = appointments;
        this.staff = staff;
        this.audit = audit;
    }

    public record AppointmentRequest(
            @NotNull Long hostId,
            Long visitorId,
            @NotBlank @Size(max = 200) String visitorName,
            @Size(max = 500) String purpose,
            @NotNull Instant startsAt,
            @NotNull Instant endsAt) {}

    public record AppointmentView(Long id, Long hostId, String hostName, Long visitorId, String visitorName,
                                  String purpose, Instant startsAt, Instant endsAt, String status) {
        static AppointmentView of(Appointment a) {
            return new AppointmentView(a.getId(), a.getHost().getId(), a.getHost().getFullName(), a.getVisitorId(),
                    a.getVisitorName(), a.getPurpose(), a.getStartsAt(), a.getEndsAt(), a.getStatus());
        }
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<AppointmentView> list(@RequestParam Instant from, @RequestParam Instant to,
                                      @RequestParam(required = false) Long hostId) {
        if (Duration.between(from, to).toDays() > 62) throw ApiException.badRequest("Choose a range of two months or less");
        Long effectiveHost = receptionist() ? hostId : me().getId();
        List<Appointment> list = effectiveHost == null
                ? appointments.findInRange(from, to)
                : appointments.findInRangeForHost(effectiveHost, from, to);
        return list.stream().map(AppointmentView::of).toList();
    }

    @PostMapping
    @Transactional
    public AppointmentView create(@Valid @RequestBody AppointmentRequest r) {
        if (!r.endsAt().isAfter(r.startsAt())) throw ApiException.badRequest("End time must be after start time");
        if (r.startsAt().isBefore(Instant.now().minus(Duration.ofMinutes(5))))
            throw ApiException.badRequest("Appointments cannot be booked in the past");
        StaffUser host = staff.findById(r.hostId())
                .filter(s -> s.isActive() && s.getRoles().contains(Role.HOST_OFFICER))
                .orElseThrow(() -> ApiException.badRequest("Select an active host officer"));
        if (!receptionist() && !host.getId().equals(me().getId()))
            throw ApiException.forbidden("Host officers can only book their own calendar");
        if (appointments.overlaps(host.getId(), r.startsAt(), r.endsAt()))
            throw ApiException.conflict(host.getFullName() + " already has an appointment that overlaps this time");

        Appointment a = new Appointment();
        a.setHost(host);
        a.setVisitorId(r.visitorId());
        a.setVisitorName(r.visitorName().trim());
        a.setPurpose(r.purpose() == null || r.purpose().isBlank() ? null : r.purpose().trim());
        a.setStartsAt(r.startsAt());
        a.setEndsAt(r.endsAt());
        a.setCreatedBy(CurrentUser.email());
        appointments.save(a);   // the database exclusion constraint is the final guard against races
        audit.record("APPOINTMENT_CREATED", "APPOINTMENT", a.getId(),
                Details.of("hostId", host.getId(), "startsAt", a.getStartsAt(), "endsAt", a.getEndsAt()));
        return AppointmentView.of(a);
    }

    @PostMapping("/{id}/cancel")
    @Transactional
    public AppointmentView cancel(@PathVariable Long id) {
        Appointment a = appointments.findById(id).orElseThrow(() -> ApiException.notFound("Appointment"));
        if (!receptionist() && !a.getHost().getId().equals(me().getId()))
            throw ApiException.forbidden("You can only cancel your own appointments");
        if (!Appointment.SCHEDULED.equals(a.getStatus())) throw ApiException.conflict("Only scheduled appointments can be cancelled");
        a.setStatus(Appointment.CANCELLED);
        audit.record("APPOINTMENT_CANCELLED", "APPOINTMENT", a.getId(), null);
        return AppointmentView.of(a);
    }

    private boolean receptionist() {
        return CurrentUser.hasRole(Role.RECEPTIONIST);
    }

    private StaffUser me() {
        return staff.findByEmailIgnoreCase(CurrentUser.email()).orElseThrow(() -> ApiException.forbidden("Unknown user"));
    }
}
