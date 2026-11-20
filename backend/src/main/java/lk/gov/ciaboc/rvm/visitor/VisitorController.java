package lk.gov.ciaboc.rvm.visitor;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lk.gov.ciaboc.rvm.audit.AuditService;
import lk.gov.ciaboc.rvm.common.ApiException;
import lk.gov.ciaboc.rvm.common.CurrentUser;
import lk.gov.ciaboc.rvm.common.Details;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

/** Screens 03 and 04 - visitor profiles and identity scans. */
@RestController
@RequestMapping("/api/visitors")
@PreAuthorize("hasRole('RECEPTIONIST')")
public class VisitorController {
    private static final Set<String> SCAN_TYPES = Set.of("image/jpeg", "image/png", "application/pdf");

    private final VisitorRepository visitors;
    private final AuditService audit;
    private final JdbcTemplate jdbc;

    public VisitorController(VisitorRepository visitors, AuditService audit, JdbcTemplate jdbc) {
        this.visitors = visitors;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    public record VisitorRequest(
            @NotBlank @Size(max = 200) String fullName,
            @NotBlank @Pattern(regexp = "NIC|PASSPORT|DRIVING_LICENCE|OTHER") String idType,
            @NotBlank @Size(max = 50) String idNumber,
            @Size(max = 30) String mobile,
            @Email @Size(max = 255) String email,
            @Size(max = 200) String organization,
            @Size(max = 500) String address,
            @Past LocalDate dateOfBirth) {}

    @GetMapping
    public List<Visitor> search(@RequestParam String q) {
        String term = q == null ? "" : q.trim();
        if (term.length() < 2) return List.of();
        return visitors.search(term, PageRequest.of(0, 20));
    }

    @GetMapping("/possible-duplicates")
    public List<Visitor> duplicates(@RequestParam String idNumber,
                                    @RequestParam(defaultValue = "") String mobile,
                                    @RequestParam(defaultValue = "") String fullName) {
        return visitors.possibleDuplicates(idNumber.trim(), mobile.trim(), fullName.trim(), PageRequest.of(0, 10));
    }

    @GetMapping("/{id}")
    public Visitor get(@PathVariable Long id) {
        return visitors.findById(id).orElseThrow(() -> ApiException.notFound("Visitor"));
    }

    @PostMapping
    @Transactional
    public Visitor create(@Valid @RequestBody VisitorRequest r) {
        visitors.findByIdentity(r.idType(), r.idNumber().trim()).ifPresent(existing -> {
            throw ApiException.conflict("A visitor with this " + r.idType() + " already exists (" + existing.getFullName()
                    + "). Select the existing profile instead.");
        });
        Visitor v = new Visitor();
        apply(v, r);
        v.setCreatedBy(CurrentUser.email());
        visitors.save(v);
        audit.record("VISITOR_CREATED", "VISITOR", v.getId(), Details.of("idType", v.getIdType()));
        return v;
    }

    @PutMapping("/{id}")
    @Transactional
    public Visitor update(@PathVariable Long id, @Valid @RequestBody VisitorRequest r) {
        Visitor v = get(id);
        visitors.findByIdentity(r.idType(), r.idNumber().trim())
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> { throw ApiException.conflict("Another visitor already uses this identity document"); });
        apply(v, r);
        audit.record("VISITOR_UPDATED", "VISITOR", v.getId(), null);
        return v;
    }

    @PostMapping(path = "/{id}/id-scan", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public Visitor uploadScan(@PathVariable Long id, @RequestParam("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) throw ApiException.badRequest("The scan file is empty");
        String type = file.getContentType();
        if (type == null || !SCAN_TYPES.contains(type)) throw ApiException.badRequest("Upload a JPEG, PNG or PDF scan");
        Visitor v = get(id);
        Instant now = Instant.now();
        jdbc.update("UPDATE visitor SET id_scan = ?, id_scan_content_type = ?, id_scan_at = ? WHERE id = ?",
                file.getBytes(), type, Timestamp.from(now), id);
        v.setIdScanAt(now);
        audit.record("VISITOR_ID_SCANNED", "VISITOR", v.getId(), Details.of("contentType", type, "bytes", file.getSize()));
        return v;
    }

    @GetMapping("/{id}/id-scan")
    @Transactional
    public ResponseEntity<byte[]> scan(@PathVariable Long id) {
        List<ResponseEntity<byte[]>> rows = jdbc.query(
                "SELECT id_scan, id_scan_content_type FROM visitor WHERE id = ? AND id_scan IS NOT NULL",
                (rs, i) -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(rs.getString(2)))
                        .cacheControl(CacheControl.noStore())
                        .body(rs.getBytes(1)),
                id);
        if (rows.isEmpty()) throw ApiException.notFound("Identity scan");
        audit.record("VISITOR_ID_SCAN_VIEWED", "VISITOR", id, null);   // viewing personal data is itself audited
        return rows.get(0);
    }

    private void apply(Visitor v, VisitorRequest r) {
        v.setFullName(r.fullName().trim());
        v.setIdType(r.idType());
        v.setIdNumber(r.idNumber().trim().toUpperCase());
        v.setMobile(blank(r.mobile()));
        v.setEmail(blank(r.email()));
        v.setOrganization(blank(r.organization()));
        v.setAddress(blank(r.address()));
        v.setDateOfBirth(r.dateOfBirth());
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
