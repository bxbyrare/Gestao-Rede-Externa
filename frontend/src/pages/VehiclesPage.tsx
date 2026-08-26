import { useEffect, useMemo, useState } from 'react';
import { Download, MessageCircle, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Technician, Vehicle } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';
import { isCoordenador, useAuth } from '../state/AuthContext';

const VEHICLE_TYPES = ['Utilitário', 'Moto', 'Carro', 'Caminhão', 'Van'];

const emptyForm = {
  plate: '', type: 'Utilitário', model: '', responsible_tech_id: '',
  has_rack: false, has_basket: false, has_giroflex: false, has_inverter: false,
  ticket_car: '', area_rede: '', base: '', setor: '',
  condutor_dia: '', condutor_tarde: '', condutor_madrugada: '', subclus: '',
};

export default function VehiclesPage() {
  const { user } = useAuth();
  const canDelete = isCoordenador(user);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    api.get<Vehicle[]>('/api/vehicles').then(setVehicles).catch(() => setVehicles([]));
  }

  useEffect(() => {
    load();
    api.get<Technician[]>('/api/technicians').then(setTechnicians).catch(() => setTechnicians([]));
  }, []);

  const filtered = useMemo(() => {
    if (!vehicles) return [];
    const q = search.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter(
      (v) => v.plate.toLowerCase().includes(q) || v.type.toLowerCase().includes(q) || (v.model || '').toLowerCase().includes(q) || (v.responsible_name || '').toLowerCase().includes(q)
    );
  }, [vehicles, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({
      plate: v.plate, type: v.type, model: v.model || '', responsible_tech_id: v.responsible_tech_id ? String(v.responsible_tech_id) : '',
      has_rack: v.has_rack, has_basket: v.has_basket, has_giroflex: v.has_giroflex, has_inverter: v.has_inverter,
      ticket_car: v.ticket_car || '', area_rede: v.area_rede || '', base: v.base || '', setor: v.setor || '',
      condutor_dia: v.condutor_dia || '', condutor_tarde: v.condutor_tarde || '', condutor_madrugada: v.condutor_madrugada || '', subclus: v.subclus || '',
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
    const text = `*CADASTRO DE VEÍCULO - CLARO REDE EXTERNA*\n\n` +
      `*Placa:* ${v.plate || 'N/A'}\n` +
      `*Modelo:* ${v.model || 'N/A'}\n` +
      `*Responsável:* ${v.responsible_name || v.condutor_dia || 'N/A'}\n` +
      `*Número do Ticket:* ${v.ticket_car || 'N/A'}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div>
      <PageHeader
        title="Veículos"
        subtitle="Frota de veículos e equipamentos da operação"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { window.location.href = '/api/vehicles/export'; }}>
              <Download className="w-4 h-4" /> Exportar
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" /> Cadastrar Veículo
            </Button>
          </div>
        }
      />

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por placa, tipo, modelo..." className="pl-11 rounded-full" />
      </div>

      {vehicles === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhum veículo encontrado.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v) => (
            <Card key={v.id} className="p-5 flex flex-col gap-3 animate-in">
              <div className="flex items-center justify-between">
                <span className="mono text-sm font-bold tracking-wider px-2.5 py-1 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                  {v.plate}
                </span>
                <span className="text-[11px] text-[var(--color-text-faint)]">{v.type}</span>
              </div>
              <div>
                <h3 className="font-bold text-base leading-snug">{v.model || 'Sem modelo'}</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Responsável: {v.responsible_name || '—'}</p>
                {v.subclus && <p className="text-xs text-[var(--color-text-faint)]">Subcluster: {v.subclus}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {v.has_rack && <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">Rack</span>}
                {v.has_basket && <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">Cesto</span>}
                {v.has_giroflex && <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">Giroflex</span>}
                {v.has_inverter && <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">Inversor</span>}
              </div>
              <div className="mt-auto flex items-center gap-2 pt-2">
                <button
                  onClick={() => sendWhatsapp(v)}
                  aria-label="Enviar dados no WhatsApp"
                  title="Enviar dados no WhatsApp"
                  className="w-10 h-10 shrink-0 rounded-full bg-[#25d366]/10 border border-[#25d366]/30 flex items-center justify-center text-[#25d366] hover:bg-[#25d366]/20 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openEdit(v)}
                  className="flex-1 h-10 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07] transition-colors"
                >
                  <Pencil className="w-4 h-4" /> Editar
                </button>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(v)}
                    aria-label="Excluir veículo"
                    className="w-10 h-10 shrink-0 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Veículo' : 'Novo Veículo'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Veículo'}</Button>
          </>
        }
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Placa">
            <Input value={form.plate} onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))} placeholder="ABC1D23" />
          </Field>
          <Field label="Tipo">
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Modelo">
          <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="Ex: Fiat Strada" />
        </Field>
        <Field label="Responsável">
          <Select value={form.responsible_tech_id} onChange={(e) => setForm((f) => ({ ...f, responsible_tech_id: e.target.value }))}>
            <option value="">Sem responsável</option>
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Área de Rede">
            <Input value={form.area_rede} onChange={(e) => setForm((f) => ({ ...f, area_rede: e.target.value }))} />
          </Field>
          <Field label="Base">
            <Input value={form.base} onChange={(e) => setForm((f) => ({ ...f, base: e.target.value }))} />
          </Field>
          <Field label="Setor">
            <Input value={form.setor} onChange={(e) => setForm((f) => ({ ...f, setor: e.target.value }))} />
          </Field>
          <Field label="Subcluster">
            <Input value={form.subclus} onChange={(e) => setForm((f) => ({ ...f, subclus: e.target.value }))} />
          </Field>
          <Field label="Condutor (Dia)">
            <Input value={form.condutor_dia} onChange={(e) => setForm((f) => ({ ...f, condutor_dia: e.target.value }))} />
          </Field>
          <Field label="Condutor (Tarde)">
            <Input value={form.condutor_tarde} onChange={(e) => setForm((f) => ({ ...f, condutor_tarde: e.target.value }))} />
          </Field>
          <Field label="Condutor (Madrugada)">
            <Input value={form.condutor_madrugada} onChange={(e) => setForm((f) => ({ ...f, condutor_madrugada: e.target.value }))} />
          </Field>
          <Field label="Ticket do Carro">
            <Input value={form.ticket_car} onChange={(e) => setForm((f) => ({ ...f, ticket_car: e.target.value }))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {[
            { key: 'has_rack', label: 'Possui Rack' },
            { key: 'has_basket', label: 'Possui Cesto' },
            { key: 'has_giroflex', label: 'Possui Giroflex' },
            { key: 'has_inverter', label: 'Possui Inversor' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={(form as Record<string, boolean | string>)[key] as boolean}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                className="w-4 h-4 accent-[var(--color-accent)]"
              />
              {label}
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}
