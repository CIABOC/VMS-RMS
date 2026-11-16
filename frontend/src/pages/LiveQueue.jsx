import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { ErrorBanner, Loading, PageHeader } from '../components/ui.jsx';
import { VISIT_STATUS, fmtMinutes, fmtTime, minutesSince } from '../utils/format.js';

const LANES = [
  { title: 'Registration in progress', statuses: ['PENDING_VERIFICATION', 'PENDING_SIGNATURE'] },
  { title: 'Waiting for host', statuses: ['WAITING', 'DELAYED'] },
  { title: 'Accepted - approve entry', statuses: ['ACCEPTED'] },
  { title: 'In premises', statuses: ['IN_PREMISES'] },
  { title: 'Declined - see out', statuses: ['DECLINED'] },
];

const nextLink = (v) => {
  if (v.status === 'PENDING_VERIFICATION') return `/visits/${v.id}/verify`;
  if (v.status === 'PENDING_SIGNATURE') return `/visits/${v.id}/sign`;
  return `/visits/${v.id}`;
};

/** Screen 06 - live queue board (also the entry point for screens 04, 05 and 07). */
export default function LiveQueue() {
  const { refreshSeconds } = useAuth();
  const [params] = useSearchParams();
  const step = params.get('step');
  const { data, error, loading } = useApi('/visits', { refreshSeconds });

  const lanes = step ? LANES.filter((l) => l.statuses.includes(step)) : LANES;

  return (
    <>
      <PageHeader no="06" title="Live queue board" actions={<>
        <a className="btn" href="/display/queue" target="_blank" rel="noopener">Open public token display</a>
        <Link className="btn primary" to="/visits/new">Register visitor</Link>
      </>}>
        Today's visits by status. Select a card to continue that visit. Refreshes every {refreshSeconds} seconds.
      </PageHeader>
      {step && <div className="alert info" style={{ marginBottom: 12 }}>Showing visits at step: {VISIT_STATUS[step]?.label}. <Link to="/queue">Show all</Link></div>}
      <ErrorBanner error={error} />
      {loading && !data ? <Loading /> : (
        <div className="board">
          {lanes.map((lane) => {
            const items = (data || []).filter((v) => lane.statuses.includes(v.status));
            return (
              <section key={lane.title} className="lane" aria-label={lane.title}>
                <h3>{lane.title} <span className="badge">{items.length}</span></h3>
                {items.length === 0 && <p className="small muted">None</p>}
                {items.map((v) => (
                  <Link key={v.id} to={nextLink(v)} className="qcard">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span className="token" style={{ fontSize: 20 }}>{v.tokenNo ?? '—'}</span>
                      <span className={`badge ${VISIT_STATUS[v.status].tone}`}>{VISIT_STATUS[v.status].label}</span>
                    </div>
                    <div style={{ fontWeight: 600, marginTop: 4 }}>{v.visitorName}</div>
                    <div className="small muted">to {v.hostName} · {v.categoryName}</div>
                    <div className="small muted">
                      {v.status === 'DELAYED' && v.delayUntil ? `Delayed until ${fmtTime(v.delayUntil)}` :
                        v.signedAt && ['WAITING', 'DELAYED'].includes(v.status) ? `Waiting ${fmtMinutes(minutesSince(v.signedAt))}` :
                        v.entryApprovedAt ? `Entered ${fmtTime(v.entryApprovedAt)} · badge ${v.badgeNo}` :
                        `Registered ${fmtTime(v.createdAt)}`}
                    </div>
                  </Link>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
