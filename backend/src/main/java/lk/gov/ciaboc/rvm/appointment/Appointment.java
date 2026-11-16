package lk.gov.ciaboc.rvm.appointment;

import jakarta.persistence.*;
import lk.gov.ciaboc.rvm.staff.StaffUser;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "appointment")
@Getter
@Setter
public class Appointment {
    public static final String SCHEDULED = "SCHEDULED";
    public static final String CANCELLED = "CANCELLED";
    public static final String COMPLETED = "COMPLETED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.EAGER)
    @JoinColumn(name = "host_id")
    private StaffUser host;

    private Long visitorId;
    private String visitorName;
    private String purpose;
    private Instant startsAt;
    private Instant endsAt;
    private String status = SCHEDULED;
    private Instant createdAt = Instant.now();
    private String createdBy;
}
