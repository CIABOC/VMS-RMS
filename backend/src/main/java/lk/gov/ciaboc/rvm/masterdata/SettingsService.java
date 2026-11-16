package lk.gov.ciaboc.rvm.masterdata;

import lk.gov.ciaboc.rvm.audit.AuditService;
import lk.gov.ciaboc.rvm.common.ApiException;
import lk.gov.ciaboc.rvm.common.CurrentUser;
import lk.gov.ciaboc.rvm.common.Details;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/** Typed access to {@code system_setting}. Values are read fresh so admin changes apply immediately. */
@Service
public class SettingsService {
    public static final String ID_SCAN_REUSE_DAYS = "ID_SCAN_REUSE_DAYS";
    public static final String HOST_RESPONSE_TIMEOUT_MINUTES = "HOST_RESPONSE_TIMEOUT_MINUTES";
    public static final String VEHICLE_MAX_STAY_HOURS = "VEHICLE_MAX_STAY_HOURS";
    public static final String MAX_VISITS_PER_HOST_PER_DAY = "MAX_VISITS_PER_HOST_PER_DAY";
    public static final String MAX_ITEMS_PER_VISIT = "MAX_ITEMS_PER_VISIT";
    public static final String QUEUE_REFRESH_SECONDS = "QUEUE_REFRESH_SECONDS";

    private final SystemSettingRepository repo;
    private final AuditService audit;

    public SettingsService(SystemSettingRepository repo, AuditService audit) {
        this.repo = repo;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public int getInt(String key) {
        SystemSetting s = repo.findById(key)
                .orElseThrow(() -> new IllegalStateException("Missing system setting " + key + " - check database migrations"));
        return Integer.parseInt(s.getValue().trim());
    }

    @Transactional
    public SystemSetting update(String key, String value) {
        SystemSetting s = repo.findById(key).orElseThrow(() -> ApiException.notFound("Setting " + key));
        String v = value == null ? "" : value.trim();
        switch (s.getValueType()) {
            case "INTEGER" -> {
                try {
                    if (Integer.parseInt(v) < 0) throw ApiException.badRequest("Value must be zero or more");
                } catch (NumberFormatException e) {
                    throw ApiException.badRequest("Value must be a whole number");
                }
            }
            case "BOOLEAN" -> {
                if (!v.equals("true") && !v.equals("false")) throw ApiException.badRequest("Value must be true or false");
            }
            default -> {
                if (v.isEmpty()) throw ApiException.badRequest("Value is required");
            }
        }
        String old = s.getValue();
        s.setValue(v);
        s.setUpdatedAt(Instant.now());
        s.setUpdatedBy(CurrentUser.email());
        audit.record("SETTING_UPDATED", "SETTING", key, Details.of("from", old, "to", v));
        return s;
    }
}
