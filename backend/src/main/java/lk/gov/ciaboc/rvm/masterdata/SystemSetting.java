package lk.gov.ciaboc.rvm.masterdata;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "system_setting")
@Getter
@Setter
public class SystemSetting {
    @Id
    @Column(name = "setting_key")
    private String key;
    @Column(name = "setting_value")
    private String value;
    private String valueType;
    private String description;
    private Instant updatedAt;
    private String updatedBy;
}
