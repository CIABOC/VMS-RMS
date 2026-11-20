package lk.gov.ciaboc.rvm.card;

import lk.gov.ciaboc.rvm.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Signs and checks the text written to a visitor card.
 *
 * The card text is a JSON object whose last member is {@code "sig"}: an HMAC-SHA256 (first 16 bytes,
 * base64url) over the exact JSON text without that member. Signing the exact bytes means the check
 * does not depend on how the JSON is re-serialised.
 */
@Component
public class CardSigner {
    private static final Logger log = LoggerFactory.getLogger(CardSigner.class);
    private static final Pattern SIG = Pattern.compile(",\"sig\":\"([A-Za-z0-9_-]{16,64})\"}\\s*$");
    private static final int SIG_BYTES = 16;

    private final byte[] key;

    public CardSigner(AppProperties props) {
        String secret = props.cardSecret();
        if (secret == null || secret.isBlank()) {
            if (!props.devAuth()) {
                throw new IllegalStateException("APP_CARD_SECRET must be set (32+ random characters) to issue visitor NFC cards");
            }
            byte[] random = new byte[32];
            new SecureRandom().nextBytes(random);
            key = random;
            log.warn("APP_CARD_SECRET is not set: using a temporary key. Visitor cards written now fail the check after a restart.");
        } else {
            if (secret.length() < 32) log.warn("APP_CARD_SECRET is shorter than 32 characters; use a longer random value.");
            key = secret.getBytes(StandardCharsets.UTF_8);
        }
    }

    /** {@code json} must be a JSON object; returns it with the signature appended as the last member. */
    public String sign(String json) {
        if (!json.endsWith("}")) throw new IllegalArgumentException("JSON object expected");
        return json.substring(0, json.length() - 1) + ",\"sig\":\"" + mac(json) + "\"}";
    }

    /** Returns the signed JSON (without {@code sig}) when the signature is valid, otherwise null. */
    public String verify(String text) {
        if (text == null) return null;
        Matcher m = SIG.matcher(text);
        if (!m.find()) return null;
        String body = text.substring(0, m.start()) + "}";
        byte[] expected = mac(body).getBytes(StandardCharsets.US_ASCII);
        byte[] actual = m.group(1).getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(expected, actual) ? body : null;
    }

    public static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private String mac(String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] full = mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(Arrays.copyOf(full, SIG_BYTES));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
