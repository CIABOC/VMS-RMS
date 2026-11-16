package lk.gov.ciaboc.rvm.masterdata;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** Versioned visitor acknowledgement in English, Sinhala and Tamil. Versions are never edited, only superseded. */
@Entity
@Table(name = "acknowledgement_text")
@Getter
@Setter
public class AcknowledgementText {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private int version;
    private String textEn;
    private String textSi;
    private String textTa;
    private boolean active;
    private Instant createdAt = Instant.now();
    private String createdBy;
}
