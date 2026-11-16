package lk.gov.ciaboc.rvm.masterdata;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RoleMappingRepository extends JpaRepository<RoleMapping, Long> {
    List<RoleMapping> findAllByOrderBySsoGroupAsc();
}
