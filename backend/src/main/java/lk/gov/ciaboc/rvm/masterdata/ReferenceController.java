package lk.gov.ciaboc.rvm.masterdata;

import lk.gov.ciaboc.rvm.common.ApiException;
import lk.gov.ciaboc.rvm.security.Role;
import lk.gov.ciaboc.rvm.staff.StaffUserRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Read-only lookups any signed-in user may need (drop-downs, refresh rate). */
@RestController
@RequestMapping("/api/reference")
public class ReferenceController {
    private final VisitorCategoryRepository categories;
    private final StaffUserRepository staff;
    private final AcknowledgementTextRepository ackTexts;
    private final SettingsService settings;

    public ReferenceController(VisitorCategoryRepository categories, StaffUserRepository staff,
                               AcknowledgementTextRepository ackTexts, SettingsService settings) {
        this.categories = categories;
        this.staff = staff;
        this.ackTexts = ackTexts;
        this.settings = settings;
    }

    public record Host(Long id, String fullName, String designation, String department) {}
    public record ClientSettings(int refreshSeconds, int idScanReuseDays, int maxItemsPerVisit) {}

    @GetMapping("/categories")
    public List<VisitorCategory> categories() {
        return categories.findByActiveTrueOrderByNameAsc();
    }

    @GetMapping("/hosts")
    public List<Host> hosts() {
        return staff.findActiveByRole(Role.HOST_OFFICER).stream()
                .map(s -> new Host(s.getId(), s.getFullName(), s.getDesignation(), s.getDepartment()))
                .toList();
    }

    @GetMapping("/ack-text/active")
    public AcknowledgementText activeAckText() {
        return ackTexts.findFirstByActiveTrue()
                .orElseThrow(() -> ApiException.notFound("An active acknowledgement text (ask a System Administrator to publish one)"));
    }

    @GetMapping("/client-settings")
    public ClientSettings clientSettings() {
        return new ClientSettings(
                settings.getInt(SettingsService.QUEUE_REFRESH_SECONDS),
                settings.getInt(SettingsService.ID_SCAN_REUSE_DAYS),
                settings.getInt(SettingsService.MAX_ITEMS_PER_VISIT));
    }
}
