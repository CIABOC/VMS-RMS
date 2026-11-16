import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { menuFor } from '../config/screens.js';
import { ROLES } from '../config/roles.js';
import Crest from './Crest.jsx';

export default function AppLayout() {
  const { user, roles, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [location.pathname]);

  const items = menuFor(roles);
  const groups = [...new Set(items.map((s) => s.group))];

  const signOut = async () => {
    await logout();
    navigate('/sign-in', { replace: true });
  };

  return (
    <div className="shell">
      <aside className={`side${open ? ' open' : ''}`} aria-label="Main navigation">
        <Link to="/" className="brand">
          <Crest size={36} />
          <span><b>CIABOC</b><small>Reception &amp; Vehicle Management</small></span>
        </Link>
        <nav className="nav">
          <NavLink to="/" end><span className="no">⌂</span>Home</NavLink>
          {groups.map((g) => (
            <div key={g}>
              <div className="nav-group">{g}</div>
              {items.filter((s) => s.group === g).map((s) => (
                <NavLink key={s.no} to={s.path} end={s.path === '/gate'}>
                  <span className="no">{s.no}</span>{s.title}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <div className="topbar">
          <button className="btn small menu-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Menu</button>
          <div className="who">
            Signed in as <b>{user.fullName}</b>
            <span className="small"> · {user.roles.map((r) => ROLES[r] || r).join(', ')}</span>
          </div>
          <button className="btn small" onClick={signOut}>Sign out</button>
        </div>
        <main className="content" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
