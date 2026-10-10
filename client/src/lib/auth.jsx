import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const signOut = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    if (!tokenStore.get()) return;
    api.get('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false));
  }, [signOut]);

  const value = useMemo(() => {
    const accept = (data) => {
      tokenStore.set(data.token);
      setUser(data.user);
      return data.user;
    };
    return {
      user,
      loading,
      signOut,
      signIn: async (email, password) => accept(await api.post('/auth/login', { email, password })),
      register: async (fields) => accept(await api.post('/auth/register', fields)),
    };
  }, [user, loading, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const homeFor = (user) => (user?.role === 'MUNICIPAL' ? '/municipal' : '/');
