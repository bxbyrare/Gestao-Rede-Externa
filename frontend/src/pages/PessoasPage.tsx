import { useEffect, useState } from 'react';
import { Copy, Download, MessageCircle, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Technician } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';

const ROLES = ['Técnico', 'Auxiliar', 'Supervisor', 'Coordenador', 'Administrativo', 'COP'];
const COMPANIES = ['Claro', 'FFA', 'Procisa'];
const TEAM_TYPES = [
  { value: 'Fusão', label: 'Fusão (Emenda Fibra)' },
  { value: 'Lançamento', label: 'Lançamento (Cabeamento)' },
  { value: 'Coaxial', label: 'Coaxial' },
  { value: 'Vistoriador Estático', label: 'Vistoriador Estático' },
  { value: 'Gestão', label: 'Gestão' },
];

type FormState = Record<string, string>;

const emptyForm: FormState = {
  name: '', cpf: '', phone: '', identity: '', dob: '', role: 'Técnico', area: '',
  team_type: 'Fusão', company: '', registration_claro: '', registration_third: '',
  toa_login: '', phone_model: '', imei_1: '', imei_2: '', email: '',
  shirt_size: '', boot_size: '', pants_size: '', jacket_size: '', team: '',
};

export default function PessoasPage() {
  const [people, setPeople] = useState<Technician[] | null>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load(q = '') {
    api.get<Technician[]>('/api/technicians', q ? { search: q } : undefined).then(setPeople).catch(() => setPeople([]));
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(tech: Technician) {
    setEditing(tech);
    setForm({
      name: tech.name, cpf: tech.cpf || '', phone: tech.phone || '', identity: tech.identity || '',
      dob: tech.dob || '', role: tech.role || 'Técnico', area: tech.area || '',
      team_type: tech.team_type || 'Fusão', company: tech.company || '',
      registration_claro: tech.registration_claro || '', registration_third: tech.registration_third || '',
      toa_login: tech.toa_login || '', phone_model: tech.phone_model || '', imei_1: tech.imei_1 || '',
      imei_2: tech.imei_2 || '', email: tech.email || '', shirt_size: tech.shirt_size || '',
      boot_size: tech.boot_size || '', pants_size: tech.pants_size || '', jacket_size: tech.jacket_size || '',
      team: tech.team || '',
    });
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    if (!form.name.trim()) {
      setError('Nome completo é obrigatório.');
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        await api.putForm(`/api/technicians/${editing.id}`, form);
      } else {
        await api.postForm('/api/technicians', form);
      }
      setModalOpen(false);
      load(search);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(tech: Technician) {
    if (!confirm(`Excluir o cadastro de "${tech.name}"?`)) return;
    await api.delete(`/api/technicians/${tech.id}`);
    load(search);
  }

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

    function copyWhatsapp(p: Technician) {
    const lines = [
      `*DADOS DO COLABORADOR - CLARO REDE EXTERNA*`,
      ``,
      `👤 *Nome:* ${p.name || 'N/A'}`,
      `🆔 *CPF:* ${p.cpf || 'N/A'}`,
      `🪪 *RG / Identidade:* ${p.identity || 'N/A'}`,
      `📞 *Telefone:* ${p.phone || 'N/A'}`,
      `🏢 *Empresa:* ${p.company || 'FFA'}`,
      `💼 *Cargo:* ${p.role || 'Técnico'}`,
      `📍 *Área de Atuação:* ${p.area || 'N/A'}`,
    ];
    if (p.registration_claro) lines.push(`🏷️ *Matrícula Claro:* ${p.registration_claro}`);
    if (p.registration_third) lines.push(`🏷️ *Matrícula Terceiro:* ${p.registration_third}`);
    if (p.toa_login) lines.push(`🔑 *Login TOA:* ${p.toa_login}`);
    if (p.phone_model) lines.push(`📱 *Modelo Telefone:* ${p.phone_model}`);
    if (p.imei_1) lines.push(`🔢 *IMEI 1:* ${p.imei_1}`);
    if (p.email) lines.push(`✉️ *E-mail:* ${p.email}`);
    if (p.shirt_size || p.boot_size) lines.push(`👕 *Uniforme:* Camisa ${p.shirt_size || '-'} | Bota ${p.boot_size || '-'}`);

    const fullText = lines.join('\n');
    navigator.clipboard.writeText(fullText);
    alert('Dados copiados no formato do WhatsApp!');
  }

  function sendWhatsapp(p: Technician) {
    const text = `*CADASTRO DE TÉCNICO - CLARO REDE EXTERNA*\n\n` +
      `*Nome:* ${p.name || 'N/A'}\n` +
      `*CPF:* ${p.cpf || 'N/A'}\n` +
      `*Identidade:* ${p.identity || 'N/A'}\n` +
      `*Telefone:* ${p.phone || 'N/A'}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div>
      <PageHeader
        title="Pessoas"
        subtitle={people ? `${people.length} pessoas cadastradas` : 'Carregando...'}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { window.location.href = '/api/technicians/export'; }}>
              <Download className="w-4 h-4" /> Exportar
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" /> Cadastrar Técnico
            </Button>
          </div>
        }
      />

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, CPF ou área..." className="pl-11 rounded-full" />
      </div>

      <Card className="overflow-hidden">
        {people === null ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]">Carregando...</p>
        ) : people.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--color-text-muted)] flex flex-col items-center gap-3">
            <Users className="w-8 h-8 text-[var(--color-text-faint)]" />
            Nenhuma pessoa encontrada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/5">
                  <th className="px-5 py-3 font-semibold">Nome</th>
                  <th className="px-5 py-3 font-semibold">Empresa</th>
                  <th className="px-5 py-3 font-semibold">Telefone</th>
                  <th className="px-5 py-3 font-semibold">Cargo</th>
                  <th className="px-5 py-3 font-semibold">Área</th>
                  <th className="px-5 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-semibold">{p.name}</div>
                      {p.cpf && <div className="text-xs text-[var(--color-text-faint)] mono">{p.cpf}</div>}
                    </td>
                    <td className="px-5 py-3 text-[var(--color-text-muted)]">{p.company || '—'}</td>
                    <td className="px-5 py-3 mono text-[var(--color-text-muted)]">{p.phone || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-primary)]">{p.role}</span>
                    </td>
                    <td className="px-5 py-3 text-[var(--color-text-muted)]">{p.area || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => copyWhatsapp(p)} aria-label="Copiar no formato do WhatsApp" title="Copiar no formato do WhatsApp (Zap)" className="h-10 px-3.5 rounded-full bg-[#25d366]/10 border border-[#25d366]/30 flex items-center justify-center gap-1.5 text-[#25d366] hover:bg-[#25d366]/20 transition-colors font-bold text-xs">
                          <Copy className="w-3.5 h-3.5" />
                          <span>Zap</span>
                        </button>
                        <button onClick={() => sendWhatsapp(p)} aria-label="Enviar dados no WhatsApp" title="Enviar dados no WhatsApp" className="w-10 h-10 rounded-full bg-[#25d366]/10 border border-[#25d366]/30 flex items-center justify-center text-[#25d366] hover:bg-[#25d366]/20 transition-colors">
                          <MessageCircle className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(p)} aria-label="Editar" className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07] transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(p)} aria-label="Excluir" className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar: ${editing.name}` : 'Cadastrar Técnico'}
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
          </>
        }
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Field label="Nome completo"><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome do técnico" /></Field>
          <Field label="CPF"><Input value={form.cpf} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" /></Field>
          <Field label="Telefone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(00) 00000-0000" /></Field>
          <Field label="RG"><Input value={form.identity} onChange={(e) => set('identity', e.target.value)} placeholder="RG do colaborador" /></Field>
          <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="nome@empresa.com" /></Field>
          <Field label="Data de nascimento"><Input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
          <Field label="Cargo">
            <Select value={form.role} onChange={(e) => set('role', e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Empresa">
            <Select value={form.company} onChange={(e) => set('company', e.target.value)}>
              <option value="">Selecione...</option>
              {COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Área de atuação" hint="Separe múltiplas áreas por vírgula">
            <Input value={form.area} onChange={(e) => set('area', e.target.value)} placeholder="Ex: Metropolitana, Baixada Fluminense" />
          </Field>
          <Field label="Tipo de equipe">
            <Select value={form.team_type} onChange={(e) => set('team_type', e.target.value)}>
              {TEAM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Matrícula Claro"><Input value={form.registration_claro} onChange={(e) => set('registration_claro', e.target.value)} placeholder="Ex: C123456" /></Field>
          <Field label="Matrícula Terceira"><Input value={form.registration_third} onChange={(e) => set('registration_third', e.target.value)} placeholder="Ex: T998877" /></Field>
          <Field label="Login TOA"><Input value={form.toa_login} onChange={(e) => set('toa_login', e.target.value)} placeholder="Ex: usr.toa.123" /></Field>
          <Field label="Modelo do celular"><Input value={form.phone_model} onChange={(e) => set('phone_model', e.target.value)} placeholder="Ex: Samsung Galaxy A14" /></Field>
          <Field label="IMEI 1"><Input value={form.imei_1} onChange={(e) => set('imei_1', e.target.value)} placeholder="351234567890123" /></Field>
          <Field label="IMEI 2"><Input value={form.imei_2} onChange={(e) => set('imei_2', e.target.value)} placeholder="Opcional" /></Field>
          <Field label="Camisa"><Input value={form.shirt_size} onChange={(e) => set('shirt_size', e.target.value)} placeholder="P / M / G / GG" /></Field>
          <Field label="Bota"><Input value={form.boot_size} onChange={(e) => set('boot_size', e.target.value)} placeholder="Número" /></Field>
        </div>
      </Modal>
    </div>
  );
}
