package lk.gov.ciaboc.rvm.device;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "device_custody")
@Getter
@Setter
public class DeviceCustody {
    public static final String HELD = "HELD";
    public static final String RETURNED = "RETURNED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long visitId;
    private String tagNo;
    private String deviceType;
    private String description;
    private String status = HELD;
    private Instant receivedAt = Instant.now();
    private String receivedBy;
    private Instant returnedAt;
    private String returnedBy;
}
