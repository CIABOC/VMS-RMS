import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import javax.smartcardio.*;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executors;

/**
 * CIABOC RVM - local NFC bridge.
 *
 * Runs on the reception PC next to a USB PC/SC NFC reader (ACR122U, ACR1252U, ...) and lets the
 * web app write the visitor's temporary NFC card. The browser cannot talk to a USB reader itself,
 * so the app calls this program on http://127.0.0.1:47800.
 *
 * No dependencies: uses the JDK's javax.smartcardio (Windows smart card service) and its built-in
 * HTTP server. Start with:  java NfcBridge.java      (JDK 17 or newer)
 *
 * Supported cards (detected automatically):
 *  - NTAG213/215/216 and other NFC Forum Type 2 tags: the data is written as an NDEF MIME record
 *    (application/vnd.ciaboc.visitor), so an Android phone can read it too. NTAG213 is too small
 *    for full visitor data; NTAG215/216 fit.
 *  - MIFARE Classic 1K/4K: the data is written to sectors 1-15 (about 700 bytes) in a small
 *    "CVC1" container. Sector 0 (manufacturer block) is never touched.
 *
 * Endpoints (all return JSON):
 *  GET  /status                       reader + card on the reader (does not wait)
 *  POST /write?timeoutMs=15000        body = UTF-8 text to store; waits for a card, writes, reads back
 *  POST /read?timeoutMs=15000         waits for a card and returns the stored text
 *  POST /erase?timeoutMs=15000        clears the stored text
 *
 * Only the web app's own origins may call it (NFC_BRIDGE_ALLOWED_ORIGINS, comma separated), so
 * other websites open in the browser cannot read or write cards.
 */
public class NfcBridge {
    static final String VERSION = "1.0";
    static final String MIME = "application/vnd.ciaboc.visitor";
    static final byte[] CLASSIC_MAGIC = "CVC1".getBytes(StandardCharsets.US_ASCII);
    static final int DEFAULT_TIMEOUT_MS = 15_000;
    static final int MAX_TIMEOUT_MS = 60_000;

    static Set<String> allowedOrigins;

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(env("NFC_BRIDGE_PORT", "47800"));
        allowedOrigins = new HashSet<>();
        for (String o : env("NFC_BRIDGE_ALLOWED_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081").split(",")) {
            if (!o.isBlank()) allowedOrigins.add(o.trim().replaceAll("/+$", ""));
        }

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/", NfcBridge::handle);
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
        System.out.println("CIABOC NFC bridge " + VERSION + " listening on http://127.0.0.1:" + port);
        System.out.println("Allowed web app origins: " + allowedOrigins);
        try {
            System.out.println("Readers: " + readerNames());
        } catch (Exception e) {
            System.out.println("No NFC reader found yet (" + e.getMessage() + "). Plug one in; it is picked up automatically.");
        }
    }

    // ------------------------------------------------------------------ HTTP

    static void handle(HttpExchange ex) throws IOException {
        String origin = ex.getRequestHeaders().getFirst("Origin");
        try {
            if (origin != null && !allowedOrigins.contains(origin)) {
                send(ex, 403, Map.of("ok", false, "error", "Origin " + origin + " is not allowed. Add it to NFC_BRIDGE_ALLOWED_ORIGINS."), null);
                return;
            }
            if ("OPTIONS".equals(ex.getRequestMethod())) {
                send(ex, 204, null, origin);
                return;
            }
            String path = ex.getRequestURI().getPath();
            Map<String, String> q = query(ex.getRequestURI());
            int timeout = Math.min(MAX_TIMEOUT_MS, Math.max(0, parseInt(q.get("timeoutMs"), DEFAULT_TIMEOUT_MS)));
            Object result;
            synchronized (NfcBridge.class) {   // one card operation at a time
                result = switch (ex.getRequestMethod() + " " + path) {
                    case "GET /status" -> status();
                    case "POST /write" -> write(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8), timeout);
                    case "POST /read" -> read(timeout);
                    case "POST /erase" -> erase(timeout);
                    default -> null;
                };
            }
            if (result == null) send(ex, 404, Map.of("ok", false, "error", "Not found"), origin);
            else send(ex, 200, result, origin);
        } catch (BridgeException e) {
            send(ex, 409, Map.of("ok", false, "code", e.code, "error", e.getMessage()), origin);
        } catch (Exception e) {
            e.printStackTrace();
            send(ex, 500, Map.of("ok", false, "code", "FAILED", "error", String.valueOf(e.getMessage())), origin);
        }
    }

    static void send(HttpExchange ex, int status, Object body, String origin) throws IOException {
        var h = ex.getResponseHeaders();
        if (origin != null && allowedOrigins.contains(origin)) {
            h.set("Access-Control-Allow-Origin", origin);
            h.set("Vary", "Origin");
            h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            h.set("Access-Control-Allow-Headers", "Content-Type");
            h.set("Access-Control-Allow-Private-Network", "true");   // Chrome private network access preflight
            h.set("Access-Control-Max-Age", "600");
        }
        h.set("Cache-Control", "no-store");
        if (body == null) {
            ex.sendResponseHeaders(status, -1);
        } else {
            byte[] bytes = Json.write(body).getBytes(StandardCharsets.UTF_8);
            h.set("Content-Type", "application/json; charset=utf-8");
            ex.sendResponseHeaders(status, bytes.length);
            try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
        }
        ex.close();
    }

    // ------------------------------------------------------------------ operations

    static Map<String, Object> status() throws Exception {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("version", VERSION);
        List<String> names;
        try {
            names = readerNames();
        } catch (Exception e) {
            names = List.of();
        }
        out.put("readers", names);
        CardTerminal t = terminalOrNull();
        out.put("reader", t == null ? null : t.getName());
        out.put("cardPresent", false);
        if (t != null && t.isCardPresent()) {
            out.put("cardPresent", true);
            try (Tag tag = Tag.connect(t)) {
                out.put("card", tag.info());
            } catch (BridgeException e) {
                out.put("cardError", e.getMessage());
            }
        }
        return out;
    }

    static Map<String, Object> write(String text, int timeout) throws Exception {
        byte[] data = text.getBytes(StandardCharsets.UTF_8);
        if (data.length == 0) throw new BridgeException("EMPTY", "Nothing to write");
        try (Tag tag = Tag.connect(waitForCard(timeout))) {
            if (data.length > tag.maxPayload()) {
                throw new BridgeException("TOO_LARGE", "The data (" + data.length + " bytes) does not fit on this "
                        + tag.type + " card (" + tag.maxPayload() + " bytes). Use an NTAG215/216 or MIFARE Classic 1K card.");
            }
            tag.writeData(data);
            byte[] back = tag.readData();
            if (!Arrays.equals(back, data)) throw new BridgeException("VERIFY_FAILED", "The card did not read back correctly. Keep the card on the reader and try again.");
            Map<String, Object> out = new LinkedHashMap<>(tag.info());
            out.put("ok", true);
            out.put("bytesWritten", data.length);
            return out;
        }
    }

    static Map<String, Object> read(int timeout) throws Exception {
        try (Tag tag = Tag.connect(waitForCard(timeout))) {
            byte[] data = tag.readData();
            Map<String, Object> out = new LinkedHashMap<>(tag.info());
            out.put("ok", true);
            out.put("empty", data == null);
            out.put("text", data == null ? null : new String(data, StandardCharsets.UTF_8));
            return out;
        }
    }

    static Map<String, Object> erase(int timeout) throws Exception {
        try (Tag tag = Tag.connect(waitForCard(timeout))) {
            tag.erase();
            Map<String, Object> out = new LinkedHashMap<>(tag.info());
            out.put("ok", true);
            return out;
        }
    }

    // ------------------------------------------------------------------ reader

    /** A fresh PC/SC context each time, so a reader plugged in after start-up is found. */
    static List<CardTerminal> terminals() throws CardException {
        try {
            return TerminalFactory.getInstance("PC/SC", null).terminals().list();
        } catch (java.security.NoSuchAlgorithmException e) {
            return TerminalFactory.getDefault().terminals().list();
        }
    }

    static List<String> readerNames() throws CardException {
        List<String> out = new ArrayList<>();
        for (CardTerminal t : terminals()) out.add(t.getName());
        return out;
    }

    /** The contactless interface of the reader (dual readers also list a SAM / contact slot). */
    static CardTerminal terminalOrNull() {
        try {
            List<CardTerminal> list = terminals();
            String pref = System.getenv("NFC_BRIDGE_READER");
            for (CardTerminal t : list) if (pref != null && !pref.isBlank() && t.getName().toLowerCase().contains(pref.toLowerCase())) return t;
            for (CardTerminal t : list) { String n = t.getName().toUpperCase(); if (n.contains("PICC") || n.contains("CONTACTLESS")) return t; }
            for (CardTerminal t : list) if (!t.getName().toUpperCase().contains("SAM")) return t;
            return list.isEmpty() ? null : list.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    static CardTerminal waitForCard(int timeout) throws Exception {
        CardTerminal t = terminalOrNull();
        if (t == null) throw new BridgeException("NO_READER", "No NFC reader is connected to this PC.");
        if (!t.isCardPresent() && (timeout == 0 || !t.waitForCardPresent(timeout))) {
            throw new BridgeException("NO_CARD", "No card was placed on the reader.");
        }
        return t;
    }

    // ------------------------------------------------------------------ card access

    static final class Tag implements AutoCloseable {
        final Card card;
        final CardChannel ch;
        final String uid;
        final String type;
        final int dataBytes;      // raw user memory available
        final boolean classic;
        final boolean readOnly;
        final Map<Integer, byte[][]> classicAuth = new HashMap<>();   // sector -> {key, keyType}

        private Tag(Card card, String uid, String type, int dataBytes, boolean classic, boolean readOnly) {
            this.card = card;
            this.ch = card.getBasicChannel();
            this.uid = uid;
            this.type = type;
            this.dataBytes = dataBytes;
            this.classic = classic;
            this.readOnly = readOnly;
        }

        static Tag connect(CardTerminal t) throws Exception {
            Card card;
            try {
                card = t.connect("*");
            } catch (CardException e) {
                throw new BridgeException("NO_CARD", "Could not connect to the card. Hold it still on the reader.");
            }
            try {
                CardChannel ch = card.getBasicChannel();
                String uid = hex(ok(ch.transmit(new CommandAPDU(new byte[]{(byte) 0xFF, (byte) 0xCA, 0, 0, 0})), "read the card UID"));
                byte[] atr = card.getATR().getBytes();
                int name = atr.length >= 15 && (atr[4] & 0xFF) == 0x80 && (atr[5] & 0xFF) == 0x4F
                        ? ((atr[13] & 0xFF) << 8) | (atr[14] & 0xFF) : -1;

                if (name == 0x0001 || name == 0x0002 || name == 0x0026) {
                    String type = name == 0x0002 ? "MIFARE Classic 4K" : name == 0x0026 ? "MIFARE Mini" : "MIFARE Classic 1K";
                    if (name == 0x0026) throw new BridgeException("UNSUPPORTED", "MIFARE Mini cards are too small.");
                    return new Tag(card, uid, type, 15 * 48, true, false);
                }
                // NFC Forum Type 2 (Ultralight / NTAG): the capability container is page 3.
                byte[] cc = readPages(ch, 3);
                if ((cc[0] & 0xFF) == 0xE1) {
                    int size = (cc[2] & 0xFF) * 8;
                    String type = switch (cc[2] & 0xFF) {
                        case 0x12 -> "NTAG213";
                        case 0x3E -> "NTAG215";
                        case 0x6D -> "NTAG216";
                        case 0x06 -> "MIFARE Ultralight";
                        default -> "NFC Type 2 tag";
                    };
                    return new Tag(card, uid, type, size, false, (cc[3] & 0x0F) != 0);
                }
                throw new BridgeException("UNSUPPORTED", "This card type is not supported or not NDEF formatted (ATR " + hex(atr) + ").");
            } catch (Exception e) {
                try { card.disconnect(false); } catch (Exception ignored) { }
                throw e;
            }
        }

        Map<String, Object> info() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("uid", uid);
            m.put("type", type);
            m.put("capacity", dataBytes);
            m.put("maxPayload", maxPayload());
            m.put("readOnly", readOnly);
            return m;
        }

        /** Largest text that fits, after the container / NDEF overhead. */
        int maxPayload() {
            if (classic) return dataBytes - CLASSIC_MAGIC.length - 2;
            // TLV (up to 4) + terminator (1) + record header (1 + 1 + 4) + MIME type
            return Math.max(0, dataBytes - 4 - 1 - 6 - MIME.length());
        }

        void writeData(byte[] data) throws Exception {
            if (readOnly) throw new BridgeException("READ_ONLY", "This card is locked (read-only).");
            if (classic) {
                byte[] buf = new byte[dataBytes];
                System.arraycopy(CLASSIC_MAGIC, 0, buf, 0, 4);
                buf[4] = (byte) (data.length >> 8);
                buf[5] = (byte) data.length;
                System.arraycopy(data, 0, buf, 6, data.length);
                int used = 6 + data.length;
                // Header block last, so an interrupted write never leaves a valid-looking half card.
                for (int off = 16; off < used; off += 16) writeClassicChunk(buf, off);
                writeClassicChunk(buf, 0);
            } else {
                byte[] msg = ndefMime(data);
                ByteArrayOutputStream tlv = new ByteArrayOutputStream();
                tlv.write(0x03);
                if (msg.length < 0xFF) tlv.write(msg.length);
                else { tlv.write(0xFF); tlv.write(msg.length >> 8); tlv.write(msg.length & 0xFF); }
                tlv.write(msg);
                tlv.write(0xFE);
                byte[] bytes = tlv.toByteArray();
                if (bytes.length > dataBytes) throw new BridgeException("TOO_LARGE", "The data does not fit on this card.");
                int pages = (bytes.length + 3) / 4;
                byte[] buf = Arrays.copyOf(bytes, pages * 4);
                // Write page 4 (with the length) last, so a half-written card reads as empty, not corrupt.
                for (int p = 1; p < pages; p++) writePage(4 + p, Arrays.copyOfRange(buf, p * 4, p * 4 + 4));
                writePage(4, Arrays.copyOfRange(buf, 0, 4));
            }
        }

        byte[] readData() throws Exception {
            if (classic) {
                byte[] head = readClassicChunk(0);
                if (!Arrays.equals(Arrays.copyOf(head, 4), CLASSIC_MAGIC)) return null;
                int len = ((head[4] & 0xFF) << 8) | (head[5] & 0xFF);
                if (len > dataBytes - 6) return null;
                ByteArrayOutputStream all = new ByteArrayOutputStream();
                all.write(head);
                for (int off = 16; off < 6 + len; off += 16) all.write(readClassicChunk(off));
                return Arrays.copyOfRange(all.toByteArray(), 6, 6 + len);
            }
            // Read 4 pages at a time until the NDEF TLV is complete.
            ByteArrayOutputStream mem = new ByteArrayOutputStream();
            for (int p = 4; p < 4 + dataBytes / 4; p += 4) {
                mem.write(readPages(ch, p));
                Tlv r = parseTlv(mem.toByteArray());
                if (r != Tlv.MORE) return r.payload;
            }
            return null;
        }

        void erase() throws Exception {
            if (readOnly) throw new BridgeException("READ_ONLY", "This card is locked (read-only).");
            if (classic) {
                byte[] zero = new byte[dataBytes];
                for (int off = 0; off < dataBytes; off += 16) writeClassicChunk(zero, off);
            } else {
                // Empty NDEF message, then zero the rest of the user memory.
                writePage(4, new byte[]{0x03, 0x00, (byte) 0xFE, 0x00});
                for (int p = 5; p < 4 + dataBytes / 4; p++) writePage(p, new byte[4]);
            }
        }

        // ---- NTAG / Type 2

        void writePage(int page, byte[] four) throws CardException, BridgeException {
            byte[] apdu = new byte[9];
            apdu[0] = (byte) 0xFF; apdu[1] = (byte) 0xD6; apdu[2] = 0; apdu[3] = (byte) page; apdu[4] = 4;
            System.arraycopy(four, 0, apdu, 5, 4);
            ok(ch.transmit(new CommandAPDU(apdu)), "write page " + page);
        }

        /** Result of walking the TLVs: MORE = read more pages; otherwise payload (null = no data on the card). */
        record Tlv(byte[] payload) {
            static final Tlv MORE = new Tlv(null);
            static final Tlv NONE = new Tlv(null);
        }

        /** Walks the TLVs in Type 2 user memory looking for the NDEF message. */
        static Tlv parseTlv(byte[] m) throws BridgeException {
            int i = 0;
            while (i < m.length) {
                int t = m[i] & 0xFF;
                if (t == 0x00) { i++; continue; }                 // NULL TLV
                if (t == 0xFE) return Tlv.NONE;                    // terminator before any NDEF message
                if (i + 1 >= m.length) return Tlv.MORE;
                int len = m[i + 1] & 0xFF;
                int start = i + 2;
                if (len == 0xFF) {
                    if (i + 3 >= m.length) return Tlv.MORE;
                    len = ((m[i + 2] & 0xFF) << 8) | (m[i + 3] & 0xFF);
                    start = i + 4;
                }
                if (start + len > m.length) return Tlv.MORE;
                if (t == 0x03) return len == 0 ? Tlv.NONE : new Tlv(ndefPayload(Arrays.copyOfRange(m, start, start + len)));
                i = start + len;                                   // lock / memory control TLVs
            }
            return Tlv.MORE;
        }

        // ---- MIFARE Classic: chunk offsets map onto data blocks of sectors 1..15

        static int blockFor(int offset) {
            int idx = offset / 16;            // 0..44
            int sector = 1 + idx / 3;
            return sector * 4 + idx % 3;
        }

        static final byte[][] KEYS = {
                hexBytes("FFFFFFFFFFFF"), hexBytes("D3F7D3F7D3F7"), hexBytes("A0A1A2A3A4A5"), hexBytes("000000000000"),
        };

        void writeClassicChunk(byte[] buf, int offset) throws Exception {
            int block = blockFor(offset);
            byte[] data = Arrays.copyOfRange(buf, offset, offset + 16);
            int sector = block / 4;
            byte[] apdu = new byte[21];
            apdu[0] = (byte) 0xFF; apdu[1] = (byte) 0xD6; apdu[2] = 0; apdu[3] = (byte) block; apdu[4] = 16;
            System.arraycopy(data, 0, apdu, 5, 16);
            // Try each key until one both authenticates and is allowed to write.
            byte[][] cached = classicAuth.get(sector);
            if (cached != null && auth(block, cached[0], cached[1][0]) && isOk(ch.transmit(new CommandAPDU(apdu)))) return;
            for (byte keyType : new byte[]{0x60, 0x61}) {
                for (byte[] key : KEYS) {
                    if (auth(block, key, keyType) && isOk(ch.transmit(new CommandAPDU(apdu)))) {
                        classicAuth.put(sector, new byte[][]{key, {keyType}});
                        return;
                    }
                }
            }
            throw new BridgeException("AUTH_FAILED", "Cannot write sector " + sector + " of this MIFARE card (unknown keys or write-protected).");
        }

        byte[] readClassicChunk(int offset) throws Exception {
            int block = blockFor(offset);
            int sector = block / 4;
            CommandAPDU read = new CommandAPDU(new byte[]{(byte) 0xFF, (byte) 0xB0, 0, (byte) block, 16});
            byte[][] cached = classicAuth.get(sector);
            if (cached != null && auth(block, cached[0], cached[1][0])) {
                ResponseAPDU r = ch.transmit(read);
                if (isOk(r)) return r.getData();
            }
            for (byte keyType : new byte[]{0x60, 0x61}) {
                for (byte[] key : KEYS) {
                    if (!auth(block, key, keyType)) continue;
                    ResponseAPDU r = ch.transmit(read);
                    if (isOk(r)) {
                        classicAuth.put(sector, new byte[][]{key, {keyType}});
                        return r.getData();
                    }
                }
            }
            throw new BridgeException("AUTH_FAILED", "Cannot read sector " + sector + " of this MIFARE card (unknown keys).");
        }

        boolean auth(int block, byte[] key, byte keyType) throws CardException {
            byte[] load = new byte[11];
            load[0] = (byte) 0xFF; load[1] = (byte) 0x82; load[2] = 0; load[3] = 0; load[4] = 6;
            System.arraycopy(key, 0, load, 5, 6);
            if (!isOk(ch.transmit(new CommandAPDU(load)))) return false;
            return isOk(ch.transmit(new CommandAPDU(new byte[]{(byte) 0xFF, (byte) 0x86, 0, 0, 5, 1, 0, (byte) block, keyType, 0})));
        }

        @Override
        public void close() {
            try { card.disconnect(false); } catch (Exception ignored) { }
        }
    }

    // ------------------------------------------------------------------ NDEF

    static byte[] ndefMime(byte[] payload) throws IOException {
        byte[] type = MIME.getBytes(StandardCharsets.US_ASCII);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        boolean sr = payload.length < 256;
        out.write(0x80 | 0x40 | (sr ? 0x10 : 0) | 0x02);   // MB, ME, SR, TNF = MIME media type
        out.write(type.length);
        if (sr) out.write(payload.length);
        else { out.write(payload.length >>> 24); out.write(payload.length >>> 16); out.write(payload.length >>> 8); out.write(payload.length); }
        out.write(type);
        out.write(payload);
        return out.toByteArray();
    }

    /** First record's payload: our MIME record, or a well-known Text record. */
    static byte[] ndefPayload(byte[] msg) throws BridgeException {
        if (msg.length < 3) return null;
        int h = msg[0] & 0xFF;
        boolean sr = (h & 0x10) != 0, il = (h & 0x08) != 0;
        int tnf = h & 0x07;
        int i = 1;
        int typeLen = msg[i++] & 0xFF;
        long payloadLen;
        if (sr) payloadLen = msg[i++] & 0xFF;
        else { payloadLen = ((long) (msg[i] & 0xFF) << 24) | ((msg[i + 1] & 0xFF) << 16) | ((msg[i + 2] & 0xFF) << 8) | (msg[i + 3] & 0xFF); i += 4; }
        int idLen = il ? msg[i++] & 0xFF : 0;
        String type = new String(msg, i, typeLen, StandardCharsets.US_ASCII);
        i += typeLen + idLen;
        if (i + payloadLen > msg.length) throw new BridgeException("CORRUPT", "The data on the card is incomplete.");
        byte[] payload = Arrays.copyOfRange(msg, i, (int) (i + payloadLen));
        if (tnf == 0x01 && "T".equals(type) && payload.length > 0) {
            int langLen = payload[0] & 0x3F;
            return Arrays.copyOfRange(payload, 1 + langLen, payload.length);
        }
        return payload;
    }

    // ------------------------------------------------------------------ helpers

    static byte[] readPages(CardChannel ch, int page) throws CardException, BridgeException {
        byte[] d = ok(ch.transmit(new CommandAPDU(new byte[]{(byte) 0xFF, (byte) 0xB0, 0, (byte) page, 16})), "read page " + page);
        if (d.length < 4) throw new BridgeException("READ_FAILED", "Short read from the card.");
        return Arrays.copyOf(d, 16);
    }

    static boolean isOk(ResponseAPDU r) {
        return r.getSW() == 0x9000;
    }

    static byte[] ok(ResponseAPDU r, String what) throws BridgeException {
        if (!isOk(r)) throw new BridgeException("CARD_ERROR", "The card refused to " + what + String.format(" (status %04X). Keep the card on the reader.", r.getSW()));
        return r.getData();
    }

    static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02X", x));
        return sb.toString();
    }

    static byte[] hexBytes(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(i * 2, i * 2 + 2), 16);
        return b;
    }

    static String env(String k, String def) {
        String v = System.getenv(k);
        return v == null || v.isBlank() ? def : v;
    }

    static int parseInt(String s, int def) {
        try { return s == null ? def : Integer.parseInt(s); } catch (NumberFormatException e) { return def; }
    }

    static Map<String, String> query(URI uri) {
        Map<String, String> m = new HashMap<>();
        String q = uri.getRawQuery();
        if (q == null) return m;
        for (String p : q.split("&")) {
            int i = p.indexOf('=');
            if (i > 0) m.put(p.substring(0, i), java.net.URLDecoder.decode(p.substring(i + 1), StandardCharsets.UTF_8));
        }
        return m;
    }

    static final class BridgeException extends Exception {
        final String code;
        BridgeException(String code, String message) { super(message); this.code = code; }
    }

    /** Minimal JSON writer for the responses (maps, lists, strings, numbers, booleans, null). */
    static final class Json {
        static String write(Object o) {
            StringBuilder sb = new StringBuilder();
            write(sb, o);
            return sb.toString();
        }

        static void write(StringBuilder sb, Object o) {
            if (o == null) sb.append("null");
            else if (o instanceof Boolean || o instanceof Number) sb.append(o);
            else if (o instanceof Map<?, ?> m) {
                sb.append('{');
                boolean first = true;
                for (var e : m.entrySet()) {
                    if (!first) sb.append(',');
                    first = false;
                    write(sb, String.valueOf(e.getKey()));
                    sb.append(':');
                    write(sb, e.getValue());
                }
                sb.append('}');
            } else if (o instanceof Collection<?> c) {
                sb.append('[');
                boolean first = true;
                for (Object x : c) { if (!first) sb.append(','); first = false; write(sb, x); }
                sb.append(']');
            } else {
                String s = o.toString();
                sb.append('"');
                for (char ch : s.toCharArray()) {
                    switch (ch) {
                        case '"' -> sb.append("\\\"");
                        case '\\' -> sb.append("\\\\");
                        case '\n' -> sb.append("\\n");
                        case '\r' -> sb.append("\\r");
                        case '\t' -> sb.append("\\t");
                        default -> { if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch)); else sb.append(ch); }
                    }
                }
                sb.append('"');
            }
        }
    }
}
