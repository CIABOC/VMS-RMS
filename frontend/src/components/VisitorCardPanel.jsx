import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import { Badge, Dialog, ErrorBanner, Field } from './ui.jsx';
import { CARD_FIELDS, eraseCard, waitForCard, writeCard } from '../utils/nfcBridge.js';
import { fmtDateTime } from '../utils/format.js';

const STATUS = {
  ISSUED: { label: 'With visitor', tone: 'info' },
  RETURNED: { label: 'Returned', tone: 'good' },
  REPLACED: { label: 'Replaced', tone: '' },
  LOST: { label: 'Not returned', tone: 'serious' },
};

/**
 * Temporary visitor NFC card for one visit: write the visitor's verified details to a card,
 * collect (erase) it at check-out, or record that it was not handed back.
 */
export default function VisitorCardPanel({ visitId, visitStatus, compact = false }) {
  const { data, reload } = useApi(`/visits/${visitId}/card`);
  const [step, setStep] = useState(null);      // null | 'wait' | 'write' | 'erase' | 'lost'
  const [msg, setMsg] = useState(null);        // { tone, text }
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const active = data?.active;
  const canIssue = !['PENDING_VERIFICATION', 'COMPLETED', 'CANCELLED', 'DECLINED'].includes(visitStatus);
  const busy = step === 'wait' || step === 'write' || step === 'erase';

  const issue = async () => {
    setError(null); setMsg(null);
    try {
      setStep('wait');
      const card = await waitForCard();
      if (card.readOnly) throw new Error('This card is locked (read-only). Use another card.');
      const payload = await api.get(`/visits/${visitId}/card/payload?maxBytes=${card.maxPayload}`);
      setStep('write');
      const written = await writeCard(payload.text, 5000);
      if (written.uid !== card.uid) throw new Error('A different card was placed on the reader. Try again with one card.');
      await api.post(`/visits/${visitId}/card`, { cardUid: written.uid, cardType: written.type, text: payload.text });
      const left = payload.omitted.map((k) => CARD_FIELDS[k]?.toLowerCase() || k);
      setMsg({
        tone: left.length ? 'warning' : 'good',
        text: `Card ${written.uid} (${written.type}) is ready. Hand it to the visitor.`
          + (left.length ? ` The card is small, so these were left off: ${left.join(', ')}.` : ''),
      });
      await reload();
    } catch (e) {
      if (!cancelled.current) setError(e);
    } finally {
      if (!cancelled.current) setStep(null);
    }
  };

  const collect = async () => {
    setError(null); setMsg(null);
    try {
      setStep('erase');
      const erased = await eraseCard();
      const r = await api.post('/cards/return', { cardUid: erased.uid, erased: true });
      setMsg(r.card
        ? { tone: 'good', text: `Card ${erased.uid} returned and cleared. It can be given to the next visitor.` }
        : { tone: 'warning', text: `Card ${erased.uid} was cleared, but it was not registered as out with any visitor.` });
      await reload();
    } catch (e) {
      if (!cancelled.current) setError(e);
    } finally {
      if (!cancelled.current) setStep(null);
    }
  };

  const markLost = async () => {
    setError(null);
    try {
      await api.post(`/visits/${visitId}/card/lost`, { note });
      setStep(null); setNote('');
      setMsg({ tone: 'warning', text: 'Recorded that the card was not returned. It will fail every card check.' });
      await reload();
    } catch (e) { setError(e); }
  };

  const prompt = step === 'wait' ? 'Place a blank visitor card on the NFC reader…'
    : step === 'write' ? 'Writing… keep the card on the reader.'
      : step === 'erase' ? 'Place the returned card on the NFC reader…' : null;

  return (
    <section className={compact ? '' : 'card'} aria-labelledby={`card-h-${visitId}`}>
      <h2 id={`card-h-${visitId}`} style={compact ? { fontSize: 16 } : undefined}>Visitor NFC card</h2>
      {active ? (
        <p style={{ margin: '6px 0 10px' }}>
          <Badge tone="info">With visitor</Badge> Card <span className="mono">{active.cardUid}</span>
          {active.cardType ? ` · ${active.cardType}` : ''} · issued {fmtDateTime(active.issuedAt)}
        </p>
      ) : (
        <p className="small muted" style={{ margin: '6px 0 10px' }}>
          {canIssue
            ? 'Write the verified visitor details to a temporary NFC card for the visitor to carry.'
            : visitStatus === 'PENDING_VERIFICATION' ? 'Verify the visitor\'s identity first.' : 'No card is out for this visit.'}
        </p>
      )}

      {prompt && <div className="alert info" role="status" aria-live="polite">{prompt}</div>}
      {msg && <div className={`alert ${msg.tone}`} role="status">{msg.text}</div>}
      <ErrorBanner error={error} />

      <div className="actions" style={{ marginTop: 10 }}>
        {canIssue && (
          <button className={`btn ${active ? '' : 'primary'}`} onClick={issue} disabled={busy}>
            {active ? 'Write a new card (replaces it)' : 'Write visitor card'}
          </button>
        )}
        {active && <button className="btn primary" onClick={collect} disabled={busy}>Collect &amp; clear card</button>}
        {active && <button className="btn danger" onClick={() => setStep('lost')} disabled={busy}>Not returned</button>}
      </div>

      {!compact && data?.history?.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="small">Card history ({data.history.length})</summary>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Card</th><th>Status</th><th>Issued</th><th>Back</th></tr></thead>
            <tbody>
              {data.history.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.cardUid}<div className="small muted">{c.cardType}</div></td>
                  <td><Badge tone={STATUS[c.status]?.tone}>{STATUS[c.status]?.label || c.status}</Badge>
                    {c.note && <div className="small muted">{c.note}</div>}</td>
                  <td className="small">{fmtDateTime(c.issuedAt)}<div className="muted">{c.issuedBy}</div></td>
                  <td className="small">{c.returnedAt ? fmtDateTime(c.returnedAt) : '—'}{c.erased && <div className="muted">cleared</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <Dialog open={step === 'lost'} title="Card not returned" onClose={() => setStep(null)} footer={<>
        <button className="btn" onClick={() => setStep(null)}>Close</button>
        <button className="btn danger" onClick={markLost}>Record as not returned</button>
      </>}>
        <ErrorBanner error={error} />
        <p style={{ marginBottom: 10 }}>The card holds the visitor's personal details. Recording it as not returned makes every later check of this card fail.</p>
        <Field label="Note" hint="Optional"><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
      </Dialog>
    </section>
  );
}
