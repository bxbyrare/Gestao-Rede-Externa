import { useEffect, useState } from 'react';
import {
  ClipboardList,
  Download,
  FileCheck,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  ShieldCheck
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Technician } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';
import { useAuth, isCoordenadorClaro } from '../state/AuthContext';

const ROLES = ['Técnico', 'Auxiliar', 'Supervisor', 'Coordenador', 'Administrativo', 'COP'];
const COMPANIES = ['Claro', 'FFA', 'Procisa', 'Servilog'];
const TEAM_TYPES = [
  { value: 'Fusão', label: 'Fusão (Emenda Fibra)' },
  { value: 'Lançamento', label: 'Lançamento (Cabeamento)' },
  { value: 'MDU', label: 'MDU' },
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
  nr10_expiration: '', nr35_expiration: '', aso_expiration: ''
};

function getExpirationStatus(dateStr?: string | null) {
  if (!dateStr) return { text: 'Pendente', color: 'text-slate-500 bg-slate-800/40 border-white/5', days: null };
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return { text: 'Inválido', color: 'text-slate-500 bg-slate-800/40 border-white/5', days: null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `Vencido (${Math.abs(diffDays)}d)`, color: 'text-red-400 bg-red-500/10 border-red-500/30', days: diffDays };
  }
  if (diffDays <= 30) {
    return { text: `Vence em ${diffDays}d`, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', days: diffDays };
  }
  return { text: `Válido (${diffDays}d)`, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', days: diffDays };
}

export default function PessoasPage() {
  const { user } = useAuth();
  const canExport = isCoordenadorClaro(user);
  const [people, setPeople] = useState<Technician[] | null>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [files, setFiles] = useState<{ nr10_file?: File; nr35_file?: File; aso_file?: File }>({});
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
    setFiles({});
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
      nr10_expiration: tech.nr10_expiration || '',
      nr35_expiration: tech.nr35_expiration || '',
      aso_expiration: tech.aso_expiration || '',
    });
    setFiles({});
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
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (files.nr10_file) fd.append('nr10_file', files.nr10_file);
      if (files.nr35_file) fd.append('nr35_file', files.nr35_file);
      if (files.aso_file) fd.append('aso_file', files.aso_file);

      if (editing) {
        await api.postFormData(`/api/technicians/${editing.id}`, fd);
      } else {
        await api.postFormData('/api/technicians', fd);
      }
      setModalOpen(false);
      load(search);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar colaborador.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(tech: Technician) {
    if (!confirm(`Excluir permanentemente o cadastro de "${tech.name}"?`)) return;
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
    if (p.team || p.team_type) lines.push(`👥 *Equipe:* ${p.team || 'N/A'} (${p.team_type || 'Geral'})`);
    if (p.registration_claro) lines.push(`🏷️ *Matrícula Claro:* ${p.registration_claro}`);
    if (p.registration_third) lines.push(`🏷️ *Matrícula Terceiro:* ${p.registration_third}`);
    if (p.toa_login) lines.push(`🔑 *Login TOA:* ${p.toa_login}`);
    if (p.phone_model) lines.push(`📱 *Modelo Telefone:* ${p.phone_model}`);
    if (p.imei_1) lines.push(`🔢 *IMEI 1:* ${p.imei_1}`);
    if (p.email) lines.push(`✉️ *E-mail:* ${p.email}`);
    if (p.shirt_size || p.boot_size || p.pants_size || p.jacket_size) {
      lines.push(`👕 *Uniforme:* Camisa ${p.shirt_size || '-'} | Bota ${p.boot_size || '-'} | Calça ${p.pants_size || '-'} | Casaco ${p.jacket_size || '-'}`);
    }
    if (p.nr10_expiration || p.nr35_expiration || p.aso_expiration) {
      lines.push(`📜 *Certificados:* NR-10 (${p.nr10_expiration || 'Pendente'}) | NR-35 (${p.nr35_expiration || 'Pendente'}) | ASO (${p.aso_expiration || 'Pendente'})`);
    }

    const fullText = lines.join('\n');
    navigator.clipboard.writeText(fullText);
    alert('Ficha do colaborador copiada para o WhatsApp!');
  }

  function sendWhatsapp(p: Technician) {
    const text = `*CADASTRO DE COLABORADOR - CLARO REDE EXTERNA*\n\n` +
      `*Nome:* ${p.name || 'N/A'}\n` +
      `*CPF:* ${p.cpf || 'N/A'}\n` +
      `*Empresa:* ${p.company || 'N/A'}\n` +
      `*Telefone:* ${p.phone || 'N/A'}\n` +
      `*Cargo:* ${p.role || 'N/A'}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Pessoas & NRs"
        subtitle={people ? `${people.length} colaboradores técnicos cadastrados e monitorados` : 'Carregando equipe...'}
        actions={
          <div className="flex gap-2 flex-wrap">
            {canExport && (
              <Button
                variant="outline"
                onClick={() => { window.location.href = '/api/technicians/export'; }}
                className="border-white/10 hover:border-red-500/40 text-slate-200"
              >
                <Download className="w-4 h-4 text-red-500 mr-1.5" /> Exportar Cadastro (CSV)
              </Button>
            )}
            <Button
              onClick={openCreate}
              className="bg-red-600 hover:bg-red-500 text-white font-semibold shadow-lg shadow-red-600/20"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Cadastrar Colaborador
            </Button>
          </div>
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, CPF, empresa, matrícula ou área..."
          className="pl-10 bg-[#0F1422] border-white/10 focus:border-red-500/50 rounded-xl text-slate-100"
        />
      </div>

      <Card className="overflow-hidden bg-[#0F1422] border-white/10 rounded-2xl shadow-xl">
        {people === null ? (
          <div className="p-12 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            Carregando lista de técnicos...
          </div>
        ) : people.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400 flex flex-col items-center gap-3">
            <Users className="w-10 h-10 text-slate-600" />
            <div className="font-semibold text-slate-300">Nenhum colaborador encontrado.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[900px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-white/10 bg-white/[0.02]">
                  <th className="px-5 py-3.5 font-bold">Colaborador / CPF</th>
                  <th className="px-5 py-3.5 font-bold">Empresa / Cargo</th>
                  <th className="px-5 py-3.5 font-bold">Contato / Área</th>
                  <th className="px-5 py-3.5 font-bold">Conformidade NR-10</th>
                  <th className="px-5 py-3.5 font-bold">Conformidade NR-35</th>
                  <th className="px-5 py-3.5 font-bold">Saúde ASO</th>
                  <th className="px-5 py-3.5 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {people.map((p) => {
                  const s10 = getExpirationStatus(p.nr10_expiration);
                  const s35 = getExpirationStatus(p.nr35_expiration);
                  const sAso = getExpirationStatus(p.aso_expiration);

                  return (
                    <tr key={p.id} className="hover:bg-white/[0.03] transition-colors group">
                      <td className="px-5 py-3">
                        <div className="font-bold text-slate-100 group-hover:text-red-400 transition-colors">
                          {p.name}
                        </div>
                        {p.cpf && <div className="text-xs font-mono text-slate-400">{p.cpf}</div>}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-slate-200">{p.company || '—'}</span>
                        <div className="text-xs text-red-400 font-medium">{p.role}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-xs font-mono text-slate-300">{p.phone || '—'}</div>
                        <div className="text-xs text-slate-400 truncate max-w-[140px]">{p.area || '—'}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${s10.color}`}>
                            {s10.text}
                          </span>
                          {p.nr10_file && (
                            <a
                              href={`/uploads/${p.nr10_file}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-400 hover:text-sky-300"
                              title="Visualizar Certificado NR-10"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${s35.color}`}>
                            {s35.text}
                          </span>
                          {p.nr35_file && (
                            <a
                              href={`/uploads/${p.nr35_file}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-400 hover:text-sky-300"
                              title="Visualizar Certificado NR-35"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${sAso.color}`}>
                            {sAso.text}
                          </span>
                          {p.aso_file && (
                            <a
                              href={`/uploads/${p.aso_file}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-400 hover:text-sky-300"
                              title="Visualizar Atestado ASO"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => sendWhatsapp(p)}
                            aria-label="WhatsApp direto"
                            title="Conversar no WhatsApp"
                            className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => copyWhatsapp(p)}
                            aria-label="Copiar dados"
                            title="Copiar dados técnicos completos"
                            className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] transition-colors"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEdit(p)}
                            aria-label="Editar cadastro"
                            title="Editar cadastro e documentos"
                            className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            aria-label="Excluir"
                            title="Excluir cadastro"
                            className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal Criar / Editar Colaborador */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar: ${editing.name}` : 'Cadastrar Colaborador'}
        maxWidth="max-w-3xl"
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
              {isSaving ? 'Salvando...' : 'Salvar Colaborador'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-3">
              Identificação & Dados Corporativos
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nome Completo">
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome do técnico" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="CPF">
                <Input value={form.cpf} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="Telefone de Contato">
                <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(21) 90000-0000" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="RG / Identidade">
                <Input value={form.identity} onChange={(e) => set('identity', e.target.value)} placeholder="RG do colaborador" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="tecnico@claro.com.br" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="Data de Nascimento">
                <Input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="Cargo">
                <Select value={form.role} onChange={(e) => set('role', e.target.value)} className="bg-[#090D16] border-white/10 text-slate-100">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="Empresa Parceira">
                <Select value={form.company} onChange={(e) => set('company', e.target.value)} className="bg-[#090D16] border-white/10 text-slate-100">
                  <option value="">Selecione...</option>
                  {COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Área de Atuação">
                <Input value={form.area} onChange={(e) => set('area', e.target.value)} placeholder="Ex: Metropolitana, Baixada Fluminense" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="Tipo de Equipe">
                <Select value={form.team_type} onChange={(e) => set('team_type', e.target.value)} className="bg-[#090D16] border-white/10 text-slate-100">
                  {TEAM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Nome da Equipe">
                <Input value={form.team} onChange={(e) => set('team', e.target.value)} placeholder="Ex: Equipe Alpha 01" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="Matrícula Claro">
                <Input value={form.registration_claro} onChange={(e) => set('registration_claro', e.target.value)} placeholder="Ex: C123456" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="Matrícula Terceiro">
                <Input value={form.registration_third} onChange={(e) => set('registration_third', e.target.value)} placeholder="Ex: T998877" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="Login TOA">
                <Input value={form.toa_login} onChange={(e) => set('toa_login', e.target.value)} placeholder="Ex: usr.toa.123" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
            </div>
          </div>

          {/* Seção NRs e ASO */}
          <div className="pt-4 border-t border-white/10">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              Segurança do Trabalho (NR-10, NR-35 e ASO)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 bg-[#090D16] rounded-xl border border-white/5 space-y-2">
                <div className="text-xs font-bold text-slate-200">NR-10 (Elétrica)</div>
                <Field label="Data de Vencimento">
                  <Input
                    type="date"
                    value={form.nr10_expiration}
                    onChange={(e) => set('nr10_expiration', e.target.value)}
                    className="bg-[#0F1422] border-white/10 text-slate-100 text-xs"
                  />
                </Field>
                <Field label="Anexar Certificado">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setFiles((prev) => ({ ...prev, nr10_file: e.target.files?.[0] }))}
                    className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-white/10 file:text-slate-200 cursor-pointer"
                  />
                </Field>
              </div>

              <div className="p-3 bg-[#090D16] rounded-xl border border-white/5 space-y-2">
                <div className="text-xs font-bold text-slate-200">NR-35 (Altura)</div>
                <Field label="Data de Vencimento">
                  <Input
                    type="date"
                    value={form.nr35_expiration}
                    onChange={(e) => set('nr35_expiration', e.target.value)}
                    className="bg-[#0F1422] border-white/10 text-slate-100 text-xs"
                  />
                </Field>
                <Field label="Anexar Certificado">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setFiles((prev) => ({ ...prev, nr35_file: e.target.files?.[0] }))}
                    className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-white/10 file:text-slate-200 cursor-pointer"
                  />
                </Field>
              </div>

              <div className="p-3 bg-[#090D16] rounded-xl border border-white/5 space-y-2">
                <div className="text-xs font-bold text-slate-200">ASO (Saúde Ocupacional)</div>
                <Field label="Data de Vencimento">
                  <Input
                    type="date"
                    value={form.aso_expiration}
                    onChange={(e) => set('aso_expiration', e.target.value)}
                    className="bg-[#0F1422] border-white/10 text-slate-100 text-xs"
                  />
                </Field>
                <Field label="Anexar Atestado">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setFiles((prev) => ({ ...prev, aso_file: e.target.files?.[0] }))}
                    className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-white/10 file:text-slate-200 cursor-pointer"
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Seção Aparelho e Uniformes */}
          <div className="pt-4 border-t border-white/10">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Smartphone Corporativo & Uniformes
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Field label="Modelo Celular">
                <Input value={form.phone_model} onChange={(e) => set('phone_model', e.target.value)} placeholder="Ex: Galaxy A14" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="IMEI 1">
                <Input value={form.imei_1} onChange={(e) => set('imei_1', e.target.value)} placeholder="IMEI primário" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="Camisa">
                <Input value={form.shirt_size} onChange={(e) => set('shirt_size', e.target.value)} placeholder="P / M / G" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
              <Field label="Bota">
                <Input value={form.boot_size} onChange={(e) => set('boot_size', e.target.value)} placeholder="41 / 42" className="bg-[#090D16] border-white/10 text-slate-100" />
              </Field>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
