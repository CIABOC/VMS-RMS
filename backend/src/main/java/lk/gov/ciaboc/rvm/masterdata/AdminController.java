package lk.gov.ciaboc.rvm.masterdata;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lk.gov.ciaboc.rvm.audit.AuditService;
import lk.gov.ciaboc.rvm.common.ApiException;
import lk.gov.ciaboc.rvm.common.CurrentUser;
import lk.gov.ciaboc.rvm.common.Details;
import lk.gov.ciaboc.rvm.security.Role;
import lk.gov.ciaboc.rvm.staff.StaffUser;
import lk.gov.ciaboc.rvm.staff.StaffUserRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/** Screen 14 - admin master data. Every change is audited. */
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('SYSTEM_ADMIN')")
public class AdminController {
    private final SystemSettingRepository settings;
    private final SettingsService settingsService;
    private final VisitorCategoryRepository categories;
    private final AcknowledgementTextRepository ackTexts;
    private final RoleMappingRepository roleMappings;
    private final StaffUserRepository staff;
    private final AuditService audit;

    public AdminController(SystemSettingRepository settings, SettingsService settingsService,
                           VisitorCategoryRepository categories, AcknowledgementTextRepository ackTexts,
                           RoleMappingRepository roleMappings, StaffUserRepository staff, AuditService audit) {
        this.settings = settings;
        this.settingsService = settingsService;
        this.categories = categories;
        this.ackTexts = ackTexts;
        this.roleMappings = roleMappings;
        this.staff = staff;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ settings
    public record SettingUpdate(@NotNull String value) {}

    @GetMapping("/settings")
    public List<SystemSetting> listSettings() {
        return settings.findAllByOrderByKeyAsc();
    }

    @PutMapping("/settings/{key}")
    public SystemSetting updateSetting(@PathVariable String key, @Valid @RequestBody SettingUpdate body) {
        return settingsService.update(key, body.value());
    }

    // ------------------------------------------------------------------ visitor categories
    public record CategoryRequest(
            @NotBlank @Size(max = 30) @Pattern(regexp = "[A-Z0-9_]+", message = "Use capitals, digits and _ only") String code,
            @NotBlank @Size(max = 120) String name,
            boolean requiresAppointment,
            boolean requiresDeviceCustody,
            boolean active) {}

    @GetMapping("/categories")
    public List<VisitorCategory> listCategories() {
        return categories.findAllByOrderByNameAsc();
    }

    @PostMapping("/categories")
    @Transactional
    public VisitorCategory createCategory(@Valid @RequestBody CategoryRequest r) {
        VisitorCategory c = new VisitorCategory();
        apply(c, r);
        categories.save(c);
        audit.record("CATEGORY_CREATED", "CATEGORY", c.getId(), Details.of("code", c.getCode(), "name", c.getName()));
        return c;
    }

    @PutMapping("/categories/{id}")
    @Transactional
    public VisitorCategory updateCategory(@PathVariable Long id, @Valid @RequestBody CategoryRequest r) {
        VisitorCategory c = categories.findById(id).orElseThrow(() -> ApiException.notFound("Category"));
        apply(c, r);
        audit.record("CATEGORY_UPDATED", "CATEGORY", c.getId(), Details.of(
                "code", c.getCode(), "name", c.getName(), "active", c.isActive(),
                "requiresAppointment", c.isRequiresAppointment(), "requiresDeviceCustody", c.isRequiresDeviceCustody()));
        return c;
    }

    private void apply(VisitorCategory c, CategoryRequest r) {
        c.setCode(r.code().trim());
        c.setName(r.name().trim());
        c.setRequiresAppointment(r.requiresAppointment());
        c.setRequiresDeviceCustody(r.requiresDeviceCustody());
        c.setActive(r.active());
    }

    // ------------------------------------------------------------------ acknowledgement texts
    public record AckTextRequest(@NotBlank String textEn, @NotBlank String textSi, @NotBlank String textTa) {}

    @GetMapping("/ack-texts")
    public List<AcknowledgementText> listAckTexts() {
        return ackTexts.findAllByOrderByVersionDesc();
    }

    /** Creates a new, inactive version. Published versions are never edited, because signatures reference them. */
    @PostMapping("/ack-texts")
    @Transactional
    public AcknowledgementText createAckText(@Valid @RequestBody AckTextRequest r) {
        AcknowledgementText a = new AcknowledgementText();
        a.setVersion(ackTexts.maxVersion() + 1);
        a.setTextEn(r.textEn().trim());
        a.setTextSi(r.textSi().trim());
        a.setTextTa(r.textTa().trim());
        a.setActive(false);
        a.setCreatedBy(CurrentUser.email());
        ackTexts.save(a);
        audit.record("ACK_TEXT_CREATED", "ACK_TEXT", a.getId(), Details.of("version", a.getVersion()));
        return a;
    }

    @PostMapping("/ack-texts/{id}/activate")
    @Transactional
    public AcknowledgementText activateAckText(@PathVariable Long id) {
        ackTexts.findById(id).orElseThrow(() -> ApiException.notFound("Acknowledgement text"));
        ackTexts.deactivateAll();
        AcknowledgementText a = ackTexts.findById(id).orElseThrow();
        a.setActive(true);
        audit.record("ACK_TEXT_ACTIVATED", "ACK_TEXT", a.getId(), Details.of("version", a.getVersion()));
        return a;
    }

    // ------------------------------------------------------------------ role mapping
    public record RoleMappingRequest(@NotBlank @Size(max = 200) String ssoGroup, @NotNull Role role) {}

    @GetMapping("/role-mappings")
    public List<RoleMapping> listRoleMappings() {
        return roleMappings.findAllByOrderBySsoGroupAsc();
    }

    @PostMapping("/role-mappings")
    @Transactional
    public RoleMapping createRoleMapping(@Valid @RequestBody RoleMappingRequest r) {
        RoleMapping m = new RoleMapping();
        m.setSsoGroup(r.ssoGroup().trim());
        m.setRole(r.role());
        roleMappings.save(m);
        audit.record("ROLE_MAPPING_CREATED", "ROLE_MAPPING", m.getId(), Details.of("group", m.getSsoGroup(), "role", m.getRole()));
        return m;
    }

    @DeleteMapping("/role-mappings/{id}")
    @Transactional
    public void deleteRoleMapping(@PathVariable Long id) {
        RoleMapping m = roleMappings.findById(id).orElseThrow(() -> ApiException.notFound("Role mapping"));
        roleMappings.delete(m);
        audit.record("ROLE_MAPPING_DELETED", "ROLE_MAPPING", id, Details.of("group", m.getSsoGroup(), "role", m.getRole()));
    }

    // ------------------------------------------------------------------ staff
    public record StaffRequest(
            @NotBlank @Email @Size(max = 255) String email,
            @NotBlank @Size(max = 200) String fullName,
            @Size(max = 150) String designation,
            @Size(max = 150) String department,
            @Size(max = 30) String mobile,
            boolean active,
            @NotNull Set<Role> roles) {}

    @GetMapping("/staff")
    public List<StaffUser> listStaff() {
        return staff.findAllByOrderByFullNameAsc();
    }

    @PostMapping("/staff")
    @Transactional
    public StaffUser createStaff(@Valid @RequestBody StaffRequest r) {
        StaffUser s = new StaffUser();
        apply(s, r);
        staff.save(s);
        audit.record("STAFF_CREATED", "STAFF", s.getId(), Details.of("email", s.getEmail(), "roles", s.getRoles()));
        return s;
    }

    @PutMapping("/staff/{id}")
    @Transactional
    public StaffUser updateStaff(@PathVariable Long id, @Valid @RequestBody StaffRequest r) {
        StaffUser s = staff.findById(id).orElseThrow(() -> ApiException.notFound("Staff member"));
        boolean self = s.getEmail().equalsIgnoreCase(CurrentUser.email());
        if (self && (!r.active() || !r.roles().contains(Role.SYSTEM_ADMIN))) {
            throw ApiException.badRequest("You cannot remove your own administrator access");
        }
        apply(s, r);
        audit.record("STAFF_UPDATED", "STAFF", s.getId(),
                Details.of("email", s.getEmail(), "roles", s.getRoles(), "active", s.isActive()));
        return s;
    }

    private void apply(StaffUser s, StaffRequest r) {
        s.setEmail(r.email().trim().toLowerCase());
        s.setFullName(r.fullName().trim());
        s.setDesignation(blankToNull(r.designation()));
        s.setDepartment(blankToNull(r.department()));
        s.setMobile(blankToNull(r.mobile()));
        s.setActive(r.active());
        s.setRoles(r.roles().isEmpty() ? EnumSet.noneOf(Role.class) : EnumSet.copyOf(r.roles()));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
