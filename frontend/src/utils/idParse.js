// Helpers for reading details out of a scanned identity document barcode.
//
// Barcode layouts differ between card issues (NIC, driving licence, ...), so nothing here
// assumes a fixed layout. We find a Sri Lankan NIC number anywhere in the text, derive the
// date of birth and gender that the number itself encodes, and split the rest into tokens the
// receptionist can pick from. Everything is shown for confirmation - never saved blindly.

// NIC day-of-year counts February as 29 days in every year.
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const NEW_NIC = /(?<!\d)((?:19|20)\d{2})(\d{3})(\d{5})(?!\d)/;
const OLD_NIC = /(?<![\dA-Z])(\d{2})(\d{3})(\d{4})([VX])(?![A-Z])/i;

/**
 * Parses a Sri Lankan NIC number (old 9 digits + V/X, or new 12 digits).
 * Returns { number, format, birthDate: 'yyyy-mm-dd', gender } or null if it is not a valid NIC.
 */
export function parseNic(value) {
  const s = String(value || '').replace(/\s+/g, '').toUpperCase();
  let m = s.match(/^((?:19|20)\d{2})(\d{3})(\d{5})$/);
  let year;
  let days;
  let format;
  if (m) {
    year = Number(m[1]);
    days = Number(m[2]);
    format = 'NEW';
  } else {
    m = s.match(/^(\d{2})(\d{3})(\d{4})([VX])$/);
    if (!m) return null;
    year = 1900 + Number(m[1]);
    days = Number(m[2]);
    format = 'OLD';
  }
  const gender = days > 500 ? 'Female' : 'Male';
  if (days > 500) days -= 500;
  if (days < 1 || days > 366) return null;

  let month = 0;
  while (days > MONTH_DAYS[month]) days -= MONTH_DAYS[month++];
  // Day 60 (29 Feb) in a non-leap year is not a real date.
  if (month === 1 && days === 29 && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) return null;
  const birthDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
  return { number: s, format, birthDate, gender };
}

/** Finds the first valid NIC number anywhere in a block of text. */
export function findNic(text) {
  const t = String(text || '').toUpperCase();
  for (const re of [NEW_NIC, OLD_NIC]) {
    const m = t.match(re);
    if (m) {
      const nic = parseNic(m[0]);
      if (nic) return nic;
    }
  }
  return null;
}

/** Splits decoded barcode text into distinct, readable values. */
export function tokens(text) {
  const parts = String(text || '')
    // eslint-disable-next-line no-control-regex
    .split(/[\r\n\t|;^~,\u0000-\u001f]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && p.length <= 120 && /[\p{L}\p{N}]/u.test(p));
  return [...new Set(parts)].slice(0, 20);
}

/** A token that looks like a person's name: letters, spaces, dots, hyphens, apostrophes. */
function looksLikeName(p) {
  return /^[\p{L}][\p{L} .'-]{3,}$/u.test(p) && /\p{L}{2,}/u.test(p);
}

/**
 * Pulls what we can out of decoded barcode text.
 * Returns { raw, idType, idNumber, nic, suggestedName, tokens }.
 */
export function parseIdText(raw) {
  const nic = findNic(raw);
  const list = tokens(raw);
  const names = list.filter(looksLikeName).sort((a, b) => b.length - a.length);
  return {
    raw,
    idType: nic ? 'NIC' : '',
    idNumber: nic ? nic.number : '',
    nic,
    suggestedName: names[0] ? titleCase(names[0]) : '',
    tokens: list,
  };
}

export function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}
