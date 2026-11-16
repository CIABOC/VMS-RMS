package lk.gov.ciaboc.rvm.vehicle;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "vehicle_movement")
@Getter
@Setter
public class VehicleMovement {
    public static final String ENTRY = "ENTRY";
    public static final String EXIT = "EXIT";
    public static final String ADMITTED = "ADMITTED";
    public static final String DENIED = "DENIED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long vehicleId;
    private String direction;
    private String decision;
    private String reason;
    private Long visitId;
    private String driverName;
    private String gate;
    private Instant occurredAt = Instant.now();
    private String recordedBy;
}
