package lk.gov.ciaboc.rvm.visitor;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface VisitorRepository extends JpaRepository<Visitor, Long> {

    @Query("""
            select v from Visitor v
            where lower(v.fullName) like lower(concat('%', :q, '%'))
               or upper(v.idNumber) like upper(concat('%', :q, '%'))
               or v.mobile like concat('%', :q, '%')
            order by v.fullName
            """)
    List<Visitor> search(String q, Pageable pageable);

    @Query("select v from Visitor v where v.idType = :idType and upper(v.idNumber) = upper(:idNumber)")
    Optional<Visitor> findByIdentity(String idType, String idNumber);

    /** Possible duplicates: same document number under any type, same mobile, or same name. */
    @Query("""
            select v from Visitor v
            where upper(v.idNumber) = upper(:idNumber)
               or (:mobile <> '' and v.mobile = :mobile)
               or lower(v.fullName) = lower(:fullName)
            order by v.fullName
            """)
    List<Visitor> possibleDuplicates(String idNumber, String mobile, String fullName, Pageable pageable);
}
