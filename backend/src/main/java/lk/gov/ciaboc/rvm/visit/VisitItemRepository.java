package lk.gov.ciaboc.rvm.visit;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VisitItemRepository extends JpaRepository<VisitItem, Long> {
    List<VisitItem> findByVisitIdOrderByIdAsc(Long visitId);

    long countByVisitId(Long visitId);
}
