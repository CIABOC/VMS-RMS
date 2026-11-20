package lk.gov.ciaboc.rvm.card;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lk.gov.ciaboc.rvm.card.CardService.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * Temporary visitor NFC cards. The card is written by the local NFC bridge on the reception PC;
 * these endpoints supply the signed data and keep the register of issued cards.
 */
@RestController
@RequestMapping("/api")
@Validated
public class CardController {
    private final CardService service;

    public CardController(CardService service) {
        this.service = service;
    }

    @GetMapping("/visits/{id}/card")
    @PreAuthorize("hasRole('RECEPTIONIST')")
    public CardsOfVisit ofVisit(@PathVariable Long id) {
        return service.ofVisit(id);
    }

    /** The signed text to write; {@code maxBytes} is the capacity the bridge reported for the card on the reader. */
    @GetMapping("/visits/{id}/card/payload")
    @PreAuthorize("hasRole('RECEPTIONIST')")
    public CardPayload payload(@PathVariable Long id, @RequestParam(required = false) Integer maxBytes) {
        return service.payload(id, maxBytes);
    }

    public record IssueBody(@NotBlank @Size(max = 64) String cardUid, @Size(max = 40) String cardType,
                            @NotBlank @Size(max = 4000) String text) {}

    @PostMapping("/visits/{id}/card")
    @PreAuthorize("hasRole('RECEPTIONIST')")
    public CardView issue(@PathVariable Long id, @RequestBody @Validated IssueBody b) {
        return service.issue(id, new Issue(b.cardUid(), b.cardType(), b.text()));
    }

    public record LostBody(@Size(max = 500) String note) {}

    @PostMapping("/visits/{id}/card/lost")
    @PreAuthorize("hasRole('RECEPTIONIST')")
    public CardView lost(@PathVariable Long id, @RequestBody @Validated LostBody b) {
        return service.markLost(id, b.note());
    }

    public record ReturnBody(@NotBlank @Size(max = 64) String cardUid, boolean erased) {}

    /** A card handed back and tapped on the reader. {@code card} is null when the card was not out. */
    @PostMapping("/cards/return")
    @PreAuthorize("hasRole('RECEPTIONIST')")
    public Map<String, Object> returnCard(@RequestBody @Validated ReturnBody b) {
        Map<String, Object> out = new HashMap<>();
        out.put("card", service.returnCard(b.cardUid(), b.erased()));
        return out;
    }

    public record CheckBody(@Size(max = 4000) String text, @Size(max = 64) String cardUid) {}

    /** Checks a tapped card: signature, issue register, expiry and visit state. */
    @PostMapping("/cards/check")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'GATE_OFFICER', 'SECURITY_SUPERVISOR')")
    public CheckResult check(@RequestBody @Validated CheckBody b) {
        return service.check(b.text(), b.cardUid());
    }
}
