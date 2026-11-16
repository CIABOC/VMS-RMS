package lk.gov.ciaboc.rvm.audit;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Screen 15 - audit log. */
@RestController
@RequestMapping("/api/audit")
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN','SECURITY_SUPERVISOR')")
public class AuditController {
    private final AuditEventRepository repo;
    private final AuditService audit;

    public AuditController(AuditEventRepository repo, AuditService audit) {
        this.repo = repo;
        this.audit = audit;
    }

    public record PageResult<T>(List<T> items, int page, int size, long total, int totalPages) {}

    @GetMapping
    public PageResult<AuditEvent> search(@RequestParam(required = false) String actor,
                                         @RequestParam(required = false) String action,
                                         @RequestParam(required = false) String entityType,
                                         @RequestParam(required = false) String entityId,
                                         @RequestParam(required = false) Instant from,
                                         @RequestParam(required = false) Instant to,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "50") int size) {
        Specification<AuditEvent> spec = (root, q, cb) -> {
            List<Predicate> p = new ArrayList<>();
            if (notBlank(actor)) p.add(cb.like(cb.lower(root.get("actor")), "%" + actor.toLowerCase() + "%"));
            if (notBlank(action)) p.add(cb.equal(root.get("action"), action));
            if (notBlank(entityType)) p.add(cb.equal(root.get("entityType"), entityType));
            if (notBlank(entityId)) p.add(cb.equal(root.get("entityId"), entityId));
            if (from != null) p.add(cb.greaterThanOrEqualTo(root.get("occurredAt"), from));
            if (to != null) p.add(cb.lessThan(root.get("occurredAt"), to));
            return cb.and(p.toArray(Predicate[]::new));
        };
        Page<AuditEvent> result = repo.findAll(spec,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200), Sort.by(Sort.Direction.DESC, "id")));
        return new PageResult<>(result.getContent(), result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @GetMapping("/actions")
    public List<String> actions() {
        return repo.distinctActions();
    }

    @GetMapping("/verify")
    public AuditService.ChainCheck verify() {
        return audit.verifyChain();
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
