const dt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const d = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

export const fmtDateTime = (iso) => (iso ? dt.format(new Date(iso)) : '—');
export const fmtTime = (iso) => (iso ? t.format(new Date(iso)) : '—');
export const fmtDate = (isoOrDate) => {
  if (!isoOrDate) return '—';
  const v = typeof isoOrDate === 'string' && isoOrDate.length === 10 ? isoOrDate + 'T00:00:00' : isoOrDate;
  return d.format(new Date(v));
};

export function fmtMinutes(mins) {
  if (mins === null || mins === undefined) return '—';
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const minutesSince = (iso) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)) : null);

/** Local date as yyyy-mm-dd (for <input type=date>). */
export function isoDate(date = new Date()) {
  const z = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export const VISIT_STATUS = {
  PENDING_VERIFICATION: { label: 'Needs ID check', tone: 'warning' },
  PENDING_SIGNATURE: { label: 'Needs signature', tone: 'warning' },
  WAITING: { label: 'Waiting for host', tone: 'info' },
  DELAYED: { label: 'Delayed by host', tone: 'warning' },
  ACCEPTED: { label: 'Accepted', tone: 'good' },
  DECLINED: { label: 'Declined', tone: 'serious' },
  IN_PREMISES: { label: 'In premises', tone: 'good' },
  COMPLETED: { label: 'Completed', tone: '' },
  CANCELLED: { label: 'Cancelled', tone: '' },
};

export const ID_TYPES = { NIC: 'NIC', PASSPORT: 'Passport', DRIVING_LICENCE: 'Driving licence', OTHER: 'Other' };

export const OWNER_TYPES = { STAFF: 'Staff', VISITOR: 'Visitor', OFFICIAL: 'Official', CONTRACTOR: 'Contractor' };

export const LANGUAGES = { en: 'English', si: 'සිංහල', ta: 'தமிழ்' };
