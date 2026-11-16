import { useState } from 'react';
import { api, qs } from '../api/client.js';
import { useAction, useApi } from '../hooks/useApi.js';
import { Empty, ErrorBanner, Field, Loading, PageHeader } from '../components/ui.jsx';
import { fmtDateTime } from '../utils/format.js';

const EMPTY = { actor: '', action: '', entityType: '', entityId: '', from: '', to: '' };
const ENTITY_TYPES = ['VISIT', 'VISITOR', 'APPOINTMENT', 'VEHICLE', 'STAFF', 'SETTING', 'CATEGORY', 'ACK_TEXT', 'ROLE_MAPPING'];

/** Screen 15 - audit log with the hash-chain integrity check. */
export default function AuditLog() {
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(0);
  const params = {
    ...filters,
    from: filters.from ? new Date(filters.from + 'T00:00:00').toISOString() : '',
    to: filters.to ? new Date(new Date(filters.to + 'T00:00:00').getTime() + 86400000).toISOString() : '',
    page, size: 50,
  };
  const { data, error, loading } = useApi(`/audit${qs(params)}`);
  const { data: actions } = useApi('/audit/actions');
  const [check, setCheck] = useState(null);
  const { busy, error: checkError, run } = useAction();
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });

  const apply = (e) => { e.preventDefault(); setPage(0); setFilters(draft); };
  const verify = () => run(async () => setCheck(await api.get('/audit/verify')));

  return (
    <>
      <PageHeader no="15" title="Audit log" actions={<button className="btn primary" onClick={verify} disabled={busy}>{busy ? 'Checking…' : 'Run integrity check'}</button>}>
        Every change in the system is recorded here. Entries cannot be edited or deleted, and each one is chained to the previous entry by a SHA-256 hash.
      </PageHeader>
      <ErrorBanner error={checkError} />
      {check && (
        <div className={`alert ${check.valid ? 'good' : 'serious'}`} role="status" style={{ marginBottom: 14 }}>
          {check.valid
            ? `Integrity verified: all ${check.checked} entries are intact (${fmtDateTime(check.checkedAt)}).`
            : `Integrity FAILED at entry #${check.brokenAtId} after checking ${check.checked} entries. Escalate to the security officer.`}
        </div>
      )}

      <form className="card" onSubmit={apply}>
        <div className="form-grid">
          <Field label="Actor (e-mail contains)"><input value={draft.actor} onChange={set('actor')} /></Field>
          <Field label="Action">
            <select value={draft.action} onChange={set('action')}>
              <option value="">Any</option>
              {(actions || []).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Record type">
            <select value={draft.entityType} onChange={set('entityType')}>
              <option value="">Any</option>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Record id"><input value={draft.entityId} onChange={set('entityId')} /></Field>
          <Field label="From"><input type="date" value={draft.from} onChange={set('from')} /></Field>
          <Field label="To"><input type="date" value={draft.to} onChange={set('to')} /></Field>
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn primary">Apply filters</button>
          <button type="button" className="btn" onClick={() => { setDraft(EMPTY); setFilters(EMPTY); setPage(0); }}>Clear</button>
        </div>
      </form>

      <section className="card">
        <ErrorBanner error={error} />
        {loading && !data ? <Loading /> : !data?.items.length ? <Empty>No matching entries.</Empty> : (
          <>
            <div className="table-wrap"><table>
              <thead><tr><th className="num">#</th><th>Time</th><th>Actor</th><th>Action</th><th>Record</th><th>Details</th><th>Hash</th></tr></thead>
              <tbody>{data.items.map((e) => (
                <tr key={e.id}>
                  <td className="num">{e.id}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.occurredAt)}</td>
                  <td className="small">{e.actor}</td>
                  <td className="mono">{e.action}</td>
                  <td className="mono">{e.entityType ? `${e.entityType} ${e.entityId ?? ''}` : '—'}</td>
                  <td className="mono small" style={{ maxWidth: 340, wordBreak: 'break-word' }}>{e.details || '—'}</td>
                  <td className="mono small" title={e.hash}>{e.hash.slice(0, 10)}…</td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="actions" style={{ justifyContent: 'space-between', marginTop: 12 }}>
              <span className="small muted">{data.total} entries · page {data.page + 1} of {Math.max(data.totalPages, 1)}</span>
              <span className="actions">
                <button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button>
                <button className="btn small" disabled={page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>Older</button>
              </span>
            </div>
          </>
        )}
      </section>
    </>
  );
}
