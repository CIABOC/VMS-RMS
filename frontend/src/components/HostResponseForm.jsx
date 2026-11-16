import { useState } from 'react';
import { api } from '../api/client.js';
import { useAction, useApi } from '../hooks/useApi.js';
import { ErrorBanner, Field } from './ui.jsx';

const DELAYS = [5, 10, 15, 30, 45, 60];

/** Accept / delay / redirect / decline. Used by the host inbox (08) and by reception on behalf of a host (07). */
export default function HostResponseForm({ visit, endpoint, onDone }) {
  const [mode, setMode] = useState(null);
  const [minutes, setMinutes] = useState(15);
  const [hostId, setHostId] = useState('');
  const [note, setNote] = useState('');
  const { data: hosts } = useApi(mode === 'REDIRECT' ? '/reference/hosts' : null);
  const { busy, error, run } = useAction();

  const send = (action) => run(async () => {
    await api.post(endpoint, {
      action,
      delayMinutes: action === 'DELAY' ? Number(minutes) : null,
      redirectHostId: action === 'REDIRECT' ? Number(hostId) : null,
      note,
    });
    setMode(null);
    setNote('');
    onDone?.();
  });

  return (
    <div>
      <ErrorBanner error={error} />
      {!mode && (
        <div className="btns" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className="btn good" disabled={busy} onClick={() => send('ACCEPT')}>Accept</button>
          <button className="btn" disabled={busy} onClick={() => setMode('DELAY')}>Delay</button>
          <button className="btn" disabled={busy} onClick={() => setMode('REDIRECT')}>Redirect</button>
          <button className="btn danger" disabled={busy} onClick={() => setMode('DECLINE')}>Decline</button>
        </div>
      )}
      {mode && (
        <div className="stack">
          {mode === 'DELAY' && (
            <Field label="Ask the visitor to wait">
              <select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
                {DELAYS.map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </Field>
          )}
          {mode === 'REDIRECT' && (
            <Field label="Redirect to">
              <select value={hostId} onChange={(e) => setHostId(e.target.value)}>
                <option value="">Choose an officer…</option>
                {(hosts || []).filter((h) => h.id !== visit.hostId).map((h) => (
                  <option key={h.id} value={h.id}>{h.fullName}{h.department ? ` — ${h.department}` : ''}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label={mode === 'DECLINE' ? 'Reason (required)' : 'Note (optional)'}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          <div className="actions">
            <button className="btn" onClick={() => setMode(null)}>Back</button>
            <button className={`btn ${mode === 'DECLINE' ? 'danger' : 'primary'}`} onClick={() => send(mode)}
              disabled={busy || (mode === 'DECLINE' && !note.trim()) || (mode === 'REDIRECT' && !hostId)}>
              Confirm {mode.toLowerCase()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
