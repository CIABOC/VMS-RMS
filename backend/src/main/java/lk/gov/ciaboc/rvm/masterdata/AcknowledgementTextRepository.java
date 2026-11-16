package lk.gov.ciaboc.rvm.masterdata;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface AcknowledgementTextRepository extends JpaRepository<AcknowledgementText, Long> {
    Optional<AcknowledgementText> findFirstByActiveTrue();

    List<AcknowledgementText> findAllByOrderByVersionDesc();

    @Query("select coalesce(max(a.version), 0) from AcknowledgementText a")
    int maxVersion();

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update AcknowledgementText a set a.active = false where a.active = true")
    void deactivateAll();
}
