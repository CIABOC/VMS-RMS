import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Badge, ErrorBanner, PageHeader, StatusBadge } from '../components/ui.jsx';
import { CARD_FIELDS, eraseCard, readCard } from '../utils/nfcBridge.js';
import { ID_TYPES, fmtDate, fmtDateTime } from '../utils/format.js';

const ORDER = ['nm', 'idt', 'idn', 'dob', 'adr', 'mob', 'org', 'cat', 'hst', 'pur', 'dt', 'tok', 'exp', 'iss'];

function show(k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'idt') return ID_TYPES[v] || v;
  if (k === 'dob' || k === 'dt') return fmtDate(v);
  if (k === 'exp' || k === 'iss') return fmtDateTime(v);
  return String(v);
}

/** Screen 16 - tap a visitor NFC card to see who it belongs to and whether it is genuine and still valid. */
export default function CardCheck() {
  const { roles } = useAuth();
  const isReception = roles.includes('RECEPTIONIST');
  const [state, setState] = useState(null);    // null | 'reading' | 'erasing'
  const [card, setCard] = useState(null);      // bridge result
  const [result, setResult] = useState(null);  // server check
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const check = async () => {
    setError(null); setMsg(null); setResult(null); setCard(null);
    try {
      setState('reading');
      const c = await readCard();
      setCard(c);
      if (c.empty) return;
      setResult(await api.post('/cards/check', { text: c.text, cardUid: c.uid }));
    } catch (e) { setError(e); } finally { setState(null); }
  };

  const collect = async () => {
    setError(null); setMsg(null);
    try {
      setState('erasing');
      const c = await eraseCard();
      const r = await api.post('/cards/return', { cardUid: c.uid, erased: true });
      setMsg(r.card ? `Card ${c.uid} returned and cleared.` : `Card ${c.uid} cleared (it was not registered as out).`);
      setResult(null); setCard(null);
    } catch (e) { setError(e); } finally { setState(null); }
  };

  const d = result?.data;
  return (
    <>
      <PageHeader no="16" title="Check visitor card" actions={
        <button className="btn primary" onClick={check} disabled={!!state}>{state === 'reading' ? 'Waiting for card…' : 'Read card'}</button>}>
        Tap a visitor's NFC card on the reader to see its details and whether it is genuine and still valid.
      </PageHeader>

      {state === 'reading' && <div className="alert info" role="status">Place the visitor card on the NFC reader…</div>}
      {state === 'erasing' && <div className="alert info" role="status">Keep the card on the reader while it is cleared…</div>}
      {msg && <div className="alert good" role="status">{msg}</div>}
      <ErrorBanner error={error} />

      {card?.empty && <div className="alert warning" style={{ marginTop: 12 }}>Card {card.uid} ({card.type}) is blank.</div>}

      {result && (
        <section className="card" style={{ marginTop: 12 }} aria-live="polite">
          <div className={`alert ${result.ok ? 'good' : 'serious'}`}>
            <div>
              <b>{result.ok ? 'Valid visitor card' : 'Do not accept this card'}</b>
              {result.problems.length > 0 && <ul style={{ margin: '6px 0 0 18px' }}>{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
            </div>
          </div>
          <div className="row" style={{ gap: 8, margin: '12px 0' }}>
            <Badge tone={result.signatureValid ? 'good' : 'serious'}>{result.signatureValid ? 'Signature valid' : 'Signature invalid'}</Badge>
            <Badge tone={result.registered ? 'good' : 'serious'}>{result.registered ? 'Registered as issued' : 'Not registered'}</Badge>
            {result.expired && <Badge tone="serious">Expired</Badge>}
            {result.visitStatus && <StatusBadge status={result.visitStatus} />}
            <span className="small muted">Card <span className="mono">{card?.uid}</span> · {card?.type}</span>
          </div>
          {d && (
            <table><tbody>
              {ORDER.filter((k) => k in d).map((k) => (
                <tr key={k}><th scope="row">{CARD_FIELDS[k]}</th><td>{show(k, d[k])}</td></tr>
              ))}
            </tbody></table>
          )}
          <div className="actions" style={{ marginTop: 12 }}>
            {isReception && result.visitId && result.signatureValid && <Link className="btn" to={`/visits/${result.visitId}`}>Open visit</Link>}
            {isReception && <button className="btn primary" onClick={collect} disabled={!!state}>Collect &amp; clear card</button>}
          </div>
        </section>
      )}
    </>
  );
}
