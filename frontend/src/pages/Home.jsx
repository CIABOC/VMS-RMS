import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { SCREENS, rolesCovered, screensFor } from '../config/screens.js';

/**
 * Home launcher - the working version of the prototype's index page.
 * Counts are derived from config/screens.js (no hand-written numbers), and each card is a
 * single link so screen readers do not announce duplicates.
 */
export default function Home() {
  const { user, roles } = useAuth();
  const mine = screensFor(roles).filter((s) => s.menu !== false);
  useEffect(() => { document.title = 'Home · CIABOC RVM'; }, []);

  return (
    <>
      <section className="hero" aria-labelledby="welcome">
        <h1 id="welcome">Welcome, {user.fullName.split(' ')[0]}</h1>
        <p>Reception, Visitor Management and Vehicle Movement Management.</p>
        <div className="meta">
          <div><b>{mine.length}</b><span>Screens for your role</span></div>
          <div><b>{SCREENS.length}</b><span>Screens in the system</span></div>
          <div><b>{rolesCovered()}</b><span>Roles supported</span></div>
        </div>
      </section>

      {mine.length === 0 ? (
        <div className="card">You have no screens assigned yet. Ask a System Administrator to give you a role.</div>
      ) : (
        <nav aria-label="Your screens" className="launch">
          {mine.map((s) => (
            <Link key={s.no} to={s.path}>
              <span className="no" aria-hidden="true">{s.no}</span>
              <span>
                <span className="badge" style={{ marginBottom: 6 }}>{s.group}</span>
                <h3>{s.title}</h3>
                <p>{s.summary}</p>
              </span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
