import { useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, Lock, Plus, Shield, Trash2, Smartphone } from 'lucide-react';
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

export default function UsersPage() {
  const { user: currentUser, refreshUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<{
    tech_id: string;
    role: string;
    password: string;
    permissions: string[];
  }>({
    tech_id: '',
    role: 'Técnico',
    password: '',
    permissions: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isMaster = isMasterCoordenador(currentUser);
  const canCreateUser = hasPermission(currentUser, 'gerenciamento.create');
  const canEditUser = hasPermission(currentUser, 'gerenciamento.edit');
  const canDeleteUser = hasPermission(currentUser, 'gerenciamento.delete');

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
        const username = tech.name.trim().toLowerCase().split(/\s+/).slice(0, 2).join('.');
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
          canCreateUser ? (
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" /> Criar Acesso
            </Button>
          ) : undefined
        }
      />

      {users === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : users.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">
          Nenhum usuário cadastrado.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
                <th className="px-5 py-3">Usuário</th>
                <th className="px-5 py-3">Pessoa</th>
                <th className="px-5 py-3">Cargo</th>
                <th className="px-5 py-3">Permissões Liberadas</th>
                <th className="px-5 py-3">Autenticador (2FA)</th>
                <th className="px-5 py-3">Criado em</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const editable = canEditRow(u);
                const deletable = canDeleteRow(u);
                return (
                  <tr
                    key={u.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3 mono font-semibold text-white">{u.username}</td>
                    <td className="px-5 py-3 text-[var(--color-text-muted)]">{u.tech_name || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-neutral-200">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">{renderPermissionSummary(u)}</td>
                    <td className="px-5 py-3">
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
                    <td className="px-5 py-3 text-[var(--color-text-faint)]">{u.created_at}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {isMaster && (
                          <button
                            onClick={() => handleResetTotp(u)}
                            aria-label="Resetar Autenticador 2FA"
                            title="Resetar Autenticador 2FA (força novo QR Code)"
                            className="h-8 px-2.5 rounded-lg flex items-center gap-1 text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
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
                            className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium text-neutral-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors"
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
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors"
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
            <Field label="Pessoa">
              <Select
                value={form.tech_id}
                onChange={(e) => setForm((f) => ({ ...f, tech_id: e.target.value }))}
              >
                <option value="">Selecione...</option>
                {availableTechnicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
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
    </div>
  );
}
