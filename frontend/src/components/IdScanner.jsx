import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, Field } from './ui.jsx';
import { ID_TYPES, fmtDate } from '../utils/format.js';
import { parseIdText, parseNic } from '../utils/idParse.js';

const SCAN_EVERY_MS = 250;
const NATIVE_FORMATS = ['pdf417', 'qr_code', 'code_128', 'code_39', 'data_matrix', 'aztec'];

/**
 * Camera ID scanner. Reads the barcode on an identity card (NIC, driving licence, ...) and
 * optionally captures a photo of the card to store as the visitor's identity scan.
 *
 * onResult receives { idType, idNumber, fullName, nic, raw, photo } where photo is a JPEG File or null.
 * The receptionist always confirms (and can correct) the values before they are used.
 */
export default function IdScanner({ open, onClose, onResult, title = 'Scan identity document', photoRequired = false, confirmLabel = 'Use these details' }) {
  return (
    <Dialog open={open} title={title} onClose={onClose} className="wide">
      {open && <ScannerPanel onClose={onClose} onResult={onResult} photoRequired={photoRequired} confirmLabel={confirmLabel} />}
    </Dialog>
  );
}

function ScannerPanel({ onClose, onResult, photoRequired, confirmLabel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameras, setCameras] = useState([]);
  const [deviceId, setDeviceId] = useState('');       // camera shown in the picker
  const [requestedId, setRequestedId] = useState(''); // camera the receptionist chose ('' = default)
  const [camError, setCamError] = useState('');
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [details, setDetails] = useState(null);
  const [form, setForm] = useState({ idType: 'NIC', idNumber: '', fullName: '' });
  const [lastField, setLastField] = useState('fullName');
  const [photo, setPhoto] = useState(null); // { file, url }

  // ---- camera start / stop
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setCamError('');

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamError('The camera can only be used when the system is opened over HTTPS (or on localhost). Ask the administrator to enable HTTPS.');
      return undefined;
    }

    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: requestedId
        ? { deviceId: { exact: requestedId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    }).then(async (stream) => {
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setReady(true);
      // Labels are only available once permission has been granted.
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!cancelled) {
        setCameras(devices.filter((d) => d.kind === 'videoinput'));
        setDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId || requestedId);
      }
    }).catch((e) => {
      if (cancelled) return;
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
        setCamError('Camera access was blocked. Click the camera icon in the browser address bar, allow the camera for this site, then try again.');
      } else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
        setCamError('No camera was found. Connect a camera or document scanner camera and try again.');
      } else if (e.name === 'NotReadableError') {
        setCamError('The camera is being used by another application. Close it and try again.');
      } else {
        setCamError(`The camera could not be started (${e.message || e.name}).`);
      }
    });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [requestedId]);

  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo]);

  // ---- barcode decoding loop
  const handleDecoded = useCallback((text) => {
    const parsed = parseIdText(text);
    setDetails(parsed);
    setScanning(false);
    setForm((f) => ({
      idType: parsed.idType || f.idType,
      idNumber: parsed.idNumber || f.idNumber,
      fullName: parsed.suggestedName || f.fullName,
    }));
  }, []);

  useEffect(() => {
    if (!ready || !scanning) return undefined;
    let busy = false;
    let native = null;
    let zxing = null;

    const setup = async () => {
      if ('BarcodeDetector' in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
          if (formats.includes('pdf417')) native = new window.BarcodeDetector({ formats });
        } catch { /* fall back to zxing */ }
      }
      if (!native) {
        // Loaded on demand so the decoder is not part of the main bundle.
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'), import('@zxing/library'),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.PDF_417, BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39, BarcodeFormat.DATA_MATRIX, BarcodeFormat.AZTEC,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        zxing = new BrowserMultiFormatReader(hints);
      }
    };
    const ready$ = setup();

    const timer = setInterval(async () => {
      const video = videoRef.current;
      if (busy || !video || video.readyState < 2) return;
      busy = true;
      try {
        await ready$;
        let text = null;
        if (native) {
          const found = await native.detect(video);
          text = found.find((b) => b.rawValue)?.rawValue || null;
        } else {
          const canvas = canvasRef.current;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0);
          try { text = zxing.decodeFromCanvas(canvas).getText(); } catch { /* nothing in this frame */ }
        }
        if (text) handleDecoded(text);
      } catch { /* ignore a failed frame */ } finally {
        busy = false;
      }
    }, SCAN_EVERY_MS);

    return () => clearInterval(timer);
  }, [ready, scanning, handleDecoded]);

  // ---- photo capture
  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `id-scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setPhoto({ file, url: URL.createObjectURL(blob) });
    }, 'image/jpeg', 0.9);
  };

  const rescan = () => { setDetails(null); setScanning(true); };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pick = (value) => setForm({ ...form, [lastField]: lastField === 'idNumber' ? value.replace(/\s+/g, '').toUpperCase() : value });

  const nic = form.idType === 'NIC' ? parseNic(form.idNumber) : null;
  const canConfirm = photoRequired ? !!photo : !!(form.idNumber.trim() || photo);

  const confirm = () => onResult({
    idType: form.idType,
    idNumber: form.idNumber.trim().toUpperCase(),
    fullName: form.fullName.trim(),
    nic,
    raw: details?.raw || '',
    photo: photo?.file || null,
  });

  return (
    <div className="scanner">
      {camError ? (
        <div className="alert serious" role="alert">{camError}</div>
      ) : (
        <>
          <div className="scanner-view">
            <video ref={videoRef} muted playsInline aria-label="Camera preview" />
            <div className={`scanner-frame${details ? ' found' : ''}`} aria-hidden="true" />
            <div className="scanner-status" aria-live="polite">
              {!ready ? 'Starting camera…' : details ? 'Barcode read' : scanning ? 'Looking for a barcode…' : ''}
            </div>
          </div>
          <canvas ref={canvasRef} hidden />
          <div className="row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
            {cameras.length > 1 && (
              <Field label="Camera">
                <select value={deviceId} onChange={(e) => { setDeviceId(e.target.value); setRequestedId(e.target.value); }}>
                  {cameras.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}
                </select>
              </Field>
            )}
            <button type="button" className="btn" onClick={capture} disabled={!ready}>{photo ? 'Retake photo' : 'Capture photo of ID'}</button>
            {details && <button type="button" className="btn" onClick={rescan}>Scan barcode again</button>}
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            Hold the back of the card (the side with the barcode) steady and flat in the frame. For a passport or a card without a barcode, capture a photo and type the details.
          </p>
        </>
      )}

      {photo && (
        <div style={{ marginTop: 12 }}>
          <img src={photo.url} alt="Captured identity document" className="scanner-photo" />
          <p className="small muted">This photo will be stored as the visitor's identity scan. Viewing it later is recorded in the audit log.</p>
        </div>
      )}

      {!photoRequired && (
        <div className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Identity document">
            <select value={form.idType} onChange={set('idType')}>
              {Object.entries(ID_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Document number">
            <input value={form.idNumber} onChange={set('idNumber')} onFocus={() => setLastField('idNumber')} />
          </Field>
          <Field label="Full name" hint={details?.suggestedName ? 'Suggested from the barcode - check it against the card' : undefined}>
            <input value={form.fullName} onChange={set('fullName')} onFocus={() => setLastField('fullName')} />
          </Field>
          {nic && (
            <div className="field">
              <span>From the NIC number</span>
              <div style={{ paddingTop: 6 }}>Born {fmtDate(nic.birthDate)} · {nic.gender}</div>
            </div>
          )}
        </div>
      )}

      {!photoRequired && details && details.tokens.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Values read from the barcode. Click one to copy it into the field you selected last ({lastField === 'idNumber' ? 'document number' : 'full name'}).
          </div>
          <div className="row" style={{ gap: 6 }}>
            {details.tokens.map((t) => (
              <button key={t} type="button" className="btn small" onClick={() => pick(t)}>{t}</button>
            ))}
          </div>
        </div>
      )}

      {photoRequired && details && (
        <div className="alert info" style={{ marginTop: 12 }}>
          Barcode read{details.idNumber ? <> · document number <b>{details.idNumber}</b></> : ''}.
        </div>
      )}

      <div className="actions" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={confirm} disabled={!canConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}
