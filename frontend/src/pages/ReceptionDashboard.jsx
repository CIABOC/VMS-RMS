import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { Empty, ErrorBanner, Loading, PageHeader, StatTile, StatusBadge } from '../components/ui.jsx';
import { fmtDate, fmtMinutes } from '../utils/format.js';

/** Screen 02 - reception dashboard. */
export default function ReceptionDashboard() {
  const { refreshSeconds } = useAuth();
  const { data, error, loading } = useApi('/dashboard/reception', { refreshSeconds });

  return (
    <>
      <PageHeader no="02" title="Reception dashboard" actions={<>
        <Link className="btn" to="/queue">Live queue</Link>
        <Link className="btn primary" to="/visits/new">Register visitor</Link>
      </>}>
        {data ? fmtDate(data.date) : 'Today'} · refreshes every {refreshSeconds} seconds
      </PageHeader>
      <ErrorBanner error={error} />
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="tiles">
            <StatTile label="Visits today" value={data.total} />
            <StatTile label="Waiting for host" value={data.counts.WAITING + data.counts.DELAYED} />
            <StatTile label="Accepted, awaiting entry" value={data.counts.ACCEPTED} />
            <StatTile label="In premises" value={data.counts.IN_PREMISES} />
            <StatTile label="Completed" value={data.counts.COMPLETED} />
            <StatTile label="Devices in custody" value={data.devicesHeld} />
          </div>

          <div className="grid two">
            <section className="card" aria-labelledby="alerts-h">
              <h2 id="alerts-h">Alerts <span className="badge">{data.alerts.length}</span></h2>
              {data.alerts.length === 0 ? <Empty>No alerts right now.</Empty> : data.alerts.map((a, i) => (
                <div key={i} className={`alert ${a.severity}`}>
                  <span style={{ flex: 1 }}>{a.message}</span>
                  {a.visitId && <Link to={`/visits/${a.visitId}`}>Open</Link>}
                </div>
              ))}
              <p className="small muted" style={{ marginTop: 10 }}>
                A host is flagged after {data.hostTimeoutMinutes} minutes without a response (set on screen 14).
              </p>
            </section>

            <section className="card" aria-labelledby="waiting-h">
              <h2 id="waiting-h">Waiting visitors</h2>
              {data.waiting.length === 0 ? <Empty>Nobody is waiting.</Empty> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Token</th><th>Visitor</th><th>Host</th><th>Status</th><th className="num">Waited</th></tr></thead>
                    <tbody>
                      {data.waiting.map(({ visit: v, minutesWaiting }) => (
                        <tr key={v.id}>
                          <td><Link className="token" to={`/visits/${v.id}`}>{v.tokenNo}</Link></td>
                          <td>{v.visitorName}</td>
                          <td>{v.hostName}</td>
                          <td><StatusBadge status={v.status} /></td>
                          <td className="num">{fmtMinutes(minutesWaiting)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
