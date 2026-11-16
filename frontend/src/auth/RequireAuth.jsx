import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

/** Route guard: signed in, and (optionally) holding one of `roles`. */
export default function RequireAuth({ roles, children }) {
  const { user, ready, hasRole } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="empty">Loading…</div>;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  if (roles && roles.length && !hasRole(...roles)) {
    return (
      <div className="card" role="alert">
        <h2>Not available for your role</h2>
        <p className="muted">This screen needs one of: {roles.join(', ').replaceAll('_', ' ').toLowerCase()}.</p>
      </div>
    );
  }
  return children;
}
