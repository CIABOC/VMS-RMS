package lk.gov.ciaboc.rvm.visitor;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "visitor")
@Getter
@Setter
public class Visitor {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String fullName;
    private String idType;
    private String idNumber;
    private String mobile;
    private String email;
    private String organization;
    private String address;
    private LocalDate dateOfBirth;

    // The scan bytes (id_scan, id_scan_content_type) are deliberately not mapped so searches never load them.
    // VisitorController reads and writes them with JDBC.
    private Instant idScanAt;

    private Instant createdAt = Instant.now();
    private String createdBy;

    public boolean isHasIdScan() {
        return idScanAt != null;
    }
}
