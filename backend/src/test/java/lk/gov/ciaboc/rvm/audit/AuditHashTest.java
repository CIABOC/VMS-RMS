package lk.gov.ciaboc.rvm.audit;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class AuditHashTest {

    private static AuditEvent event(String prev, String details) {
        AuditEvent e = new AuditEvent();
        e.setPrevHash(prev);
        e.setOccurredAt(Instant.parse("2026-11-16T04:30:00.123456Z"));
        e.setActor("reception@ciaboc.gov.lk");
        e.setAction("VISIT_REGISTERED");
        e.setEntityType("VISIT");
        e.setEntityId("42");
        e.setDetails(details);
        return e;
    }

    @Test
    void hashIsDeterministicAndHex() {
        String a = AuditService.hash(event(AuditService.GENESIS, "{\"hostId\":3}"));
        String b = AuditService.hash(event(AuditService.GENESIS, "{\"hostId\":3}"));
        assertThat(a).isEqualTo(b).hasSize(64).matches("[0-9a-f]+");
    }

    @Test
    void anyChangeToARowChangesItsHash() {
        String original = AuditService.hash(event(AuditService.GENESIS, "{\"hostId\":3}"));
        assertThat(AuditService.hash(event(AuditService.GENESIS, "{\"hostId\":4}"))).isNotEqualTo(original);
        assertThat(AuditService.hash(event("1".repeat(64), "{\"hostId\":3}"))).isNotEqualTo(original);
    }
}
