package lk.gov.ciaboc.rvm.masterdata;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VisitorCategoryRepository extends JpaRepository<VisitorCategory, Long> {
    List<VisitorCategory> findAllByOrderByNameAsc();

    List<VisitorCategory> findByActiveTrueOrderByNameAsc();
}
