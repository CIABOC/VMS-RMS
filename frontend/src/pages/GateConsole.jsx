import { useState } from 'react';
import { api, qs } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAction } from '../hooks/useApi.js';
import { Badge, ErrorBanner, Field, PageHeader } from '../components/ui.jsx';
import { OWNER_TYPES, fmtDateTime, fmtMinutes, minutesSince } from '../utils/format.js';

const GATE_KEY = 'rvm.gateName';
const readGate = () => { try { return localStorage.getItem(GATE_KEY) || ''; } catch { return ''; } };
const saveGate = (v) => { try { localStorage.setItem(GATE_KEY, v); } catch { /* storage unavailable */ } };

/** Screen 10 - gate console: plate lookup and the admission decision. */
export default function GateConsole() {
  const { hasRole } = useAuth();
  const supervisor = hasRole('SECURITY_SUPERVISOR');
  const [plate, setPlate] = useState('');
  const [result, setResult] = useState(null);
  const [gate, setGate] = useState(readGate);
  const [driver, setDriver] = useState('');
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(null);
  const { busy, error, setError, run } = useAction();

  const lookup = (e) => {
    e?.preventDefault();
    setDone(null);
    run(async () => {
      setResult(await api.get(`/gate/lookup${qs({ plate })}`));
      setReason('');
      setDriver('');
    });
  };

  const record = (direction, decision) => run(async () => {
    const m = await api.post('/gate/movements', {
      vehicleId: result.vehicle.id, direction, decision, reason, driverName: driver, gate,
    });
    setDone(m);
    setResult(await api.get(`/gate/lookup${qs({ plate: result.vehicle.plateNo })}`));
    setReason('');
  });

  const v = result?.vehicle;
  const needsReason = v && !result.inside && (v.flagged || v.blocked);

  return (
    <>
      <PageHeader no="10" title="Gate console">Enter the vehicle number to see its record and decide.</PageHeader>
      <form className="card" onSubmit={lookup}>
        <div className="row">
          <div className="grow">
            <Field label="Vehicle number">
              <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} autoFocus required
                style={{ fontSize: 22, letterSpacing: '.08em', fontWeight: 700, minHeight: 50 }} autoComplete="off" />
            </Field>
          </div>
          <div style={{ width: 200 }}>
            <Field label="Gate" hint="Remembered on this device">
              <input value={gate} onChange={(e) => { setGate(e.target.value); saveGate(e.target.value); }} maxLength={50} />
            </Field>
          </div>
          <button className="btn primary" style={{ minHeight: 50 }} disabled={busy}>Look up</button>
        </div>
      </form>
      <div style={{ marginTop: 16 }}><ErrorBanner error={error} /></div>
      {done && (
        <div className={`alert ${done.decision === 'DENIED' ? 'serious' : 'good'}`} role="status" style={{ marginTop: 12 }}>
          Recorded: {done.plateNo} {done.direction.toLowerCase()} {done.decision.toLowerCase()} at {fmtDateTime(done.occurredAt)}.
        </div>
      )}

      {result && !v && (
        <RegisterVehicle plate={result.normalisedPlate} onSaved={async (saved) => {
          setError(null);
          setResult(await api.get(`/gate/lookup${qs({ plate: saved.plateNo })}`));
        }} />
      )}

      {v && (
        <div className="grid two" style={{ marginTop: 16 }}>
          <section className="card">
            <h2>
              <span className="mono" style={{ fontSize: 22 }}>{v.plateNo}</span>
              <span className="actions">
                {v.blocked && <Badge tone="serious">Blocked</Badge>}
                {v.flagged && !v.blocked && <Badge tone="warning">Flagged</Badge>}
                <Badge tone={result.inside ? 'good' : ''}>{result.inside ? 'Inside' : 'Outside'}</Badge>
              </span>
            </h2>
            {v.flagged && <div className="alert serious" style={{ marginBottom: 12 }}><b>Flag:</b> {v.flagReason}</div>}
            <table><tbody>
              <tr><th scope="row">Owner</th><td>{OWNER_TYPES[v.ownerType]}{v.ownerName ? ` · ${v.ownerName}` : ''}</td></tr>
              <tr><th scope="row">Vehicle</th><td>{[v.makeModel, v.colour].filter(Boolean).join(' · ') || '—'}</td></tr>
              {result.inside && <tr><th scope="row">Inside since</th><td>{fmtDateTime(result.insideSince)} ({fmtMinutes(minutesSince(result.insideSince))})</td></tr>}
            </tbody></table>

            <div className="stack" style={{ marginTop: 14 }}>
              {!result.inside && <Field label="Driver name (optional)"><input value={driver} onChange={(e) => setDriver(e.target.value)} maxLength={200} /></Field>}
              <Field label={needsReason ? 'Reason (required for a flagged vehicle)' : 'Reason / remark'}>
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
              </Field>
              <div className="actions">
                {result.inside ? (
                  <button className="btn primary" disabled={busy} onClick={() => record('EXIT', 'ADMITTED')}>Record exit</button>
                ) : (
                  <>
                    <button className="btn good" disabled={busy || (needsReason && !reason.trim()) || (v.blocked && !supervisor)}
                      onClick={() => record('ENTRY', 'ADMITTED')}>
                      {v.blocked ? 'Override block and admit' : 'Admit'}
                    </button>
                    <button className="btn danger" disabled={busy || !reason.trim()} onClick={() => record('ENTRY', 'DENIED')}>Deny entry</button>
                  </>
                )}
              </div>
              {v.blocked && !supervisor && !result.inside && <p className="small muted">Blocked vehicles can only be admitted by a Security Supervisor.</p>}
            </div>
          </section>

          <section className="card">
            <h2>Recent movements</h2>
            {result.recent.length === 0 ? <p className="muted small">No movements recorded.</p> : (
              <table>
                <thead><tr><th>When</th><th>Direction</th><th>Decision</th><th>Gate</th></tr></thead>
                <tbody>{result.recent.map((m) => (
                  <tr key={m.id}><td>{fmtDateTime(m.occurredAt)}</td><td>{m.direction.toLowerCase()}</td>
                    <td><Badge tone={m.decision === 'DENIED' ? 'serious' : 'good'}>{m.decision.toLowerCase()}</Badge>
                      {m.reason && <div className="small muted">{m.reason}</div>}</td>
                    <td>{m.gate || '—'}</td></tr>
                ))}</tbody>
              </table>
            )}
            {supervisor && <FlagForm vehicle={v} onSaved={(nv) => setResult({ ...result, vehicle: nv })} />}
          </section>
        </div>
      )}
    </>
  );
}

function RegisterVehicle({ plate, onSaved }) {
  const [f, setF] = useState({ plateNo: plate, ownerType: 'VISITOR', ownerName: '', makeModel: '', colour: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="card" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); run(async () => onSaved(await api.post('/gate/vehicles', f))); }}>
      <h2>{plate} is not registered</h2>
      <p className="muted small" style={{ marginBottom: 10 }}>Register it to record the movement.</p>
      <ErrorBanner error={error} />
      <div className="form-grid">
        <Field label="Owner type">
          <select value={f.ownerType} onChange={set('ownerType')}>
            {Object.entries(OWNER_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Owner / organisation"><input value={f.ownerName} onChange={set('ownerName')} maxLength={200} /></Field>
        <Field label="Make and model"><input value={f.makeModel} onChange={set('makeModel')} maxLength={100} /></Field>
        <Field label="Colour"><input value={f.colour} onChange={set('colour')} maxLength={40} /></Field>
      </div>
      <div className="actions" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy}>Register vehicle</button></div>
    </form>
  );
}

function FlagForm({ vehicle, onSaved }) {
  const [f, setF] = useState({ flagged: vehicle.flagged, blocked: vehicle.blocked, reason: vehicle.flagReason || '' });
  const { busy, error, run } = useAction();
  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }} className="stack">
      <h3 style={{ fontSize: 14 }}>Supervisor: flag or block</h3>
      <ErrorBanner error={error} />
      <label className="check"><input type="checkbox" checked={f.flagged} onChange={(e) => setF({ ...f, flagged: e.target.checked })} /> Flagged (gate must record a reason)</label>
      <label className="check"><input type="checkbox" checked={f.blocked} onChange={(e) => setF({ ...f, blocked: e.target.checked })} /> Blocked (only a supervisor can admit)</label>
      <Field label="Reason"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={500} /></Field>
      <div><button className="btn" disabled={busy} onClick={() => run(async () => onSaved(await api.put(`/gate/vehicles/${vehicle.id}/flag`, f)))}>Save flag</button></div>
    </div>
  );
}
