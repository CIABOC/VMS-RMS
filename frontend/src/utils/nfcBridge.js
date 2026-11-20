// Talks to the NFC bridge running on this PC (nfc-bridge/NfcBridge.java), which drives the USB
// NFC reader. The browser cannot use a USB reader itself, so card reads/writes go through it.

export const BRIDGE_URL = (import.meta.env.VITE_NFC_BRIDGE_URL || 'http://127.0.0.1:47800').replace(/\/+$/, '');
const WAIT_MS = 20000;

export class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function call(method, path, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (timeoutMs || 5000) + 5000);
  let res;
  try {
    res = await fetch(BRIDGE_URL + path, {
      method,
      body,
      headers: body !== undefined ? { 'Content-Type': 'text/plain; charset=utf-8' } : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new BridgeError('BRIDGE_OFFLINE',
      'The NFC reader program is not running on this PC. Start "nfc-bridge\\start-nfc-bridge.cmd" and try again.');
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !data?.ok) throw new BridgeError(data?.code || 'FAILED', data?.error || `NFC reader error (${res.status})`);
  return data;
}

/** Reader and card currently on it (does not wait). */
export const bridgeStatus = () => call('GET', '/status');

/** Waits for a card, writes the text, reads it back. Resolves to { uid, type, capacity, maxPayload, bytesWritten }. */
export const writeCard = (text, timeoutMs = WAIT_MS) => call('POST', `/write?timeoutMs=${timeoutMs}`, text, timeoutMs);

/** Waits for a card and reads it. Resolves to { uid, type, empty, text }. */
export const readCard = (timeoutMs = WAIT_MS) => call('POST', `/read?timeoutMs=${timeoutMs}`, undefined, timeoutMs);

/** Waits for a card and clears it. Resolves to { uid, type }. */
export const eraseCard = (timeoutMs = WAIT_MS) => call('POST', `/erase?timeoutMs=${timeoutMs}`, undefined, timeoutMs);

/** Waits until a card is on the reader and returns its details (uid, type, maxPayload). */
export async function waitForCard(timeoutMs = WAIT_MS, signal) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const s = await bridgeStatus();
    if (!s.reader) throw new BridgeError('NO_READER', 'No NFC reader is connected to this PC.');
    if (s.cardPresent && s.card) return s.card;
    if (s.cardPresent && s.cardError) throw new BridgeError('UNSUPPORTED', s.cardError);
    if (signal?.aborted) throw new BridgeError('CANCELLED', 'Cancelled.');
    if (Date.now() > until) throw new BridgeError('NO_CARD', 'No card was placed on the reader.');
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** Labels for the short keys used on the card (see backend CardService). */
export const CARD_FIELDS = {
  nm: 'Name', idt: 'ID type', idn: 'ID number', dob: 'Date of birth', adr: 'Address', mob: 'Mobile',
  org: 'Organisation', cat: 'Category', hst: 'Host', pur: 'Purpose', dt: 'Visit date', tok: 'Token',
  vid: 'Visit', exp: 'Valid until', iss: 'Issued',
};
