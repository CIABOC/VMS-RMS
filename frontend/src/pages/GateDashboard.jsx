import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { Badge, Empty, ErrorBanner, Loading, PageHeader, StatTile } from '../components/ui.jsx';
import { OWNER_TYPES, fmtMinutes, fmtTime } from '../utils/format.js';

/** Screen 11 - gate and security dashboard. */
export default function GateDashboard() {
  const { refreshSeconds } = useAuth();
  const { data, error, loading } = useApi('/dashboard/gate', { refreshSeconds });

  return (
    <>
      <PageHeader no="11" title="Gate and security dashboard" actions={<Link className="btn primary" to="/gate">Gate console</Link>}>
        Vehicles inside now and today's exceptions. Refreshes every {refreshSeconds} seconds.
      </PageHeader>
      <ErrorBanner error={error} />
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="tiles">
            <StatTile label="Vehicles inside" value={data.insideCount} />
            <StatTile label="Entries today" value={data.entriesToday} />
            <StatTile label="Exits today" value={data.exitsToday} />
            <StatTile label="Denied today" value={data.deniedToday} />
            <StatTile label="On watch list" value={data.watchListCount} hint="flagged or blocked" />
          </div>

          <div className="grid two">
            <section className="card">
              <h2>Vehicles inside</h2>
              {data.inside.length === 0 ? <Empty>No vehicles inside.</Empty> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Vehicle</th><th>Owner</th><th>Since</th><th className="num">Inside for</th></tr></thead>
                  <tbody>{data.inside.map((v) => (
                    <tr key={v.vehicleId}>
                      <td className="mono">{v.plateNo} {v.flagged && <Badge tone="warning">flag</Badge>}</td>
                      <td>{OWNER_TYPES[v.ownerType]}{v.ownerName ? ` · ${v.ownerName}` : ''}</td>
                      <td>{fmtTime(v.since)}</td>
                      <td className="num">{fmtMinutes(v.minutesInside)} {v.overstay && <Badge tone="serious">over {data.maxStayHours} h</Badge>}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </section>

            <section className="card">
              <h2>Exceptions today <span className="badge">{data.exceptions.length}</span></h2>
              {data.exceptions.length === 0 ? <Empty>No denials or flagged movements today.</Empty> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Time</th><th>Vehicle</th><th>Event</th><th>Reason</th></tr></thead>
                  <tbody>{data.exceptions.map((m) => (
                    <tr key={m.id}>
                      <td>{fmtTime(m.occurredAt)}</td>
                      <td className="mono">{m.plateNo}</td>
                      <td><Badge tone={m.decision === 'DENIED' ? 'serious' : 'warning'}>{m.direction.toLowerCase()} {m.decision.toLowerCase()}</Badge></td>
                      <td>{m.reason || '—'}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </section>
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <h2>Latest movements</h2>
            {data.recent.length === 0 ? <Empty>No movements today.</Empty> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Time</th><th>Vehicle</th><th>Direction</th><th>Decision</th><th>Gate</th><th>Recorded by</th></tr></thead>
                <tbody>{data.recent.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtTime(m.occurredAt)}</td><td className="mono">{m.plateNo}</td><td>{m.direction.toLowerCase()}</td>
                    <td>{m.decision.toLowerCase()}</td><td>{m.gate || '—'}</td><td className="small">{m.recordedBy}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        </>
      )}
    </>
  );
}
