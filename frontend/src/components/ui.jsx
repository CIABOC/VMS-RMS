import { useEffect, useId, useRef } from 'react';
import { VISIT_STATUS } from '../utils/format.js';

export function PageHeader({ no, title, children, actions }) {
  useEffect(() => { document.title = `${title} · CIABOC RVM`; }, [title]);
  return (
    <header className="page-head">
      <div>
        {no && <div className="eyebrow">Screen {no}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function StatTile({ label, value, hint }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value ?? '—'}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const s = VISIT_STATUS[status] || { label: status, tone: '' };
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}

export function Badge({ tone = '', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function ErrorBanner({ error }) {
  if (!error) return null;
  return <div className="alert serious" role="alert">{error.message || String(error)}</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Loading({ what = '' }) {
  return <div className="empty" aria-live="polite">Loading{what ? ` ${what}` : ''}…</div>;
}

/** Labelled form control. `error` comes from ApiError.fieldErrors. */
export function Field({ label, hint, error, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
      {error && <span className="err">{error}</span>}
    </label>
  );
}

/** Native <dialog> modal. */
export function Dialog({ open, title, onClose, children, footer, className }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby={titleId} className={className}>
      <div className="dlg-body">
        <h2 id={titleId}style={{ fontSize: 18, marginBottom: 12 }}>{title}</h2>
        {children}
      </div>
      {footer && <div className="dlg-foot">{footer}</div>}
    </dialog>
  );
}
