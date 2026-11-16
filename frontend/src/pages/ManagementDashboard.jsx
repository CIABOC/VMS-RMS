import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { Empty, ErrorBanner, Loading, PageHeader, StatTile } from '../components/ui.jsx';
import { VISIT_STATUS, fmtDate, fmtMinutes } from '../utils/format.js';

const RANGES = [7, 30, 90, 365];

function CountTable({ caption, rows, nameLabel, total }) {
  return (
    <section className="card">
      <h2>{caption}</h2>
      {rows.length === 0 ? <Empty>No data in this period.</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th>{nameLabel}</th><th className="num">Visits</th><th className="num">Share</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.name}><td>{r.name}</td><td className="num">{r.count}</td>
              <td className="num">{total ? `${Math.round((r.count / total) * 100)}%` : '—'}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

/** Screen 13 - management dashboard. Aggregate figures only: no visitor names or identities. */
export default function ManagementDashboard() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useApi(`/dashboard/management?days=${days}`);

  return (
    <>
      <PageHeader no="13" title="Management dashboard" actions={
        <label className="check">Period
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 'auto' }}>
            {RANGES.map((r) => <option key={r} value={r}>Last {r} days</option>)}
          </select>
        </label>
      }>
        {data ? `${fmtDate(data.from)} to ${fmtDate(data.to)}. ` : ''}Aggregate indicators only. Personal details are not shown here.
      </PageHeader>
      <ErrorBanner error={error} />
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="tiles">
            <StatTile label="Visits" value={data.totalVisits} />
            <StatTile label="Unique visitors" value={data.uniqueVisitors} />
            <StatTile label="Avg host response" value={fmtMinutes(data.avgHostResponseMinutes)} hint="signature to host answer" />
            <StatTile label="Avg time on premises" value={fmtMinutes(data.avgVisitMinutes)} hint="entry to check-out" />
            <StatTile label="Vehicle entries" value={data.vehicleEntries} />
            <StatTile label="Vehicles denied" value={data.vehicleDenials} />
          </div>

          <div className="grid two">
            <section className="card">
              <h2>Visits by day</h2>
              {data.visitsByDay.length === 0 ? <Empty>No visits in this period.</Empty> : (
                <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}><table>
                  <thead><tr><th>Day</th><th className="num">Total</th><th className="num">Completed</th><th className="num">Declined</th><th className="num">Cancelled</th></tr></thead>
                  <tbody>{data.visitsByDay.map((r) => (
                    <tr key={r.day}><td>{fmtDate(r.day)}</td><td className="num">{r.total}</td><td className="num">{r.completed}</td>
                      <td className="num">{r.declined}</td><td className="num">{r.cancelled}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </section>
            <section className="card">
              <h2>Vehicle movements by day</h2>
              {data.vehiclesByDay.length === 0 ? <Empty>No vehicle movements in this period.</Empty> : (
                <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}><table>
                  <thead><tr><th>Day</th><th className="num">Entries</th><th className="num">Denied</th></tr></thead>
                  <tbody>{data.vehiclesByDay.map((r) => (
                    <tr key={r.day}><td>{fmtDate(r.day)}</td><td className="num">{r.entries}</td><td className="num">{r.denied}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </section>
            <CountTable caption="By visitor category" nameLabel="Category" rows={data.byCategory} total={data.totalVisits} />
            <CountTable caption="By host department" nameLabel="Department" rows={data.byDepartment} total={data.totalVisits} />
            <CountTable caption="Current status of visits" nameLabel="Status" total={data.totalVisits}
              rows={data.outcomes.map((o) => ({ ...o, name: VISIT_STATUS[o.name]?.label || o.name }))} />
          </div>
        </>
      )}
    </>
  );
}
