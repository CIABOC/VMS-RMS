package lk.gov.ciaboc.rvm.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import lk.gov.ciaboc.rvm.common.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.Map;
import java.util.stream.Stream;

/**
 * Writes the tamper-evident audit trail. Every event stores the hash of the previous event,
 * so changing or removing any row breaks the chain and is caught by {@link #verifyChain()}.
 */
@Service
public class AuditService {
    public static final String GENESIS = "0".repeat(64);

    private final AuditEventRepository repo;
    private final ObjectMapper json;
    private final EntityManager em;

    public AuditService(AuditEventRepository repo, ObjectMapper json, EntityManager em) {
        this.repo = repo;
        this.json = json;
        this.em = em;
    }

    public record ChainCheck(boolean valid, long checked, Long brokenAtId, Instant checkedAt) {}

    /** Records an event inside the caller's transaction, so the audit row and the change commit together. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(String action, String entityType, Object entityId, Map<String, ?> details) {
        // Serialise writers so two events never share the same previous hash.
        em.createNativeQuery("SELECT pg_advisory_xact_lock(4242001)").getSingleResult();

        String prev = repo.findTopByOrderByIdDesc().map(AuditEvent::getHash).orElse(GENESIS);
        AuditEvent e = new AuditEvent();
        e.setOccurredAt(Instant.now().truncatedTo(ChronoUnit.MICROS));   // PostgreSQL stores microseconds
        e.setActor(CurrentUser.email());
        e.setAction(action);
        e.setEntityType(entityType);
        e.setEntityId(entityId == null ? null : String.valueOf(entityId));
        e.setDetails(toJson(details));
        e.setPrevHash(prev);
        e.setHash(hash(e));
        repo.save(e);
    }

    @Transactional(readOnly = true)
    public ChainCheck verifyChain() {
        long checked = 0;
        String expectedPrev = GENESIS;
        try (Stream<AuditEvent> all = repo.streamAllInOrder()) {
            Iterator<AuditEvent> it = all.iterator();
            while (it.hasNext()) {
                AuditEvent e = it.next();
                checked++;
                if (!e.getPrevHash().equals(expectedPrev) || !e.getHash().equals(hash(e))) {
                    return new ChainCheck(false, checked, e.getId(), Instant.now());
                }
                expectedPrev = e.getHash();
                em.detach(e);
            }
        }
        return new ChainCheck(true, checked, null, Instant.now());
    }

    static String hash(AuditEvent e) {
        String material = String.join("|",
                e.getPrevHash(),
                e.getOccurredAt().toString(),
                nz(e.getActor()), nz(e.getAction()), nz(e.getEntityType()), nz(e.getEntityId()), nz(e.getDetails()));
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(material.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private String toJson(Map<String, ?> details) {
        if (details == null || details.isEmpty()) return null;
        try {
            return json.writeValueAsString(new java.util.TreeMap<>(details));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
