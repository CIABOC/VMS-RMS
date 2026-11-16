package lk.gov.ciaboc.rvm.visit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

public interface VisitRepository extends JpaRepository<Visit, Long> {

    List<Visit> findByVisitDateOrderByIdAsc(LocalDate date);

    List<Visit> findByVisitDateAndStatusInOrderByIdAsc(LocalDate date, Collection<VisitStatus> statuses);

    List<Visit> findByVisitDateAndHostIdAndStatusInOrderByIdAsc(LocalDate date, Long hostId, Collection<VisitStatus> statuses);

    long countByVisitDateAndHostIdAndStatusNot(LocalDate date, Long hostId, VisitStatus status);

    /** Visitors still inside from earlier days (forgot to check out) are included in "in premises". */
    List<Visit> findByStatusOrderByEntryApprovedAtAsc(VisitStatus status);

    @Query("select coalesce(max(v.tokenNo), 0) from Visit v where v.visitDate = :date")
    int maxToken(LocalDate date);
}
