package lk.gov.ciaboc.rvm.visit;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** An item a visitor declares on arrival (documents, parcels, equipment). */
@Entity
@Table(name = "visit_item")
@Getter
@Setter
public class VisitItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long visitId;
    private String description;
    private int quantity = 1;
    private Instant recordedAt = Instant.now();
    private String recordedBy;
}
