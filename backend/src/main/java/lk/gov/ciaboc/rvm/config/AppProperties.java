package lk.gov.ciaboc.rvm.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String authMode,
        String ssoLoginUrl,
        String bootstrapAdminEmail,
        String bootstrapAdminName,
        String timeZone,
        /** Signs the data written to visitor NFC cards, so a forged or edited card is detected. */
        String cardSecret) {

    public boolean devAuth() {
        return "dev".equalsIgnoreCase(authMode);
    }

    public ZoneId zone() {
        return ZoneId.of(timeZone == null || timeZone.isBlank() ? "Asia/Colombo" : timeZone);
    }

    public LocalDate today() {
        return LocalDate.now(zone());
    }

    public Instant startOfToday() {
        return today().atStartOfDay(zone()).toInstant();
    }
}
