import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Crest from '../components/Crest.jsx';
import Wordmark from '../components/Wordmark.jsx';
import { ErrorBanner } from '../components/ui.jsx';

const ORG = 'Commission to Investigate Allegations of Bribery or Corruption';

function GovIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2 2 7v2h20V7L12 2Zm-7 9v7h2v-7H5Zm4 0v7h2v-7H9Zm4 0v7h2v-7h-2Zm4 0v7h2v-7h-2ZM3 20v2h18v-2H3Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Screen 01 - sign-in, styled to the CIABOC Account template.
 * The SSO integration will be merged here: point APP_SSO_LOGIN_URL at the SSO start URL and
 * set APP_AUTH_MODE=sso. Until then, the e-mail form lets named staff in (no passwords).
 */
export default function SignIn() {
  const { user, config, ready, devLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/';

  useEffect(() => { document.title = 'Sign in · CIABOC RVM'; }, []);

  if (ready && user) return <Navigate to={from} replace />;

  const ssoUrl = config?.ssoLoginUrl;
  const devMode = config?.mode === 'dev';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await devLogin(email.trim());
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const ssoButton = ssoUrl ? (
    <a className={`btn ${devMode ? 'outline' : 'primary'} block`} href={ssoUrl}><GovIcon />Continue with CIABOC SSO</a>
  ) : (
    <button type="button" className="btn outline block" disabled aria-describedby="sso-note"><GovIcon />Continue with CIABOC SSO</button>
  );

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="auth-org">
          <Crest size={84} />
          <span>{ORG}</span>
        </div>

        <div className="auth-title">
          <Wordmark size={64} />
          <span className="gold-rule" />
          <h1>Reception &amp; Vehicle Management</h1>
          <p>Welcome to the secure visitor and vehicle management portal.</p>
        </div>

        <p className="auth-foot">© {new Date().getFullYear()} {ORG}</p>
      </section>

      <section className="auth-side">
        <div className="auth-card">
          <div className="auth-card-head">
            <h2>Staff sign-in</h2>
            <p>Authorised staff only. Every action is recorded in the audit log.</p>
          </div>

          {devMode && (
            <form onSubmit={submit} className="stack">
              <ErrorBanner error={error} />
              <label className="field">
                <span>Email / Username</span>
                <input
                  type="email" required autoComplete="username" autoFocus
                  placeholder="name@ciaboc.gov.lk"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                />
                <small>No password is needed until Single Sign-On is connected.</small>
              </label>
              <button className="btn primary block lg" disabled={busy || !email}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {devMode && <div className="or">or</div>}

          {ssoButton}
          {!ssoUrl && <p id="sso-note" className="small muted center" style={{ marginTop: 8 }}>Single Sign-On is not connected yet.</p>}
        </div>
      </section>
    </div>
  );
}
