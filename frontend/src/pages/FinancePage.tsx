import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Trash2, Pencil } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { ConsumableFinanceRecord, TeamFinanceRecord, Technician } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';

const emptyTeamForm = { tech1_id: '', tech2_id: '', area: '', amount: '', reference_month: '' };
const emptyConsumableForm = { description: '', area: '', amount: '', reference_month: '' };

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function FinancePage() {
  const [tab, setTab] = useState<'equipes' | 'consumiveis'>('equipes');
  const [teams, setTeams] = useState<TeamFinanceRecord[] | null>(null);
  const [consumables, setConsumables] = useState<ConsumableFinanceRecord[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamForm, setTeamForm] = useState(emptyTeamForm);
  const [editingTeam, setEditingTeam] = useState<TeamFinanceRecord | null>(null);

  const [consModalOpen, setConsModalOpen] = useState(false);
  const [consForm, setConsForm] = useState(emptyConsumableForm);
  const [editingCons, setEditingCons] = useState<ConsumableFinanceRecord | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function loadTeams() {
    api.get<TeamFinanceRecord[]>('/api/finance/teams').then(setTeams).catch(() => setTeams([]));
  }
  function loadConsumables() {
    api.get<ConsumableFinanceRecord[]>('/api/finance/consumables').then(setConsumables).catch(() => setConsumables([]));
  }

  useEffect(() => {
    loadTeams();
    loadConsumables();
    api.get<Technician[]>('/api/technicians').then(setTechnicians).catch(() => setTechnicians([]));
  }, []);

  const totalTeams = useMemo(() => (teams || []).reduce((s, t) => s + t.amount, 0), [teams]);
  const totalConsumables = useMemo(() => (consumables || []).reduce((s, c) => s + c.amount, 0), [consumables]);

  function openCreateTeam() {
    setEditingTeam(null);
    setTeamForm(emptyTeamForm);
    setError(null);
    setTeamModalOpen(true);
  }
  function openEditTeam(t: TeamFinanceRecord) {
    setEditingTeam(t);
    setTeamForm({ tech1_id: String(t.tech1_id), tech2_id: String(t.tech2_id), area: t.area, amount: String(t.amount), reference_month: t.reference_month });
    setError(null);
    setTeamModalOpen(true);
  }
  async function submitTeam() {
    setError(null);
    setIsSaving(true);
    try {
      const payload = { ...teamForm, amount: Number(teamForm.amount) };
      if (editingTeam) await api.put(`/api/finance/teams/${editingTeam.id}`, payload);
      else await api.post('/api/finance/teams', payload);
      setTeamModalOpen(false);
      loadTeams();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }
  async function deleteTeam(t: TeamFinanceRecord) {
    if (!confirm(`Excluir este lançamento de equipe (${t.tech1_name} + ${t.tech2_name})?`)) return;
    await api.delete(`/api/finance/teams/${t.id}`);
    loadTeams();
  }

  function openCreateCons() {
    setEditingCons(null);
    setConsForm(emptyConsumableForm);
    setError(null);
    setConsModalOpen(true);
  }
  function openEditCons(c: ConsumableFinanceRecord) {
    setEditingCons(c);
    setConsForm({ description: c.description, area: c.area, amount: String(c.amount), reference_month: c.reference_month });
    setError(null);
    setConsModalOpen(true);
  }
  async function submitCons() {
    setError(null);
    setIsSaving(true);
    try {
      const payload = { ...consForm, amount: Number(consForm.amount) };
      if (editingCons) await api.put(`/api/finance/consumables/${editingCons.id}`, payload);
      else await api.post('/api/finance/consumables', payload);
      setConsModalOpen(false);
      loadConsumables();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }
  async function deleteCons(c: ConsumableFinanceRecord) {
    if (!confirm(`Excluir a despesa "${c.description}"?`)) return;
    await api.delete(`/api/finance/consumables/${c.id}`);
    loadConsumables();
  }

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Faturamento de equipes externas e custos de consumíveis"
        actions={
          <Button variant="outline" onClick={() => { window.location.href = '/api/finance/export'; }}>
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 mb-6 max-w-lg">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Total Equipes</div>
          <div className="text-xl font-extrabold mt-1">{formatBRL(totalTeams)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">Total Consumíveis</div>
          <div className="text-xl font-extrabold mt-1">{formatBRL(totalConsumables)}</div>
        </Card>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('equipes')} className={`h-10 px-5 rounded-full text-sm font-semibold transition-colors ${tab === 'equipes' ? 'bg-[var(--color-primary-dim)] text-[var(--color-primary)] border border-[var(--color-primary)]/30' : 'bg-white/[0.03] border border-white/10 text-[var(--color-text-muted)]'}`}>Equipes Externas</button>
        <button onClick={() => setTab('consumiveis')} className={`h-10 px-5 rounded-full text-sm font-semibold transition-colors ${tab === 'consumiveis' ? 'bg-[var(--color-primary-dim)] text-[var(--color-primary)] border border-[var(--color-primary)]/30' : 'bg-white/[0.03] border border-white/10 text-[var(--color-text-muted)]'}`}>Consumíveis</button>
      </div>

      {tab === 'equipes' ? (
        <>
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateTeam}><Plus className="w-4 h-4" /> Novo Lançamento</Button>
          </div>
          {teams === null ? (
            <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
          ) : teams.length === 0 ? (
            <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhum lançamento de equipe.</Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
                    <th className="px-5 py-3">Mês</th><th className="px-5 py-3">Equipe</th><th className="px-5 py-3">Área</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => (
                    <tr key={t.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-3 mono">{t.reference_month}</td>
                      <td className="px-5 py-3">{t.tech1_name} + {t.tech2_name}</td>
                      <td className="px-5 py-3 text-[var(--color-text-muted)]">{t.area}</td>
                      <td className="px-5 py-3 font-semibold">{formatBRL(t.amount)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openEditTeam(t)} className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => deleteTeam(t)} className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateCons}><Plus className="w-4 h-4" /> Novo Custo</Button>
          </div>
          {consumables === null ? (
            <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
          ) : consumables.length === 0 ? (
            <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhum custo de consumível.</Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
                    <th className="px-5 py-3">Mês</th><th className="px-5 py-3">Descrição</th><th className="px-5 py-3">Área</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {consumables.map((c) => (
                    <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-3 mono">{c.reference_month}</td>
                      <td className="px-5 py-3">{c.description}</td>
                      <td className="px-5 py-3 text-[var(--color-text-muted)]">{c.area}</td>
                      <td className="px-5 py-3 font-semibold">{formatBRL(c.amount)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openEditCons(c)} className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => deleteCons(c)} className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      <Modal
        open={teamModalOpen}
        onClose={() => setTeamModalOpen(false)}
        title={editingTeam ? 'Editar Lançamento de Equipe' : 'Novo Lançamento de Equipe'}
        footer={<><Button variant="ghost" onClick={() => setTeamModalOpen(false)}>Cancelar</Button><Button onClick={submitTeam} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Pessoa 1">
            <Select value={teamForm.tech1_id} onChange={(e) => setTeamForm((f) => ({ ...f, tech1_id: e.target.value }))}>
              <option value="">Selecione...</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Pessoa 2">
            <Select value={teamForm.tech2_id} onChange={(e) => setTeamForm((f) => ({ ...f, tech2_id: e.target.value }))}>
              <option value="">Selecione...</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Área">
          <Input value={teamForm.area} onChange={(e) => setTeamForm((f) => ({ ...f, area: e.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Valor (R$)">
            <Input type="number" step="0.01" value={teamForm.amount} onChange={(e) => setTeamForm((f) => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field label="Mês de Referência">
            <Input value={teamForm.reference_month} onChange={(e) => setTeamForm((f) => ({ ...f, reference_month: e.target.value }))} placeholder="ex: julho-26" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={consModalOpen}
        onClose={() => setConsModalOpen(false)}
        title={editingCons ? 'Editar Custo' : 'Novo Custo de Consumível'}
        footer={<><Button variant="ghost" onClick={() => setConsModalOpen(false)}>Cancelar</Button><Button onClick={submitCons} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Descrição">
          <Input value={consForm.description} onChange={(e) => setConsForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <Field label="Área">
          <Input value={consForm.area} onChange={(e) => setConsForm((f) => ({ ...f, area: e.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Valor (R$)">
            <Input type="number" step="0.01" value={consForm.amount} onChange={(e) => setConsForm((f) => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field label="Mês de Referência">
            <Input value={consForm.reference_month} onChange={(e) => setConsForm((f) => ({ ...f, reference_month: e.target.value }))} placeholder="ex: julho-26" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
