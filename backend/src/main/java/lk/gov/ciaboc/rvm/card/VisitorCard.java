package lk.gov.ciaboc.rvm.card;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** One issue of a temporary visitor NFC card for a visit. */
@Entity
@Table(name = "visitor_card")
@Getter
@Setter
public class VisitorCard {
    public static final String ISSUED = "ISSUED";
    public static final String RETURNED = "RETURNED";
    public static final String REPLACED = "REPLACED";
    public static final String LOST = "LOST";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long visitId;
    private String cardUid;
    private String cardType;
    private String payloadSha256;
    private Integer payloadBytes;
    private String status = ISSUED;
    private Instant issuedAt = Instant.now();
    private String issuedBy;
    private Instant returnedAt;
    private String returnedBy;
    private boolean erased;
    private String note;
}
