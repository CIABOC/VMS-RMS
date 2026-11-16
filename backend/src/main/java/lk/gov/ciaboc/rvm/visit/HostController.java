package lk.gov.ciaboc.rvm.visit;

import jakarta.validation.Valid;
import lk.gov.ciaboc.rvm.visit.VisitDtos.HostResponse;
import lk.gov.ciaboc.rvm.visit.VisitDtos.VisitSummary;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Screen 08 - host officer mobile view. */
@RestController
@RequestMapping("/api/host/visits")
@PreAuthorize("hasRole('HOST_OFFICER')")
public class HostController {
    private final VisitService service;

    public HostController(VisitService service) {
        this.service = service;
    }

    @GetMapping
    public List<VisitSummary> myVisits() {
        return service.hostVisits();
    }

    @PostMapping("/{id}/respond")
    public VisitSummary respond(@PathVariable Long id, @Valid @RequestBody HostResponse body) {
        return service.hostRespond(id, body);
    }
}
