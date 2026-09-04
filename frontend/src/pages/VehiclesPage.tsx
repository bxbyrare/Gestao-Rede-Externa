import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
  Car,
  Layers,
  Flame,
  UserCheck,
  CheckCircle2
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Technician, Vehicle } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';
import VehiclePreview from '../components/VehiclePreview';
import { isCoordenador, useAuth } from '../state/AuthContext';

const emptyForm = {
  plate: '',
  type: 'Utilitário',
  model: '',
  responsible_tech_id: '',
  has_rack: false,
  has_basket: false,
  has_giroflex: false,
  has_inverter: false,
  ticket_car: '',
  area_rede: '',
  base: '',
  setor: '',
  condutor_dia: '',
  condutor_tarde: '',
  condutor_madrugada: '',
  subclus: '',
};

// Calcula a pontuação de completude das informações (mais completo = pontuação maior)
function getVehicleCompletenessScore(v: Vehicle): number {
  let score = 0;
  if (v.plate?.trim()) score += 2;
  if (v.model?.trim()) score += 2;
  if (v.responsible_name?.trim() || v.condutor_dia?.trim()) score += 4;
  if (v.subclus?.trim()) score += 2;
  if (v.base?.trim()) score += 2;
  if (v.setor?.trim()) score += 1;
  if (v.ticket_car?.trim()) score += 2;
  if (v.area_rede?.trim()) score += 1;
  if (v.condutor_tarde?.trim() || v.condutor_madrugada?.trim()) score += 1;
  if (v.has_rack || v.has_basket || v.has_giroflex || v.has_inverter) score += 1;
  return score;
}

// Normaliza e agrupa pelo modelo do veículo
function getNormalizedModel(v: Vehicle): string {
  const m = (v.model || '').trim().toUpperCase();
  const t = (v.type || '').trim().toUpperCase();

  if (m.includes('GOL')) return 'Volkswagen Gol';
  if (m.includes('FIORINO')) return 'Fiat Fiorino';
  if (m.includes('KWID')) return 'Renault Kwid';
  if (m.includes('DUCATO')) return 'Fiat Ducato';
  if (m.includes('STRADA')) return 'Fiat Strada';
  if (m.includes('SAVEIRO')) return 'Volkswagen Saveiro';
  if (m.includes('MASTER')) return 'Renault Master';
  if (m.includes('MOBI')) return 'Fiat Mobi';
  if (m.includes('ARGO')) return 'Fiat Argo';
  if (m.includes('ONIX')) return 'Chevrolet Onix';
  if (m.includes('MOTO') || t.includes('MOTO') || m.includes('CG')) return 'Motocicletas & Apoio';
  if (m.includes('CAMINH') || t.includes('CAMINH') || m.includes('HR') || m.includes('DAILY')) return 'Caminhões & VUCs';

  if (m) return m;
  if (t) return t;
  return 'Outros Veículos';
}

export default function VehiclesPage() {
  const { user } = useAuth();
  const canDelete = isCoordenador(user);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [search, setSearch] = useState('');
  const [selectedModel, setSelectedModel] = useState('Todos');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    api
      .get<Vehicle[]>('/api/vehicles')
      .then(setVehicles)
      .catch(() => setVehicles([]));
  }

  useEffect(() => {
    load();
    api
      .get<Technician[]>('/api/technicians')
      .then(setTechnicians)
      .catch(() => setTechnicians([]));
  }, []);

  // Filtra por busca e agrupa ordenado por completude
  const groupedVehicles = useMemo(() => {
    if (!vehicles) return [];
    const q = search.trim().toLowerCase();

    // 1. Filtragem por busca
    const filtered = vehicles.filter((v) => {
      if (!q) return true;
      return (
        v.plate.toLowerCase().includes(q) ||
        v.type.toLowerCase().includes(q) ||
        (v.model || '').toLowerCase().includes(q) ||
        (v.responsible_name || '').toLowerCase().includes(q) ||
        (v.subclus || '').toLowerCase().includes(q) ||
        (v.ticket_car || '').toLowerCase().includes(q)
      );
    });

    // 2. Agrupamento por Modelo
    const groupsMap = new Map<string, Vehicle[]>();
    filtered.forEach((v) => {
      const modelGroup = getNormalizedModel(v);
      if (!groupsMap.has(modelGroup)) {
        groupsMap.set(modelGroup, []);
      }
      groupsMap.get(modelGroup)!.push(v);
    });

    // 3. Ordenação dentro de cada grupo: Mais completos primeiro (maior score no topo)
    const groups: { model: string; vehicles: Vehicle[]; total: number }[] = [];
    groupsMap.forEach((vList, modelName) => {
      vList.sort((a, b) => getVehicleCompletenessScore(b) - getVehicleCompletenessScore(a));
      groups.push({
        model: modelName,
        vehicles: vList,
        total: vList.length,
      });
    });

    // 4. Ordenação dos grupos: Gol primeiro, depois Fiorino, Kwid, Ducato, etc.
    const priorityOrder = [
      'Volkswagen Gol',
      'Fiat Fiorino',
      'Renault Kwid',
      'Fiat Ducato',
      'Fiat Strada',
      'Volkswagen Saveiro',
      'Renault Master',
      'Fiat Mobi',
      'Fiat Argo',
      'Chevrolet Onix',
    ];

    groups.sort((a, b) => {
      const idxA = priorityOrder.indexOf(a.model);
      const idxB = priorityOrder.indexOf(b.model);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return b.total - a.total;
    });

    // Se houver filtro de modelo específico selecionado
    if (selectedModel !== 'Todos') {
      return groups.filter((g) => g.model === selectedModel);
    }

    return groups;
  }, [vehicles, search, selectedModel]);

  // Lista de modelos disponíveis para o seletor de topo
  const availableModels = useMemo(() => {
    if (!vehicles) return ['Todos'];
    const setM = new Set<string>();
    vehicles.forEach((v) => setM.add(getNormalizedModel(v)));
    return ['Todos', ...Array.from(setM)];
  }, [vehicles]);

  // Estatísticas Gerais da Frota
  const stats = useMemo(() => {
    if (!vehicles) return { total: 0, utilitarios: 0, carros: 0, vans: 0, racks: 0 };
    let utilitarios = 0;
    let carros = 0;
    let vans = 0;
    let racks = 0;

    vehicles.forEach((v) => {
      const t = (v.type || '').toLowerCase();
      const m = (v.model || '').toLowerCase();
      if (t.includes('util') || m.includes('fiorino') || m.includes('strada') || m.includes('saveiro')) utilitarios++;
      else if (t.includes('van') || m.includes('ducato') || m.includes('master') || m.includes('sprinter')) vans++;
      else carros++;

      if (v.has_rack) racks++;
    });

    return { total: vehicles.length, utilitarios, carros, vans, racks };
  }, [vehicles]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({
      plate: v.plate,
      type: v.type || 'Utilitário',
      model: v.model || '',
      responsible_tech_id: v.responsible_tech_id ? String(v.responsible_tech_id) : '',
      has_rack: Boolean(v.has_rack),
      has_basket: Boolean(v.has_basket),
      has_giroflex: Boolean(v.has_giroflex),
      has_inverter: Boolean(v.has_inverter),
      ticket_car: v.ticket_car || '',
      area_rede: v.area_rede || '',
      base: v.base || '',
      setor: v.setor || '',
      condutor_dia: v.condutor_dia || '',
      condutor_tarde: v.condutor_tarde || '',
      condutor_madrugada: v.condutor_madrugada || '',
      subclus: v.subclus || '',
    });
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    setIsSaving(true);
    try {
      const payload = { ...form, responsible_tech_id: form.responsible_tech_id || null };
      if (editing) {
        await api.put(`/api/vehicles/${editing.id}`, payload);
      } else {
        await api.post('/api/vehicles', payload);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(v: Vehicle) {
    if (!confirm(`Excluir o veículo de placa "${v.plate}"?`)) return;
    await api.delete(`/api/vehicles/${v.id}`);
    load();
  }

  function sendWhatsapp(v: Vehicle) {
    const text =
      `🚗 *FICHA DE VEÍCULO — CLARO REDE EXTERNA*\n\n` +
      `*Placa:* ${v.plate || 'N/A'}\n` +
      `*Modelo:* ${v.model || v.type || 'N/A'}\n` +
      `*Responsável:* ${v.responsible_name || v.condutor_dia || 'Não atribuído'}\n` +
      `*Subcluster:* ${v.subclus || 'N/A'}\n` +
      `*Base / Área:* ${v.base || ''} ${v.area_rede || ''}\n` +
      `*Ticket Car:* ${v.ticket_car || 'N/A'}\n` +
      `*Equipamentos:* ${[
        v.has_rack ? 'Rack de Escada' : null,
        v.has_basket ? 'Cesto Aéreo' : null,
        v.has_giroflex ? 'Giroflex' : null,
        v.has_inverter ? 'Inversor 220V' : null,
      ]
        .filter(Boolean)
        .join(', ') || 'Padrão'}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  const totalFilteredCount = groupedVehicles.reduce((acc, g) => acc + g.vehicles.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Veículos & Frota"
        subtitle="Gerenciamento operacional da frota Claro, condutores e acessórios de campo"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = '/api/vehicles/export';
              }}
            >
              <Download className="w-4 h-4" /> Exportar Frota
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" /> Cadastrar Veículo
            </Button>
          </div>
        }
      />

      {/* PAINEL DE ESTATÍSTICAS DA FROTA */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl glass flex items-center gap-3 border border-white/5">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-dim)] text-[var(--color-primary)] flex items-center justify-center font-bold">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)]">Total Frota</p>
            <p className="text-lg font-black text-white">{stats.total} veículos</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl glass flex items-center gap-3 border border-white/5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)]">Utilitários / Furgão</p>
            <p className="text-lg font-black text-white">{stats.utilitarios}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl glass flex items-center gap-3 border border-white/5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)]">Passeio / Apoio</p>
            <p className="text-lg font-black text-white">{stats.carros}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl glass flex items-center gap-3 border border-white/5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)]">Com Rack / Escada</p>
            <p className="text-lg font-black text-white">{stats.racks}</p>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS & BUSCA */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por placa, modelo, condutor, subcluster..."
            className="pl-11 rounded-full"
          />
        </div>

        {/* Pílulas de Seleção por Modelo */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {availableModels.map((m) => {
            const active = selectedModel === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedModel(m)}
                className={`h-9 px-3.5 rounded-full text-xs font-semibold transition-all shrink-0 ${
                  active
                    ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25'
                    : 'bg-white/[0.03] hover:bg-white/[0.07] text-[var(--color-text-muted)] border border-white/10'
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* EXIBIÇÃO AGRUPADA POR MODELO COM ORDENAÇÃO DE COMPLETUDE */}
      {vehicles === null ? (
        <div className="py-16 text-center text-sm text-[var(--color-text-muted)] flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          <span>Carregando frota de veículos...</span>
        </div>
      ) : totalFilteredCount === 0 ? (
        <Card className="p-12 text-center text-sm text-[var(--color-text-muted)]">
          Nenhum veículo encontrado com os filtros atuais.
        </Card>
      ) : (
        <div className="space-y-10">
          {groupedVehicles.map((group) => {
            const withTechCount = group.vehicles.filter((v) => v.responsible_name || v.condutor_dia).length;
            const withRackCount = group.vehicles.filter((v) => v.has_rack).length;

            return (
              <section key={group.model} className="space-y-4">
                {/* CABEÇALHO DA CATEGORIA / MODELO */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-[var(--color-primary)] font-bold">
                      <Car className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-white tracking-tight">{group.model}</h2>
                      <p className="text-xs text-[var(--color-text-faint)]">
                        {group.total} veículo{group.total > 1 ? 's' : ''} nesta categoria · Ordenados por completude cadastral
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                      {withTechCount} com condutor
                    </span>
                    {withRackCount > 0 && (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-medium">
                        {withRackCount} com Rack
                      </span>
                    )}
                  </div>
                </div>

                {/* GRADE DE VEÍCULOS DESTA CATEGORIA */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {group.vehicles.map((v) => {
                    const hasTech = Boolean(v.responsible_name || v.condutor_dia);
                    const isComplete = Boolean(v.model && v.plate && (v.responsible_name || v.condutor_dia) && (v.base || v.subclus));

                    return (
                      <Card
                        key={v.id}
                        className="p-4 flex flex-col gap-3.5 animate-in hover:border-white/20 transition-all rounded-2xl bg-black/40 border border-white/10 shadow-lg group"
                      >
                        {/* CABEÇALHO DO CARD: PLACA MERCOSUL & BADGES */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center rounded-md overflow-hidden border border-white/20 bg-white text-black font-bold shadow-sm">
                            <div className="bg-[#003399] text-white text-[9px] px-1.5 py-0.5 flex items-center font-black">
                              BR
                            </div>
                            <div className="px-2 py-0.5 text-xs font-mono font-bold tracking-wider text-slate-900">
                              {v.plate}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isComplete ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Ficha Completa
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/5 text-[var(--color-text-faint)]">
                                Cadastro Básico
                              </span>
                            )}
                            {v.subclus && (
                              <span className="text-[10px] text-[var(--color-text-faint)]">
                                {v.subclus}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* PRÉ-VISUALIZAÇÃO VETORIAL MINIMALISTA */}
                        <VehiclePreview
                          type={v.type}
                          model={v.model || v.type}
                          hasRack={v.has_rack}
                          hasBasket={v.has_basket}
                          hasGiroflex={v.has_giroflex}
                          hasInverter={v.has_inverter}
                          plate={v.plate}
                        />

                        {/* DADOS DO VEÍCULO */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-base text-white">
                              {v.model || v.type}
                            </h3>
                            {v.ticket_car && (
                              <span className="text-[10px] font-mono text-[var(--color-text-faint)]">
                                Ticket: {v.ticket_car}
                              </span>
                            )}
                          </div>

                          {/* Condutor / Responsável */}
                          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.02] border border-white/5">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                hasTech
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-white/5 text-[var(--color-text-faint)]'
                              }`}
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[9px] uppercase font-bold text-[var(--color-text-faint)]">
                                Responsável Atual
                              </p>
                              <p className="text-xs font-semibold text-white/90 truncate">
                                {v.responsible_name || v.condutor_dia || 'Não atribuído'}
                              </p>
                            </div>
                          </div>

                          {/* Base Operacional e Subcluster */}
                          <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                            {v.base ? (
                              <span>
                                <span className="text-[var(--color-text-faint)]">Base:</span> {v.base}
                              </span>
                            ) : (
                              <span className="text-[var(--color-text-faint)] italic">Sem base vinculada</span>
                            )}
                            {v.area_rede && (
                              <span>
                                <span className="text-[var(--color-text-faint)]">Área:</span> {v.area_rede}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* AÇÕES */}
                        <div className="mt-auto flex items-center gap-2 pt-2 border-t border-white/5">
                          <button
                            onClick={() => sendWhatsapp(v)}
                            aria-label="Compartilhar dados no WhatsApp"
                            title="Enviar dados no WhatsApp"
                            className="w-9 h-9 shrink-0 rounded-full bg-[#25d366]/10 border border-[#25d366]/20 flex items-center justify-center text-[#25d366] hover:bg-[#25d366]/20 transition-all active:scale-95"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEdit(v)}
                            className="flex-1 h-9 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/[0.07] transition-all active:scale-95"
                          >
                            <Pencil className="w-3 h-3" /> Editar Veículo
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(v)}
                              aria-label="Excluir veículo"
                              title="Excluir veículo"
                              className="w-9 h-9 shrink-0 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-all active:scale-95"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Veículo' : 'Novo Veículo da Operação'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar Veículo'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Placa (Mercosul)">
            <Input
              value={form.plate}
              onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
              placeholder="Ex: ABC1D23"
              className="font-mono uppercase font-bold"
            />
          </Field>
          <Field label="Tipo de Veículo">
            <Select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              {['Utilitário', 'Passeio', 'Van', 'Moto', 'Caminhão'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Modelo">
          <Input
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder="Ex: Fiat Fiorino 1.4 Flex"
          />
        </Field>
        <Field label="Técnico Responsável">
          <Select
            value={form.responsible_tech_id}
            onChange={(e) => setForm((f) => ({ ...f, responsible_tech_id: e.target.value }))}
          >
            <option value="">Sem responsável atribuído</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Área de Rede">
            <Input
              value={form.area_rede}
              onChange={(e) => setForm((f) => ({ ...f, area_rede: e.target.value }))}
              placeholder="Ex: Norte 1"
            />
          </Field>
          <Field label="Base Operacional">
            <Input
              value={form.base}
              onChange={(e) => setForm((f) => ({ ...f, base: e.target.value }))}
              placeholder="Ex: Base Central"
            />
          </Field>
          <Field label="Setor">
            <Input
              value={form.setor}
              onChange={(e) => setForm((f) => ({ ...f, setor: e.target.value }))}
              placeholder="Ex: Infraestrutura"
            />
          </Field>
          <Field label="Subcluster">
            <Input
              value={form.subclus}
              onChange={(e) => setForm((f) => ({ ...f, subclus: e.target.value }))}
              placeholder="Ex: RIO CAPITAL"
            />
          </Field>
          <Field label="Condutor (Dia)">
            <Input
              value={form.condutor_dia}
              onChange={(e) => setForm((f) => ({ ...f, condutor_dia: e.target.value }))}
            />
          </Field>
          <Field label="Condutor (Tarde)">
            <Input
              value={form.condutor_tarde}
              onChange={(e) => setForm((f) => ({ ...f, condutor_tarde: e.target.value }))}
            />
          </Field>
          <Field label="Condutor (Madrugada)">
            <Input
              value={form.condutor_madrugada}
              onChange={(e) => setForm((f) => ({ ...f, condutor_madrugada: e.target.value }))}
            />
          </Field>
          <Field label="Ticket do Carro">
            <Input
              value={form.ticket_car}
              onChange={(e) => setForm((f) => ({ ...f, ticket_car: e.target.value }))}
              placeholder="Ex: 88921"
            />
          </Field>
        </div>

        {/* ACESSÓRIOS E EQUIPAMENTOS */}
        <div className="pt-2">
          <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
            Acessórios & Equipamentos Acoplados
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { key: 'has_rack', label: 'Possui Rack de Escada' },
              { key: 'has_basket', label: 'Possui Cesto Aéreo' },
              { key: 'has_giroflex', label: 'Possui Giroflex de Alerta' },
              { key: 'has_inverter', label: 'Possui Inversor 220V' },
            ].map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 text-xs font-medium text-white/80 cursor-pointer select-none transition-colors"
              >
                <input
                  type="checkbox"
                  checked={(form as Record<string, boolean | string>)[key] as boolean}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                  className="w-4 h-4 rounded accent-[var(--color-primary)]"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}