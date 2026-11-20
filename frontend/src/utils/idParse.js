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

// Field separators used by ID barcodes. Commas are handled separately (they also appear inside addresses).
// eslint-disable-next-line no-control-regex
const FIELD_SEP = /[\r\n\t|;^~\u0000-\u001f]+/;

/** Splits decoded barcode text into its fields, in order. Falls back to commas when nothing else separates them. */
function fields(text) {
  const s = String(text || '');
  let parts = s.split(FIELD_SEP);
  if (parts.filter((p) => p.trim()).length <= 2 && s.includes(',')) parts = s.split(/[\r\n\t|;^~,]+/);
  return parts.map((p) => p.trim().replace(/\s+/g, ' ')).filter((p) => p.length >= 1 && p.length <= 200);
}

/** Distinct, readable values from decoded barcode text (shown as pick buttons). Commas are kept so addresses stay whole. */
export function tokens(text) {
  const parts = String(text || '')
    .split(FIELD_SEP)
    .map((p) => p.trim().replace(/^[\p{L} ]{2,20}[:=]\s*/u, ''))
    .filter((p) => p.length >= 2 && p.length <= 120 && /[\p{L}\p{N}]/u.test(p));
  return [...new Set(parts)].slice(0, 20);
}

// Card headers, labels and other text that is never the holder's name or address.
const NOT_PERSONAL = /\b(REPUBLIC|SRI LANKA|DEMOCRATIC|SOCIALIST|IDENTITY|IDENTIFICATION|CARD|DEPARTMENT|REGISTRATION|GOVERNMENT|NATIONAL|LICEN[CS]E|PASSPORT|COMMISSIONER|AUTHORITY|ISSUE|EXPIRY|EXPIRES|VALID)\b/i;
const GENDER = /^(M|F|MALE|FEMALE|MALES?|FEMALES?)$/i;
const ADDRESS_WORD = /\b(NO|ROAD|RD|STREET|ST|MAWATHA|MW|LANE|PLACE|PL|AVENUE|AVE|GARDENS?|ESTATE|VILLAGE|WATTA|PEDESA|JUNCTION|TOWN|CITY|P\.?O|POST|COLOMBO|KANDY|GALLE|JAFFNA)\b/i;

/** A date written as yyyy-mm-dd, dd/mm/yyyy (separators - / . or space) or yyyymmdd. Returns 'yyyy-mm-dd' or null. */
export function parseDate(p) {
  const s = String(p || '').trim();
  let m = s.match(/^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/) || s.match(/^((?:19|20)\d{2})(\d{2})(\d{2})$/);
  let y; let mo; let d;
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/))) [, d, mo, y] = m;
  else return null;
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +mo - 1 || date.getUTCDate() !== +d) return null;
  if (+y < 1900 || date > new Date()) return null;
  return date.toISOString().slice(0, 10);
}

/** A field that looks like an address: commas/slashes, a house number with words, or a street word. */
function looksLikeAddress(p) {
  return /\p{L}{2,}/u.test(p) && !parseDate(p) && !NOT_PERSONAL.test(p)
    && (/[,/]/.test(p) || (/\d/.test(p) && /\p{L}{3,}/u.test(p)) || ADDRESS_WORD.test(p));
}

/** A field that looks like a person's name: letters, spaces, dots, hyphens, apostrophes - not a header or address. */
function looksLikeName(p) {
  return /^[\p{L}][\p{L} .'-]{3,}$/u.test(p) && /\p{L}{2,}/u.test(p)
    && !GENDER.test(p) && !NOT_PERSONAL.test(p) && !ADDRESS_WORD.test(p);
}

/** Reads "Label: value" / "Label=value" fields, if the barcode uses them. */
function labelled(list) {
  const out = {};
  for (const p of list) {
    const m = p.match(/^([\p{L} ]{2,20}?)\s*[:=]\s*(.+)$/u);
    if (!m) continue;
    const label = m[1].toLowerCase().replace(/\s+/g, ' ').trim();
    const value = m[2].trim();
    if (/^(full )?name|^holder/.test(label)) out.name ??= value;
    else if (/birth|^dob$|^d\.?o\.?b/.test(label)) out.birthDate ??= parseDate(value);
    else if (/^(permanent |residential )?addr/.test(label)) out.address ??= value;
  }
  return out;
}

/**
 * Pulls what we can out of decoded barcode text.
 * Returns { raw, idType, idNumber, nic, suggestedName, birthDate, address, tokens }.
 *
 * - Labelled fields ("Name: ...") win when present.
 * - The name is the first name-like field (cards list the name before the address); headers,
 *   gender and street names are skipped.
 * - The address starts at the first address-like field and takes the text fields after it
 *   (multi-line addresses), stopping at a date, gender or the NIC number.
 * - The date of birth is the NIC-encoded one (the NIC number is authoritative); other
 *   printed dates are usually issue/expiry dates. Without a NIC, the earliest printed date is used.
 */
export function parseIdText(raw) {
  const nic = findNic(raw);
  const isNic = (p) => nic && p.replace(/\s+/g, '').toUpperCase().includes(nic.number);
  const all = fields(raw);
  const tagged = labelled(all);
  const list = all
    .filter((p) => !isNic(p))
    .map((p) => p.replace(/^[\p{L} ]{2,20}[:=]\s*/u, ''))
    .filter((p) => p && /[\p{L}\p{N}]/u.test(p));

  const name = tagged.name || list.find((p) => looksLikeName(p) && p.trim().includes(' ')) || list.find(looksLikeName) || '';

  let address = tagged.address || '';
  if (!address) {
    const start = list.findIndex((p) => p !== name && looksLikeAddress(p));
    if (start >= 0) {
      const lines = [];
      for (const p of list.slice(start)) {
        if (p === name || parseDate(p) || GENDER.test(p) || NOT_PERSONAL.test(p) || !/\p{L}{2,}/u.test(p)) break;
        lines.push(p.replace(/,+$/, ''));
      }
      address = lines.join(', ').slice(0, 500);
    }
  }

  const dates = list.map(parseDate).filter(Boolean).sort();
  const birthDate = tagged.birthDate || nic?.birthDate || dates[0] || '';

  return {
    raw,
    idType: nic ? 'NIC' : '',
    idNumber: nic ? nic.number : '',
    nic,
    suggestedName: name ? titleCase(name) : '',
    birthDate,
    address: address ? titleCase(address) : '',
    tokens: tokens(raw),
  };
}

export function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s.'/,-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}
