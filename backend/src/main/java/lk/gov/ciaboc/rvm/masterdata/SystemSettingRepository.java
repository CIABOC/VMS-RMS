package lk.gov.ciaboc.rvm.masterdata;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SystemSettingRepository extends JpaRepository<SystemSetting, String> {
    List<SystemSetting> findAllByOrderByKeyAsc();
}
