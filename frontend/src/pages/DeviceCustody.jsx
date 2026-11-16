import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAction, useApi } from '../hooks/useApi.js';
import { Empty, ErrorBanner, Field, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';
import { fmtTime } from '../utils/format.js';

const ACTIVE = ['WAITING', 'DELAYED', 'ACCEPTED', 'IN_PREMISES'];
// Suggestions only - any device type can be typed.
const SUGGESTED_TYPES = ['Mobile phone', 'Laptop', 'Tablet', 'Camera', 'Audio recorder', 'Smart watch', 'USB storage'];

/** Screen 12 - device custody: handover against a visit, and return. */
export default function DeviceCustody() {
  const { refreshSeconds } = useAuth();
  const held = useApi('/devices?status=HELD', { refreshSeconds });
  const returned = useApi('/devices?status=RETURNED');
  const visits = useApi(`/visits${qs({ status: ACTIVE })}`);
  const [f, setF] = useState({ visitId: '', tagNo: '', deviceType: '', description: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const reloadAll = async () => { await Promise.all([held.reload(), returned.reload()]); };

  const handOver = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/devices', { ...f, visitId: Number(f.visitId) });
      setF({ ...f, tagNo: '', deviceType: '', description: '' });
      await reloadAll();
    });
  };
  const giveBack = (d) => run(async () => { await api.post(`/devices/${d.id}/return`); await reloadAll(); });

  return (
    <>
      <PageHeader no="12" title="Device custody">
        Devices handed in at reception are tagged against the visit and must be returned before check-out.
      </PageHeader>
      <ErrorBanner error={error} />
      <div className="split rev">
        <form className="card" onSubmit={handOver}>
          <h2>Receive a device</h2>
          <div className="stack">
            <Field label="Visit">
              <select required value={f.visitId} onChange={set('visitId')}>
                <option value="">Choose a visitor…</option>
                {(visits.data || []).map((v) => <option key={v.id} value={v.id}>Token {v.tokenNo} · {v.visitorName}</option>)}
              </select>
            </Field>
            <Field label="Custody tag number" hint="The physical tag given to the visitor"><input required maxLength={30} value={f.tagNo} onChange={set('tagNo')} /></Field>
            <Field label="Device type">
              <input required list="device-types" maxLength={50} value={f.deviceType} onChange={set('deviceType')} />
              <datalist id="device-types">{SUGGESTED_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            </Field>
            <Field label="Description / serial"><input maxLength={300} value={f.description} onChange={set('description')} /></Field>
            <button className="btn primary" disabled={busy}>Receive device</button>
          </div>
        </form>

        <div>
          <section className="card">
            <h2>Held now <span className="badge">{held.data?.length ?? 0}</span></h2>
            {held.loading && !held.data ? <Loading /> : !held.data?.length ? <Empty>No devices in custody.</Empty> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Tag</th><th>Device</th><th>Visitor</th><th>Visit</th><th>Since</th><th /></tr></thead>
                <tbody>{held.data.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.tagNo}</td>
                    <td>{d.deviceType}{d.description && <div className="small muted">{d.description}</div>}</td>
                    <td><Link to={`/visits/${d.visitId}`}>{d.tokenNo ? `#${d.tokenNo} ` : ''}{d.visitorName}</Link></td>
                    <td><StatusBadge status={d.visitStatus} /></td>
                    <td>{fmtTime(d.receivedAt)}</td>
                    <td className="num"><button className="btn small" disabled={busy} onClick={() => giveBack(d)}>Return</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
          <section className="card">
            <h2>Returned today</h2>
            {!returned.data?.length ? <Empty>None yet.</Empty> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Tag</th><th>Device</th><th>Visitor</th><th>Returned</th><th>By</th></tr></thead>
                <tbody>{returned.data.map((d) => (
                  <tr key={d.id}><td className="mono">{d.tagNo}</td><td>{d.deviceType}</td><td>{d.visitorName}</td>
                    <td>{fmtTime(d.returnedAt)}</td><td className="small">{d.returnedBy}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
