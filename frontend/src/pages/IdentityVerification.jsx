import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAction, useApi } from '../hooks/useApi.js';
import { ErrorBanner, Field, Loading, PageHeader, StatusBadge } from '../components/ui.jsx';
import IdScanner from '../components/IdScanner.jsx';
import { ID_TYPES, fmtDateTime } from '../utils/format.js';

/** Screen 04 - identity verification with the stored-scan reuse rule. */
export default function IdentityVerification() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: visit, error: loadError } = useApi(`/visits/${id}`);
  const { data: st, reload } = useApi(`/visits/${id}/verification`);
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [readNumber, setReadNumber] = useState(null); // document number read from the barcode, if any
  const { busy, error, run } = useAction();

  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);

  useEffect(() => {
    if (st && !method) setMethod(st.reuseAllowed ? 'REUSED_SCAN' : 'NEW_SCAN');
  }, [st, method]);

  if (loadError) return <ErrorBanner error={loadError} />;
  if (!visit || !st) return <Loading />;
  const v = visit.visitor;
  const done = visit.summary.status !== 'PENDING_VERIFICATION';

  const viewScan = () => run(async () => {
    const blob = await api.blob(`/visitors/${v.id}/id-scan`);
    setPreview({ url: URL.createObjectURL(blob), type: blob.type });
  });

  const upload = () => run(async () => {
    const form = new FormData();
    form.append('file', file);
    await api.upload(`/visitors/${v.id}/id-scan`, form);
    setFile(null);
    await reload();
  });

  const onCameraScan = (r) => run(async () => {
    setScannerOpen(false);
    setReadNumber(r.raw && r.idNumber ? r.idNumber : null);
    const form = new FormData();
    form.append('file', r.photo);
    await api.upload(`/visitors/${v.id}/id-scan`, form);
    await reload();
  });
  const numberMatches = readNumber && readNumber.replace(/\s+/g, '') === String(v.idNumber).replace(/\s+/g, '').toUpperCase();

  const confirm = () => run(async () => {
    await api.post(`/visits/${id}/verify`, { method, note });
    navigate(`/visits/${id}/sign`);
  });

  return (
    <>
      <PageHeader no="04" title="Identity verification" actions={<Link className="btn" to={`/visits/${id}`}>Visit detail</Link>}>
        Check the visitor's document against the stored scan, take a new scan, or record an exception.
      </PageHeader>
      <ErrorBanner error={error} />
      <IdScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onResult={onCameraScan}
        title="New identity scan" photoRequired confirmLabel="Save scan" />
      <div className="grid two">
        <section className="card">
          <h2>Visitor <StatusBadge status={visit.summary.status} /></h2>
          <dl className="stack">
            <div><dt className="small muted">Name</dt><dd>{v.fullName}</dd></div>
            <div><dt className="small muted">Document</dt><dd>{ID_TYPES[v.idType]} · <b>{v.idNumber}</b></dd></div>
            <div><dt className="small muted">Stored scan</dt>
              <dd>{st.hasStoredScan
                ? <>Scanned {fmtDateTime(st.scannedAt)} ({st.scanAgeDays} days ago) <button className="btn small" onClick={viewScan} disabled={busy}>View scan</button></>
                : 'None on file'}</dd>
            </div>
          </dl>
          {preview && (
            <div style={{ marginTop: 12 }}>
              {preview.type === 'application/pdf'
                ? <iframe title="Identity scan" src={preview.url} style={{ width: '100%', height: 360, border: '1px solid var(--line)' }} />
                : <img alt="Stored identity scan" src={preview.url} style={{ maxWidth: '100%', border: '1px solid var(--line)', borderRadius: 8 }} />}
              <p className="small muted">Viewing a scan is recorded in the audit log.</p>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Verification method</h2>
          {done ? (
            <div className="alert good">Identity already verified ({visit.idVerification}). <Link to={`/visits/${id}/sign`}>Continue to signature</Link></div>
          ) : (
            <fieldset className="stack" style={{ border: 0, padding: 0 }}>
              <legend className="sr-only">Verification method</legend>
              <label className="check">
                <input type="radio" name="m" value="REUSED_SCAN" checked={method === 'REUSED_SCAN'} disabled={!st.reuseAllowed} onChange={(e) => setMethod(e.target.value)} />
                Reuse stored scan
                <span className="small muted">
                  {st.reuseAllowed ? `(within the ${st.reuseDays}-day reuse limit)` : st.hasStoredScan ? `(older than ${st.reuseDays} days - not allowed)` : '(no scan on file)'}
                </span>
              </label>
              <label className="check">
                <input type="radio" name="m" value="NEW_SCAN" checked={method === 'NEW_SCAN'} onChange={(e) => setMethod(e.target.value)} />
                Take a new scan
              </label>
              {method === 'NEW_SCAN' && (
                <div className="row" style={{ paddingLeft: 26 }}>
                  <Field label="Scan file (JPEG, PNG or PDF, max 5 MB)">
                    <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} />
                  </Field>
                  <button className="btn" onClick={upload} disabled={!file || busy}>Upload</button>
                  <span className="muted small">or</span>
                  <button className="btn primary" onClick={() => setScannerOpen(true)} disabled={busy}>Use camera</button>
                  {st.scannedToday && <span className="badge good">Scanned today</span>}
                </div>
              )}
              {method === 'NEW_SCAN' && readNumber && (
                <div className={`alert ${numberMatches ? 'good' : 'serious'}`} role="status" style={{ marginLeft: 26 }}>
                  {numberMatches
                    ? <>The barcode number <b>{readNumber}</b> matches the visitor's profile.</>
                    : <>The barcode number <b>{readNumber}</b> does not match the profile ({v.idNumber}). Check the document before continuing.</>}
                </div>
              )}
              <label className="check">
                <input type="radio" name="m" value="EXCEPTION" checked={method === 'EXCEPTION'} onChange={(e) => setMethod(e.target.value)} />
                Exception (document not available)
              </label>
              {method === 'EXCEPTION' && (
                <Field label="Reason for the exception" hint="At least 10 characters. This is reviewed in the audit log.">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
                </Field>
              )}
              <div className="actions">
                <button className="btn primary" onClick={confirm}
                  disabled={busy || !method || (method === 'NEW_SCAN' && !st.scannedToday) || (method === 'EXCEPTION' && note.trim().length < 10)}>
                  Confirm and continue to signature
                </button>
              </div>
            </fieldset>
          )}
        </section>
      </div>
    </>
  );
}
