import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

/**
 * Holds the signed-in staff member and the client settings.
 * When SSO is merged, only the sign-in page changes: the backend will create the same session,
 * and this provider picks it up through /api/auth/me.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [settings, setSettings] = useState(null);
  const [ready, setReady] = useState(false);

  const loadSettings = useCallback(async () => {
    try { setSettings(await api.get('/reference/client-settings')); } catch { /* not signed in */ }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      setUser(me);
      await loadSettings();
    } catch {
      setUser(null);
    }
  }, [loadSettings]);

  useEffect(() => {
    (async () => {
      await api.get('/auth/csrf').catch(() => {});        // makes sure the XSRF cookie exists
      setConfig(await api.get('/auth/config').catch(() => ({ mode: 'sso' })));
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('rvm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('rvm:unauthorized', onUnauthorized);
  }, []);

  const devLogin = useCallback(async (email) => {
    const me = await api.post('/auth/dev-login', { email });
    await api.get('/auth/csrf').catch(() => {});        // the session id changed, so refresh the token
    setUser(me);
    await loadSettings();
    return me;
  }, [loadSettings]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally {
      setUser(null);
      await api.get('/auth/csrf').catch(() => {});
    }
  }, []);

  const value = useMemo(() => ({
    user, config, settings, ready, devLogin, logout, refresh,
    roles: user?.roles || [],
    hasRole: (...r) => !!user && r.some((x) => user.roles.includes(x)),
    refreshSeconds: settings?.refreshSeconds || 15,
  }), [user, config, settings, ready, devLogin, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
