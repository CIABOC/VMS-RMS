import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import HostResponseForm from '../components/HostResponseForm.jsx';
import { Empty, ErrorBanner, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';
import { fmtMinutes, fmtTime, minutesSince } from '../utils/format.js';

/** Screen 08 - host officer view (built mobile-first). */
export default function HostInbox() {
  const { refreshSeconds } = useAuth();
  const { data, error, loading, reload } = useApi('/host/visits', { refreshSeconds });
  const pending = (data || []).filter((v) => ['WAITING', 'DELAYED'].includes(v.status));
  const others = (data || []).filter((v) => !['WAITING', 'DELAYED'].includes(v.status));

  return (
    <div className="mobile">
      <PageHeader no="08" title="My visitors" actions={<Link className="btn" to="/appointments">My appointments</Link>}>
        Visitors waiting for you today. Refreshes every {refreshSeconds} seconds.
      </PageHeader>
      <ErrorBanner error={error} />
      {loading && !data ? <Loading /> : (
        <>
          {pending.length === 0 && <div className="card"><Empty>Nobody is waiting for you.</Empty></div>}
          {pending.map((v) => (
            <article key={v.id} className="hcard" aria-label={`Token ${v.tokenNo}, ${v.visitorName}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="token" style={{ fontSize: 28 }}>{v.tokenNo}</span>
                <StatusBadge status={v.status} />
              </div>
              <h2 style={{ fontSize: 18, marginTop: 6 }}>{v.visitorName}</h2>
              <p className="muted small">{[v.visitorOrganization, v.categoryName].filter(Boolean).join(' · ')}</p>
              {v.purpose && <p style={{ marginTop: 6 }}>{v.purpose}</p>}
              <p className="small muted" style={{ marginTop: 6 }}>
                Waiting {fmtMinutes(minutesSince(v.signedAt))}
                {v.status === 'DELAYED' && v.delayUntil && <> · you asked them to wait until {fmtTime(v.delayUntil)}</>}
              </p>
              <div style={{ marginTop: 12 }}>
                <HostResponseForm visit={v} endpoint={`/host/visits/${v.id}/respond`} onDone={reload} />
              </div>
            </article>
          ))}

          {others.length > 0 && (
            <section className="card" style={{ marginTop: 16 }}>
              <h2>Accepted and in premises</h2>
              <table>
                <tbody>
                  {others.map((v) => (
                    <tr key={v.id}>
                      <td className="token">{v.tokenNo}</td>
                      <td>{v.visitorName}</td>
                      <td><StatusBadge status={v.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
