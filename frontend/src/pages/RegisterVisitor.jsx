import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api/client.js';
import { useAction, useApi } from '../hooks/useApi.js';
import { Empty, ErrorBanner, Field, PageHeader } from '../components/ui.jsx';
import IdScanner from '../components/IdScanner.jsx';
import { parseNic } from '../utils/idParse.js';
import { ID_TYPES, fmtDate, fmtTime, isoDate } from '../utils/format.js';

const EMPTY_VISITOR = { fullName: '', idType: 'NIC', idNumber: '', mobile: '', email: '', organization: '', address: '', dateOfBirth: '' };

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

/** Stores a photo taken by the camera scanner as the visitor's identity scan. Returns the updated visitor. */
async function saveScanPhoto(visitor, photo) {
  if (!photo) return visitor;
  const form = new FormData();
  form.append('file', photo);
  return api.upload(`/visitors/${visitor.id}/id-scan`, form);
}

function FindOrCreate({ onSelected }) {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scan, setScan] = useState(null);
  const { busy: scanBusy, error: scanError, run } = useAction();

  // After a camera scan: open the existing profile if the document number is known, else start a new one.
  const onScanned = (result) => run(async () => {
    setScannerOpen(false);
    const matches = result.idNumber ? await api.get(`/visitors${qs({ q: result.idNumber })}`) : [];
    const same = matches.filter((v) => v.idNumber.toUpperCase() === result.idNumber);
    const existing = same.find((v) => v.idType === result.idType) || same[0];
    if (existing) {
      onSelected(await saveScanPhoto(existing, result.photo));
    } else {
      setScan(result);
      setCreating(true);
    }
  });
  const { data: results, loading } = useApi(term.length >= 2 ? `/visitors${qs({ q: term })}` : null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  if (creating) {
    return <NewVisitor initialName={q} scan={scan} onCancel={() => { setCreating(false); setScan(null); }} onSelected={onSelected} />;
  }

  return (
    <section className="card" aria-labelledby="find-h">
      <h2 id="find-h">1. Find the visitor</h2>
      <div className="row">
        <Field label="Name, identity number or mobile">
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="At least 2 characters" />
        </Field>
        <button className="btn primary" onClick={() => setScannerOpen(true)} disabled={scanBusy}>
          {scanBusy ? 'Looking up…' : 'Scan ID with camera'}
        </button>
        <button className="btn" onClick={() => setCreating(true)}>New visitor</button>
      </div>
      <div style={{ marginTop: 10 }}><ErrorBanner error={scanError} /></div>
      <IdScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onResult={onScanned} confirmLabel="Continue" />
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

const FILLABLE = { fullName: 'full name', idNumber: 'ID number', address: 'address' };

/** Turns a camera scan result into form values (only the fields the ID can give us). */
function fromScan(r) {
  return {
    ...(r.idNumber ? { idType: r.idType || 'NIC', idNumber: r.idNumber } : {}),
    ...(r.fullName ? { fullName: r.fullName } : {}),
    ...(r.birthDate ? { dateOfBirth: r.birthDate } : {}),
    ...(r.address ? { address: r.address } : {}),
  };
}

/**
 * The visitor form. Used the same way whether the visitor was scanned (fields pre-filled from the ID)
 * or entered by hand. The phone number is always typed in.
 */
function NewVisitor({ initialName, scan, onCancel, onSelected }) {
  const [f, setF] = useState(() => ({
    ...EMPTY_VISITOR,
    fullName: /\d/.test(initialName) ? '' : initialName,
    ...(scan ? fromScan(scan) : {}),
  }));
  const [photo, setPhoto] = useState(scan?.photo || null);
  const [readValues, setReadValues] = useState(scan?.tokens || []);
  const [lastField, setLastField] = useState('fullName');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [dupes, setDupes] = useState([]);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const scanned = !!(scan || readValues.length);

  const checkDuplicates = async (v = f) => {
    if (!v.idNumber.trim()) return;
    try {
      setDupes(await api.get(`/visitors/possible-duplicates${qs({ idNumber: v.idNumber, mobile: v.mobile, fullName: v.fullName })}`));
    } catch { setDupes([]); }
  };

  // A scanned ID fills the form straight away, so check for duplicates without waiting for a blur.
  useEffect(() => { if (scan) checkDuplicates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (e) => {
    e.preventDefault();
    run(async () => onSelected(await saveScanPhoto(await api.post('/visitors', { ...f, dateOfBirth: f.dateOfBirth || null }), photo)));
  };

  const onScanned = (r) => {
    setScannerOpen(false);
    const next = { ...f, ...fromScan(r) };
    setF(next);
    setReadValues(r.tokens || []);
    if (r.photo) setPhoto(r.photo);
    checkDuplicates(next);
  };

  const pick = (value) => setF({ ...f, [lastField]: lastField === 'idNumber' ? value.replace(/\s+/g, '').toUpperCase() : value });
  const focus = (k) => () => setLastField(k);
  const nic = f.idType === 'NIC' ? parseNic(f.idNumber) : null;
  const fe = error?.fieldErrors || {};

  return (
    <>
    <IdScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onResult={onScanned} confirmLabel="Continue to form" />
    <form className="card" onSubmit={save} aria-labelledby="new-h" autoComplete="off">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 id="new-h">1. Visitor details</h2>
        <button type="button" className="btn small" onClick={() => setScannerOpen(true)}>{scanned ? 'Scan again' : 'Scan ID with camera'}</button>
      </div>
      {scanned && (
        <div className="alert info" style={{ marginTop: 8 }}>
          Details were filled in from the ID. Check them against the card, then enter the phone number.
        </div>
      )}
      {photo && <div className="alert good" style={{ marginTop: 8 }}>A camera photo of the ID will be saved as the identity scan.</div>}
      <ErrorBanner error={error} />

      <h3 className="form-section">From the identity document</h3>
      <div className="form-grid">
        <Field label="Full name" error={fe.fullName}>
          <input required value={f.fullName} onChange={set('fullName')} autoComplete="off" onFocus={focus('fullName')} onBlur={() => checkDuplicates()} />
        </Field>
        <Field label="Identity document" error={fe.idType}>
          <select value={f.idType} onChange={set('idType')}>
            {Object.entries(ID_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="ID number" error={fe.idNumber}>
          <input required value={f.idNumber} onChange={set('idNumber')} autoComplete="off" name="visitor-id-no" onFocus={focus('idNumber')} onBlur={() => checkDuplicates()} />
        </Field>
        <Field label="Date of birth" error={fe.dateOfBirth}
          hint={nic && nic.birthDate !== f.dateOfBirth
            ? <>The NIC number gives {fmtDate(nic.birthDate)}. <button type="button" className="btn small" onClick={() => setF({ ...f, dateOfBirth: nic.birthDate })}>Use it</button></>
            : undefined}>
          <input type="date" value={f.dateOfBirth} max={isoDate()} onChange={set('dateOfBirth')} />
        </Field>
        <Field label="Address" error={fe.address}>
          <input value={f.address} onChange={set('address')} autoComplete="off" onFocus={focus('address')} maxLength={500} />
        </Field>
      </div>

      {readValues.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Everything read from the ID. If a field is wrong, click into it, then click the right value here to copy it in (now: {FILLABLE[lastField]}).
          </div>
          <div className="row" style={{ gap: 6 }}>
            {readValues.map((t) => <button key={t} type="button" className="btn small" onClick={() => pick(t)}>{t}</button>)}
          </div>
        </div>
      )}

      <h3 className="form-section">Contact (enter manually)</h3>
      <div className="form-grid">
        <Field label="Phone number" error={fe.mobile}>
          <input type="tel" inputMode="tel" value={f.mobile} onChange={set('mobile')} onBlur={() => checkDuplicates()} autoFocus={scanned} />
        </Field>
        <Field label="E-mail" hint="Optional" error={fe.email}><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Organisation" hint="Optional" error={fe.organization}><input value={f.organization} onChange={set('organization')} /></Field>
      </div>

      {dupes.length > 0 && (
        <div className="alert warning" style={{ marginTop: 14, display: 'block' }} role="status">
          <b>Possible duplicate{dupes.length > 1 ? 's' : ''}.</b> Use an existing profile if it is the same person.
          <ul style={{ marginTop: 6, paddingLeft: 18 }}>
            {dupes.map((d) => (
              <li key={d.id} style={{ marginTop: 4 }}>
                {d.fullName} · {ID_TYPES[d.idType]} {d.idNumber} · {d.mobile || 'no mobile'}{' '}
                <button type="button" className="btn small" onClick={() => run(async () => onSelected(await saveScanPhoto(d, photo)))}>Use this profile</button>
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
    </>
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
        {visitor.dateOfBirth ? ` · born ${fmtDate(visitor.dateOfBirth)}` : ''}
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
