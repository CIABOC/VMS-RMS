import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAction, useApi } from '../hooks/useApi.js';
import { Badge, Dialog, Empty, ErrorBanner, Field, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';
import HostResponseForm from '../components/HostResponseForm.jsx';
import { ID_TYPES, LANGUAGES, fmtDateTime, fmtTime } from '../utils/format.js';

/** Screen 07 - visit detail: entry approval, declared items, devices and the audited history. */
export default function VisitDetail() {
  const { id } = useParams();
  const { data: d, error: loadError, reload } = useApi(`/visits/${id}`);
  const { busy, error, run } = useAction();
  const [dialog, setDialog] = useState(null);
  const [badge, setBadge] = useState('');
  const [custody, setCustody] = useState(false);
  const [reason, setReason] = useState('');
  const [item, setItem] = useState({ description: '', quantity: 1 });
  const [signature, setSignature] = useState(null);

  if (loadError) return <ErrorBanner error={loadError} />;
  if (!d) return <Loading />;
  const s = d.summary;
  const v = d.visitor;

  const act = (fn) => run(async () => { await fn(); setDialog(null); await reload(); });
  const approve = () => act(() => api.post(`/visits/${id}/approve-entry`, { badgeNo: badge, deviceCustodyConfirmed: custody }));
  const checkOut = () => act(() => api.post(`/visits/${id}/check-out`));
  const cancel = () => act(() => api.post(`/visits/${id}/cancel`, { reason }));
  const addItem = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/visits/${id}/items`, { ...item, quantity: Number(item.quantity) });
      setItem({ description: '', quantity: 1 });
      await reload();
    });
  };
  const showSignature = () => run(async () => setSignature((await api.get(`/visits/${id}/signature`)).signaturePng));

  const cancellable = ['PENDING_VERIFICATION', 'PENDING_SIGNATURE', 'WAITING', 'DELAYED', 'ACCEPTED'].includes(s.status);
  const closed = ['COMPLETED', 'CANCELLED'].includes(s.status);
  const heldDevices = d.devices.filter((x) => x.status === 'HELD');

  return (
    <>
      <PageHeader no="07" title={`Visit ${s.tokenNo ? '· token ' + s.tokenNo : '#' + s.id}`} actions={<>
        {s.status === 'PENDING_VERIFICATION' && <Link className="btn primary" to={`/visits/${id}/verify`}>Verify identity</Link>}
        {s.status === 'PENDING_SIGNATURE' && <Link className="btn primary" to={`/visits/${id}/sign`}>Capture signature</Link>}
        {['WAITING', 'DELAYED'].includes(s.status) && <button className="btn" onClick={() => setDialog('host')}>Record host response</button>}
        {s.status === 'ACCEPTED' && <button className="btn good" onClick={() => setDialog('approve')}>Approve entry</button>}
        {['IN_PREMISES', 'DECLINED'].includes(s.status) && <button className="btn primary" onClick={() => setDialog('checkout')}>Check out</button>}
        {cancellable && <button className="btn danger" onClick={() => setDialog('cancel')}>Cancel visit</button>}
      </>}>
        <StatusBadge status={s.status} /> · {s.visitorName} visiting {s.hostName}
      </PageHeader>
      <ErrorBanner error={error} />

      <div className="grid two">
        <section className="card">
          <h2>Visit</h2>
          <table><tbody>
            <tr><th scope="row">Category</th><td>{s.categoryName} {d.requiresDeviceCustody && <Badge tone="info">device custody</Badge>}</td></tr>
            <tr><th scope="row">Host</th><td>{s.hostName}</td></tr>
            <tr><th scope="row">Purpose</th><td>{s.purpose || '—'}</td></tr>
            <tr><th scope="row">Registered</th><td>{fmtDateTime(s.createdAt)}</td></tr>
            <tr><th scope="row">Identity check</th><td>{d.idVerification ? `${d.idVerification.replace('_', ' ').toLowerCase()} · ${fmtTime(d.verifiedAt)}` : '—'}
              {d.idVerificationNote && <div className="small muted">{d.idVerificationNote}</div>}</td></tr>
            <tr><th scope="row">Signature</th><td>{d.signed
              ? <>{LANGUAGES[d.ackLanguage]} · {fmtTime(s.signedAt)} <button className="btn small" onClick={showSignature}>View</button></>
              : '—'}</td></tr>
            <tr><th scope="row">Host response</th><td>{s.hostRespondedAt ? fmtTime(s.hostRespondedAt) : '—'}
              {s.delayUntil && <> · delayed until {fmtTime(s.delayUntil)}</>}
              {s.hostResponseNote && <div className="small muted">{s.hostResponseNote}</div>}</td></tr>
            <tr><th scope="row">Entry</th><td>{s.entryApprovedAt ? `${fmtTime(s.entryApprovedAt)} · badge ${s.badgeNo}` : '—'}</td></tr>
            <tr><th scope="row">Check-out</th><td>{s.checkedOutAt ? fmtTime(s.checkedOutAt) : '—'}</td></tr>
          </tbody></table>
          {signature && <img src={signature} alt="Visitor signature" style={{ marginTop: 12, maxWidth: '100%', border: '1px solid var(--line)', borderRadius: 8 }} />}
        </section>

        <section className="card">
          <h2>Visitor</h2>
          <table><tbody>
            <tr><th scope="row">Name</th><td>{v.fullName}</td></tr>
            <tr><th scope="row">Document</th><td>{ID_TYPES[v.idType]} {v.idNumber}</td></tr>
            <tr><th scope="row">Mobile</th><td>{v.mobile || '—'}</td></tr>
            <tr><th scope="row">Organisation</th><td>{v.organization || '—'}</td></tr>
          </tbody></table>
        </section>

        <section className="card">
          <h2>Declared items</h2>
          {d.items.length === 0 ? <p className="muted small">No items declared.</p> : (
            <table>
              <thead><tr><th>Item</th><th className="num">Qty</th><th>Recorded</th></tr></thead>
              <tbody>{d.items.map((i) => <tr key={i.id}><td>{i.description}</td><td className="num">{i.quantity}</td><td>{fmtTime(i.recordedAt)}</td></tr>)}</tbody>
            </table>
          )}
          {!closed && (
            <form className="row" onSubmit={addItem} style={{ marginTop: 12 }}>
              <div className="grow"><Field label="Item"><input required maxLength={300} value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} /></Field></div>
              <div style={{ width: 90 }}><Field label="Qty"><input type="number" min={1} max={999} value={item.quantity} onChange={(e) => setItem({ ...item, quantity: e.target.value })} /></Field></div>
              <button className="btn" disabled={busy}>Add</button>
            </form>
          )}
        </section>

        <section className="card">
          <h2>Devices in custody <Link className="btn small" to="/devices">Device custody</Link></h2>
          {d.devices.length === 0 ? <p className="muted small">No devices taken.</p> : (
            <table>
              <thead><tr><th>Tag</th><th>Device</th><th>Status</th></tr></thead>
              <tbody>{d.devices.map((x) => (
                <tr key={x.id}><td className="mono">{x.tagNo}</td><td>{x.deviceType}{x.description ? ` · ${x.description}` : ''}</td>
                  <td><Badge tone={x.status === 'HELD' ? 'warning' : 'good'}>{x.status === 'HELD' ? 'Held' : 'Returned'}</Badge></td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>History (from the audit log)</h2>
        {d.history.length === 0 ? <Empty>No events.</Empty> : (
          <ol className="timeline">
            {d.history.map((h) => (
              <li key={h.id}>
                <b>{h.action.replaceAll('_', ' ').toLowerCase()}</b> <span className="small muted">· {fmtDateTime(h.occurredAt)} · {h.actor}</span>
                {h.details && <div className="mono muted" style={{ wordBreak: 'break-word' }}>{h.details}</div>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <Dialog open={dialog === 'approve'} title="Approve entry" onClose={() => setDialog(null)} footer={<>
        <button className="btn" onClick={() => setDialog(null)}>Close</button>
        <button className="btn good" onClick={approve} disabled={busy || !badge.trim() || (d.requiresDeviceCustody && !custody)}>Approve entry</button>
      </>}>
        <ErrorBanner error={error} />
        <div className="stack">
          <Field label="Visitor badge number"><input value={badge} onChange={(e) => setBadge(e.target.value)} maxLength={30} autoFocus /></Field>
          {d.requiresDeviceCustody && (
            <label className="check">
              <input type="checkbox" checked={custody} onChange={(e) => setCustody(e.target.checked)} />
              Devices have been taken into custody ({heldDevices.length} held) or the visitor has none
            </label>
          )}
        </div>
      </Dialog>

      <Dialog open={dialog === 'checkout'} title="Check out visitor" onClose={() => setDialog(null)} footer={<>
        <button className="btn" onClick={() => setDialog(null)}>Close</button>
        <button className="btn primary" onClick={checkOut} disabled={busy || heldDevices.length > 0}>Confirm check-out</button>
      </>}>
        <ErrorBanner error={error} />
        {heldDevices.length > 0
          ? <div className="alert warning">Return the {heldDevices.length} held device(s) first on the device custody screen.</div>
          : <p>Collect badge {s.badgeNo || ''} and confirm that {s.visitorName} has left.</p>}
      </Dialog>

      <Dialog open={dialog === 'cancel'} title="Cancel visit" onClose={() => setDialog(null)} footer={<>
        <button className="btn" onClick={() => setDialog(null)}>Close</button>
        <button className="btn danger" onClick={cancel} disabled={busy || reason.trim().length < 5}>Cancel visit</button>
      </>}>
        <ErrorBanner error={error} />
        <Field label="Reason"><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
      </Dialog>

      <Dialog open={dialog === 'host'} title="Record the host's response" onClose={() => setDialog(null)}>
        <p className="small muted" style={{ marginBottom: 10 }}>Use this when the host answers by phone. It is recorded as on behalf of the host.</p>
        <HostResponseForm visit={s} endpoint={`/visits/${id}/host-response`} onDone={() => { setDialog(null); reload(); }} />
      </Dialog>
    </>
  );
}
