package lk.gov.ciaboc.rvm.visit;

import jakarta.persistence.*;
import lk.gov.ciaboc.rvm.appointment.Appointment;
import lk.gov.ciaboc.rvm.masterdata.VisitorCategory;
import lk.gov.ciaboc.rvm.staff.StaffUser;
import lk.gov.ciaboc.rvm.visitor.Visitor;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "visit")
@Getter
@Setter
public class Visit {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.EAGER)
    @JoinColumn(name = "visitor_id")
    private Visitor visitor;

    @ManyToOne(optional = false, fetch = FetchType.EAGER)
    @JoinColumn(name = "category_id")
    private VisitorCategory category;

    @ManyToOne(optional = false, fetch = FetchType.EAGER)
    @JoinColumn(name = "host_id")
    private StaffUser host;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "appointment_id")
    private Appointment appointment;

    private String purpose;
    private LocalDate visitDate;
    private Integer tokenNo;

    @Enumerated(EnumType.STRING)
    private VisitStatus status;

    private String idVerification;
    private String idVerificationNote;
    private Instant verifiedAt;
    private String verifiedBy;

    private Long ackTextId;
    private String ackLanguage;
    private String signaturePng;
    private Instant signedAt;

    private String hostResponseNote;
    private Instant hostRespondedAt;
    private Instant delayUntil;

    private String badgeNo;
    private Instant entryApprovedAt;
    private String entryApprovedBy;
    private Instant checkedOutAt;

    private Instant createdAt = Instant.now();
    private String createdBy;
}
