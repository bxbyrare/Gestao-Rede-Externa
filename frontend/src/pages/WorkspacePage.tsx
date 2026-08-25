import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Technician, UserTask } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';

const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente'];
const STATUSES = ['Pendente', 'Em Andamento', 'Concluída'];

const PRIORITY_COLOR: Record<string, string> = {
  Baixa: 'text-[var(--color-text-muted)]',
  Média: 'text-[var(--color-warning)]',
  Alta: 'text-[var(--color-primary)]',
  Urgente: 'text-[var(--color-danger)]',
};

const emptyForm = { title: '', priority: 'Média', due_date: '', assigned_tech_id: '', description: '', status: 'Pendente' };

export default function WorkspacePage() {
  const [tasks, setTasks] = useState<UserTask[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserTask | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    api.get<UserTask[]>('/api/user-tasks').then(setTasks).catch(() => setTasks([]));
  }

  useEffect(() => {
    load();
    api.get<Technician[]>('/api/technicians').then(setTechnicians).catch(() => setTechnicians([]));
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<string, UserTask[]> = { Pendente: [], 'Em Andamento': [], Concluída: [] };
    (tasks || []).forEach((t) => { (groups[t.status] || groups.Pendente).push(t); });
    return groups;
  }, [tasks]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(t: UserTask) {
    setEditing(t);
    setForm({
      title: t.title, priority: t.priority, due_date: t.due_date || '',
      assigned_tech_id: t.assigned_tech_id ? String(t.assigned_tech_id) : '', description: t.description, status: t.status,
    });
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      setError('Título é obrigatório.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const tech = technicians.find((t) => String(t.id) === form.assigned_tech_id);
      const payload = { ...form, assigned_tech_id: form.assigned_tech_id || null, assigned_tech_name: tech?.name || '' };
      if (editing) {
        await api.put(`/api/user-tasks/${editing.id}`, payload);
      } else {
        await api.post('/api/user-tasks', payload);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(t: UserTask) {
    if (!confirm(`Excluir a tarefa "${t.title}"?`)) return;
    await api.delete(`/api/user-tasks/${t.id}`);
    load();
  }

  async function quickSetStatus(t: UserTask, status: string) {
    await api.put(`/api/user-tasks/${t.id}`, { ...t, assigned_tech_id: t.assigned_tech_id || null, status });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Área de Trabalho"
        subtitle="Suas tarefas pessoais de acompanhamento"
        actions={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Nova Tarefa
          </Button>
        }
      />

      {tasks === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : tasks.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhuma tarefa cadastrada.</Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {STATUSES.map((status) => (
            <div key={status}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-faint)] mb-3">{status} ({grouped[status].length})</h3>
              <div className="space-y-3">
                {grouped[status].map((t) => (
                  <Card key={t.id} className="p-4 flex flex-col gap-2 animate-in">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-sm leading-snug">{t.title}</h4>
                      <span className={`text-[10px] font-bold uppercase shrink-0 ${PRIORITY_COLOR[t.priority] || ''}`}>{t.priority}</span>
                    </div>
                    {t.description && <p className="text-xs text-[var(--color-text-muted)]">{t.description}</p>}
                    <div className="flex items-center justify-between text-[11px] text-[var(--color-text-faint)] mt-1">
                      <span>{t.assigned_tech_name || '—'}</span>
                      {t.due_date && <span>{t.due_date}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 pt-2 border-t border-white/5 mt-1">
                      <Select value={t.status} onChange={(e) => quickSetStatus(t, e.target.value)} className="!h-8 !text-xs flex-1">
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                      <button onClick={() => openEdit(t)} aria-label="Editar tarefa" className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07] transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(t)} aria-label="Excluir tarefa" className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Card>
                ))}
                {grouped[status].length === 0 && <p className="text-xs text-[var(--color-text-faint)] italic">Nenhuma tarefa.</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Tarefa' : 'Nova Tarefa'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Tarefa'}</Button>
          </>
        }
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Título">
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Prioridade">
            <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Prazo">
            <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
          </Field>
          <Field label="Responsável">
            <Select value={form.assigned_tech_id} onChange={(e) => setForm((f) => ({ ...f, assigned_tech_id: e.target.value }))}>
              <option value="">Ninguém</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Descrição">
          <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
      </Modal>
    </div>
  );
}
