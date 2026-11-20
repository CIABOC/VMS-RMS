package lk.gov.ciaboc.rvm.card;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lk.gov.ciaboc.rvm.audit.AuditService;
import lk.gov.ciaboc.rvm.common.ApiException;
import lk.gov.ciaboc.rvm.common.CurrentUser;
import lk.gov.ciaboc.rvm.common.Details;
import lk.gov.ciaboc.rvm.config.AppProperties;
import lk.gov.ciaboc.rvm.visit.Visit;
import lk.gov.ciaboc.rvm.visit.VisitRepository;
import lk.gov.ciaboc.rvm.visit.VisitStatus;
import lk.gov.ciaboc.rvm.visitor.Visitor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Temporary visitor NFC cards: builds the signed data written to the card, records which card was
 * issued for which visit, and checks a card when it is tapped.
 *
 * Card data (JSON, short keys so it fits on small cards; "sig" is always last):
 * <pre>
 * v    format version (1)          typ  "CIABOC-VISITOR"
 * vid  visit id                    tok  queue token number
 * dt   visit date                  exp  valid until (end of the visit day, local time)
 * nm   full name                   idt  ID document type    idn  ID number
 * dob  date of birth               adr  address             mob  mobile
 * org  organisation                cat  visitor category    hst  host officer
 * pur  purpose                     iss  issued at (UTC)     sig  signature
 * </pre>
 */
@Service
@Transactional
public class CardService {
    private static final String ENTITY = "VISIT";
    public static final String TYPE = "CIABOC-VISITOR";
    /** Optional members, dropped in this order when the card is too small. */
    private static final List<String> DROP_ORDER = List.of("pur", "org", "mob", "adr", "hst", "cat", "dob");

    private final VisitorCardRepository cards;
    private final VisitRepository visits;
    private final CardSigner signer;
    private final AuditService audit;
    private final ObjectMapper json;
    private final AppProperties props;

    public CardService(VisitorCardRepository cards, VisitRepository visits, CardSigner signer,
                       AuditService audit, ObjectMapper json, AppProperties props) {
        this.cards = cards;
        this.visits = visits;
        this.signer = signer;
        this.audit = audit;
        this.json = json;
        this.props = props;
    }

    public record CardPayload(String text, int bytes, List<String> omitted) {}

    public record CardView(Long id, String cardUid, String cardType, String status, Integer payloadBytes,
                           Instant issuedAt, String issuedBy, Instant returnedAt, String returnedBy,
                           boolean erased, String note) {
        static CardView of(VisitorCard c) {
            return new CardView(c.getId(), c.getCardUid(), c.getCardType(), c.getStatus(), c.getPayloadBytes(),
                    c.getIssuedAt(), c.getIssuedBy(), c.getReturnedAt(), c.getReturnedBy(), c.isErased(), c.getNote());
        }
    }

    public record CardsOfVisit(CardView active, List<CardView> history) {}

    public record CheckResult(boolean ok, boolean signatureValid, boolean registered, boolean expired,
                              Long visitId, VisitStatus visitStatus, CardView card,
                              Map<String, Object> data, List<String> problems) {}

    // ------------------------------------------------------------------ queries

    @Transactional(readOnly = true)
    public CardsOfVisit ofVisit(Long visitId) {
        List<CardView> all = cards.findByVisitIdOrderByIssuedAtDesc(visitId).stream().map(CardView::of).toList();
        return new CardsOfVisit(all.stream().filter(c -> VisitorCard.ISSUED.equals(c.status())).findFirst().orElse(null), all);
    }

    /** The signed text to write, made to fit in {@code maxBytes} (UTF-8) by leaving out optional details. */
    @Transactional(readOnly = true)
    public CardPayload payload(Long visitId, Integer maxBytes) {
        Visit v = issuable(visitId);
        Map<String, Object> m = data(v);
        List<String> omitted = new ArrayList<>();
        String text = signed(m);
        int limit = maxBytes == null || maxBytes <= 0 ? Integer.MAX_VALUE : maxBytes;
        for (String key : DROP_ORDER) {
            if (bytes(text) <= limit) break;
            if (m.remove(key) != null) {
                omitted.add(key);
                text = signed(m);
            }
        }
        if (bytes(text) > limit) {
            throw ApiException.badRequest("This card can hold " + limit + " bytes, but the visitor's name and ID need "
                    + bytes(text) + ". Use an NTAG215/216 or MIFARE Classic 1K card.");
        }
        return new CardPayload(text, bytes(text), omitted);
    }

    // ------------------------------------------------------------------ issue / return

    public record Issue(String cardUid, String cardType, String text) {}

    /** Records a card after the bridge has written (and read back) the text. */
    public CardView issue(Long visitId, Issue r) {
        Visit v = issuable(visitId);
        String uid = uid(r.cardUid());
        Map<String, Object> data = checkedData(r.text());
        if (data == null) throw ApiException.badRequest("The card data is not signed by this system");
        if (!visitId.equals(asLong(data.get("vid")))) throw ApiException.badRequest("The card data belongs to another visit");

        // The same physical card may still be registered to another visit.
        cards.findFirstByCardUidAndStatus(uid, VisitorCard.ISSUED).ifPresent(other -> {
            if (other.getVisitId().equals(visitId)) return;
            Visit ov = visits.findById(other.getVisitId()).orElse(null);
            if (ov != null && !VisitStatus.CLOSED.contains(ov.getStatus())) {
                throw ApiException.conflict("This card is still issued for visit #" + ov.getId() + " ("
                        + ov.getVisitor().getFullName() + "). Collect it there first, or use another card.");
            }
            close(other, VisitorCard.RETURNED, "Re-issued after the earlier visit closed", false);
        });
        // Any earlier card for this visit (including the same card written again) is replaced.
        cards.findFirstByVisitIdAndStatus(visitId, VisitorCard.ISSUED)
                .ifPresent(prev -> close(prev, VisitorCard.REPLACED, "Replaced by card " + uid, false));
        cards.flush();

        VisitorCard c = new VisitorCard();
        c.setVisitId(visitId);
        c.setCardUid(uid);
        c.setCardType(trim(r.cardType(), 40));
        c.setPayloadSha256(CardSigner.sha256(r.text()));
        c.setPayloadBytes(bytes(r.text()));
        c.setIssuedBy(CurrentUser.email());
        cards.save(c);
        audit.record("VISIT_CARD_ISSUED", ENTITY, v.getId(), Details.of(
                "cardUid", uid, "cardType", c.getCardType(), "bytes", c.getPayloadBytes()));
        return CardView.of(c);
    }

    /** A card handed back at reception (tapped on the reader). Unknown cards are simply reported. */
    public CardView returnCard(String cardUid, boolean erased) {
        VisitorCard c = cards.findFirstByCardUidAndStatus(uid(cardUid), VisitorCard.ISSUED).orElse(null);
        if (c == null) return null;
        close(c, VisitorCard.RETURNED, null, erased);
        audit.record("VISIT_CARD_RETURNED", ENTITY, c.getVisitId(), Details.of("cardUid", c.getCardUid(), "erased", erased));
        return CardView.of(c);
    }

    /** The visitor left without handing the card back. */
    public CardView markLost(Long visitId, String note) {
        VisitorCard c = cards.findFirstByVisitIdAndStatus(visitId, VisitorCard.ISSUED)
                .orElseThrow(() -> ApiException.conflict("No card is out for this visit"));
        close(c, VisitorCard.LOST, trim(note, 500), false);
        audit.record("VISIT_CARD_LOST", ENTITY, visitId, Details.of("cardUid", c.getCardUid(), "note", c.getNote()));
        return CardView.of(c);
    }

    // ------------------------------------------------------------------ check a tapped card

    @Transactional(readOnly = true)
    public CheckResult check(String text, String cardUid) {
        List<String> problems = new ArrayList<>();
        Map<String, Object> data = checkedData(text);
        boolean sigOk = data != null;
        if (!sigOk) {
            problems.add("The data on this card is not signed by this system, or has been changed.");
            return new CheckResult(false, false, false, false, null, null, null, parseLoosely(text), problems);
        }
        Long visitId = asLong(data.get("vid"));
        Visit v = visitId == null ? null : visits.findById(visitId).orElse(null);
        if (v == null) problems.add("The visit on this card does not exist.");

        VisitorCard c = cardUid == null || cardUid.isBlank() ? null
                : cards.findFirstByCardUidAndStatus(uid(cardUid), VisitorCard.ISSUED).orElse(null);
        boolean registered = c != null && c.getVisitId().equals(visitId)
                && c.getPayloadSha256().equals(CardSigner.sha256(text));
        if (!registered) {
            problems.add(c == null
                    ? "This card is not registered as issued (it was returned, replaced, reported lost, or copied)."
                    : "This card holds older or different data than what was issued.");
        }

        boolean expired = false;
        try {
            expired = data.get("exp") != null && OffsetDateTime.parse(String.valueOf(data.get("exp"))).toInstant().isBefore(Instant.now());
        } catch (RuntimeException e) {
            problems.add("The card's expiry date cannot be read.");
        }
        if (expired) problems.add("The card has expired (it is valid only on the visit day).");
        if (v != null && VisitStatus.CLOSED.contains(v.getStatus())) {
            problems.add("The visit is " + v.getStatus().name().toLowerCase() + ".");
        }

        boolean ok = problems.isEmpty();
        return new CheckResult(ok, true, registered, expired, visitId, v == null ? null : v.getStatus(),
                c == null ? null : CardView.of(c), data, problems);
    }

    // ------------------------------------------------------------------ helpers

    private Visit issuable(Long visitId) {
        Visit v = visits.findById(visitId).orElseThrow(() -> ApiException.notFound("Visit"));
        if (v.getStatus() == VisitStatus.PENDING_VERIFICATION) {
            throw ApiException.conflict("Verify the visitor's identity before issuing a card");
        }
        if (VisitStatus.CLOSED.contains(v.getStatus()) || v.getStatus() == VisitStatus.DECLINED) {
            throw ApiException.conflict("The visit is " + v.getStatus().name().toLowerCase() + "; no card can be issued");
        }
        return v;
    }

    private Map<String, Object> data(Visit v) {
        Visitor p = v.getVisitor();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("v", 1);
        m.put("typ", TYPE);
        m.put("vid", v.getId());
        if (v.getTokenNo() != null) m.put("tok", v.getTokenNo());
        m.put("dt", v.getVisitDate().toString());
        m.put("exp", v.getVisitDate().plusDays(1).atStartOfDay(props.zone()).minusSeconds(1).toOffsetDateTime().toString());
        m.put("nm", trim(p.getFullName(), 120));
        m.put("idt", p.getIdType());
        m.put("idn", p.getIdNumber());
        put(m, "dob", p.getDateOfBirth() == null ? null : p.getDateOfBirth().toString());
        put(m, "adr", trim(p.getAddress(), 160));
        put(m, "mob", p.getMobile());
        put(m, "org", trim(p.getOrganization(), 80));
        put(m, "cat", v.getCategory().getName());
        put(m, "hst", v.getHost().getFullName());
        put(m, "pur", trim(v.getPurpose(), 100));
        m.put("iss", Instant.now().truncatedTo(ChronoUnit.SECONDS).toString());
        return m;
    }

    private String signed(Map<String, Object> m) {
        try {
            return signer.sign(json.writeValueAsString(m));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The card data when the signature is valid and it is a visitor card, otherwise null. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> checkedData(String text) {
        String body = signer.verify(text);
        if (body == null) return null;
        try {
            Map<String, Object> m = json.readValue(body, LinkedHashMap.class);
            return TYPE.equals(m.get("typ")) ? m : null;
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    /** Shows what an unsigned/forged card claims, for the officer's information only. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> parseLoosely(String text) {
        try {
            return text == null ? null : json.readValue(text, LinkedHashMap.class);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private void close(VisitorCard c, String status, String note, boolean erased) {
        c.setStatus(status);
        c.setReturnedAt(Instant.now());
        c.setReturnedBy(CurrentUser.email());
        c.setErased(erased);
        if (note != null) c.setNote(note);
    }

    private static void put(Map<String, Object> m, String k, String v) {
        if (v != null && !v.isBlank()) m.put(k, v.trim());
    }

    private static String uid(String s) {
        String u = s == null ? "" : s.replaceAll("[^0-9A-Fa-f]", "").toUpperCase();
        if (u.length() < 8 || u.length() > 32) throw ApiException.badRequest("Invalid card UID");
        return u;
    }

    private static String trim(String s, int max) {
        if (s == null) return null;
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static Long asLong(Object o) {
        return o instanceof Number n ? n.longValue() : null;
    }

    private static int bytes(String s) {
        return s.getBytes(StandardCharsets.UTF_8).length;
    }
}
