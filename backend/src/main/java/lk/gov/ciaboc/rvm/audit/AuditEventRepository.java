package lk.gov.ciaboc.rvm.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

public interface AuditEventRepository extends JpaRepository<AuditEvent, Long>, JpaSpecificationExecutor<AuditEvent> {
    Optional<AuditEvent> findTopByOrderByIdDesc();

    List<AuditEvent> findByEntityTypeAndEntityIdOrderByIdAsc(String entityType, String entityId);

    @Query("select distinct e.action from AuditEvent e order by e.action")
    List<String> distinctActions();

    @Query("select e from AuditEvent e order by e.id asc")
    Stream<AuditEvent> streamAllInOrder();
}
