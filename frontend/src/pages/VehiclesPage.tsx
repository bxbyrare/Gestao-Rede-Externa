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
  Bike,
  Layers,
  Sparkles,
  Zap,
  Flame,
  Shield,
  Filter,
  CheckCircle2,
  Navigation,
  UserCheck
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Technician, Vehicle } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';
import VehiclePreview from '../components/VehiclePreview';
import { isCoordenador, useAuth } from '../state/AuthContext';

const VEHICLE_TYPES = ['Todos', 'Utilitário', 'Passeio', 'Van', 'Moto', 'Caminhão'];

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

export default function VehiclesPage() {
  const { user } = useAuth();
  const canDelete = isCoordenador(user);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('Todos');

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

  const filtered = useMemo(() => {
    if (!vehicles) return [];
    let list = [...vehicles];

    if (typeFilter !== 'Todos') {
      list = list.filter((v) => (v.type || '').toLowerCase() === typeFilter.toLowerCase());
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (v) =>
          v.plate.toLowerCase().includes(q) ||
          v.type.toLowerCase().includes(q) ||
          (v.model || '').toLowerCase().includes(q) ||
          (v.responsible_name || '').toLowerCase().includes(q) ||
          (v.subclus || '').toLowerCase().includes(q) ||
          (v.ticket_car || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [vehicles, search, typeFilter]);

  // Estatísticas da Frota
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

  return (
    <div>
      <PageHeader
        title="Veículos & Equipamentos"
        subtitle="Gerenciamento visual da frota operacional, condutores e acessórios de campo"
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por placa, modelo, condutor, subcluster..."
            className="pl-11 rounded-full"
          />
        </div>

        {/* Categoria Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {VEHICLE_TYPES.map((t) => {
            const active = typeFilter === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`h-9 px-3.5 rounded-full text-xs font-semibold transition-all shrink-0 ${
                  active
                    ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25'
                    : 'bg-white/[0.03] hover:bg-white/[0.07] text-[var(--color-text-muted)] border border-white/10'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* GRADE DE VEÍCULOS COM PRÉ-VISUALIZAÇÃO MODERNA */}
      {vehicles === null ? (
        <div className="py-16 text-center text-sm text-[var(--color-text-muted)] flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          <span>Carregando frota de veículos...</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-[var(--color-text-muted)]">
          Nenhum veículo encontrado com os filtros atuais.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((v) => {
            const hasTech = Boolean(v.responsible_name || v.condutor_dia);

            return (
              <Card
                key={v.id}
                className="p-4 flex flex-col gap-3.5 animate-in hover:border-white/20 transition-all rounded-3xl bg-black/40 border border-white/10 shadow-xl group"
              >
                {/* TOPO DO CARD: PLACA ESTILO MERCOSUL & BADGE */}
                <div className="flex items-center justify-between">
                  {/* Placa Mercosul Estilizada */}
                  <div className="flex items-center rounded-lg overflow-hidden border border-white/20 shadow-md bg-white text-black font-bold">
                    <div className="bg-[#003399] text-white text-[9px] px-1.5 py-0.5 flex items-center font-black tracking-tighter">
                      BR
                    </div>
                    <div className="px-2.5 py-0.5 text-xs font-mono font-black tracking-wider text-slate-900">
                      {v.plate}
                    </div>
                  </div>

                  {/* Badge Tipo & Status */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[var(--color-text-muted)] uppercase tracking-wider">
                      {v.type || 'Veículo'}
                    </span>
                  </div>
                </div>

                {/* PRÉ-VISUALIZAÇÃO DINÂMICA & ANIMAÇÃO DO VEÍCULO */}
                <VehiclePreview
                  type={v.type}
                  model={v.model || v.type}
                  hasRack={v.has_rack}
                  hasBasket={v.has_basket}
                  hasGiroflex={v.has_giroflex}
                  hasInverter={v.has_inverter}
                  plate={v.plate}
                />

                {/* DADOS DO VEÍCULO & OPERAÇÃO */}
                <div className="space-y-1.5 px-1">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-extrabold text-base text-white group-hover:text-[var(--color-primary)] transition-colors">
                      {v.model || v.type}
                    </h3>
                    {v.subclus && (
                      <span className="text-[10px] font-semibold text-[var(--color-text-faint)]">
                        {v.subclus}
                      </span>
                    )}
                  </div>

                  {/* Responsável / Condutor */}
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.02] border border-white/5">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
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
                      <p className="text-xs font-semibold text-white truncate">
                        {v.responsible_name || v.condutor_dia || 'Não atribuído'}
                      </p>
                    </div>
                  </div>

                  {/* Informações Complementares (Base / Setor / Ticket) */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    {v.base && (
                      <div className="text-[var(--color-text-muted)] truncate">
                        <span className="text-[var(--color-text-faint)]">Base:</span> {v.base}
                      </div>
                    )}
                    {v.ticket_car && (
                      <div className="text-[var(--color-text-muted)] truncate text-right">
                        <span className="text-[var(--color-text-faint)]">Ticket:</span>{' '}
                        <span className="font-mono text-white/90">{v.ticket_car}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* BOTÕES DE AÇÃO */}
                <div className="mt-auto flex items-center gap-2 pt-2 border-t border-white/5">
                  <button
                    onClick={() => sendWhatsapp(v)}
                    aria-label="Compartilhar dados no WhatsApp"
                    title="Enviar dados no WhatsApp"
                    className="w-10 h-10 shrink-0 rounded-full bg-[#25d366]/10 border border-[#25d366]/30 flex items-center justify-center text-[#25d366] hover:bg-[#25d366]/20 transition-all active:scale-95"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEdit(v)}
                    className="flex-1 h-10 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center gap-2 text-xs font-semibold text-white hover:bg-white/[0.08] hover:border-white/20 transition-all active:scale-95"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Editar Veículo
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(v)}
                      aria-label="Excluir veículo"
                      title="Excluir veículo"
                      className="w-10 h-10 shrink-0 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] hover:border-[var(--color-danger)]/30 transition-all active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO DE VEÍCULO */}
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
              {VEHICLE_TYPES.filter((t) => t !== 'Todos').map((t) => (
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