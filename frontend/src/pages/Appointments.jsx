import { useMemo, useState } from 'react';
import { api, qs } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAction, useApi } from '../hooks/useApi.js';
import { Badge, Empty, ErrorBanner, Field, Loading, PageHeader } from '../components/ui.jsx';
import { fmtDate, fmtTime, isoDate } from '../utils/format.js';

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Screen 09 - host calendars. The backend (and a database constraint) reject overlapping bookings. */
export default function Appointments() {
  const { user, hasRole } = useAuth();
  const receptionist = hasRole('RECEPTIONIST');
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [hostFilter, setHostFilter] = useState('');
  const weekEnd = useMemo(() => new Date(week.getTime() + 7 * 86400000), [week]);
  const path = `/appointments${qs({ from: week.toISOString(), to: weekEnd.toISOString(), hostId: receptionist ? hostFilter : '' })}`;
  const { data, error, loading, reload } = useApi(path);
  const { data: hosts } = useApi(receptionist ? '/reference/hosts' : null);
  const { busy, error: actionError, run } = useAction();

  const days = Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * 86400000));
  const shift = (n) => setWeek(new Date(week.getTime() + n * 7 * 86400000));
  const cancel = (a) => run(async () => { await api.post(`/appointments/${a.id}/cancel`); await reload(); });

  return (
    <>
      <PageHeader no="09" title="Appointments" actions={<>
        <button className="btn" onClick={() => shift(-1)} aria-label="Previous week">‹ Previous</button>
        <button className="btn" onClick={() => setWeek(mondayOf(new Date()))}>This week</button>
        <button className="btn" onClick={() => shift(1)} aria-label="Next week">Next ›</button>
      </>}>
        Week of {fmtDate(week)}. {receptionist ? 'All host calendars.' : 'Your calendar.'}
      </PageHeader>

      <div className="split">
        <section className="card">
          <h2>Schedule
            {receptionist && (
              <select style={{ maxWidth: 260 }} value={hostFilter} onChange={(e) => setHostFilter(e.target.value)} aria-label="Filter by host">
                <option value="">All hosts</option>
                {(hosts || []).map((h) => <option key={h.id} value={h.id}>{h.fullName}</option>)}
              </select>
            )}
          </h2>
          <ErrorBanner error={error || actionError} />
          {loading && !data ? <Loading /> : days.map((day) => {
            const key = isoDate(day);
            const list = (data || []).filter((a) => isoDate(new Date(a.startsAt)) === key);
            return (
              <div key={key} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
                <div style={{ fontWeight: 600 }}>{fmtDate(day)}</div>
                {list.length === 0 ? <div className="small muted">No appointments</div> : (
                  <table style={{ marginTop: 6 }}>
                    <tbody>
                      {list.map((a) => (
                        <tr key={a.id} style={{ opacity: a.status === 'CANCELLED' ? 0.55 : 1 }}>
                          <td style={{ whiteSpace: 'nowrap', width: 120 }}>{fmtTime(a.startsAt)}–{fmtTime(a.endsAt)}</td>
                          <td><b>{a.visitorName}</b>{a.purpose && <div className="small muted">{a.purpose}</div>}</td>
                          {receptionist && <td>{a.hostName}</td>}
                          <td><Badge tone={a.status === 'SCHEDULED' ? 'info' : a.status === 'COMPLETED' ? 'good' : ''}>{a.status.toLowerCase()}</Badge></td>
                          <td className="num">{a.status === 'SCHEDULED' && <button className="btn small danger" disabled={busy} onClick={() => cancel(a)}>Cancel</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </section>

        <NewAppointment receptionist={receptionist} me={user} hosts={hosts} onCreated={reload} />
      </div>
    </>
  );
}

function NewAppointment({ receptionist, me, hosts, onCreated }) {
  const [f, setF] = useState({ hostId: '', visitorName: '', purpose: '', date: isoDate(), start: '', end: '' });
  const [ok, setOk] = useState(null);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setOk(null);
    run(async () => {
      const a = await api.post('/appointments', {
        hostId: receptionist ? Number(f.hostId) : me.id,
        visitorName: f.visitorName,
        purpose: f.purpose,
        startsAt: new Date(`${f.date}T${f.start}`).toISOString(),
        endsAt: new Date(`${f.date}T${f.end}`).toISOString(),
      });
      setOk(`Booked ${a.visitorName} with ${a.hostName} at ${fmtTime(a.startsAt)}.`);
      setF({ ...f, visitorName: '', purpose: '', start: '', end: '' });
      onCreated();
    });
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>New appointment</h2>
      <ErrorBanner error={error} />
      {ok && <div className="alert good" role="status">{ok}</div>}
      <div className="stack" style={{ marginTop: 8 }}>
        {receptionist && (
          <Field label="Host officer">
            <select required value={f.hostId} onChange={set('hostId')}>
              <option value="">Choose…</option>
              {(hosts || []).map((h) => <option key={h.id} value={h.id}>{h.fullName}</option>)}
            </select>
          </Field>
        )}
        <Field label="Visitor name"><input required maxLength={200} value={f.visitorName} onChange={set('visitorName')} /></Field>
        <Field label="Purpose"><input maxLength={500} value={f.purpose} onChange={set('purpose')} /></Field>
        <Field label="Date"><input type="date" required min={isoDate()} value={f.date} onChange={set('date')} /></Field>
        <div className="row">
          <div className="grow"><Field label="Start"><input type="time" required value={f.start} onChange={set('start')} /></Field></div>
          <div className="grow"><Field label="End"><input type="time" required value={f.end} onChange={set('end')} /></Field></div>
        </div>
        {f.start && f.end && f.end <= f.start && <div className="alert warning">The end time must be after the start time.</div>}
        <button className="btn primary" disabled={busy || (f.start && f.end && f.end <= f.start)}>Book appointment</button>
      </div>
    </form>
  );
}
