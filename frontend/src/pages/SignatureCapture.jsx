import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAction, useApi } from '../hooks/useApi.js';
import SignaturePad from '../components/SignaturePad.jsx';
import { ErrorBanner, Loading, PageHeader } from '../components/ui.jsx';
import { LANGUAGES } from '../utils/format.js';

/** Screen 05 - per-visit acknowledgement and signature in English, Sinhala or Tamil. */
export default function SignatureCapture() {
  const { id } = useParams();
  const { data: visit, error: loadError } = useApi(`/visits/${id}`);
  const { data: ack, error: ackError } = useApi('/reference/ack-text/active');
  const [lang, setLang] = useState('en');
  const [blank, setBlank] = useState(true);
  const [result, setResult] = useState(null);
  const pad = useRef(null);
  const { busy, error, run } = useAction();

  if (loadError) return <ErrorBanner error={loadError} />;
  if (!visit) return <Loading />;

  const status = result?.status || visit.summary.status;
  const token = result?.tokenNo ?? visit.summary.tokenNo;

  if (status !== 'PENDING_SIGNATURE' && status !== 'PENDING_VERIFICATION') {
    return (
      <>
        <PageHeader no="05" title="Signature capture" />
        <section className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="muted">Signed. Queue token</p>
          <div className="token-xl" aria-live="polite">{token}</div>
          <p style={{ marginTop: 10 }}>{visit.visitor.fullName} is waiting for <b>{visit.summary.hostName}</b>, who has been notified.</p>
          <div className="actions" style={{ justifyContent: 'center', marginTop: 20 }}>
            <Link className="btn" to={`/visits/${id}`}>Visit detail</Link>
            <Link className="btn primary" to="/queue">Live queue</Link>
            <Link className="btn" to="/visits/new">Register next visitor</Link>
          </div>
        </section>
      </>
    );
  }

  if (status === 'PENDING_VERIFICATION') {
    return (
      <>
        <PageHeader no="05" title="Signature capture" />
        <div className="alert warning">Verify the visitor's identity first. <Link to={`/visits/${id}/verify`}>Go to identity verification</Link></div>
      </>
    );
  }

  const text = ack ? { en: ack.textEn, si: ack.textSi, ta: ack.textTa }[lang] : '';

  const submit = () => run(async () => {
    setResult(await api.post(`/visits/${id}/sign`, { language: lang, signaturePng: pad.current.toDataURL() }));
  });

  return (
    <>
      <PageHeader no="05" title="Signature capture">
        Turn the screen to the visitor. They read the acknowledgement in their language and sign below.
      </PageHeader>
      <ErrorBanner error={error || ackError} />
      {ack && (
        <section className="card">
          <div className="tabs" role="tablist" aria-label="Language">
            {Object.entries(LANGUAGES).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={lang === k} onClick={() => setLang(k)} lang={k}>{label}</button>
            ))}
          </div>
          <div lang={lang} style={{ whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 1.7, maxHeight: 280, overflowY: 'auto' }}>{text}</div>
          <p className="small muted" style={{ marginTop: 8 }}>Acknowledgement version {ack.version}</p>

          <h2 style={{ marginTop: 18 }}>Visitor signature: {visit.visitor.fullName}</h2>
          <SignaturePad ref={pad} onChange={setBlank} label={`Signature of ${visit.visitor.fullName}`} />
          <div className="actions" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <button className="btn" onClick={() => pad.current.clear()}>Clear</button>
            <button className="btn primary" onClick={submit} disabled={busy || blank}>
              {busy ? 'Saving…' : 'I have read and agree - submit'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
