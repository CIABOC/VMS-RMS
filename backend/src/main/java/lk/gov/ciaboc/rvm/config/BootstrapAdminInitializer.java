package lk.gov.ciaboc.rvm.config;

import lk.gov.ciaboc.rvm.audit.AuditService;
import lk.gov.ciaboc.rvm.common.Details;
import lk.gov.ciaboc.rvm.security.Role;
import lk.gov.ciaboc.rvm.staff.StaffUser;
import lk.gov.ciaboc.rvm.staff.StaffUserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;

/**
 * On an empty database nobody could sign in to create the first staff account.
 * If APP_BOOTSTRAP_ADMIN_EMAIL is set and the staff table is empty, that person is created as a
 * System Administrator. It never runs again once any staff record exists.
 */
@Component
public class BootstrapAdminInitializer implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(BootstrapAdminInitializer.class);

    private final AppProperties props;
    private final StaffUserRepository staff;
    private final AuditService audit;

    public BootstrapAdminInitializer(AppProperties props, StaffUserRepository staff, AuditService audit) {
        this.props = props;
        this.staff = staff;
        this.audit = audit;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (staff.count() > 0) return;
        String email = props.bootstrapAdminEmail();
        if (email == null || email.isBlank()) {
            log.warn("No staff accounts exist and APP_BOOTSTRAP_ADMIN_EMAIL is not set - nobody can sign in yet.");
            return;
        }
        StaffUser admin = new StaffUser();
        admin.setEmail(email.trim().toLowerCase());
        admin.setFullName(props.bootstrapAdminName());
        admin.setRoles(EnumSet.of(Role.SYSTEM_ADMIN));
        staff.save(admin);
        audit.record("STAFF_BOOTSTRAP_ADMIN", "STAFF", admin.getId(), Details.of("email", admin.getEmail()));
        log.info("Created bootstrap System Administrator {}", admin.getEmail());
    }
}
