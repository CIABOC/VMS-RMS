package lk.gov.ciaboc.rvm.device;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface DeviceCustodyRepository extends JpaRepository<DeviceCustody, Long> {
    List<DeviceCustody> findByVisitIdOrderByReceivedAtAsc(Long visitId);

    long countByVisitIdAndStatus(Long visitId, String status);

    List<DeviceCustody> findByStatusOrderByReceivedAtAsc(String status);

    List<DeviceCustody> findByStatusAndReturnedAtGreaterThanEqualOrderByReturnedAtDesc(String status, Instant since);
}
