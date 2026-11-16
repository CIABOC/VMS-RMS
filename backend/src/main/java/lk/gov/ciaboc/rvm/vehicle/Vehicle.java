package lk.gov.ciaboc.rvm.vehicle;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "vehicle")
@Getter
@Setter
public class Vehicle {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String plateNo;
    private String ownerType;
    private String ownerName;
    private Long staffId;
    private String makeModel;
    private String colour;
    private boolean flagged;
    private boolean blocked;
    private String flagReason;
    private Instant createdAt = Instant.now();
    private String createdBy;

    /** Upper case, letters and digits only, so "wp cab-1234" and "WP CAB 1234" are the same vehicle. */
    public static String normalisePlate(String raw) {
        return raw == null ? "" : raw.toUpperCase().replaceAll("[^A-Z0-9]", "");
    }
}
