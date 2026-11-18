import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clock, Eye, KeyRound, Loader2, Lock, Mail, MapPin, Monitor, Plus, Search, Send, Shield, Smartphone, Trash2, User as UserIcon } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { ManagedUser, Technician } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_MODULES,
  hasPermission,
  isCoordenador,
  isMasterCoordenador,
  useAuth,
} from '../state/AuthContext';

const ALL_ROLES = ['Técnico', 'Auxiliar', 'Supervisor', 'Coordenador'];

interface PendingEmailRecipient {
  user_id: number | null;
  tech_id: number | null;
  name: string;
  username?: string | null;
  role: string;
  email: string;
  missing_fields: string[];
}

interface LastDispatchInfo {
  id: number;
  triggered_by: string;
  trigger_type: string;
  status: string;
  eligible_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string | null;
  completed_at: string | null;
  results?: Array<{ email: string; name: string; status: 'sent' | 'failed'; detail: string }>;
}

interface PendingEmailPreview {
  resend_configured: boolean;
  from_email: string;
  recipients: PendingEmailRecipient[];
  total_registered: number;
  with_email_count: number;
  eligible_count: number;
  already_sent_24h_count?: number;
  missing_email_but_pending_count: number;
  cooldown_active?: boolean;
  remaining_seconds?: number;
  remaining_label?: string | null;
  next_allowed_at?: string | null;
  last_dispatch?: LastDispatchInfo | null;
}

interface ResendStatusInfo {
  configured: boolean;
  from_email: string;
  domain_name: string;
  domain_status: string;
}

interface DispatchResult {
  success: boolean;
  sent_count: number;
  failed_count: number;
  eligible_count: number;
  message?: string;
  error?: string;
  results?: Array<{ email: string; name: string; status: 'sent' | 'failed'; detail: string }>;
}

interface UserProfileDetail {
  id: number;
  username: string;
  display_name: string;
  role: string;
  tech_id: number | null;
  company: string;
  email: string;
  email_bounced: boolean;
  email_bounce_reason?: string | null;
  phone: string;
  cpf: string;
  identity: string;
  dob: string;
  area: string;
  team: string;
  team_type: string;
  registration_claro: string;
  registration_third: string;
  toa_login: string;
  phone_model: string;
  imei_1: string;
  shirt_size: string;
  boot_size: string;
  pants_size: string;
  jacket_size: string;
  nr6_expiration: string;
  nr10_expiration: string;
  nr35_expiration: string;
  aso_expiration: string;
  totp_enabled: boolean;
  totp_verified_at_fmt?: string | null;
  theme_preference: string;
  created_at_fmt?: string | null;
  last_login_at_fmt?: string | null;
  last_login_device?: string | null;
  last_login_ua?: string | null;
  last_login_ip?: string | null;
  last_login_location?: string | null;
  permissions: string[];
  missing_fields: string[];
  login_history: Array<{
    id: number;
    login_at_fmt: string;
    device: string;
    user_agent: string;
    ip_address: string;
    location: string;
    auth_stage: string;
  }>;
  recent_actions: Array<{
    id: number;
    action: string;
    timestamp_fmt: string;
  }>;
}

export default function UsersPage() {
  const { user: currentUser, refreshUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<{
    tech_id: string;
    username: string;
    role: string;
    password: string;
    permissions: string[];
  }>({
    tech_id: '',
    username: '',
    role: 'Técnico',
    password: '',
    permissions: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailPreview, setEmailPreview] = useState<PendingEmailPreview | null>(null);
  const [resendStatus, setResendStatus] = useState<ResendStatusInfo | null>(null);
  const [loadingEmailPreview, setLoadingEmailPreview] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [sendingGlobalEmails, setSendingGlobalEmails] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState('');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<UserProfileDetail | null>(null);

  async function openUserProfile(u: ManagedUser) {
    setProfileModalOpen(true);
    setLoadingProfile(true);
    setSelectedProfile(null);
    try {
      const detail = await api.get<UserProfileDetail>(`/api/users/${u.id}/profile-detail`);
      setSelectedProfile(detail);
    } catch {
      setProfileModalOpen(false);
      alert('Não foi possível carregar o perfil detalhado do usuário.');
    } finally {
      setLoadingProfile(false);
    }
  }

  const filteredUsers = useMemo(() => {
    if (!users) return null;
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.tech_name || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q) ||
        (u.last_login_device || '').toLowerCase().includes(q) ||
        (u.last_login_location || '').toLowerCase().includes(q) ||
        (u.area || '').toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const isMaster = isMasterCoordenador(currentUser);
  const canCreateUser = hasPermission(currentUser, 'gerenciamento.create');
  const canEditUser = hasPermission(currentUser, 'gerenciamento.edit');
  const canDeleteUser = hasPermission(currentUser, 'gerenciamento.delete');
  // Exclusivo para o Coordenador Master
  const canNotifyPendingEmails = isMaster;

  async function openPendingEmailModal() {
    setEmailModalOpen(true);
    setLoadingEmailPreview(true);
    setDispatchResult(null);
    setDispatchError(null);
    try {
      const [previewRes, statusRes] = await Promise.all([
        api.get<PendingEmailPreview>('/api/admin/notify-outdated-profile'),
        api.get<ResendStatusInfo>('/api/admin/resend-status'),
      ]);
      setEmailPreview(previewRes);
      setResendStatus(statusRes);
    } catch (err) {
      setDispatchError(
        err instanceof ApiError ? err.message : 'Não foi possível carregar os usuários com pendências.'
      );
    } finally {
      setLoadingEmailPreview(false);
    }
  }

  async function refreshPendingPreview(silent = false) {
    if (!silent) {
      setRefreshingStatus(true);
      setDispatchError(null);
    }
    try {
      const [previewRes, statusRes] = await Promise.all([
        api.get<PendingEmailPreview>('/api/admin/notify-outdated-profile'),
        api.get<ResendStatusInfo>('/api/admin/resend-status'),
      ]);
      setEmailPreview(previewRes);
      setResendStatus(statusRes);
    } catch (err) {
      if (!silent) {
        setDispatchError(
          err instanceof ApiError ? err.message : 'Não foi possível atualizar o status do disparo.'
        );
      }
    } finally {
      if (!silent) setRefreshingStatus(false);
    }
  }

  useEffect(() => {
    if (!emailModalOpen || emailPreview?.last_dispatch?.status !== 'running') return;
    const timer = window.setInterval(() => {
      refreshPendingPreview(true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [emailModalOpen, emailPreview?.last_dispatch?.status]);

  async function handleSendGlobalPendingEmails(force = false) {
    if (!emailPreview || emailPreview.eligible_count === 0) return;
    if (!force && emailPreview.cooldown_active) return;
    setSendingGlobalEmails(true);
    setDispatchError(null);
    setDispatchResult(null);
    try {
      const res = await api.post<DispatchResult>('/api/admin/notify-outdated-profile', force ? { force: true } : {});
      setDispatchResult(res);
      await refreshPendingPreview();
    } catch (err) {
      setDispatchError(
        err instanceof ApiError ? err.message : 'Falha ao disparar e-mails via Resend.'
      );
    } finally {
      setSendingGlobalEmails(false);
    }
  }

  function load() {
    api.get<ManagedUser[]>('/api/users').then(setUsers).catch(() => setUsers([]));
  }

  useEffect(() => {
    load();
    api.get<Technician[]>('/api/technicians').then(setTechnicians).catch(() => setTechnicians([]));
  }, []);

  const availableTechnicians = useMemo(() => {
    const usedIds = new Set((users || []).map((u) => u.tech_id));
    return technicians.filter((t) => !usedIds.has(t.id));
  }, [technicians, users]);

  const selectableRoles = useMemo(() => {
    if (isMaster) return ALL_ROLES;
    return ALL_ROLES.filter((r) => r !== 'Coordenador');
  }, [isMaster]);

  const visibleModules = useMemo(() => {
    const targetIsCoord = isCoordenador({ username: editing?.username, role: form.role });
    return PERMISSION_MODULES.filter((m) => !m.coordOnly || (isMaster && targetIsCoord));
  }, [editing, form.role, isMaster]);

  function canEditRow(target: ManagedUser): boolean {
    if (!canEditUser) return false;
    if (isMasterCoordenador(target)) return isMaster;
    if (isCoordenador(target)) return isMaster;
    if (target.id === currentUser?.id) return isMaster;
    return true;
  }

  function canDeleteRow(target: ManagedUser): boolean {
    if (!canDeleteUser) return false;
    if (isMasterCoordenador(target)) return false;
    if (target.id === currentUser?.id) return false;
    if (isCoordenador(target) && !isMaster) return false;
    return true;
  }

  function openCreate() {
    setEditing(null);
    setForm({
      tech_id: '',
      username: '',
      role: 'Técnico',
      password: '',
      permissions: [],
    });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(u: ManagedUser) {
    if (!canEditRow(u)) return;
    setEditing(u);
    const existingPerms = Array.isArray(u.permissions)
      ? u.permissions
      : isCoordenador(u)
        ? [...ALL_PERMISSION_KEYS]
        : [];
    setForm({
      tech_id: u.tech_id ? String(u.tech_id) : '',
      username: u.username,
      role: u.role,
      password: '',
      permissions: existingPerms,
    });
    setError(null);
    setModalOpen(true);
  }

  function handleRoleChange(newRole: string) {
    setForm((prev) => {
      const wasCoord = isCoordenador({ username: editing?.username, role: prev.role });
      const nowCoord = isCoordenador({ username: editing?.username, role: newRole });
      let nextPerms = [...prev.permissions];
      if (!wasCoord && nowCoord) {
        nextPerms = [...ALL_PERMISSION_KEYS];
      } else if (wasCoord && !nowCoord) {
        nextPerms = nextPerms.filter((p) => !p.startsWith('gerenciamento.'));
      }
      return { ...prev, role: newRole, permissions: nextPerms };
    });
  }

  function togglePermission(key: string) {
    if (editing && isMasterCoordenador(editing)) return;
    setForm((prev) => {
      const exists = prev.permissions.includes(key);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter((p) => p !== key)
          : [...prev.permissions, key],
      };
    });
  }

  function toggleModuleAll(moduleActions: string[]) {
    if (editing && isMasterCoordenador(editing)) return;
    setForm((prev) => {
      const allSelected = moduleActions.every((k) => prev.permissions.includes(k));
      if (allSelected) {
        return {
          ...prev,
          permissions: prev.permissions.filter((p) => !moduleActions.includes(p)),
        };
      }
      const merged = new Set([...prev.permissions, ...moduleActions]);
      return { ...prev, permissions: Array.from(merged) };
    });
  }

  function selectAllVisible() {
    if (editing && isMasterCoordenador(editing)) return;
    const keys = visibleModules.flatMap((m) => m.actions.map((a) => a.key));
    setForm((prev) => ({ ...prev, permissions: Array.from(new Set(keys)) }));
  }

  function clearAllPermissions() {
    if (editing && isMasterCoordenador(editing)) return;
    setForm((prev) => ({ ...prev, permissions: [] }));
  }

  async function handleSubmit() {
    setError(null);
    setIsSaving(true);
    try {
      if (editing) {
        await api.put(`/api/users/${editing.id}`, {
          role: form.role,
          tech_id: form.tech_id || null,
          password: form.password || undefined,
          permissions: form.permissions,
        });
      } else {
        const tech = technicians.find((t) => String(t.id) === form.tech_id);
        if (!tech) throw new ApiError(400, 'Selecione a pessoa correspondente.');
        const username = (form.username || tech.name.trim().toLowerCase().split(/\s+/).slice(0, 2).join('.')).trim().toLowerCase();
        if (!username) throw new ApiError(400, 'Informe o login do usuário.');
        if (!/^[a-z0-9._-]+$/.test(username)) {
          throw new ApiError(400, 'Não é permitido acentuações especiais.');
        }
        await api.post('/api/users', {
          username,
          role: form.role,
          tech_id: form.tech_id,
          permissions: form.permissions,
        });
      }
      setModalOpen(false);
      load();
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(u: ManagedUser) {
    if (!canDeleteRow(u)) return;
    if (!confirm(`Excluir a conta do usuário "${u.username}"?`)) return;
    try {
      await api.delete(`/api/users/${u.id}`);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao excluir usuário.');
    }
  }

  async function handleResetTotp(u: ManagedUser) {
    if (!isMaster) return;
    if (!confirm(`Redefinir o aplicativo autenticador do usuário "${u.username}"?\n\nEle será obrigado a escanear um novo QR Code para conseguir acessar o portal.`)) {
      return;
    }
    try {
      const res = await api.post<{ success: boolean; message: string }>(`/api/users/${u.id}/reset-totp`);
      alert(res.message || 'Autenticador redefinido com sucesso!');
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao redefinir autenticador.');
    }
  }

  function renderPermissionSummary(u: ManagedUser) {
    if (isMasterCoordenador(u)) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/15 text-white">
          <Shield className="w-3 h-3 text-neutral-300" /> Coordenador Geral (Total)
        </span>
      );
    }
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    if (perms.length === 0) {
      return (
        <span className="inline-flex items-center text-[11px] px-2.5 py-1 rounded-md bg-white/[0.02] border border-white/5 text-[var(--color-text-faint)]">
          Somente leitura
        </span>
      );
    }
    if (isCoordenador(u) && perms.length >= ALL_PERMISSION_KEYS.length) {
      return (
        <span className="inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-md bg-white/[0.05] border border-white/10 text-neutral-200">
          Todas as permissões ({perms.length})
        </span>
      );
    }

    const activeModules = PERMISSION_MODULES.map((m) => {
      const count = m.actions.filter((a) => perms.includes(a.key)).length;
      return count > 0 ? { name: m.name, count, total: m.actions.length } : null;
    }).filter(Boolean) as { name: string; count: number; total: number }[];

    const preview = activeModules.slice(0, 3);
    const remaining = activeModules.length - preview.length;

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {preview.map((mod) => (
          <span
            key={mod.name}
            className="text-[11px] px-2 py-0.5 rounded bg-white/[0.04] border border-white/10 text-neutral-300"
          >
            {mod.name} ({mod.count}/{mod.total})
          </span>
        ))}
        {remaining > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-white/[0.03] border border-white/10 text-[var(--color-text-muted)]">
            +{remaining} {remaining === 1 ? 'módulo' : 'módulos'}
          </span>
        )}
      </div>
    );
  }

  const editingIsMaster = Boolean(editing && isMasterCoordenador(editing));

  return (
    <div>
      <PageHeader
        title="Gerenciamento"
        subtitle="Contas de acesso e controle de permissões por módulo"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canNotifyPendingEmails && (
              <Button variant="outline" onClick={openPendingEmailModal}>
                <Mail className="w-4 h-4" /> Notificar Pendências (E-mail)
              </Button>
            )}
            {canCreateUser && (
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4" /> Criar Acesso
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 max-w-md relative">
        <Search className="w-4 h-4 text-[var(--color-text-faint)] absolute left-3.5 top-1/2 -translate-y-1/2" />
        <Input
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          placeholder="Buscar por usuário, nome, cargo, dispositivo ou local..."
          className="pl-10"
        />
      </div>

      {filteredUsers === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : filteredUsers.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">
          Nenhum usuário encontrado.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1060px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
                <th className="px-4 py-3">Usuário / Pessoa</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Último Login (Data Exata, Dispositivo & Local)</th>
                <th className="px-4 py-3">Permissões Liberadas</th>
                <th className="px-4 py-3">2FA</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const editable = canEditRow(u);
                const deletable = canDeleteRow(u);
                const isMobileDevice = (u.last_login_device || '').toLowerCase().includes('celular');

                return (
                  <tr
                    key={u.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openUserProfile(u)}
                        className="text-left group cursor-pointer"
                        title="Clique para abrir o Perfil Completo do Usuário"
                      >
                        <div className="mono font-bold text-white group-hover:text-[var(--color-primary)] transition-colors">
                          {u.username}
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)]">
                          {u.tech_name || '—'}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-neutral-200">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.last_login_at_fmt ? (
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                            <Clock className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                            <span>{u.last_login_at_fmt}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                            {isMobileDevice ? (
                              <Smartphone className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                            ) : (
                              <Monitor className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                            )}
                            <span className="truncate max-w-[260px]" title={u.last_login_device || ''}>
                              {u.last_login_device || 'Dispositivo não identificado'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-amber-300/90">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                            <span className="truncate max-w-[260px]" title={u.last_login_location || ''}>
                              {u.last_login_location || 'Local não identificado'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] text-[var(--color-text-muted)]">
                          <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>Nunca fez login desde que esta opção foi implementada</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{renderPermissionSummary(u)}</td>
                    <td className="px-4 py-3">
                      {u.totp_enabled ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                          <Check className="w-3 h-3" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openUserProfile(u)}
                          title="Abrir Perfil do Usuário (Último login, dispositivo, local e ficha completa)"
                          className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold text-sky-300 bg-sky-500/12 hover:bg-sky-500/22 border border-sky-500/30 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Perfil
                        </button>
                        {isMaster && (
                          <button
                            onClick={() => handleResetTotp(u)}
                            aria-label="Resetar Autenticador 2FA"
                            title="Resetar Autenticador 2FA (força novo QR Code)"
                            className="h-8 px-2.5 rounded-lg flex items-center gap-1 text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-colors cursor-pointer"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                            Reset 2FA
                          </button>
                        )}
                        {editable ? (
                          <button
                            onClick={() => openEdit(u)}
                            aria-label="Editar permissões e usuário"
                            title="Editar cargo e permissões"
                            className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium text-neutral-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            Permissões
                          </button>
                        ) : (
                          <span
                            title="Acesso protegido por hierarquia"
                            className="h-8 px-2.5 rounded-lg inline-flex items-center gap-1 text-[11px] text-[var(--color-text-faint)] bg-white/[0.02] border border-white/5 select-none"
                          >
                            <Lock className="w-3 h-3" /> Protegido
                          </span>
                        )}
                        {deletable && (
                          <button
                            onClick={() => handleDelete(u)}
                            aria-label="Excluir usuário"
                            title="Excluir usuário"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Gerenciar Acesso — ${editing.username}` : 'Novo Acesso'}
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {!editing ? (
            <>
              <Field label="Pessoa">
                <Select
                  value={form.tech_id}
                  onChange={(e) => {
                    const tid = e.target.value;
                    const tech = technicians.find((t) => String(t.id) === tid);
                    const suggested = tech
                      ? tech.name.trim().toLowerCase().split(/\s+/).slice(0, 2).join('.')
                      : '';
                    setForm((f) => ({ ...f, tech_id: tid, username: suggested }));
                  }}
                >
                  <option value="">Selecione...</option>
                  {availableTechnicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Login (usuário)">
                <Input
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
                  placeholder="ex: otavio.silva"
                />
                {form.username && !/^[a-z0-9._-]+$/.test(form.username) && (
                  <p className="mt-1.5 text-xs font-medium text-amber-300">
                    Não é permitido acentuações especiais.
                  </p>
                )}
              </Field>
            </>
          ) : (
            <Field label="Usuário">
              <Input value={editing.username} disabled />
            </Field>
          )}

          <Field label="Cargo">
            <Select
              value={form.role}
              disabled={editingIsMaster}
              onChange={(e) => handleRoleChange(e.target.value)}
            >
              {selectableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {editing && (
          <div className="mb-5">
            <Field label="Redefinir Senha (opcional)">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Deixe em branco para manter a senha atual"
              />
            </Field>
          </div>
        )}

        <div className="border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-200">
                Permissões Individuais por Módulo
              </h4>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Selecione exatamente o que este usuário pode adicionar, editar ou remover.
              </p>
            </div>
            {!editingIsMaster && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-neutral-200 transition-colors"
                >
                  Liberar Tudo
                </button>
                <button
                  type="button"
                  onClick={clearAllPermissions}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-white/[0.02] hover:bg-white/[0.06] border border-white/10 text-[var(--color-text-muted)] transition-colors"
                >
                  Remover Tudo
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.015] divide-y divide-white/5 max-h-[340px] overflow-y-auto">
            {visibleModules.map((mod) => {
              const modKeys = mod.actions.map((a) => a.key);
              const allModChecked = modKeys.every((k) => form.permissions.includes(k));
              return (
                <div
                  key={mod.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={editingIsMaster}
                      onClick={() => toggleModuleAll(modKeys)}
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                        allModChecked
                          ? 'bg-neutral-200 border-neutral-200 text-neutral-950'
                          : 'bg-white/[0.03] border-white/15 text-transparent hover:border-white/30'
                      } ${editingIsMaster ? 'opacity-60 cursor-not-allowed' : ''}`}
                      title="Marcar/desmarcar linha inteira"
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </button>
                    <span className="text-xs font-medium text-neutral-200">{mod.name}</span>
                  </div>

                  <div className="flex items-center flex-wrap gap-1.5">
                    {mod.actions.map((action) => {
                      const active = form.permissions.includes(action.key);
                      return (
                        <button
                          key={action.key}
                          type="button"
                          disabled={editingIsMaster}
                          onClick={() => togglePermission(action.key)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                            active
                              ? 'bg-white/[0.12] border-white/25 text-white'
                              : 'bg-white/[0.02] border-white/10 text-[var(--color-text-faint)] hover:text-neutral-300 hover:border-white/15'
                          } ${editingIsMaster ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              active ? 'bg-white' : 'bg-white/20'
                            }`}
                          />
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* MODAL: PERFIL COMPLETO DO USUÁRIO (ÚLTIMO LOGIN, DISPOSITIVO, LOCAL E DADOS CADASTRAIS) */}
      <Modal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title={
          selectedProfile
            ? `Perfil do Usuário — ${selectedProfile.display_name} (@${selectedProfile.username})`
            : 'Carregando Perfil do Usuário...'
        }
        maxWidth="max-w-3xl"
        footer={
          <Button variant="ghost" onClick={() => setProfileModalOpen(false)}>
            Fechar Perfil
          </Button>
        }
      >
        {loadingProfile || !selectedProfile ? (
          <div className="py-12 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Carregando informações de acesso e perfil do usuário...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* CABEÇALHO DO PERFIL */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/30 text-white font-black text-lg flex items-center justify-center shrink-0">
                  {(selectedProfile.display_name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-extrabold text-white">{selectedProfile.display_name}</h3>
                    <span className="text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-white/10 text-slate-200">
                      {selectedProfile.role}
                    </span>
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                      {selectedProfile.company}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    <span className="mono text-slate-200">@{selectedProfile.username}</span>
                    {selectedProfile.area ? ` · Área: ${selectedProfile.area}` : ''}
                    {selectedProfile.created_at_fmt ? ` · Criado em ${selectedProfile.created_at_fmt}` : ''}
                  </p>
                </div>
              </div>

              <div>
                {selectedProfile.totp_enabled ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 2FA Vinculado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" /> 2FA Pendente
                  </span>
                )}
              </div>
            </div>

            {/* BLOCO PRINCIPAL: DATA/HORA EXATA DO ÚLTIMO LOGIN, DISPOSITIVO E LOCAL */}
            <div className="p-5 rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.015] border border-white/15 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[var(--color-primary)]" />
                  Telemetria do Último Login
                </h4>
                {selectedProfile.last_login_ip && (
                  <span className="text-[11px] font-mono text-slate-400">
                    IP: <strong className="text-slate-200">{selectedProfile.last_login_ip}</strong>
                  </span>
                )}
              </div>

              {selectedProfile.last_login_at_fmt ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="p-3.5 rounded-xl bg-black/30 border border-white/10 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Data e Hora Exata</span>
                    </div>
                    <div className="text-sm font-extrabold text-white font-mono">
                      {selectedProfile.last_login_at_fmt}
                    </div>
                    <div className="text-[10px] text-slate-400">Horário Oficial de Brasília</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-black/30 border border-white/10 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-400">
                      {(selectedProfile.last_login_device || '').toLowerCase().includes('celular') ? (
                        <Smartphone className="w-3.5 h-3.5" />
                      ) : (
                        <Monitor className="w-3.5 h-3.5" />
                      )}
                      <span>Dispositivo Usado</span>
                    </div>
                    <div className="text-xs font-bold text-white leading-snug">
                      {selectedProfile.last_login_device || 'Dispositivo não identificado'}
                    </div>
                    {selectedProfile.last_login_ua && (
                      <div className="text-[10px] text-slate-500 truncate" title={selectedProfile.last_login_ua}>
                        {selectedProfile.last_login_ua}
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl bg-black/30 border border-white/10 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Local do Último Login</span>
                    </div>
                    <div className="text-xs font-bold text-white leading-snug">
                      {selectedProfile.last_login_location || 'Local não identificado'}
                    </div>
                    {selectedProfile.last_login_ip && (
                      <div className="text-[10px] font-mono text-slate-400">
                        Endereço IP: {selectedProfile.last_login_ip}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-amber-200 text-xs">
                  <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-bold text-sm text-white">
                      Nunca realizou login desde que esta opção foi implementada
                    </div>
                    <div className="text-[11px] text-amber-200/80 mt-0.5">
                      Assim que o usuário entrar no sistema, a data/hora exata, o dispositivo utilizado e a localização aparecerão automaticamente aqui.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* DADOS DO PERFIL DO USUÁRIO / FICHA CADASTRAL */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                <UserIcon className="w-3.5 h-3.5 text-sky-400" />
                Dados Cadastrais do Perfil do Usuário
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-bold">E-mail</span>
                  <span className="text-white font-medium break-all">{selectedProfile.email || 'Não informado'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-bold">Telefone / WhatsApp</span>
                  <span className="text-white font-mono">{selectedProfile.phone || 'Não informado'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-bold">CPF</span>
                  <span className="text-white font-mono">{selectedProfile.cpf || 'Não informado'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-bold">RG / Identidade</span>
                  <span className="text-white font-mono">{selectedProfile.identity || 'Não informado'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-bold">Área de Atuação</span>
                  <span className="text-white font-medium">{selectedProfile.area || 'Não informada'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-bold">Equipe / Tipo</span>
                  <span className="text-white font-medium">
                    {[selectedProfile.team, selectedProfile.team_type].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-bold">Matrícula Claro / Terceiro</span>
                  <span className="text-white font-mono">
                    {[selectedProfile.registration_claro, selectedProfile.registration_third].filter(Boolean).join(' / ') || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-bold">Login TOA</span>
                  <span className="text-white font-mono">{selectedProfile.toa_login || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block font-bold">Tema Escolhido</span>
                  <span className="text-white font-medium">
                    {selectedProfile.theme_preference === 'light' ? 'Claro (Branco)' : 'Escuro (Preto — Padrão)'}
                  </span>
                </div>
              </div>
            </div>

            {/* HISTÓRICO DE LOGINS DO USUÁRIO */}
            {selectedProfile.login_history && selectedProfile.login_history.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5">
                  Histórico Recente de Acessos ({selectedProfile.login_history.length})
                </h4>
                <div className="rounded-xl border border-white/10 divide-y divide-white/5 max-h-48 overflow-y-auto bg-white/[0.015]">
                  {selectedProfile.login_history.map((h) => (
                    <div
                      key={h.id}
                      className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-300">{h.login_at_fmt}</span>
                        <span className="text-slate-300">· {h.device}</span>
                      </div>
                      <div className="text-[11px] text-amber-300 font-mono">
                        {h.location} {h.ip_address && !h.location.includes(h.ip_address) ? `(${h.ip_address})` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ÚLTIMAS AÇÕES NA AUDITORIA */}
            {selectedProfile.recent_actions && selectedProfile.recent_actions.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5">
                  Últimas Ações Realizadas no Sistema
                </h4>
                <div className="rounded-xl border border-white/10 divide-y divide-white/5 max-h-44 overflow-y-auto bg-white/[0.015]">
                  {selectedProfile.recent_actions.map((act) => (
                    <div key={act.id} className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-200 truncate">{act.action}</span>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">{act.timestamp_fmt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={emailModalOpen}
        onClose={() => !sendingGlobalEmails && setEmailModalOpen(false)}
        title="Notificação Global de Pendências Cadastrais (Resend)"
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setEmailModalOpen(false)}
              disabled={sendingGlobalEmails}
            >
              Fechar
            </Button>
            <Button
              onClick={() => handleSendGlobalPendingEmails(false)}
              disabled={
                loadingEmailPreview ||
                sendingGlobalEmails ||
                !emailPreview ||
                emailPreview.eligible_count === 0 ||
                !resendStatus?.configured ||
                Boolean(emailPreview.cooldown_active)
              }
            >
              <Send className="w-4 h-4" />
              {sendingGlobalEmails
                ? 'Iniciando disparo...'
                : emailPreview?.cooldown_active
                  ? `Aguardar 24h (${emailPreview.remaining_label || 'ativo'})`
                  : `Enviar E-mail Global (${emailPreview?.eligible_count ?? 0})`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            Envia e-mail para todos os colaboradores com e-mail cadastrado que possuem CPF, Identidade (RG) ou outros dados pendentes.
          </p>

          {resendStatus && (
            <div
              className={`rounded-xl border px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2 ${
                resendStatus.configured
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {resendStatus.configured ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <div>
                  <div className="font-semibold">
                    {resendStatus.configured
                      ? 'Resend API configurada no servidor'
                      : 'RESEND_API_KEY não configurada no ambiente'}
                  </div>
                  <div className="text-[11px] opacity-80">
                    Remetente: <span className="mono">{resendStatus.from_email}</span>
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-black/30 border border-white/10 font-medium">
                Domínio ({resendStatus.domain_name}):{' '}
                {resendStatus.domain_status === 'verified'
                  ? 'Verificado'
                  : resendStatus.domain_status === 'sending_key_only'
                    ? 'Chave de envio ativa'
                    : resendStatus.domain_status}
              </span>
            </div>
          )}

          {loadingEmailPreview ? (
            <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">
              Analisando cadastros (CPF, Identidade, Telefone, Empresa e E-mail)...
            </p>
          ) : emailPreview ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">
                    Com E-mail Cadastrado
                  </div>
                  <div className="text-xl font-bold text-white mt-0.5">
                    {emailPreview.with_email_count}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-amber-300/80">
                    Elegíveis para Envio
                  </div>
                  <div className="text-xl font-bold text-amber-300 mt-0.5">
                    {emailPreview.eligible_count}
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-emerald-300/80">
                    Já Notificados (24h)
                  </div>
                  <div className="text-xl font-bold text-emerald-300 mt-0.5">
                    {emailPreview.already_sent_24h_count ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">
                    Pendentes Sem E-mail
                  </div>
                  <div className="text-xl font-bold text-neutral-300 mt-0.5">
                    {emailPreview.missing_email_but_pending_count}
                  </div>
                </div>
              </div>

              {emailPreview.cooldown_active && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      Intervalo mínimo de 24h ativo entre disparos globais
                    </div>
                    <div className="text-[11px] opacity-90 mt-0.5">
                      Tempo restante: <strong>{emailPreview.remaining_label}</strong>
                      {emailPreview.next_allowed_at ? ` • Próximo envio liberado em ${emailPreview.next_allowed_at}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={sendingGlobalEmails || !resendStatus?.configured}
                    onClick={() => {
                      if (window.confirm('Deseja ignorar a trava de 24h e iniciar um novo disparo global agora?')) {
                        handleSendGlobalPendingEmails(true);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 text-[11px] font-semibold transition disabled:opacity-50"
                  >
                    Forçar Novo Envio (Master)
                  </button>
                </div>
              )}

              {emailPreview.last_dispatch && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">
                      Último Disparo Global ({emailPreview.last_dispatch.trigger_type === 'auto' ? 'Automático' : 'Manual'})
                      {' · '}
                      <span
                        className={
                          emailPreview.last_dispatch.status === 'running'
                            ? 'text-blue-300'
                            : emailPreview.last_dispatch.status === 'failed'
                              ? 'text-red-300'
                              : emailPreview.last_dispatch.status === 'interrupted'
                                ? 'text-amber-300'
                                : 'text-emerald-300'
                        }
                      >
                        {emailPreview.last_dispatch.status === 'running'
                          ? 'Enviando em segundo plano...'
                          : emailPreview.last_dispatch.status === 'failed'
                            ? 'Falhou'
                            : emailPreview.last_dispatch.status === 'interrupted'
                              ? 'Interrompido (retomável)'
                              : 'Concluído'}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={refreshingStatus}
                      onClick={() => refreshPendingPreview(false)}
                      className="text-[11px] text-blue-300 hover:text-blue-200 underline disabled:opacity-50 cursor-pointer"
                    >
                      {refreshingStatus ? 'Atualizando...' : 'Atualizar status'}
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Iniciado em {emailPreview.last_dispatch.created_at || '—'} por {emailPreview.last_dispatch.triggered_by}
                    {' • '}Elegíveis: <strong className="text-white">{emailPreview.last_dispatch.eligible_count}</strong>
                    {' • '}Enviados: <strong className="text-emerald-300">{emailPreview.last_dispatch.sent_count}</strong>
                    {' • '}Falhas: <strong className="text-red-300">{emailPreview.last_dispatch.failed_count}</strong>
                  </div>
                </div>
              )}

              {dispatchError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                  {dispatchError}
                </div>
              )}

              {dispatchResult && (
                <div
                  className={`rounded-xl border px-4 py-3 text-xs ${
                    dispatchResult.failed_count > 0 && dispatchResult.sent_count === 0
                      ? 'border-red-500/30 bg-red-500/10 text-red-200'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  }`}
                >
                  <div className="font-semibold">{dispatchResult.message}</div>
                  {dispatchResult.results && dispatchResult.results.some((r) => r.status === 'failed') && (
                    <ul className="mt-2 space-y-1 text-[11px] opacity-90">
                      {dispatchResult.results
                        .filter((r) => r.status === 'failed')
                        .slice(0, 5)
                        .map((r) => (
                          <li key={r.email}>
                            • {r.name} ({r.email}): {r.detail}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}

              {emailPreview.recipients.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-[var(--color-text-muted)]">
                  Nenhum colaborador com e-mail cadastrado possui pendências no momento.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
                  {emailPreview.recipients.map((rec) => (
                    <div
                      key={rec.email}
                      className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-white/[0.02]"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{rec.name}</div>
                        <div className="text-xs text-[var(--color-text-muted)] mono">
                          {rec.email} • {rec.role}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {rec.missing_fields.map((field) => (
                          <span
                            key={field}
                            className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
