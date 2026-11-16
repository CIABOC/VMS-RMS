package lk.gov.ciaboc.rvm.visit;

import jakarta.validation.Valid;
import lk.gov.ciaboc.rvm.visit.VisitDtos.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Screens 03-07 (reception side of a visit). */
@RestController
@RequestMapping("/api/visits")
@PreAuthorize("hasRole('RECEPTIONIST')")
public class VisitController {
    private final VisitService service;

    public VisitController(VisitService service) {
        this.service = service;
    }

    @GetMapping
    public List<VisitSummary> list(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                   @RequestParam(required = false) Set<VisitStatus> status) {
        return service.list(date, status);
    }

    @PostMapping
    public VisitSummary create(@Valid @RequestBody CreateVisit body) {
        return service.create(body);
    }

    @GetMapping("/{id}")
    public VisitDetail detail(@PathVariable Long id) {
        return service.detail(id);
    }

    @GetMapping("/{id}/verification")
    public VerificationStatus verification(@PathVariable Long id) {
        return service.verificationStatus(id);
    }

    @PostMapping("/{id}/verify")
    public VisitSummary verify(@PathVariable Long id, @Valid @RequestBody Verify body) {
        return service.verify(id, body);
    }

    @PostMapping("/{id}/sign")
    public VisitSummary sign(@PathVariable Long id, @Valid @RequestBody Sign body) {
        return service.sign(id, body);
    }

    @GetMapping("/{id}/signature")
    public Map<String, String> signature(@PathVariable Long id) {
        return Map.of("signaturePng", service.signature(id));
    }

    /** Reception may record a host's answer given by phone; it is audited as on-behalf. */
    @PostMapping("/{id}/host-response")
    public VisitSummary hostResponse(@PathVariable Long id, @Valid @RequestBody HostResponse body) {
        return service.hostRespond(id, body);
    }

    @PostMapping("/{id}/approve-entry")
    public VisitSummary approveEntry(@PathVariable Long id, @Valid @RequestBody ApproveEntry body) {
        return service.approveEntry(id, body);
    }

    @PostMapping("/{id}/items")
    public VisitItem addItem(@PathVariable Long id, @Valid @RequestBody AddItem body) {
        return service.addItem(id, body);
    }

    @PostMapping("/{id}/check-out")
    public VisitSummary checkOut(@PathVariable Long id) {
        return service.checkOut(id);
    }

    @PostMapping("/{id}/cancel")
    public VisitSummary cancel(@PathVariable Long id, @Valid @RequestBody Cancel body) {
        return service.cancel(id, body);
    }
}
