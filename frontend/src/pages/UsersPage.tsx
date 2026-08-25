import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { ManagedUser, Technician } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';
import { useAuth } from '../state/AuthContext';

const ROLES = ['Técnico', 'Auxiliar', 'Supervisor', 'Coordenador'];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState({ tech_id: '', role: 'Técnico', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  function openCreate() {
    setEditing(null);
    setForm({ tech_id: '', role: 'Técnico', password: '' });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(u: ManagedUser) {
    setEditing(u);
    setForm({ tech_id: u.tech_id ? String(u.tech_id) : '', role: u.role, password: '' });
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    setIsSaving(true);
    try {
      if (editing) {
        await api.put(`/api/users/${editing.id}`, { role: form.role, tech_id: form.tech_id || null, password: form.password || undefined });
      } else {
        const tech = technicians.find((t) => String(t.id) === form.tech_id);
        if (!tech) throw new ApiError(400, 'Selecione a pessoa correspondente.');
        const username = tech.name.trim().toLowerCase().split(/\s+/).slice(0, 2).join('.');
        await api.post('/api/users', { username, role: form.role, tech_id: form.tech_id });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(u: ManagedUser) {
    if (!confirm(`Excluir a conta do usuário "${u.username}"?`)) return;
    await api.delete(`/api/users/${u.id}`);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Gerenciamento"
        subtitle="Contas de acesso ao sistema"
        actions={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Criar Acesso
          </Button>
        }
      />

      {users === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : users.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhum usuário cadastrado.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
                <th className="px-5 py-3">Usuário</th>
                <th className="px-5 py-3">Pessoa</th>
                <th className="px-5 py-3">Cargo</th>
                <th className="px-5 py-3">Criado em</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3 mono font-semibold">{u.username}</td>
                  <td className="px-5 py-3 text-[var(--color-text-muted)]">{u.tech_name || '—'}</td>
                  <td className="px-5 py-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/5 border border-white/10">{u.role}</span>
                  </td>
                  <td className="px-5 py-3 text-[var(--color-text-faint)]">{u.created_at}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openEdit(u)} aria-label="Editar usuário" className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07] transition-colors">
                        <KeyRound className="w-4 h-4" />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => handleDelete(u)} aria-label="Excluir usuário" className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar Acesso — ${editing.username}` : 'Novo Acesso'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
          </>
        }
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        {!editing && (
          <Field label="Pessoa" hint="A pessoa precisa já estar cadastrada em Pessoas.">
            <Select value={form.tech_id} onChange={(e) => setForm((f) => ({ ...f, tech_id: e.target.value }))}>
              <option value="">Selecione...</option>
              {availableTechnicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Cargo">
          <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
        {editing && (
          <Field label="Nova Senha" hint="Deixe em branco para manter a senha atual.">
            <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
          </Field>
        )}
      </Modal>
    </div>
  );
}
