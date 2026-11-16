import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

/**
 * Loads `path` and optionally re-polls every `refreshSeconds`.
 * Pass path = null to skip loading.
 */
export function useApi(path, { refreshSeconds = 0 } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!!path);
  const live = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api.get(path);
      if (live.current) { setData(d); setError(null); }
    } catch (e) {
      if (live.current) setError(e);
    } finally {
      if (live.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    live.current = true;
    setLoading(!!path);
    load();
    let timer;
    if (refreshSeconds > 0) {
      timer = setInterval(() => { if (!document.hidden) load(); }, refreshSeconds * 1000);
    }
    return () => { live.current = false; clearInterval(timer); };
  }, [load, refreshSeconds, path]);

  return { data, error, loading, reload: load, setData };
}

/** Wraps an async action with busy + error state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
