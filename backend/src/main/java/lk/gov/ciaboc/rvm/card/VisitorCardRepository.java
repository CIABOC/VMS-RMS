package lk.gov.ciaboc.rvm.card;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface VisitorCardRepository extends JpaRepository<VisitorCard, Long> {
    List<VisitorCard> findByVisitIdOrderByIssuedAtDesc(Long visitId);

    Optional<VisitorCard> findFirstByVisitIdAndStatus(Long visitId, String status);

    Optional<VisitorCard> findFirstByCardUidAndStatus(String cardUid, String status);
}
