import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Crest from '../components/Crest.jsx';
import { ErrorBanner, Field } from '../components/ui.jsx';

/**
 * Screen 01 - SSO sign-in.
 * Kept as the SSO landing page as agreed. The SSO integration will be merged here:
 * point APP_SSO_LOGIN_URL at the SSO start URL and set APP_AUTH_MODE=sso.
 * Until then, the "development sign-in" block lets named staff in by e-mail (no passwords).
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

  return (
    <div className="signin">
      <section className="signin-hero">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Crest size={56} />
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 700, letterSpacing: '.05em' }}>CIABOC</div>
            <div style={{ fontSize: 12.5, color: 'var(--gold-hi)' }}>
              Reception, Visitor Management &amp; Vehicle Movement Management
            </div>
          </div>
        </div>
        <div>
          <h1>Staff sign-in</h1>
          <p>Access is through the Commission's Single Sign-On. There are no separate passwords for this system.
            Every action you take is recorded in the audit log.</p>
        </div>
        <p className="small" style={{ color: '#8494b8' }}>Authorised staff only. Unauthorised access is an offence.</p>
      </section>

      <section className="signin-panel">
        <div className="signin-box">
          <h2>Sign in</h2>
          <p className="muted" style={{ marginTop: 6 }}>Use your CIABOC account.</p>

          <div style={{ marginTop: 22 }}>
            {ssoUrl ? (
              <a className="btn primary" style={{ width: '100%', minHeight: 46 }} href={ssoUrl}>Sign in with Single Sign-On</a>
            ) : (
              <>
                <button className="btn primary" style={{ width: '100%', minHeight: 46 }} disabled aria-describedby="sso-note">
                  Sign in with Single Sign-On
                </button>
                <p id="sso-note" className="small muted" style={{ marginTop: 8 }}>Single Sign-On is not connected yet.</p>
              </>
            )}
          </div>

          {devMode && (
            <form onSubmit={submit} className="stack">
              <div className="signin-sep">Development sign-in (until SSO is connected)</div>
              <ErrorBanner error={error} />
              <Field label="Staff e-mail" hint="Must match an active staff record created by a System Administrator.">
                <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <button className="btn gold" style={{ width: '100%' }} disabled={busy || !email}>
                {busy ? 'Signing in…' : 'Continue'}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
