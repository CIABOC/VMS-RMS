package lk.gov.ciaboc.rvm.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

/**
 * Session-cookie security for the React SPA.
 * <ul>
 *   <li>No passwords: staff are authenticated by SSO (later) or by the dev sign-in (until SSO is merged).</li>
 *   <li>CSRF protection with the XSRF-TOKEN cookie / X-XSRF-TOKEN header pattern.</li>
 *   <li>Screen-level permissions are enforced with {@code @PreAuthorize} on each controller.</li>
 * </ul>
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityContextRepository contextRepository) throws Exception {
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null); // load the token on every request so the cookie is always present

        http
            .csrf(c -> c.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(csrfHandler))
            .securityContext(s -> s.securityContextRepository(contextRepository))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/auth/config", "/api/auth/csrf", "/api/auth/dev-login",
                                 "/api/public/**", "/actuator/health").permitAll()
                .requestMatchers("/api/**").authenticated()
                .anyRequest().permitAll())
            .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)
            .logout(AbstractHttpConfigurer::disable)
            .headers(h -> h
                .contentSecurityPolicy(c -> c.policyDirectives("default-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'"))
                .frameOptions(f -> f.deny()));
        return http.build();
    }
}
