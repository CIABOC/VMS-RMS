package lk.gov.ciaboc.rvm.visit;

import jakarta.persistence.EntityManager;
import lk.gov.ciaboc.rvm.appointment.Appointment;
import lk.gov.ciaboc.rvm.appointment.AppointmentRepository;
import lk.gov.ciaboc.rvm.audit.AuditEventRepository;
import lk.gov.ciaboc.rvm.audit.AuditService;
import lk.gov.ciaboc.rvm.common.ApiException;
import lk.gov.ciaboc.rvm.common.CurrentUser;
import lk.gov.ciaboc.rvm.common.Details;
import lk.gov.ciaboc.rvm.config.AppProperties;
import lk.gov.ciaboc.rvm.device.DeviceCustody;
import lk.gov.ciaboc.rvm.device.DeviceCustodyRepository;
import lk.gov.ciaboc.rvm.masterdata.AcknowledgementText;
import lk.gov.ciaboc.rvm.masterdata.AcknowledgementTextRepository;
import lk.gov.ciaboc.rvm.masterdata.SettingsService;
import lk.gov.ciaboc.rvm.masterdata.VisitorCategory;
import lk.gov.ciaboc.rvm.masterdata.VisitorCategoryRepository;
import lk.gov.ciaboc.rvm.security.Role;
import lk.gov.ciaboc.rvm.staff.StaffUser;
import lk.gov.ciaboc.rvm.staff.StaffUserRepository;
import lk.gov.ciaboc.rvm.visit.VisitDtos.*;
import lk.gov.ciaboc.rvm.visitor.Visitor;
import lk.gov.ciaboc.rvm.visitor.VisitorRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.EnumSet;
import java.util.List;

/** All visit state transitions. Each one checks the current state, applies the rule from the SRS and writes an audit event. */
@Service
@Transactional
public class VisitService {
    private static final String ENTITY = "VISIT";

    private final VisitRepository visits;
    private final VisitItemRepository items;
    private final VisitorRepository visitors;
    private final VisitorCategoryRepository categories;
    private final StaffUserRepository staff;
    private final AppointmentRepository appointments;
    private final AcknowledgementTextRepository ackTexts;
    private final DeviceCustodyRepository devices;
    private final AuditEventRepository auditEvents;
    private final AuditService audit;
    private final SettingsService settings;
    private final AppProperties props;
    private final EntityManager em;

    public VisitService(VisitRepository visits, VisitItemRepository items, VisitorRepository visitors,
                        VisitorCategoryRepository categories, StaffUserRepository staff,
                        AppointmentRepository appointments, AcknowledgementTextRepository ackTexts,
                        DeviceCustodyRepository devices, AuditEventRepository auditEvents, AuditService audit,
                        SettingsService settings, AppProperties props, EntityManager em) {
        this.visits = visits;
        this.items = items;
        this.visitors = visitors;
        this.categories = categories;
        this.staff = staff;
        this.appointments = appointments;
        this.ackTexts = ackTexts;
        this.devices = devices;
        this.auditEvents = auditEvents;
        this.audit = audit;
        this.settings = settings;
        this.props = props;
        this.em = em;
    }

    // ------------------------------------------------------------------ queries
    @Transactional(readOnly = true)
    public List<VisitSummary> list(LocalDate date, Collection<VisitStatus> statuses) {
        LocalDate d = date == null ? props.today() : date;
        List<Visit> list = statuses == null || statuses.isEmpty()
                ? visits.findByVisitDateOrderByIdAsc(d)
                : visits.findByVisitDateAndStatusInOrderByIdAsc(d, statuses);
        return list.stream().map(VisitSummary::of).toList();
    }

    @Transactional(readOnly = true)
    public VisitDetail detail(Long id) {
        Visit v = get(id);
        return new VisitDetail(VisitSummary.of(v), v.getVisitor(), v.getCategory().getId(),
                v.getCategory().isRequiresDeviceCustody(),
                v.getAppointment() == null ? null : v.getAppointment().getId(),
                v.getIdVerification(), v.getIdVerificationNote(), v.getVerifiedAt(), v.getVerifiedBy(),
                v.getAckTextId(), v.getAckLanguage(), v.getSignaturePng() != null,
                v.getEntryApprovedBy(),
                items.findByVisitIdOrderByIdAsc(id),
                devices.findByVisitIdOrderByReceivedAtAsc(id),
                auditEvents.findByEntityTypeAndEntityIdOrderByIdAsc(ENTITY, String.valueOf(id)));
    }

    @Transactional(readOnly = true)
    public String signature(Long id) {
        Visit v = get(id);
        if (v.getSignaturePng() == null) throw ApiException.notFound("Signature");
        return v.getSignaturePng();
    }

    @Transactional(readOnly = true)
    public VerificationStatus verificationStatus(Long id) {
        Visit v = get(id);
        Visitor visitor = v.getVisitor();
        int reuseDays = settings.getInt(SettingsService.ID_SCAN_REUSE_DAYS);
        Instant scannedAt = visitor.getIdScanAt();
        Long age = scannedAt == null ? null : Duration.between(scannedAt, Instant.now()).toDays();
        boolean reuseAllowed = scannedAt != null && age <= reuseDays;
        boolean scannedToday = scannedAt != null && !scannedAt.isBefore(props.startOfToday());
        return new VerificationStatus(scannedAt != null, scannedAt, age, reuseDays, reuseAllowed, scannedToday,
                v.getIdVerification());
    }

    @Transactional(readOnly = true)
    public List<VisitSummary> hostVisits() {
        StaffUser me = me();
        return visits.findByVisitDateAndHostIdAndStatusInOrderByIdAsc(props.today(), me.getId(), VisitStatus.HOST_ACTIVE)
                .stream().map(VisitSummary::of).toList();
    }

    @Transactional(readOnly = true)
    public List<QueueToken> publicQueue() {
        return visits.findByVisitDateAndStatusInOrderByIdAsc(props.today(), VisitStatus.ON_QUEUE).stream()
                .filter(v -> v.getTokenNo() != null)
                .map(v -> new QueueToken(v.getTokenNo(), switch (v.getStatus()) {
                    case ACCEPTED -> "PROCEED";
                    case DELAYED -> "DELAYED";
                    default -> "WAITING";
                }))
                .toList();
    }

    // ------------------------------------------------------------------ screen 03: register
    public VisitSummary create(CreateVisit r) {
        Visitor visitor = visitors.findById(r.visitorId()).orElseThrow(() -> ApiException.notFound("Visitor"));
        VisitorCategory category = categories.findById(r.categoryId()).filter(VisitorCategory::isActive)
                .orElseThrow(() -> ApiException.badRequest("Select an active visitor category"));
        StaffUser host = activeHost(r.hostId());
        LocalDate today = props.today();

        int limit = settings.getInt(SettingsService.MAX_VISITS_PER_HOST_PER_DAY);
        if (visits.countByVisitDateAndHostIdAndStatusNot(today, host.getId(), VisitStatus.CANCELLED) >= limit) {
            throw ApiException.conflict(host.getFullName() + " has reached the daily limit of " + limit + " visits");
        }

        Appointment appointment = null;
        if (r.appointmentId() != null) {
            appointment = appointments.findById(r.appointmentId()).orElseThrow(() -> ApiException.notFound("Appointment"));
            if (!Appointment.SCHEDULED.equals(appointment.getStatus()) || !appointment.getHost().getId().equals(host.getId())) {
                throw ApiException.badRequest("The appointment is not a scheduled appointment with this host");
            }
            LocalDate apptDay = appointment.getStartsAt().atZone(props.zone()).toLocalDate();
            if (!apptDay.equals(today)) throw ApiException.badRequest("The appointment is not for today");
        } else if (category.isRequiresAppointment()) {
            throw ApiException.badRequest("Visitors in the " + category.getName() + " category need an appointment");
        }

        Visit v = new Visit();
        v.setVisitor(visitor);
        v.setCategory(category);
        v.setHost(host);
        v.setAppointment(appointment);
        v.setPurpose(blank(r.purpose()));
        v.setVisitDate(today);
        v.setStatus(VisitStatus.PENDING_VERIFICATION);
        v.setCreatedBy(CurrentUser.email());
        visits.save(v);
        audit.record("VISIT_REGISTERED", ENTITY, v.getId(), Details.of(
                "visitorId", visitor.getId(), "categoryId", category.getId(), "hostId", host.getId(),
                "appointmentId", appointment == null ? null : appointment.getId()));
        return VisitSummary.of(v);
    }

    // ------------------------------------------------------------------ screen 04: identity verification
    public VisitSummary verify(Long id, Verify r) {
        Visit v = get(id);
        requireStatus(v, EnumSet.of(VisitStatus.PENDING_VERIFICATION));
        VerificationStatus st = verificationStatus(id);
        switch (r.method()) {
            case "REUSED_SCAN" -> {
                if (!st.reuseAllowed()) throw ApiException.badRequest(
                        "The stored scan cannot be reused (missing or older than " + st.reuseDays() + " days). Take a new scan.");
            }
            case "NEW_SCAN" -> {
                if (!st.scannedToday()) throw ApiException.badRequest("Upload the new identity scan first");
            }
            case "EXCEPTION" -> {
                if (r.note() == null || r.note().trim().length() < 10)
                    throw ApiException.badRequest("Explain the exception (at least 10 characters)");
            }
            default -> throw ApiException.badRequest("Unknown verification method");
        }
        v.setIdVerification(r.method());
        v.setIdVerificationNote(blank(r.note()));
        v.setVerifiedAt(Instant.now());
        v.setVerifiedBy(CurrentUser.email());
        v.setStatus(VisitStatus.PENDING_SIGNATURE);
        audit.record("VISIT_ID_VERIFIED", ENTITY, v.getId(), Details.of("method", r.method(), "note", blank(r.note())));
        return VisitSummary.of(v);
    }

    // ------------------------------------------------------------------ screen 05: signature
    public VisitSummary sign(Long id, Sign r) {
        Visit v = get(id);
        requireStatus(v, EnumSet.of(VisitStatus.PENDING_SIGNATURE));
        if (!r.signaturePng().startsWith("data:image/png;base64,") || r.signaturePng().length() < 200) {
            throw ApiException.badRequest("A signature is required");
        }
        AcknowledgementText ack = ackTexts.findFirstByActiveTrue()
                .orElseThrow(() -> ApiException.conflict("No acknowledgement text is published. Ask a System Administrator."));

        // Serialise token allocation for the day; the unique constraint is the final guard.
        em.createNativeQuery("SELECT pg_advisory_xact_lock(4242002)").getSingleResult();
        v.setTokenNo(visits.maxToken(v.getVisitDate()) + 1);
        v.setAckTextId(ack.getId());
        v.setAckLanguage(r.language());
        v.setSignaturePng(r.signaturePng());
        v.setSignedAt(Instant.now());
        v.setStatus(VisitStatus.WAITING);
        audit.record("VISIT_SIGNED", ENTITY, v.getId(),
                Details.of("ackVersion", ack.getVersion(), "language", r.language(), "token", v.getTokenNo()));
        audit.record("VISIT_HOST_NOTIFIED", ENTITY, v.getId(), Details.of("hostId", v.getHost().getId()));
        return VisitSummary.of(v);
    }

    // ------------------------------------------------------------------ screen 08: host response
    public VisitSummary hostRespond(Long id, HostResponse r) {
        Visit v = get(id);
        requireStatus(v, EnumSet.of(VisitStatus.WAITING, VisitStatus.DELAYED));
        boolean isHost = v.getHost().getEmail().equalsIgnoreCase(CurrentUser.email());
        if (!isHost && !CurrentUser.hasRole(Role.RECEPTIONIST)) {
            throw ApiException.forbidden("Only the host officer can respond to this visit");
        }
        Instant now = Instant.now();
        v.setHostRespondedAt(now);
        v.setHostResponseNote(blank(r.note()));
        switch (r.action()) {
            case "ACCEPT" -> {
                v.setStatus(VisitStatus.ACCEPTED);
                v.setDelayUntil(null);
            }
            case "DELAY" -> {
                if (r.delayMinutes() == null) throw ApiException.badRequest("Choose how long the visitor should wait");
                v.setStatus(VisitStatus.DELAYED);
                v.setDelayUntil(now.plus(Duration.ofMinutes(r.delayMinutes())));
            }
            case "REDIRECT" -> {
                if (r.redirectHostId() == null) throw ApiException.badRequest("Choose the officer to redirect to");
                StaffUser newHost = activeHost(r.redirectHostId());
                if (newHost.getId().equals(v.getHost().getId())) throw ApiException.badRequest("Choose a different officer");
                Long oldHost = v.getHost().getId();
                v.setHost(newHost);
                v.setStatus(VisitStatus.WAITING);
                v.setDelayUntil(null);
                v.setHostRespondedAt(null);   // the new host has not responded yet
                audit.record("VISIT_REDIRECTED", ENTITY, v.getId(), Details.of(
                        "fromHostId", oldHost, "toHostId", newHost.getId(), "note", blank(r.note()), "onBehalf", !isHost));
                return VisitSummary.of(v);
            }
            case "DECLINE" -> {
                if (r.note() == null || r.note().isBlank()) throw ApiException.badRequest("Give a reason for declining");
                v.setStatus(VisitStatus.DECLINED);
                v.setDelayUntil(null);
            }
            default -> throw ApiException.badRequest("Unknown action");
        }
        audit.record("VISIT_HOST_" + r.action(), ENTITY, v.getId(), Details.of(
                "delayMinutes", r.delayMinutes(), "note", blank(r.note()), "onBehalf", !isHost));
        return VisitSummary.of(v);
    }

    // ------------------------------------------------------------------ screen 07: entry, items, exit
    public VisitSummary approveEntry(Long id, ApproveEntry r) {
        Visit v = get(id);
        requireStatus(v, EnumSet.of(VisitStatus.ACCEPTED));
        if (v.getCategory().isRequiresDeviceCustody() && !r.deviceCustodyConfirmed()) {
            throw ApiException.badRequest("This category requires device custody. Take the visitor's devices on screen 12 and confirm.");
        }
        v.setBadgeNo(r.badgeNo().trim());
        v.setEntryApprovedAt(Instant.now());
        v.setEntryApprovedBy(CurrentUser.email());
        v.setStatus(VisitStatus.IN_PREMISES);
        audit.record("VISIT_ENTRY_APPROVED", ENTITY, v.getId(), Details.of(
                "badgeNo", v.getBadgeNo(), "devicesHeld", devices.countByVisitIdAndStatus(id, DeviceCustody.HELD)));
        return VisitSummary.of(v);
    }

    public VisitItem addItem(Long id, AddItem r) {
        Visit v = get(id);
        if (VisitStatus.CLOSED.contains(v.getStatus())) throw ApiException.conflict("The visit is closed");
        int max = settings.getInt(SettingsService.MAX_ITEMS_PER_VISIT);
        if (items.countByVisitId(id) >= max) throw ApiException.conflict("A visit can have at most " + max + " declared items");
        VisitItem item = new VisitItem();
        item.setVisitId(id);
        item.setDescription(r.description().trim());
        item.setQuantity(r.quantity());
        item.setRecordedBy(CurrentUser.email());
        items.save(item);
        audit.record("VISIT_ITEM_DECLARED", ENTITY, id, Details.of("description", item.getDescription(), "quantity", item.getQuantity()));
        return item;
    }

    public VisitSummary checkOut(Long id) {
        Visit v = get(id);
        requireStatus(v, EnumSet.of(VisitStatus.IN_PREMISES, VisitStatus.DECLINED));
        long held = devices.countByVisitIdAndStatus(id, DeviceCustody.HELD);
        if (held > 0) throw ApiException.conflict("Return the " + held + " device(s) held in custody before check-out");
        v.setCheckedOutAt(Instant.now());
        v.setStatus(VisitStatus.COMPLETED);
        if (v.getAppointment() != null && Appointment.SCHEDULED.equals(v.getAppointment().getStatus())) {
            v.getAppointment().setStatus(Appointment.COMPLETED);
        }
        audit.record("VISIT_CHECKED_OUT", ENTITY, v.getId(), null);
        return VisitSummary.of(v);
    }

    public VisitSummary cancel(Long id, Cancel r) {
        Visit v = get(id);
        requireStatus(v, VisitStatus.CANCELLABLE);
        if (devices.countByVisitIdAndStatus(id, DeviceCustody.HELD) > 0)
            throw ApiException.conflict("Return held devices before cancelling");
        v.setStatus(VisitStatus.CANCELLED);
        audit.record("VISIT_CANCELLED", ENTITY, v.getId(), Details.of("reason", r.reason().trim()));
        return VisitSummary.of(v);
    }

    // ------------------------------------------------------------------ helpers
    Visit get(Long id) {
        return visits.findById(id).orElseThrow(() -> ApiException.notFound("Visit"));
    }

    private StaffUser activeHost(Long id) {
        return staff.findById(id)
                .filter(s -> s.isActive() && s.getRoles().contains(Role.HOST_OFFICER))
                .orElseThrow(() -> ApiException.badRequest("Select an active host officer"));
    }

    private StaffUser me() {
        return staff.findByEmailIgnoreCase(CurrentUser.email()).orElseThrow(() -> ApiException.forbidden("Unknown user"));
    }

    private static void requireStatus(Visit v, Collection<VisitStatus> allowed) {
        if (!allowed.contains(v.getStatus())) {
            throw ApiException.conflict("This action is not possible while the visit is " + v.getStatus());
        }
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
