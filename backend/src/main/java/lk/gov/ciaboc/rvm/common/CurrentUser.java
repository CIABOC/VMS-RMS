package lk.gov.ciaboc.rvm.common;

import lk.gov.ciaboc.rvm.security.Role;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** Static helpers to read the signed-in staff member. */
public final class CurrentUser {
    private CurrentUser() {}

    public static String email() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a == null ? "system" : a.getName();
    }

    public static boolean hasRole(Role role) {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a != null && a.getAuthorities().stream()
                .anyMatch(g -> g.getAuthority().equals("ROLE_" + role.name()));
    }
}
