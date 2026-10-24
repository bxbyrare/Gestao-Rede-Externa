import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Pencil,
  Plus,
  Trash2,
  Paperclip,
  CheckCircle2,
  Clock,
  Search,
  X
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Technician, UserTask } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';
import { hasPermission, useAuth } from '../state/AuthContext';

const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente'];
const STATUSES = ['Pendente', 'Em Andamento', 'Concluída'];

const PRIORITY_BADGE: Record<string, string> = {
  Baixa: 'text-slate-400 bg-slate-800/60 border-white/5',
  Média: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  Alta: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  Urgente: 'text-red-400 bg-red-500/10 border-red-500/30 font-bold',
};

const emptyForm = {
  title: '',
  priority: 'Média',
  due_date: '',
  assigned_tech_id: '',
  description: '',
  status: 'Pendente',
  region: 'Capital',
  ticket: '',
  event_type: 'RAL',
  measurement: ''
};

export default function WorkspacePage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, 'area_de_trabalho.create');
  const canEdit = hasPermission(user, 'area_de_trabalho.edit');
  const canDelete = hasPermission(user, 'area_de_trabalho.delete');
  const [tasks, setTasks] = useState<UserTask[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserTask | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [newFiles, setNewFiles] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [techFilter, setTechFilter] = useState('');

  function load() {
    api.get<UserTask[]>('/api/user-tasks').then(setTasks).catch(() => setTasks([]));
  }

  useEffect(() => {
    load();
    api.get<Technician[]>('/api/technicians').then(setTechnicians).catch(() => setTechnicians([]));
  }, []);

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    const norm = (s?: string | null) =>
      (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const q = norm(searchQuery.trim());

    return tasks.filter((t) => {
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (techFilter && (t.assigned_tech_name || '') !== techFilter) return false;
      if (!q) return true;

      const haystack = [
        t.title,
        t.description,
        t.ticket,
        t.assigned_tech_name,
        t.region,
        t.event_type,
        t.measurement,
        t.status
      ]
        .map(norm)
        .join(' ');

      return haystack.includes(q);
    });
  }, [tasks, searchQuery, priorityFilter, techFilter]);

  const uniqueTechNames = useMemo(() => {
    const names = new Set<string>();
    (tasks || []).forEach((t) => {
      if (t.assigned_tech_name?.trim()) names.add(t.assigned_tech_name.trim());
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [tasks]);

  const grouped = useMemo(() => {
    const groups: Record<string, UserTask[]> = { Pendente: [], 'Em Andamento': [], Concluída: [] };
    filteredTasks.forEach((t) => {
      (groups[t.status] || groups.Pendente).push(t);
    });
    return groups;
  }, [filteredTasks]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setNewFiles(null);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(t: UserTask) {
    setEditing(t);
    setForm({
      title: t.title,
      priority: t.priority,
      due_date: t.due_date || '',
      assigned_tech_id: t.assigned_tech_id ? String(t.assigned_tech_id) : '',
      description: t.description,
      status: t.status,
      region: t.region || 'Capital',
      ticket: t.ticket || '',
      event_type: t.event_type || 'RAL',
      measurement: t.measurement || ''
    });
    setNewFiles(null);
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      setError('Título da atividade é obrigatório.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const tech = technicians.find((t) => String(t.id) === form.assigned_tech_id);
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('assigned_tech_name', tech?.name || '');
      if (newFiles) {
        Array.from(newFiles).forEach((f) => fd.append('attachments', f));
      }

      if (editing) {
        await api.postFormData(`/api/user-tasks/${editing.id}`, fd);
      } else {
        await api.postFormData('/api/user-tasks', fd);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar atividade.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(t: UserTask) {
    if (!confirm(`Excluir permanentemente a tarefa "${t.title}"?`)) return;
    await api.delete(`/api/user-tasks/${t.id}`);
    load();
  }

  async function handleDeleteAttachment(attId: number) {
    if (!confirm('Excluir este anexo?')) return;
    try {
      await api.delete(`/api/user-tasks/attachments/${attId}`);
      if (editing) {
        setEditing((prev) => prev ? {
          ...prev,
          attachments: (prev.attachments || []).filter((a) => a.id !== attId)
        } : null);
      }
      load();
    } catch (err) {
      alert('Erro ao excluir anexo.');
    }
  }

  async function quickSetStatus(t: UserTask, status: string) {
    await api.put(`/api/user-tasks/${t.id}`, { ...t, assigned_tech_id: t.assigned_tech_id || null, status });
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Área de Trabalho Operacional"
        subtitle="Quadro de atividades e acompanhamento técnico por ticket, região e medição"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => { window.location.href = '/api/user-tasks/export'; }}
              className="border-white/10 hover:border-red-500/40 text-slate-200"
            >
              <Download className="w-4 h-4 text-red-500 mr-1.5" /> Exportar Tarefas (CSV)
            </Button>
            {canCreate && (
              <Button
                onClick={openCreate}
                className="bg-red-600 hover:bg-red-500 text-white font-semibold shadow-lg shadow-red-600/20"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Nova Atividade
              </Button>
            )}
          </div>
        }
      />

      {/* Barra de Busca de Projetos e Filtros Rápidos */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 p-3.5 bg-[#0F1422] rounded-xl border border-white/10">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar projeto, trecho, obra, ticket, técnico ou descrição..."
            className="w-full h-10 pl-10 pr-9 rounded-lg bg-[#090C14] border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-500/50 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              title="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-10 px-3 rounded-lg bg-[#090C14] border border-white/10 text-xs font-medium text-slate-300 focus:outline-none focus:border-red-500/50 transition-colors"
          >
            <option value="">Todas as Prioridades</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                Prioridade: {p}
              </option>
            ))}
          </select>

          <select
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
            className="h-10 px-3 rounded-lg bg-[#090C14] border border-white/10 text-xs font-medium text-slate-300 focus:outline-none focus:border-red-500/50 transition-colors max-w-[210px] truncate"
          >
            <option value="">Todos os Responsáveis</option>
            {uniqueTechNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {(searchQuery || priorityFilter || techFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setPriorityFilter('');
                setTechFilter('');
              }}
              className="h-10 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 transition-colors whitespace-nowrap"
            >
              Limpar filtros
            </button>
          )}

          {tasks !== null && (
            <span className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-xs font-semibold text-slate-400 whitespace-nowrap">
              {filteredTasks.length} {filteredTasks.length === 1 ? 'projeto' : 'projetos'}
            </span>
          )}
        </div>
      </div>

      {tasks === null ? (
        <div className="p-12 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          Carregando atividades...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STATUSES.map((statusKey) => {
            const colTasks = grouped[statusKey] || [];
            const isDone = statusKey === 'Concluída';
            const isInProgress = statusKey === 'Em Andamento';

            return (
              <div key={statusKey} className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-3 py-2 bg-[#0F1422] rounded-xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        isDone ? 'bg-emerald-500' : isInProgress ? 'bg-sky-500' : 'bg-amber-500'
                      }`}
                    />
                    <h3 className="font-bold text-sm text-slate-200">{statusKey}</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/5 text-slate-400 border border-white/5">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-3 min-h-[300px]">
                  {colTasks.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-white/5 rounded-2xl">
                      Nenhuma atividade {statusKey.toLowerCase()}.
                    </div>
                  ) : (
                    colTasks.map((t) => (
                      <Card
                        key={t.id}
                        className="p-4 bg-[#0F1422] border-white/10 hover:border-red-500/40 transition-all shadow-md group flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                              PRIORITY_BADGE[t.priority] || PRIORITY_BADGE.Média
                            }`}
                          >
                            {t.priority}
                          </span>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            {t.region && (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-semibold text-slate-300 border border-white/5">
                                {t.region}
                              </span>
                            )}
                            {t.event_type && (
                              <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px] font-bold border border-red-500/20">
                                {t.event_type}
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          {t.ticket && (
                            <div className="text-[11px] font-mono text-red-400 font-bold mb-1">
                              #{t.ticket}
                            </div>
                          )}
                          <h4 className="font-bold text-sm text-slate-100 group-hover:text-red-400 transition-colors">
                            {t.title}
                          </h4>
                          {t.description && (
                            <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                              {t.description}
                            </p>
                          )}
                        </div>

                        {t.measurement && (
                          <div className="text-xs font-mono text-slate-300 bg-[#090D16] p-2 rounded-lg border border-white/5">
                            Medição: <span className="text-emerald-400 font-semibold">{t.measurement}</span>
                          </div>
                        )}

                        {t.attachments && t.attachments.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            {t.attachments.map((att) => (
                              <a
                                key={att.id}
                                href={att.filepath}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[11px] text-sky-400 border border-white/5 transition-colors"
                                title={att.filename}
                              >
                                <Paperclip className="w-3 h-3" />
                                <span className="max-w-[100px] truncate">{att.filename}</span>
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
                          <div>
                            {t.assigned_tech_name ? (
                              <span className="text-slate-300 font-medium">{t.assigned_tech_name}</span>
                            ) : (
                              <span className="text-slate-500">Sem responsável</span>
                            )}
                          </div>
                          {t.due_date && (
                            <div className="flex items-center gap-1 text-[11px] text-slate-400">
                              <Clock className="w-3 h-3" /> {t.due_date}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex gap-1">
                            {canEdit && !isDone && (
                              <button
                                onClick={() => quickSetStatus(t, 'Concluída')}
                                title="Marcar como Concluída"
                                className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1 transition-colors"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Concluir
                              </button>
                            )}
                            {canEdit && statusKey === 'Pendente' && (
                              <button
                                onClick={() => quickSetStatus(t, 'Em Andamento')}
                                title="Iniciar Atividade"
                                className="px-2 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-semibold flex items-center gap-1 transition-colors"
                              >
                                Iniciar
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {canEdit && (
                              <button
                                onClick={() => openEdit(t)}
                                title="Editar atividade"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(t)}
                                title="Excluir atividade"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Criar / Editar Atividade */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar Atividade #${editing.id}` : 'Nova Atividade Operacional'}
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} className="text-slate-400">
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              className="bg-red-600 hover:bg-red-500 text-white font-semibold"
            >
              {isSaving ? 'Salvando...' : 'Salvar Atividade'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <Field label="Título da Atividade">
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Correção de atenuação no anel óptico 04"
              className="bg-[#090D16] border-white/10 text-slate-100"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Ticket / Chamado">
              <Input
                value={form.ticket}
                onChange={(e) => setForm((f) => ({ ...f, ticket: e.target.value }))}
                placeholder="Ex: INC-992144"
                className="bg-[#090D16] border-white/10 text-slate-100"
              />
            </Field>
            <Field label="Região">
              <Select
                value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                className="bg-[#090D16] border-white/10 text-slate-100"
              >
                <option value="Capital">Capital</option>
                <option value="Interior">Interior</option>
                <option value="Baixada">Baixada Fluminense</option>
                <option value="Leste">Leste Fluminense</option>
              </Select>
            </Field>
            <Field label="Tipo de Evento">
              <Select
                value={form.event_type}
                onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
                className="bg-[#090D16] border-white/10 text-slate-100"
              >
                <option value="RAL">RAL</option>
                <option value="REC">REC</option>
                <option value="OUTAGE">OUTAGE</option>
                <option value="PREVENTIVA">PREVENTIVA</option>
                <option value="MANUTENÇÃO">MANUTENÇÃO</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Prioridade">
              <Select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="bg-[#090D16] border-white/10 text-slate-100"
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="bg-[#090D16] border-white/10 text-slate-100"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Data Limite (SLA)">
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="bg-[#090D16] border-white/10 text-slate-100"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Técnico Responsável">
              <Select
                value={form.assigned_tech_id}
                onChange={(e) => setForm((f) => ({ ...f, assigned_tech_id: e.target.value }))}
                className="bg-[#090D16] border-white/10 text-slate-100"
              >
                <option value="">Não atribuído</option>
                {technicians.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.company || 'FFA'})</option>)}
              </Select>
            </Field>
            <Field label="Medição Técnica (Distância / dBm)">
              <Input
                value={form.measurement}
                onChange={(e) => setForm((f) => ({ ...f, measurement: e.target.value }))}
                placeholder="Ex: -19.4 dBm / 240m"
                className="bg-[#090D16] border-white/10 text-slate-100"
              />
            </Field>
          </div>

          <Field label="Descrição Técnica & Plano de Ação">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descreva os detalhes da ocorrência, pontos de emenda, testes ou observações de campo..."
              className="bg-[#090D16] border-white/10 text-slate-100"
            />
          </Field>

          {/* Anexos Existentes */}
          {editing && editing.attachments && editing.attachments.length > 0 && (
            <div className="p-3 bg-[#090D16] rounded-xl border border-white/5 space-y-2">
              <div className="text-xs font-bold text-slate-300">Anexos Vinculados ({editing.attachments.length})</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {editing.attachments.map((att) => (
                  <div key={att.id} className="p-2 bg-[#0F1422] rounded-lg border border-white/5 flex items-center justify-between text-xs">
                    <a href={att.filepath} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 truncate max-w-[180px]">
                      {att.filename}
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(att.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                      title="Excluir anexo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Field label="Adicionar Anexos (Fotos, PDFs, Relatórios OTDR)">
            <input
              type="file"
              multiple
              onChange={(e) => setNewFiles(e.target.files)}
              className="text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-red-500/10 file:text-red-400 file:font-semibold hover:file:bg-red-500/20 cursor-pointer"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
