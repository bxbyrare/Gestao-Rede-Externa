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
  UploadCloud,
  X,
  ExternalLink,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Technician } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';
import { useAuth, isCoordenadorClaro, hasPermission } from '../state/AuthContext';
import { formatPersonName } from '../utils/formatName';

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
  nr6_expiration: '', nr10_expiration: '', nr35_expiration: '', aso_expiration: ''
};

function formatDateBr(dateStr?: string | null): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function getExpirationStatus(dateStr?: string | null) {
  if (!dateStr) return { text: 'Pendente', color: 'text-[var(--color-text-faint)] bg-white/[0.03] border-white/10', days: null };
  const target = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T00:00:00`) : new Date(dateStr);
  if (isNaN(target.getTime())) return { text: 'Inválido', color: 'text-[var(--color-text-faint)] bg-white/[0.03] border-white/10', days: null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const fmt = formatDateBr(dateStr);

  if (diffDays < 0) {
    return { text: `Vencido (${fmt})`, color: 'text-red-400 bg-red-500/10 border-red-500/25', days: diffDays };
  }
  if (diffDays <= 30) {
    return { text: `Vence em ${diffDays}d (${fmt})`, color: 'text-amber-400 bg-amber-500/10 border-amber-500/25', days: diffDays };
  }
  return { text: fmt, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', days: diffDays };
}

function getComplianceRank(p: Technician) {
  const dates = [p.nr6_expiration, p.nr10_expiration, p.nr35_expiration, p.aso_expiration];
  const files = [p.nr6_file, p.nr10_file, p.nr35_file, p.aso_file];

  let expiredCount = 0;
  let expiringSoonCount = 0;
  let validCount = 0;
  let totalCertCount = 0;
  let minDays = Number.POSITIVE_INFINITY;

  for (let i = 0; i < 4; i++) {
    const status = getExpirationStatus(dates[i]);
    const hasFile = Boolean(files[i]);
    if (status.days !== null) {
      totalCertCount++;
      if (status.days < minDays) minDays = status.days;
      if (status.days < 0) {
        expiredCount++;
      } else if (status.days <= 30) {
        expiringSoonCount++;
      } else {
        validCount++;
      }
    } else if (hasFile) {
      totalCertCount++;
      validCount++;
    }
  }

  // Tier 0: Tem certificação vencida (topo absoluto)
  // Tier 1: Tem certificação vencendo em <= 30 dias (logo abaixo das vencidas)
  // Tier 2: Tem certificações em dia (acima de quem não tem nenhuma)
  // Tier 3: Não tem nenhuma certificação cadastrada (fundo da tabela)
  let tier = 3;
  if (expiredCount > 0) {
    tier = 0;
  } else if (expiringSoonCount > 0) {
    tier = 1;
  } else if (totalCertCount > 0) {
    tier = 2;
  }

  return { tier, expiredCount, expiringSoonCount, validCount, totalCertCount, minDays };
}

function sortPeopleByCompliance(list: Technician[]): Technician[] {
  return [...list].sort((a, b) => {
    const rA = getComplianceRank(a);
    const rB = getComplianceRank(b);

    // 1. Ordem principal por Tier (0 = Vencido -> 1 = Vencendo -> 2 = Com certificação -> 3 = Sem certificação)
    if (rA.tier !== rB.tier) return rA.tier - rB.tier;

    // 2. Dentro dos Vencidos (Tier 0): mais certificações vencidas primeiro, depois o vencimento mais antigo
    if (rA.tier === 0) {
      if (rA.expiredCount !== rB.expiredCount) return rB.expiredCount - rA.expiredCount;
      if (rA.minDays !== rB.minDays) return rA.minDays - rB.minDays;
    }

    // 3. Dentro dos Vencendo em breve (Tier 1): menor prazo restante primeiro
    if (rA.tier === 1 && rA.minDays !== rB.minDays) {
      return rA.minDays - rB.minDays;
    }

    // 4. Quem possui mais certificações preenchidas aparece mais acima
    if (rA.totalCertCount !== rB.totalCertCount) {
      return rB.totalCertCount - rA.totalCertCount;
    }

    // 5. Desempate pelo vencimento mais próximo (quando ambos têm datas)
    if (rA.minDays !== rB.minDays) {
      return rA.minDays - rB.minDays;
    }

    // 6. Ordem alfabética do nome
    return (a.name || '').localeCompare(b.name || '', 'pt-BR');
  });
}

interface ComplianceDocCardProps {
  title: string;
  subtitle: string;
  dateValue: string;
  onDateChange: (val: string) => void;
  selectedFile?: File;
  onFileChange: (file?: File) => void;
  existingFilePath?: string | null;
  fileInputId: string;
}

function ComplianceDocCard({
  title,
  subtitle,
  dateValue,
  onDateChange,
  selectedFile,
  onFileChange,
  existingFilePath,
  fileInputId,
}: ComplianceDocCardProps) {
  return (
    <div className="p-4 bg-white/[0.02] rounded-xl border border-white/10 flex flex-col justify-between space-y-3.5">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/5">
        <span className="text-xs font-bold text-white">{title}</span>
        <span className="text-[10px] font-medium text-[var(--color-text-muted)] bg-white/[0.04] px-2 py-0.5 rounded border border-white/10">
          {subtitle}
        </span>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
          Data de Vencimento
        </label>
        <Input
          type="date"
          value={dateValue}
          onChange={(e) => onDateChange(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
          Comprovante Anexado
        </label>

        {selectedFile ? (
          <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/15 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-white font-semibold truncate text-xs">{selectedFile.name}</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">{(selectedFile.size / 1024).toFixed(0)} KB</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onFileChange(undefined)}
              className="p-1 text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
              title="Remover anexo selecionado"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : existingFilePath ? (
          <div className="space-y-2">
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <FileCheck className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                <span className="text-[var(--color-text)] font-medium text-xs truncate">Documento Anexado</span>
              </div>
              <a
                href={`/uploads/${existingFilePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text)] hover:text-white transition-colors bg-white/[0.06] hover:bg-white/[0.12] px-2.5 py-1 rounded-lg border border-white/10 shrink-0"
              >
                <span>Ver</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <label
              htmlFor={fileInputId}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-[var(--color-text-muted)] hover:text-white bg-white/[0.02] hover:bg-white/[0.06] border border-white/10 cursor-pointer transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Substituir Documento</span>
            </label>
          </div>
        ) : (
          <label
            htmlFor={fileInputId}
            className="w-full py-3.5 px-3 rounded-xl border border-dashed border-white/15 hover:border-white/30 bg-white/[0.02] hover:bg-white/[0.04] flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
          >
            <UploadCloud className="w-4 h-4 text-[var(--color-text-muted)] mb-1" />
            <span className="text-xs font-medium text-[var(--color-text)]">
              Selecionar Certificado
            </span>
            <span className="text-[10px] text-[var(--color-text-faint)] mt-0.5">
              PDF, PNG ou JPG
            </span>
          </label>
        )}

        <input
          id={fileInputId}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              onFileChange(e.target.files[0]);
            }
          }}
          className="hidden"
        />
      </div>
    </div>
  );
}

export default function PessoasPage() {
  const { user } = useAuth();
  const canExport = isCoordenadorClaro(user);
  const canCreate = hasPermission(user, 'pessoas.create');
  const canEdit = hasPermission(user, 'pessoas.edit');
  const canDelete = hasPermission(user, 'pessoas.delete');
  const [people, setPeople] = useState<Technician[] | null>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [files, setFiles] = useState<{ nr6_file?: File; nr10_file?: File; nr35_file?: File; aso_file?: File }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load(q = '') {
    api
      .get<Technician[]>('/api/technicians', q ? { search: q } : undefined)
      .then((list) =>
        setPeople(
          sortPeopleByCompliance(
            list.map((p) => ({ ...p, name: formatPersonName(p.name) }))
          )
        )
      )
      .catch(() => setPeople([]));
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
      name: formatPersonName(tech.name), cpf: tech.cpf || '', phone: tech.phone || '', identity: tech.identity || '',
      dob: tech.dob || '', role: tech.role || 'Técnico', area: tech.area || '',
      team_type: tech.team_type || 'Fusão', company: tech.company || '',
      registration_claro: tech.registration_claro || '', registration_third: tech.registration_third || '',
      toa_login: tech.toa_login || '', phone_model: tech.phone_model || '', imei_1: tech.imei_1 || '',
      imei_2: tech.imei_2 || '', email: tech.email || '', shirt_size: tech.shirt_size || '',
      boot_size: tech.boot_size || '', pants_size: tech.pants_size || '', jacket_size: tech.jacket_size || '',
      team: tech.team || '',
      nr6_expiration: tech.nr6_expiration || '',
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
      const normalizedName = formatPersonName(form.name);
      const fd = new FormData();
      Object.entries({ ...form, name: normalizedName }).forEach(([k, v]) => fd.append(k, v));
      if (files.nr6_file) fd.append('nr6_file', files.nr6_file);
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
    lines.push(
      `📜 *Validades:* NR-6 (${formatDateBr(p.nr6_expiration) || 'Pendente'}) | NR-10 (${formatDateBr(p.nr10_expiration) || 'Pendente'}) | NR-35 (${formatDateBr(p.nr35_expiration) || 'Pendente'}) | ASO (${formatDateBr(p.aso_expiration) || 'Pendente'})`
    );

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
        subtitle={people ? `${people.length} colaboradores técnicos cadastrados` : 'Carregando equipe...'}
        actions={
          <div className="flex gap-2 flex-wrap">
            {canExport && (
              <Button
                variant="outline"
                onClick={() => { window.location.href = '/api/technicians/export'; }}
                className="rounded-xl"
              >
                <Download className="w-4 h-4 mr-1.5" /> Exportar Cadastro (CSV)
              </Button>
            )}
            {canCreate && (
              <Button
                onClick={openCreate}
                className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 rounded-xl"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Cadastrar Colaborador
              </Button>
            )}
          </div>
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, CPF, empresa, matrícula ou área..."
          className="pl-10"
        />
      </div>

      <Card className="overflow-hidden">
        {people === null ? (
          <div className="p-12 text-center text-sm text-[var(--color-text-muted)] flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            Carregando lista de técnicos...
          </div>
        ) : people.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-text-muted)] flex flex-col items-center gap-3">
            <Users className="w-10 h-10 text-[var(--color-text-faint)]" />
            <div className="font-semibold text-[var(--color-text)]">Nenhum colaborador encontrado.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[980px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
                  <th className="px-5 py-3.5 font-semibold">Colaborador / CPF</th>
                  <th className="px-5 py-3.5 font-semibold">Empresa / Cargo</th>
                  <th className="px-5 py-3.5 font-semibold">Contato / Área</th>
                  <th className="px-5 py-3.5 font-semibold">NR-6</th>
                  <th className="px-5 py-3.5 font-semibold">NR-10</th>
                  <th className="px-5 py-3.5 font-semibold">NR-35</th>
                  <th className="px-5 py-3.5 font-semibold">ASO</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {people.map((p) => {
                  const s6 = getExpirationStatus(p.nr6_expiration);
                  const s10 = getExpirationStatus(p.nr10_expiration);
                  const s35 = getExpirationStatus(p.nr35_expiration);
                  const sAso = getExpirationStatus(p.aso_expiration);

                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-[var(--color-text)]">
                          {p.name}
                        </div>
                        {p.cpf && <div className="text-xs mono text-[var(--color-text-muted)]">{p.cpf}</div>}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-[var(--color-text)]">{p.company || '—'}</span>
                        <div className="text-xs text-[var(--color-text-muted)]">{p.role}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-xs mono text-[var(--color-text)]">{p.phone || '—'}</div>
                        <div className="text-xs text-[var(--color-text-muted)] truncate max-w-[140px]">{p.area || '—'}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${s6.color}`}>
                            {s6.text}
                          </span>
                          {p.nr6_file && (
                            <a
                              href={`/uploads/${p.nr6_file}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--color-text-muted)] hover:text-white"
                              title="Visualizar Certificado NR-6"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${s10.color}`}>
                            {s10.text}
                          </span>
                          {p.nr10_file && (
                            <a
                              href={`/uploads/${p.nr10_file}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--color-text-muted)] hover:text-white"
                              title="Visualizar Certificado NR-10"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${s35.color}`}>
                            {s35.text}
                          </span>
                          {p.nr35_file && (
                            <a
                              href={`/uploads/${p.nr35_file}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--color-text-muted)] hover:text-white"
                              title="Visualizar Certificado NR-35"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${sAso.color}`}>
                            {sAso.text}
                          </span>
                          {p.aso_file && (
                            <a
                              href={`/uploads/${p.aso_file}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--color-text-muted)] hover:text-white"
                              title="Visualizar Atestado ASO"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => sendWhatsapp(p)}
                            aria-label="WhatsApp direto"
                            title="Conversar no WhatsApp"
                            className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-emerald-400 hover:bg-white/[0.08] transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => copyWhatsapp(p)}
                            aria-label="Copiar dados"
                            title="Copiar dados técnicos completos"
                            className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-white hover:bg-white/[0.08] transition-colors"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => openEdit(p)}
                              aria-label="Editar cadastro"
                              title="Editar cadastro e documentos"
                              className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-white hover:bg-white/[0.08] transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(p)}
                              aria-label="Excluir"
                              title="Excluir cadastro"
                              className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar: ${editing.name}` : 'Cadastrar Colaborador'}
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 rounded-xl"
            >
              {isSaving ? 'Salvando...' : 'Salvar Colaborador'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
              Identificação e Dados Corporativos
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nome Completo">
                <Input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  onBlur={(e) => set('name', formatPersonName(e.target.value))}
                  placeholder="Nome do técnico"
                />
              </Field>
              <Field label="CPF">
                <Input value={form.cpf} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" />
              </Field>
              <Field label="Telefone de Contato">
                <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(21) 90000-0000" />
              </Field>
              <Field label="RG / Identidade">
                <Input value={form.identity} onChange={(e) => set('identity', e.target.value)} placeholder="RG do colaborador" />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="tecnico@claro.com.br" />
              </Field>
              <Field label="Data de Nascimento">
                <Input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
              </Field>
              <Field label="Cargo">
                <Select value={form.role} onChange={(e) => set('role', e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="Empresa Parceira">
                <Select value={form.company} onChange={(e) => set('company', e.target.value)}>
                  <option value="">Selecione...</option>
                  {COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Área de Atuação">
                <Input value={form.area} onChange={(e) => set('area', e.target.value)} placeholder="Ex: Metropolitana, Baixada Fluminense" />
              </Field>
              <Field label="Tipo de Equipe">
                <Select value={form.team_type} onChange={(e) => set('team_type', e.target.value)}>
                  {TEAM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Nome da Equipe">
                <Input value={form.team} onChange={(e) => set('team', e.target.value)} placeholder="Ex: Equipe Alpha 01" />
              </Field>
              <Field label="Matrícula Claro">
                <Input value={form.registration_claro} onChange={(e) => set('registration_claro', e.target.value)} placeholder="Ex: C123456" />
              </Field>
              <Field label="Matrícula Terceiro">
                <Input value={form.registration_third} onChange={(e) => set('registration_third', e.target.value)} placeholder="Ex: T998877" />
              </Field>
              <Field label="Login TOA">
                <Input value={form.toa_login} onChange={(e) => set('toa_login', e.target.value)} placeholder="Ex: usr.toa.123" />
              </Field>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
              Segurança do Trabalho (NR-6, NR-10, NR-35 e ASO)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ComplianceDocCard
                title="NR-6"
                subtitle="EPI"
                dateValue={form.nr6_expiration}
                onDateChange={(val) => set('nr6_expiration', val)}
                selectedFile={files.nr6_file}
                onFileChange={(file) => setFiles((prev) => ({ ...prev, nr6_file: file }))}
                existingFilePath={editing?.nr6_file}
                fileInputId="input-file-nr6"
              />

              <ComplianceDocCard
                title="NR-10"
                subtitle="Elétrica"
                dateValue={form.nr10_expiration}
                onDateChange={(val) => set('nr10_expiration', val)}
                selectedFile={files.nr10_file}
                onFileChange={(file) => setFiles((prev) => ({ ...prev, nr10_file: file }))}
                existingFilePath={editing?.nr10_file}
                fileInputId="input-file-nr10"
              />

              <ComplianceDocCard
                title="NR-35"
                subtitle="Trabalho em Altura"
                dateValue={form.nr35_expiration}
                onDateChange={(val) => set('nr35_expiration', val)}
                selectedFile={files.nr35_file}
                onFileChange={(file) => setFiles((prev) => ({ ...prev, nr35_file: file }))}
                existingFilePath={editing?.nr35_file}
                fileInputId="input-file-nr35"
              />

              <ComplianceDocCard
                title="ASO"
                subtitle="Saúde Ocupacional"
                dateValue={form.aso_expiration}
                onDateChange={(val) => set('aso_expiration', val)}
                selectedFile={files.aso_file}
                onFileChange={(file) => setFiles((prev) => ({ ...prev, aso_file: file }))}
                existingFilePath={editing?.aso_file}
                fileInputId="input-file-aso"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
              Smartphone Corporativo e Uniformes
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Field label="Modelo Celular">
                <Input value={form.phone_model} onChange={(e) => set('phone_model', e.target.value)} placeholder="Ex: Galaxy A14" />
              </Field>
              <Field label="IMEI 1">
                <Input value={form.imei_1} onChange={(e) => set('imei_1', e.target.value)} placeholder="IMEI primário" />
              </Field>
              <Field label="Camisa">
                <Input value={form.shirt_size} onChange={(e) => set('shirt_size', e.target.value)} placeholder="P / M / G" />
              </Field>
              <Field label="Bota">
                <Input value={form.boot_size} onChange={(e) => set('boot_size', e.target.value)} placeholder="41 / 42" />
              </Field>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
