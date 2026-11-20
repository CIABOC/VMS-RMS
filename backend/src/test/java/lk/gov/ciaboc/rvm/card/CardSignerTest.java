package lk.gov.ciaboc.rvm.card;

import lk.gov.ciaboc.rvm.config.AppProperties;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CardSignerTest {
    private static AppProperties props(String secret) {
        return new AppProperties("sso", null, null, null, "Asia/Colombo", secret);
    }

    private final CardSigner signer = new CardSigner(props("0123456789abcdef0123456789abcdef-test"));

    @Test
    void signedTextVerifies() {
        String body = "{\"v\":1,\"typ\":\"CIABOC-VISITOR\",\"vid\":7,\"nm\":\"කමල් පෙරේරා\"}";
        String text = signer.sign(body);
        assertTrue(text.endsWith("\"}"));
        assertEquals(body, signer.verify(text));
    }

    @Test
    void editedTextFails() {
        String text = signer.sign("{\"vid\":7,\"nm\":\"Kamal\"}");
        assertNull(signer.verify(text.replace("Kamal", "Kamel")));
        assertNull(signer.verify(text.replace("\"vid\":7", "\"vid\":8")));
        assertNull(signer.verify("{\"vid\":7}"));
        assertNull(signer.verify(null));
    }

    @Test
    void otherKeyFails() {
        String text = signer.sign("{\"vid\":7}");
        assertNull(new CardSigner(props("another-secret-another-secret-another")).verify(text));
    }

    @Test
    void productionRequiresSecret() {
        assertThrows(IllegalStateException.class, () -> new CardSigner(props("")));
        assertNotNull(new CardSigner(new AppProperties("dev", null, null, null, null, null)));
    }
}
