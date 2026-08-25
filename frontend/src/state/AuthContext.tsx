import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ user: User }>('/api/auth/me')
      .then((data) => { if (!cancelled) setUser(data.user); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post<{ user: User }>('/api/auth/login', { username, password });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // best-effort
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function isCoordenador(user: User | null): boolean {
  if (!user) return false;
  const role = user.role;
  return user.username.toLowerCase() === 'alexandre.candido' || ['Administrador', 'Admin', 'Coordenador', 'Supervisor'].includes(role);
}

export function isCoordenadorClaro(user: User | null): boolean {
  if (!user) return false;
  const role = user.role;
  const isCoord = user.username.toLowerCase() === 'alexandre.candido' || ['Administrador', 'Admin', 'Coordenador'].includes(role);
  return isCoord && (user.company || '').trim().toLowerCase() === 'claro';
}

export { ApiError };
