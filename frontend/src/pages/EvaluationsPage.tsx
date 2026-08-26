import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Search, Star, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Evaluation, Technician } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';

const SCORE_FIELDS = [
  { key: 'behavior_score', label: 'Comportamento' },
  { key: 'productivity_score', label: 'Produtividade' },
  { key: 'technical_kpi_score', label: 'KPI Técnico' },
  { key: 'process_score', label: 'Processos' },
] as const;

const emptyForm = { technician_id: '', behavior_score: '10', productivity_score: '10', technical_kpi_score: '10', process_score: '10', comments: '' };

function scoreColor(score: number) {
  if (score >= 8) return 'text-[var(--color-success)]';
  if (score >= 5) return 'text-yellow-400';
  return 'text-[var(--color-danger)]';
}

export default function EvaluationsPage() {
  const [evaluations, setEvaluations] = useState<Evaluation[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'best' | 'worst'>('best');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    api.get<Evaluation[]>('/api/evaluations').then(setEvaluations).catch(() => setEvaluations([]));
  }

  useEffect(() => {
    load();
    api.get<Technician[]>('/api/technicians').then(setTechnicians).catch(() => setTechnicians([]));
  }, []);

  const filtered = useMemo(() => {
    if (!evaluations) return [];
    const q = search.trim().toLowerCase();
    const list = q ? evaluations.filter((e) => e.technician_name.toLowerCase().includes(q) || e.company.toLowerCase().includes(q)) : evaluations;
    const sorted = [...list].sort((a, b) => (sortOrder === 'best' ? b.overall_score - a.overall_score : a.overall_score - b.overall_score));
    return sorted;
  }, [evaluations, search, sortOrder]);

  const stats = useMemo(() => {
    const list = evaluations || [];
    const total = list.length;
    const overallAvg = total ? list.reduce((s, e) => s + e.overall_score, 0) / total : 0;
    const byCompany = new Map<string, { sum: number; count: number }>();
    for (const e of list) {
      const key = (e.company || 'Sem empresa').trim();
      const entry = byCompany.get(key) || { sum: 0, count: 0 };
      entry.sum += e.overall_score;
      entry.count += 1;
      byCompany.set(key, entry);
    }
    const companyAverages = Array.from(byCompany.entries())
      .map(([company, { sum, count }]) => ({ company, avg: sum / count, count }))
      .sort((a, b) => b.count - a.count);
    return { total, overallAvg, companyAverages };
  }, [evaluations]);

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit() {
    if (!form.technician_id) {
      setError('Selecione um colaborador para avaliar.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await api.post('/api/evaluations', {
        technician_id: Number(form.technician_id),
        behavior_score: Number(form.behavior_score),
        productivity_score: Number(form.productivity_score),
        technical_kpi_score: Number(form.technical_kpi_score),
        process_score: Number(form.process_score),
        comments: form.comments,
      });
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(e: Evaluation) {
    if (!confirm(`Excluir a avaliação de "${e.technician_name}"?`)) return;
    try {
      await api.delete(`/api/evaluations/${e.id}`);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao excluir.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Avaliação"
        subtitle="Avaliação técnica de comportamento, produtividade, KPI e processos"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { window.location.href = '/api/evaluations/export'; }}>
              <Download className="w-4 h-4" /> Exportar
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" /> Nova Avaliação
            </Button>
          </div>
        }
      />

      {evaluations !== null && evaluations.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Total Avaliações</div>
            <div className="text-2xl font-extrabold mt-1">{stats.total}</div>
          </Card>
          <Card className="p-4 border-[var(--color-warning)]/20">
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Média Geral (0-10)</div>
            <div className={`text-2xl font-extrabold mt-1 ${scoreColor(stats.overallAvg)}`}>{stats.overallAvg.toFixed(1)}</div>
          </Card>
          {stats.companyAverages.map((c) => (
            <Card key={c.company} className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Média {c.company}</div>
              <div className={`text-2xl font-extrabold mt-1 ${scoreColor(c.avg)}`}>{c.avg.toFixed(1)}</div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por colaborador ou empresa..." className="pl-11 rounded-full" />
        </div>
        <Select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'best' | 'worst')} className="sm:max-w-[220px]">
          <option value="best">Mais bem avaliados</option>
          <option value="worst">Piores avaliados</option>
        </Select>
      </div>

      {evaluations === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhuma avaliação encontrada.</Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((e) => (
            <Card key={e.id} className="p-5 flex flex-col gap-3 animate-in">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-base">{e.technician_name}</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">{e.company} {e.role && `• ${e.role}`}</p>
                </div>
                <div className={`flex items-center gap-1 font-extrabold text-lg ${scoreColor(e.overall_score)}`}>
                  <Star className="w-4 h-4 fill-current" /> {e.overall_score.toFixed(1)}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {SCORE_FIELDS.map(({ key, label }) => (
                  <div key={key} className="rounded-lg bg-white/[0.03] border border-white/10 py-2">
                    <div className={`font-bold text-sm ${scoreColor(e[key])}`}>{e[key]}</div>
                    <div className="text-[9px] text-[var(--color-text-faint)] uppercase mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              {e.comments && <p className="text-sm text-[var(--color-text-muted)] italic">"{e.comments}"</p>}
              <div className="mt-auto flex items-center justify-between text-[11px] text-[var(--color-text-faint)] pt-1">
                <span>Por {e.evaluator_username} em {e.created_at}</span>
                <button onClick={() => handleDelete(e)} aria-label="Excluir avaliação" className="w-8 h-8 rounded-full flex items-center justify-center hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova Avaliação Técnica"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Avaliação'}</Button>
          </>
        }
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Colaborador">
          <Select value={form.technician_id} onChange={(e) => setForm((f) => ({ ...f, technician_id: e.target.value }))}>
            <option value="">Selecione...</option>
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-x-4">
          {SCORE_FIELDS.map(({ key, label }) => (
            <Field key={key} label={`${label} (1–10)`}>
              <Input type="number" min={1} max={10} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <Field label="Comentários">
          <Textarea rows={3} value={form.comments} onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))} />
        </Field>
      </Modal>
    </div>
  );
}
