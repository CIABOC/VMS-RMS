import { useState } from 'react';
import { api } from '../api/client.js';
import { useAction, useApi } from '../hooks/useApi.js';
import { Badge, Dialog, Empty, ErrorBanner, Field, Loading, PageHeader } from '../components/ui.jsx';
import { ROLES, ROLE_KEYS } from '../config/roles.js';
import { fmtDateTime } from '../utils/format.js';

const TABS = [
  { key: 'settings', label: 'Limits and settings' },
  { key: 'categories', label: 'Visitor categories' },
  { key: 'ack', label: 'Acknowledgement texts' },
  { key: 'staff', label: 'Staff and roles' },
  { key: 'mapping', label: 'SSO role mapping' },
];

/** Screen 14 - admin master data. Every save is audited. */
export default function AdminMasterData() {
  const [tab, setTab] = useState('settings');
  return (
    <>
      <PageHeader no="14" title="Admin master data">Limits, texts, categories, staff and role mapping. Every change is recorded in the audit log.</PageHeader>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'settings' && <Settings />}
      {tab === 'categories' && <Categories />}
      {tab === 'ack' && <AckTexts />}
      {tab === 'staff' && <Staff />}
      {tab === 'mapping' && <Mapping />}
    </>
  );
}

// ------------------------------------------------------------------ settings
function Settings() {
  const { data, error, reload } = useApi('/admin/settings');
  const [edit, setEdit] = useState({});
  const { busy, error: saveError, run } = useAction();
  const save = (key) => run(async () => { await api.put(`/admin/settings/${key}`, { value: edit[key] }); setEdit({ ...edit, [key]: undefined }); await reload(); });
  if (!data) return error ? <ErrorBanner error={error} /> : <Loading />;
  return (
    <section className="card">
      <ErrorBanner error={saveError} />
      <div className="table-wrap"><table>
        <thead><tr><th>Setting</th><th>Value</th><th>Last changed</th><th /></tr></thead>
        <tbody>{data.map((s) => (
          <tr key={s.key}>
            <td><b className="mono">{s.key}</b><div className="small muted">{s.description}</div></td>
            <td style={{ width: 160 }}>
              <input aria-label={s.key} value={edit[s.key] ?? s.value} inputMode={s.valueType === 'INTEGER' ? 'numeric' : undefined}
                onChange={(e) => setEdit({ ...edit, [s.key]: e.target.value })} />
            </td>
            <td className="small">{s.updatedAt ? <>{fmtDateTime(s.updatedAt)}<div className="muted">{s.updatedBy}</div></> : 'Initial value'}</td>
            <td className="num"><button className="btn small primary" disabled={busy || edit[s.key] === undefined || edit[s.key] === s.value} onClick={() => save(s.key)}>Save</button></td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

// ------------------------------------------------------------------ categories
const NEW_CATEGORY = { code: '', name: '', requiresAppointment: false, requiresDeviceCustody: false, active: true };

function Categories() {
  const { data, error, reload } = useApi('/admin/categories');
  const [form, setForm] = useState(null);
  const { busy, error: saveError, run } = useAction();
  const save = () => run(async () => {
    if (form.id) await api.put(`/admin/categories/${form.id}`, form); else await api.post('/admin/categories', form);
    setForm(null);
    await reload();
  });
  if (!data) return error ? <ErrorBanner error={error} /> : <Loading />;
  const fe = saveError?.fieldErrors || {};
  return (
    <section className="card">
      <h2>Visitor categories <button className="btn small primary" onClick={() => setForm({ ...NEW_CATEGORY })}>Add category</button></h2>
      {data.length === 0 ? <Empty>No categories yet. Add the categories defined in the SRS.</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Code</th><th>Name</th><th>Rules</th><th>Status</th><th /></tr></thead>
          <tbody>{data.map((c) => (
            <tr key={c.id}>
              <td className="mono">{c.code}</td><td>{c.name}</td>
              <td>{c.requiresAppointment && <Badge tone="info">appointment</Badge>} {c.requiresDeviceCustody && <Badge tone="info">device custody</Badge>}</td>
              <td><Badge tone={c.active ? 'good' : ''}>{c.active ? 'Active' : 'Inactive'}</Badge></td>
              <td className="num"><button className="btn small" onClick={() => setForm({ ...c })}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Dialog open={!!form} title={form?.id ? 'Edit category' : 'New category'} onClose={() => setForm(null)} footer={<>
        <button className="btn" onClick={() => setForm(null)}>Close</button>
        <button className="btn primary" disabled={busy} onClick={save}>Save</button>
      </>}>
        {form && <div className="stack">
          <ErrorBanner error={saveError} />
          <Field label="Code" hint="Capitals, digits and _" error={fe.code}><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Name" error={fe.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={form.requiresAppointment} onChange={(e) => setForm({ ...form, requiresAppointment: e.target.checked })} /> Requires an appointment</label>
          <label className="check"><input type="checkbox" checked={form.requiresDeviceCustody} onChange={(e) => setForm({ ...form, requiresDeviceCustody: e.target.checked })} /> Requires device custody</label>
          <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
        </div>}
      </Dialog>
    </section>
  );
}

// ------------------------------------------------------------------ acknowledgement texts
function AckTexts() {
  const { data, error, reload } = useApi('/admin/ack-texts');
  const [form, setForm] = useState(null);
  const [view, setView] = useState(null);
  const { busy, error: saveError, run } = useAction();
  const create = () => run(async () => { await api.post('/admin/ack-texts', form); setForm(null); await reload(); });
  const activate = (a) => run(async () => { await api.post(`/admin/ack-texts/${a.id}/activate`); await reload(); });
  if (!data) return error ? <ErrorBanner error={error} /> : <Loading />;
  return (
    <section className="card">
      <h2>Acknowledgement texts
        <button className="btn small primary" onClick={() => setForm({ textEn: data[0]?.textEn || '', textSi: data[0]?.textSi || '', textTa: data[0]?.textTa || '' })}>New version</button>
      </h2>
      <p className="small muted" style={{ marginBottom: 10 }}>Published versions cannot be edited, because each signature records the version the visitor saw. Create a new version and publish it.</p>
      <ErrorBanner error={saveError} />
      {data.length === 0 ? <Empty>No acknowledgement text yet. Visitors cannot sign until one is published.</Empty> : (
        <table>
          <thead><tr><th>Version</th><th>Created</th><th>Status</th><th /></tr></thead>
          <tbody>{data.map((a) => (
            <tr key={a.id}>
              <td>v{a.version}</td><td className="small">{fmtDateTime(a.createdAt)} · {a.createdBy}</td>
              <td><Badge tone={a.active ? 'good' : ''}>{a.active ? 'Published' : 'Draft / retired'}</Badge></td>
              <td className="num"><span className="actions" style={{ justifyContent: 'flex-end' }}>
                <button className="btn small" onClick={() => setView(a)}>View</button>
                {!a.active && <button className="btn small primary" disabled={busy} onClick={() => activate(a)}>Publish</button>}
              </span></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Dialog open={!!form} title="New acknowledgement version" onClose={() => setForm(null)} footer={<>
        <button className="btn" onClick={() => setForm(null)}>Close</button>
        <button className="btn primary" disabled={busy || !form?.textEn?.trim() || !form?.textSi?.trim() || !form?.textTa?.trim()} onClick={create}>Save as draft</button>
      </>}>
        {form && <div className="stack">
          <Field label="English"><textarea lang="en" value={form.textEn} onChange={(e) => setForm({ ...form, textEn: e.target.value })} /></Field>
          <Field label="Sinhala"><textarea lang="si" value={form.textSi} onChange={(e) => setForm({ ...form, textSi: e.target.value })} /></Field>
          <Field label="Tamil"><textarea lang="ta" value={form.textTa} onChange={(e) => setForm({ ...form, textTa: e.target.value })} /></Field>
        </div>}
      </Dialog>
      <Dialog open={!!view} title={`Acknowledgement v${view?.version}`} onClose={() => setView(null)} footer={<button className="btn" onClick={() => setView(null)}>Close</button>}>
        {view && <div className="stack" style={{ whiteSpace: 'pre-wrap' }}>
          <div lang="en">{view.textEn}</div><hr /><div lang="si">{view.textSi}</div><hr /><div lang="ta">{view.textTa}</div>
        </div>}
      </Dialog>
    </section>
  );
}

// ------------------------------------------------------------------ staff
const NEW_STAFF = { email: '', fullName: '', designation: '', department: '', mobile: '', active: true, roles: [] };

function Staff() {
  const { data, error, reload } = useApi('/admin/staff');
  const [form, setForm] = useState(null);
  const { busy, error: saveError, run } = useAction();
  const save = () => run(async () => {
    if (form.id) await api.put(`/admin/staff/${form.id}`, form); else await api.post('/admin/staff', form);
    setForm(null);
    await reload();
  });
  const toggleRole = (r) => setForm({ ...form, roles: form.roles.includes(r) ? form.roles.filter((x) => x !== r) : [...form.roles, r] });
  if (!data) return error ? <ErrorBanner error={error} /> : <Loading />;
  const fe = saveError?.fieldErrors || {};
  return (
    <section className="card">
      <h2>Staff and roles <button className="btn small primary" onClick={() => setForm({ ...NEW_STAFF })}>Add staff member</button></h2>
      <p className="small muted" style={{ marginBottom: 10 }}>Staff sign in with Single Sign-On; the e-mail must match their directory account. No passwords are stored.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>E-mail</th><th>Department</th><th>Roles</th><th>Status</th><th /></tr></thead>
        <tbody>{data.map((s) => (
          <tr key={s.id}>
            <td>{s.fullName}<div className="small muted">{s.designation}</div></td>
            <td className="small">{s.email}</td><td>{s.department || '—'}</td>
            <td>{s.roles.map((r) => <Badge key={r}>{ROLES[r]}</Badge>)}</td>
            <td><Badge tone={s.active ? 'good' : ''}>{s.active ? 'Active' : 'Inactive'}</Badge></td>
            <td className="num"><button className="btn small" onClick={() => setForm({ ...NEW_STAFF, ...s, designation: s.designation || '', department: s.department || '', mobile: s.mobile || '' })}>Edit</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <Dialog open={!!form} title={form?.id ? 'Edit staff member' : 'New staff member'} onClose={() => setForm(null)} footer={<>
        <button className="btn" onClick={() => setForm(null)}>Close</button>
        <button className="btn primary" disabled={busy} onClick={save}>Save</button>
      </>}>
        {form && <div className="stack">
          <ErrorBanner error={saveError} />
          <Field label="Full name" error={fe.fullName}><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="E-mail (SSO account)" error={fe.email}><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label="Designation"><input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
            <Field label="Department"><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            <Field label="Mobile"><input type="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
          </div>
          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
            <legend className="small" style={{ padding: '0 4px' }}>Roles</legend>
            {ROLE_KEYS.map((r) => <label key={r} className="check"><input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleRole(r)} /> {ROLES[r]}</label>)}
          </fieldset>
          <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
        </div>}
      </Dialog>
    </section>
  );
}

// ------------------------------------------------------------------ SSO role mapping
function Mapping() {
  const { data, error, reload } = useApi('/admin/role-mappings');
  const [f, setF] = useState({ ssoGroup: '', role: ROLE_KEYS[0] });
  const { busy, error: saveError, run } = useAction();
  const add = (e) => { e.preventDefault(); run(async () => { await api.post('/admin/role-mappings', f); setF({ ...f, ssoGroup: '' }); await reload(); }); };
  const remove = (m) => run(async () => { await api.del(`/admin/role-mappings/${m.id}`); await reload(); });
  if (!data) return error ? <ErrorBanner error={error} /> : <Loading />;
  return (
    <section className="card">
      <h2>SSO group to role mapping</h2>
      <p className="small muted" style={{ marginBottom: 10 }}>Used once Single Sign-On is connected: members of a directory group receive the mapped role at sign-in.</p>
      <ErrorBanner error={saveError} />
      <form className="row" onSubmit={add} style={{ marginBottom: 14 }}>
        <div className="grow"><Field label="SSO / directory group"><input required maxLength={200} value={f.ssoGroup} onChange={(e) => setF({ ...f, ssoGroup: e.target.value })} /></Field></div>
        <div style={{ width: 240 }}><Field label="Role">
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLE_KEYS.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select>
        </Field></div>
        <button className="btn primary" disabled={busy}>Add mapping</button>
      </form>
      {data.length === 0 ? <Empty>No mappings yet.</Empty> : (
        <table>
          <thead><tr><th>Group</th><th>Role</th><th /></tr></thead>
          <tbody>{data.map((m) => (
            <tr key={m.id}><td className="mono">{m.ssoGroup}</td><td>{ROLES[m.role]}</td>
              <td className="num"><button className="btn small danger" disabled={busy} onClick={() => remove(m)}>Remove</button></td></tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
