package lk.gov.ciaboc.rvm.staff;

import lk.gov.ciaboc.rvm.security.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface StaffUserRepository extends JpaRepository<StaffUser, Long> {
    Optional<StaffUser> findByEmailIgnoreCase(String email);

    @Query("select distinct s from StaffUser s join s.roles r where r = :role and s.active = true order by s.fullName")
    List<StaffUser> findActiveByRole(Role role);

    List<StaffUser> findAllByOrderByFullNameAsc();
}
