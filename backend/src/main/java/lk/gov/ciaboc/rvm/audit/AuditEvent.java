package lk.gov.ciaboc.rvm.audit;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "audit_event")
@Getter
@Setter
public class AuditEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Instant occurredAt;
    private String actor;
    private String action;
    private String entityType;
    private String entityId;
    private String details;
    private String prevHash;
    private String hash;
}
