package lk.gov.ciaboc.rvm.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lk.gov.ciaboc.rvm.audit.AuditService;
import lk.gov.ciaboc.rvm.common.ApiException;
import lk.gov.ciaboc.rvm.common.Details;
import lk.gov.ciaboc.rvm.config.AppProperties;
import lk.gov.ciaboc.rvm.staff.StaffUser;
import lk.gov.ciaboc.rvm.staff.StaffUserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Authentication endpoints.
 * <p>
 * The SSO integration will be merged later and will establish the same session that
 * {@link #devLogin} creates (principal = staff e-mail, authorities = ROLE_*). Nothing else in the
 * application needs to change when that happens.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AppProperties props;
    private final StaffUserRepository staff;
    private final SecurityContextRepository contextRepository;
    private final AuditService audit;

    public AuthController(AppProperties props, StaffUserRepository staff,
                          SecurityContextRepository contextRepository, AuditService audit) {
        this.props = props;
        this.staff = staff;
        this.contextRepository = contextRepository;
        this.audit = audit;
    }

    public record AuthConfig(String mode, String ssoLoginUrl) {}
    public record Me(Long id, String email, String fullName, String designation, Set<Role> roles) {}
    public record DevLogin(@NotBlank @Email String email) {}

    @GetMapping("/config")
    public AuthConfig config() {
        return new AuthConfig(props.devAuth() ? "dev" : "sso", props.ssoLoginUrl());
    }

    /** Touching the token makes Spring write the XSRF-TOKEN cookie. */
    @GetMapping("/csrf")
    public CsrfToken csrf(CsrfToken token) {
        return token;
    }

    @GetMapping("/me")
    public Me me(Authentication auth, HttpServletRequest request) {
        StaffUser s = staff.findByEmailIgnoreCase(auth.getName()).filter(StaffUser::isActive).orElse(null);
        if (s == null) {   // account removed or deactivated since sign-in
            invalidate(request);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Your account is no longer active");
        }
        return toMe(s);
    }

    @PostMapping("/dev-login")
    @Transactional
    public Me devLogin(@Valid @RequestBody DevLogin body, HttpServletRequest request, HttpServletResponse response) {
        if (!props.devAuth()) {
            throw ApiException.forbidden("Development sign-in is disabled. Use Single Sign-On.");
        }
        StaffUser s = staff.findByEmailIgnoreCase(body.email().trim())
                .filter(StaffUser::isActive)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "No active staff account for this e-mail"));
        if (s.getRoles().isEmpty()) {
            throw ApiException.forbidden("Your account has no roles yet. Ask a System Administrator.");
        }

        List<SimpleGrantedAuthority> authorities = s.getRoles().stream()
                .map(r -> new SimpleGrantedAuthority("ROLE_" + r.name())).toList();
        Authentication authentication =
                UsernamePasswordAuthenticationToken.authenticated(s.getEmail(), null, authorities);

        request.getSession(true);
        request.changeSessionId();     // session-fixation protection
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(authentication);
        SecurityContextHolder.setContext(ctx);
        contextRepository.saveContext(ctx, request, response);

        audit.record("AUTH_SIGN_IN", "STAFF", s.getId(), Details.of("method", "DEV"));
        return toMe(s);
    }

    @PostMapping("/logout")
    @Transactional
    public void logout(HttpServletRequest request) {
        audit.record("AUTH_SIGN_OUT", "STAFF", null, null);
        invalidate(request);
    }

    private void invalidate(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) session.invalidate();
        SecurityContextHolder.clearContext();
    }

    private Me toMe(StaffUser s) {
        return new Me(s.getId(), s.getEmail(), s.getFullName(), s.getDesignation(), new TreeSet<>(s.getRoles()));
    }
}
