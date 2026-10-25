import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserState: (updated: Partial<User>) => void;
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

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<{ user: User }>('/api/auth/me');
      setUser(data.user);
    } catch {
      // best-effort
    }
  }, []);

  const updateUserState = useCallback((updated: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updated } : null));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser, updateUserState }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export interface PermissionActionDef {
  key: string;
  label: 'Adicionar' | 'Editar' | 'Remover';
}

export interface PermissionModuleDef {
  id: string;
  name: string;
  coordOnly?: boolean;
  actions: PermissionActionDef[];
}

export const PERMISSION_MODULES: PermissionModuleDef[] = [
  {
    id: 'veiculos',
    name: 'Veículos e Frotas',
    actions: [
      { key: 'veiculos.create', label: 'Adicionar' },
      { key: 'veiculos.edit', label: 'Editar' },
      { key: 'veiculos.delete', label: 'Remover' },
    ],
  },
  {
    id: 'pessoas',
    name: 'Pessoas e Técnicos',
    actions: [
      { key: 'pessoas.create', label: 'Adicionar' },
      { key: 'pessoas.edit', label: 'Editar' },
      { key: 'pessoas.delete', label: 'Remover' },
    ],
  },
  {
    id: 'area_de_trabalho',
    name: 'Área de Trabalho (Demandas)',
    actions: [
      { key: 'area_de_trabalho.create', label: 'Adicionar' },
      { key: 'area_de_trabalho.edit', label: 'Editar' },
      { key: 'area_de_trabalho.delete', label: 'Remover' },
    ],
  },
  {
    id: 'favoritos',
    name: 'Favoritos',
    actions: [
      { key: 'favoritos.create', label: 'Adicionar' },
      { key: 'favoritos.edit', label: 'Editar' },
      { key: 'favoritos.delete', label: 'Remover' },
    ],
  },
  {
    id: 'buscador',
    name: 'Buscador e Base Rede',
    actions: [
      { key: 'buscador.create', label: 'Adicionar' },
      { key: 'buscador.edit', label: 'Editar' },
    ],
  },
  {
    id: 'auditoria',
    name: 'Auditoria e Vistorias',
    actions: [
      { key: 'auditoria.create', label: 'Adicionar' },
      { key: 'auditoria.edit', label: 'Editar' },
      { key: 'auditoria.delete', label: 'Remover' },
    ],
  },
  {
    id: 'aceitacao',
    name: 'Aceitação de Rede',
    actions: [
      { key: 'aceitacao.create', label: 'Adicionar' },
      { key: 'aceitacao.edit', label: 'Editar' },
      { key: 'aceitacao.delete', label: 'Remover' },
    ],
  },
  {
    id: 'pos_evento',
    name: 'Pós Evento',
    actions: [
      { key: 'pos_evento.create', label: 'Adicionar' },
      { key: 'pos_evento.edit', label: 'Editar' },
      { key: 'pos_evento.delete', label: 'Remover' },
    ],
  },
  {
    id: 'avaliacao',
    name: 'Avaliação Técnica',
    actions: [
      { key: 'avaliacao.create', label: 'Adicionar' },
      { key: 'avaliacao.delete', label: 'Remover' },
    ],
  },
  {
    id: 'projetos',
    name: 'Projetos FTTH',
    actions: [
      { key: 'projetos.create', label: 'Adicionar' },
      { key: 'projetos.edit', label: 'Editar' },
      { key: 'projetos.delete', label: 'Remover' },
    ],
  },
  {
    id: 'formularios',
    name: 'Formulários',
    actions: [
      { key: 'formularios.create', label: 'Adicionar' },
      { key: 'formularios.edit', label: 'Editar' },
      { key: 'formularios.delete', label: 'Remover' },
    ],
  },
  {
    id: 'rotas',
    name: 'Rotas e KMZ',
    actions: [
      { key: 'rotas.create', label: 'Adicionar' },
      { key: 'rotas.edit', label: 'Editar' },
      { key: 'rotas.delete', label: 'Remover' },
    ],
  },
  {
    id: 'indicadores',
    name: 'Indicadores',
    actions: [
      { key: 'indicadores.edit', label: 'Editar' },
    ],
  },
  {
    id: 'escala',
    name: 'Escala e Sobreaviso',
    actions: [
      { key: 'escala.edit', label: 'Editar' },
    ],
  },
  {
    id: 'financeiro',
    name: 'Financeiro',
    actions: [
      { key: 'financeiro.create', label: 'Adicionar' },
      { key: 'financeiro.edit', label: 'Editar' },
      { key: 'financeiro.delete', label: 'Remover' },
    ],
  },
  {
    id: 'notificacoes',
    name: 'Notificações e Comunicados',
    actions: [
      { key: 'notificacoes.create', label: 'Adicionar' },
      { key: 'notificacoes.delete', label: 'Remover' },
    ],
  },
  {
    id: 'gerenciamento',
    name: 'Gerenciamento de Acessos',
    coordOnly: true,
    actions: [
      { key: 'gerenciamento.create', label: 'Adicionar' },
      { key: 'gerenciamento.edit', label: 'Editar' },
      { key: 'gerenciamento.delete', label: 'Remover' },
    ],
  },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_MODULES.flatMap((m) =>
  m.actions.map((a) => a.key)
);

export function isMasterCoordenador(user: User | null | { username?: string }): boolean {
  if (!user) return false;
  return (user.username || '').trim().toLowerCase() === 'alexandre.candido';
}

export function isCoordenador(user: User | null | { username?: string; role?: string }): boolean {
  if (!user) return false;
  if (isMasterCoordenador(user)) return true;
  const role = (user.role || '').trim().toLowerCase();
  return ['administrador', 'admin', 'coordenador'].includes(role);
}

export function isCoordenadorClaro(user: User | null): boolean {
  if (!user) return false;
  if (isMasterCoordenador(user)) return true;
  const role = (user.role || '').trim().toLowerCase();
  if (['administrador', 'admin'].includes(role)) return true;
  const company = (user.company || '').trim().toLowerCase();
  return role === 'coordenador' && company === 'claro';
}

export function hasPermission(user: User | null, perm: string): boolean {
  if (!user) return false;
  if (isMasterCoordenador(user)) return true;
  if (Array.isArray(user.permissions)) {
    if (!isCoordenador(user) && perm.startsWith('gerenciamento.')) {
      return false;
    }
    return user.permissions.includes(perm);
  }
  return isCoordenador(user);
}

export { ApiError };
