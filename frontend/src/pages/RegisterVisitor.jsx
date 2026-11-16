import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api/client.js';
import { useAction, useApi } from '../hooks/useApi.js';
import { Empty, ErrorBanner, Field, PageHeader } from '../components/ui.jsx';
import { ID_TYPES, fmtDate, fmtTime, isoDate } from '../utils/format.js';

const EMPTY_VISITOR = { fullName: '', idType: 'NIC', idNumber: '', mobile: '', email: '', organization: '', address: '' };

/** Screen 03 - register a visitor: find or create the profile, then open a visit. */
export default function RegisterVisitor() {
  const navigate = useNavigate();
  const [visitor, setVisitor] = useState(null);

  return (
    <>
      <PageHeader no="03" title="Register visitor">
        Search for an existing profile first to avoid duplicates. Then choose the category and host.
      </PageHeader>
      {!visitor
        ? <FindOrCreate onSelected={setVisitor} />
        : <VisitForm visitor={visitor} onBack={() => setVisitor(null)} onCreated={(v) => navigate(`/visits/${v.id}/verify`)} />}
    </>
  );
}

function FindOrCreate({ onSelected }) {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const { data: results, loading } = useApi(term.length >= 2 ? `/visitors${qs({ q: term })}` : null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  if (creating) return <NewVisitor initialName={q} onCancel={() => setCreating(false)} onSelected={onSelected} />;

  return (
    <section className="card" aria-labelledby="find-h">
      <h2 id="find-h">1. Find the visitor</h2>
      <div className="row">
        <Field label="Name, identity number or mobile">
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="At least 2 characters" />
        </Field>
        <button className="btn" onClick={() => setCreating(true)}>New visitor</button>
      </div>
      <div style={{ marginTop: 14 }}>
        {term.length < 2 ? null : loading ? <Empty>Searching…</Empty> : !results?.length ? (
          <Empty>No matching visitor. <button className="btn small" onClick={() => setCreating(true)}>Create a new profile</button></Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Identity</th><th>Mobile</th><th>Organisation</th><th /></tr></thead>
              <tbody>
                {results.map((v) => (
                  <tr key={v.id}>
                    <td>{v.fullName}</td>
                    <td>{ID_TYPES[v.idType]} {v.idNumber}</td>
                    <td>{v.mobile || '—'}</td>
                    <td>{v.organization || '—'}</td>
                    <td className="num"><button className="btn small primary" onClick={() => onSelected(v)}>Select</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function NewVisitor({ initialName, onCancel, onSelected }) {
  const [f, setF] = useState({ ...EMPTY_VISITOR, fullName: /\d/.test(initialName) ? '' : initialName });
  const [dupes, setDupes] = useState([]);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const checkDuplicates = async () => {
    if (!f.idNumber.trim()) return;
    try {
      setDupes(await api.get(`/visitors/possible-duplicates${qs({ idNumber: f.idNumber, mobile: f.mobile, fullName: f.fullName })}`));
    } catch { setDupes([]); }
  };

  const save = (e) => {
    e.preventDefault();
    run(async () => onSelected(await api.post('/visitors', f)));
  };
  const fe = error?.fieldErrors || {};

  return (
    <form className="card" onSubmit={save} aria-labelledby="new-h">
      <h2 id="new-h">1. New visitor profile</h2>
      <ErrorBanner error={error} />
      <div className="form-grid" style={{ marginTop: 8 }}>
        <Field label="Full name" error={fe.fullName}><input required value={f.fullName} onChange={set('fullName')} onBlur={checkDuplicates} /></Field>
        <Field label="Identity document" error={fe.idType}>
          <select value={f.idType} onChange={set('idType')}>
            {Object.entries(ID_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Document number" error={fe.idNumber}><input required value={f.idNumber} onChange={set('idNumber')} onBlur={checkDuplicates} /></Field>
        <Field label="Mobile" error={fe.mobile}><input type="tel" value={f.mobile} onChange={set('mobile')} onBlur={checkDuplicates} /></Field>
        <Field label="E-mail" error={fe.email}><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Organisation" error={fe.organization}><input value={f.organization} onChange={set('organization')} /></Field>
        <Field label="Address" error={fe.address}><input value={f.address} onChange={set('address')} /></Field>
      </div>

      {dupes.length > 0 && (
        <div className="alert warning" style={{ marginTop: 14, display: 'block' }} role="status">
          <b>Possible duplicate{dupes.length > 1 ? 's' : ''}.</b> Use an existing profile if it is the same person.
          <ul style={{ marginTop: 6, paddingLeft: 18 }}>
            {dupes.map((d) => (
              <li key={d.id} style={{ marginTop: 4 }}>
                {d.fullName} · {ID_TYPES[d.idType]} {d.idNumber} · {d.mobile || 'no mobile'}{' '}
                <button type="button" className="btn small" onClick={() => onSelected(d)}>Use this profile</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={onCancel}>Back to search</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
      </div>
    </form>
  );
}

function VisitForm({ visitor, onBack, onCreated }) {
  const { data: categories } = useApi('/reference/categories');
  const { data: hosts } = useApi('/reference/hosts');
  const [f, setF] = useState({ categoryId: '', hostId: '', appointmentId: '', purpose: '' });
  const today = isoDate();
  const tomorrow = isoDate(new Date(Date.now() + 86400000));
  const apptPath = f.hostId
    ? `/appointments${qs({ hostId: f.hostId, from: new Date(today + 'T00:00:00').toISOString(), to: new Date(tomorrow + 'T00:00:00').toISOString() })}`
    : null;
  const { data: appts } = useApi(apptPath);
  const { busy, error, run } = useAction();
  const category = categories?.find((c) => String(c.id) === String(f.categoryId));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'hostId' ? { appointmentId: '' } : {}) });

  const submit = (e) => {
    e.preventDefault();
    run(async () => onCreated(await api.post('/visits', {
      visitorId: visitor.id,
      categoryId: Number(f.categoryId),
      hostId: Number(f.hostId),
      appointmentId: f.appointmentId ? Number(f.appointmentId) : null,
      purpose: f.purpose,
    })));
  };

  const scheduled = (appts || []).filter((a) => a.status === 'SCHEDULED');

  return (
    <form className="card" onSubmit={submit} aria-labelledby="visit-h">
      <h2 id="visit-h">2. Visit details</h2>
      <p style={{ marginBottom: 12 }}>
        <b>{visitor.fullName}</b> <span className="muted">· {ID_TYPES[visitor.idType]} {visitor.idNumber}
        {visitor.idScanAt ? ` · ID scanned ${fmtDate(visitor.idScanAt)}` : ' · no stored ID scan'}</span>
      </p>
      <ErrorBanner error={error} />
      {categories && categories.length === 0 && (
        <div className="alert warning">No visitor categories exist yet. A System Administrator must add them on screen 14.</div>
      )}
      {hosts && hosts.length === 0 && (
        <div className="alert warning">No host officers exist yet. A System Administrator must add staff with the Host officer role.</div>
      )}
      <div className="form-grid" style={{ marginTop: 8 }}>
        <Field label="Visitor category">
          <select required value={f.categoryId} onChange={set('categoryId')}>
            <option value="">Choose…</option>
            {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Host officer">
          <select required value={f.hostId} onChange={set('hostId')}>
            <option value="">Choose…</option>
            {(hosts || []).map((h) => <option key={h.id} value={h.id}>{h.fullName}{h.department ? ` — ${h.department}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Today's appointment" hint={category?.requiresAppointment ? 'Required for this category' : 'Optional'}>
          <select value={f.appointmentId} onChange={set('appointmentId')} required={!!category?.requiresAppointment} disabled={!f.hostId}>
            <option value="">{f.hostId ? (scheduled.length ? 'None' : 'No appointments today') : 'Choose a host first'}</option>
            {scheduled.map((a) => <option key={a.id} value={a.id}>{fmtTime(a.startsAt)}–{fmtTime(a.endsAt)} · {a.visitorName}</option>)}
          </select>
        </Field>
        <Field label="Purpose of visit"><input value={f.purpose} onChange={set('purpose')} maxLength={500} /></Field>
      </div>
      {category?.requiresDeviceCustody && (
        <div className="alert info" style={{ marginTop: 12 }}>This category requires the visitor's devices to be held at reception (screen 12).</div>
      )}
      <div className="actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={onBack}>Change visitor</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Registering…' : 'Register and verify identity'}</button>
      </div>
    </form>
  );
}
