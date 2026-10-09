import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/**
 * GET a path, optionally re-fetching on an interval. Keeps the previous data
 * visible while refreshing so polling never flashes a loading state.
 */
export function useApi(path, { pollMs = 0 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const pathRef = useRef(path);
  pathRef.current = path;

  const load = useCallback(async (signal) => {
    const requested = pathRef.current;
    if (!requested) return;
    try {
      const data = await api.get(requested, { signal });
      if (pathRef.current === requested) setState({ data, error: null, loading: false });
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (pathRef.current === requested) setState((s) => ({ data: s.data, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    setState({ data: null, error: null, loading: true });
    const controller = new AbortController();
    load(controller.signal);
    let timer;
    if (pollMs > 0) {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') load(controller.signal);
      }, pollMs);
    }
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [path, pollMs, load]);

  return { ...state, reload: () => load(), setData: (data) => setState({ data, error: null, loading: false }) };
}
