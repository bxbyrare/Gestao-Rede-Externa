import { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Download,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  User,
  Calendar,
  MapPin,
  Camera,
  CheckCircle2,
  Layers,
  Sparkles,
  ArrowUpDown,
  Table as TableIcon,
  ShieldCheck,
  ExternalLink,
  X,
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';
import AccordionGallery from '../components/AccordionGallery';
import { hasPermission, useAuth } from '../state/AuthContext';

interface FormItem {
  id: number;
  title: string;
  slug: string;
  category: string;
  description: string | null;
  link: string | null;
  questions?: any[] | null;
  questions_count?: number;
  created_at: string;
}

interface FormResponse {
  id: number;
  technician_name: string;
  technician_email: string;
  answers: Record<string, string | string[]>;
  submitted_at: string;
}

interface FormFormData {
  title: string;
  category: string;
  link: string;
  description: string;
  questions?: any[];
}

const CATEGORIES = ['Inspeção', 'Vistoria', 'Rede Externa', 'Técnico', 'Relatório', 'Outros'];
const emptyForm: FormFormData = { title: '', category: 'Inspeção', link: '', description: '', questions: [] };

// Utilitário para formatar datas amigáveis (ex: 04/09/2026 às 12:55)
function formatSubmissionDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// Utilitário para limpar e humanizar os rótulos de perguntas
function cleanLabel(rawKey: string): string {
  let k = rawKey.trim().replace(/[:?]+$/g, '').trim();
  if (k === k.toUpperCase() && k.length > 3) {
    k = k
      .toLowerCase()
      .split(' ')
      .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' ');
  }
  return k;
}

// Detecta se um valor é foto ou lista de fotos
function isPhotoField(value: unknown): boolean {
  if (typeof value === 'string') {
    return (
      value.startsWith('/uploads/') ||
      (value.startsWith('http') && value.match(/\.(png|jpg|jpeg|webp|gif)$/i) !== null) ||
      value.includes('/uploads/')
    );
  }
  if (Array.isArray(value)) {
    return value.some((x) => typeof x === 'string' && (x.startsWith('/uploads/') || x.includes('/uploads/')));
  }
  return false;
}

// Extrai lista normalizada de URLs de fotos
function extractPhotoUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }
  if (typeof value === 'string') {
    if (value.includes('/uploads/') && (value.includes('|') || value.includes(','))) {
      return value.split(/\s*\|\s*|\s*,\s*/).map((s) => s.trim()).filter(Boolean);
    }
    return [value.trim()];
  }
  return [];
}

export default function FormulariosPage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, 'formularios.create');
  const canEdit = hasPermission(user, 'formularios.edit');
  const canDelete = hasPermission(user, 'formularios.delete');
  const [forms, setForms] = useState<FormItem[] | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FormItem | null>(null);
  const [form, setForm] = useState<FormFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionStatus, setConversionStatus] = useState<{
    success: boolean;
    message: string;
    count?: number;
  } | null>(null);

  const [responsesModal, setResponsesModal] = useState<FormItem | null>(null);
  const [responses, setResponses] = useState<FormResponse[] | null>(null);
  const [responseSearch, setResponseSearch] = useState('');
  const [responseSortNewest, setResponseSortNewest] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [responseViewMode, setResponseViewMode] = useState<'table' | 'cards'>('table');

  // Modal de edição de resposta individual (Preenchimento interno / correções)
  const [editingResponse, setEditingResponse] = useState<FormResponse | null>(null);
  const [editTechName, setEditTechName] = useState('');
  const [editTechEmail, setEditTechEmail] = useState('');
  const [editAnswers, setEditAnswers] = useState<Record<string, string | string[]>>({});
  const [isSavingResponse, setIsSavingResponse] = useState(false);
  const [editResponseError, setEditResponseError] = useState<string | null>(null);

  // Lightbox de visualização ampliada de fotos
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  function load() {
    api
      .get<FormItem[]>('/api/forms', categoryFilter ? { category: categoryFilter } : undefined)
      .then(setForms)
      .catch(() => setForms([]));
  }

  useEffect(load, [categoryFilter]);

  const filtered = useMemo(() => {
    if (!forms) return [];
    const q = search.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter(
      (f) => f.title.toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q)
    );
  }, [forms, search]);

  async function handleConvertGoogleForm() {
    if (!form.link.trim()) {
      setConversionStatus({
        success: false,
        message: 'Por favor, insira o link do formulário Google antes de converter.',
      });
      return;
    }
    setIsConverting(true);
    setConversionStatus(null);
    try {
      const res = await api.post<{
        success: boolean;
        title: string;
        description: string;
        questions: any[];
        count: number;
      }>('/api/forms/convert-google-form', { url: form.link });

      if (res && res.success) {
        setForm((prev) => ({
          ...prev,
          title: prev.title.trim() ? prev.title : (res.title || prev.title),
          description: prev.description.trim() ? prev.description : (res.description || prev.description),
          questions: res.questions || [],
        }));
        setConversionStatus({
          success: true,
          message: `Convertido com sucesso! ${res.count || 0} pergunta(s) importada(s) para execução nativa no Gestão.`,
          count: res.count,
        });
      }
    } catch (err) {
      setConversionStatus({
        success: false,
        message:
          err instanceof ApiError
            ? err.message
            : 'Falha ao converter formulário Google. Verifique se o formulário está acessível publicamente.',
      });
    } finally {
      setIsConverting(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setConversionStatus(null);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(f: FormItem) {
    setEditing(f);
    setForm({
      title: f.title,
      category: f.category,
      link: f.link || '',
      description: f.description || '',
      questions: f.questions || [],
    });
    setConversionStatus(
      f.questions && f.questions.length > 0
        ? {
            success: true,
            message: `Este formulário possui ${f.questions.length} pergunta(s) nativas cadastradas.`,
            count: f.questions.length,
          }
        : null
    );
    setError(null);
    setModalOpen(true);
  }

  async function submitForm() {
    if (!form.title.trim()) {
      setError('Nome do formulário é obrigatório.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      if (editing) await api.put(`/api/forms/${editing.id}`, form);
      else await api.post('/api/forms', form);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteForm(f: FormItem) {
    if (!confirm(`Excluir o formulário "${f.title}"?`)) return;
    await api.delete(`/api/forms/${f.id}`);
    load();
  }

  function copyLink(f: FormItem) {
    const url = `${window.location.origin}/f/${f.slug}`;
    navigator.clipboard.writeText(url).then(
      () => alert(`Link interno do formulário copiado!\n${url}`),
      () => prompt('Copie o link do formulário:', url)
    );
  }

  function openResponses(f: FormItem) {
    setResponsesModal(f);
    setResponses(null);
    setResponseSearch('');
    api
      .get<FormResponse[]>(`/api/forms/${f.id}/responses`)
      .then(setResponses)
      .catch(() => setResponses([]));
  }

  // Filtra e ordena as respostas do modal
  const filteredResponses = useMemo(() => {
    if (!responses) return [];
    let list = [...responses];

    if (responseSearch.trim()) {
      const q = responseSearch.toLowerCase().trim();
      list = list.filter((r) => {
        if (r.technician_name?.toLowerCase().includes(q)) return true;
        if (r.technician_email?.toLowerCase().includes(q)) return true;
        return Object.values(r.answers).some((val) =>
          typeof val === 'string'
            ? val.toLowerCase().includes(q)
            : Array.isArray(val) && val.some((x) => String(x).toLowerCase().includes(q))
        );
      });
    }

    list.sort((a, b) => {
      const tA = new Date(a.submitted_at).getTime() || 0;
      const tB = new Date(b.submitted_at).getTime() || 0;
      return responseSortNewest ? tB - tA : tA - tB;
    });

    return list;
  }, [responses, responseSearch, responseSortNewest]);

  // Estatísticas do formulário
  const stats = useMemo(() => {
    if (!responses) return { total: 0, techs: 0, photos: 0 };
    const techs = new Set(responses.map((r) => r.technician_name?.trim()).filter(Boolean)).size;
    let photos = 0;
    responses.forEach((r) => {
      Object.values(r.answers).forEach((v) => {
        if (isPhotoField(v)) photos += extractPhotoUrls(v).length;
      });
    });
    return { total: responses.length, techs, photos };
  }, [responses]);

  // Copia o resumo da resposta para a área de transferência
  function copyResponseSummary(r: FormResponse) {
    const lines = [
      `📋 RESPOSTA DE FORMULÁRIO`,
      `Técnico: ${r.technician_name || 'Anônimo'}`,
      `Data: ${formatSubmissionDate(r.submitted_at)}`,
      `---------------------------------`,
    ];
    Object.entries(r.answers).forEach(([k, v]) => {
      if (k.endsWith('_other') || k === 'form_slug') return;
      if (isPhotoField(v)) {
        const urls = extractPhotoUrls(v);
        lines.push(`${cleanLabel(k)}: ${urls.length} foto(s) anexada(s)`);
      } else {
        lines.push(`${cleanLabel(k)}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
      }
    });
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedId(r.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  // Lista dinâmica e ordenada de colunas para o Modo Planilha
  const dynamicColumns = useMemo(() => {
    if (!responses || responses.length === 0) return [];
    const keysSet = new Set<string>();

    responses.forEach((r) => {
      Object.keys(r.answers || {}).forEach((k) => {
        if (!k.endsWith('_other') && k !== 'form_slug') {
          keysSet.add(k);
        }
      });
    });

    const priorityOrder = [
      'número task toa',
      'numero task toa',
      'task toa',
      'rede hfc ou fibra',
      'hfc ou fibra',
      'nome do node ou rota de fibra',
      'node',
      'controle de wfc ( preenchimento interno )',
      'controle de wfc',
      'wfc',
      'fotos para evidência',
      'fotos para evidencia',
      'foto importante quando solicitado',
      'evidência',
      'evidencia',
      'tipo de ocorrência',
      'região / área',
      'região',
      'cidade / subcluster',
      'endereço / logradouro',
      'observações',
      'observação :'
    ];

    const allKeys = Array.from(keysSet);
    allKeys.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const idxA = priorityOrder.findIndex((p) => aLower.includes(p) || p.includes(aLower));
      const idxB = priorityOrder.findIndex((p) => bLower.includes(p) || p.includes(bLower));
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return allKeys;
  }, [responses]);

  function openEditResponse(r: FormResponse) {
    setEditingResponse(r);
    setEditTechName(r.technician_name || '');
    setEditTechEmail(r.technician_email || '');
    setEditAnswers({ ...(r.answers || {}) });
    setEditResponseError(null);
  }

  async function handleSaveResponse() {
    if (!editingResponse || !responsesModal) return;
    setIsSavingResponse(true);
    setEditResponseError(null);
    try {
      await api.put(`/api/forms/${responsesModal.id}/responses/${editingResponse.id}`, {
        technician_name: editTechName,
        technician_email: editTechEmail,
        answers: editAnswers,
      });

      // Atualiza em memória instantaneamente
      setResponses((prev) =>
        prev
          ? prev.map((item) =>
              item.id === editingResponse.id
                ? {
                    ...item,
                    technician_name: editTechName,
                    technician_email: editTechEmail,
                    answers: editAnswers,
                  }
                : item
            )
          : null
      );
      setEditingResponse(null);
    } catch (err) {
      setEditResponseError(err instanceof ApiError ? err.message : 'Erro ao salvar alterações da resposta.');
    } finally {
      setIsSavingResponse(false);
    }
  }

  async function handleDeleteResponse(r: FormResponse) {
    if (!responsesModal) return;
    if (!confirm(`Excluir a resposta #${r.id} de "${r.technician_name || 'Técnico'}"?`)) return;
    try {
      await api.delete(`/api/forms/${responsesModal.id}/responses/${r.id}`);
      setResponses((prev) => (prev ? prev.filter((item) => item.id !== r.id) : null));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao excluir resposta.');
    }
  }

  async function submitImport() {
    if (!responsesModal) return;
    if (!csvText.trim()) {
      setError('Cole os dados CSV para importar.');
      return;
    }
    setError(null);
    setIsImporting(true);
    try {
      const res = await api.post<{ imported: number }>(`/api/forms/${responsesModal.id}/responses/import`, {
        csv_data: csvText,
      });
      alert(`${res.imported} resposta(s) importada(s) com sucesso!`);
      setImportModalOpen(false);
      setCsvText('');
      openResponses(responsesModal);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao importar respostas.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Formulários"
        subtitle="Formulários de campo, links externos e respostas com evidências fotográficas"
        actions={
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" /> Cadastrar Formulário
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar formulário por nome ou descrição..."
            className="pl-11 rounded-full"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="sm:max-w-[220px]"
        >
          <option value="">Todas as categorias</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      {forms === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">
          Nenhum formulário cadastrado.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f) => {
            const qCount = f.questions_count ?? (f.questions ? f.questions.length : 0);
            return (
              <Card key={f.id} className="p-5 flex flex-col gap-3 animate-in hover:border-white/20 transition-all">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[var(--color-primary-dim)] text-[var(--color-primary)]">
                      {f.category}
                    </span>
                    {qCount > 0 ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 inline-flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        {qCount} pergunta{qCount > 1 ? 's' : ''} nativa{qCount > 1 ? 's' : ''}
                      </span>
                    ) : f.link ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        Link Externo
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canEdit && (
                      <button
                        onClick={() => openEdit(f)}
                        aria-label="Editar formulário"
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => deleteForm(f)}
                        aria-label="Excluir formulário"
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <h4 className="font-bold text-base leading-snug">{f.title}</h4>
                <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                  {f.description || 'Sem instruções adicionais.'}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-auto pt-3 border-t border-white/5">
                  <a
                    href={`/f/${f.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center gap-1 text-xs font-semibold text-[var(--color-text-muted)] hover:text-white hover:bg-white/[0.08] transition-colors"
                    title="Abrir e responder formulário no Gestão"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-blue-400" /> Abrir
                  </a>
                  <button
                    onClick={() => copyLink(f)}
                    className="h-9 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center gap-1 text-xs font-semibold text-[var(--color-text-muted)] hover:text-white hover:bg-white/[0.08] transition-colors"
                    title="Copiar link oficial do formulário para técnicos"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </button>
                  <button
                    onClick={() => openResponses(f)}
                    className="h-9 rounded-full bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/20 flex items-center justify-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/25 transition-colors"
                    title="Visualizar respostas e evidências"
                  >
                    <FileText className="w-3.5 h-3.5" /> Respostas
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Formulário' : 'Novo Formulário'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitForm} disabled={isSaving || isConverting}>
              {isSaving ? 'Salvando...' : 'Salvar Formulário'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}
        <Field label="Nome do Formulário">
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Ex: Formulário de Vistoria de Campo / POP"
          />
        </Field>
        <Field label="Categoria">
          <Select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Link do Google Forms (Conversão Nativa)"
          hint="Cole a URL pública do Google Forms e clique em 'Converter' para migrar todas as perguntas, opções e upload de fotos para o Gestão."
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={form.link}
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
              placeholder="https://forms.gle/... ou https://docs.google.com/forms/..."
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              disabled={isConverting || !form.link.trim()}
              onClick={handleConvertGoogleForm}
              className="whitespace-nowrap px-4 shrink-0 text-xs font-semibold border border-white/10 hover:border-white/20 bg-white/[0.04]"
            >
              {isConverting ? (
                <>Convertendo...</>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Converter Google Form
                </>
              )}
            </Button>
          </div>
        </Field>

        {conversionStatus && (
          <div
            className={`rounded-xl p-3 text-xs border mb-3 ${
              conversionStatus.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="font-semibold flex items-center gap-1.5">
              {conversionStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <X className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              {conversionStatus.message}
            </div>
            {conversionStatus.success && form.questions && form.questions.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-200/90 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                <span className="font-semibold text-emerald-300 block mb-1">
                  Estrutura importada ({form.questions.length} perguntas):
                </span>
                {form.questions.slice(0, 10).map((q, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] bg-black/20 px-2 py-1 rounded">
                    <span className="truncate max-w-[280px]">
                      {idx + 1}. {q.title}
                    </span>
                    <span className="uppercase text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      {q.type}
                    </span>
                  </div>
                ))}
                {form.questions.length > 10 && (
                  <div className="text-[10px] text-emerald-300/70 italic text-center pt-1">
                    + {form.questions.length - 10} outras perguntas incluídas...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <Field label="Descrição / Instruções de Preenchimento">
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
      </Modal>

      {/* MODAL DE RESPOSTAS — VISUALIZAÇÃO EM PLANILHA E CARTÕES DIDÁTICOS */}
      <Modal
        open={!!responsesModal}
        onClose={() => setResponsesModal(null)}
        title={`Respostas — ${responsesModal?.title || ''}`}
        maxWidth="max-w-[96vw] sm:max-w-7xl"
        footer={
          <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-[var(--color-text-faint)] flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>
                Mostrando <b>{filteredResponses.length}</b> de <b>{responses?.length || 0}</b> resposta(s)
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  setCsvText('');
                  setError(null);
                  setImportModalOpen(true);
                }}
              >
                <Upload className="w-4 h-4" /> Importar CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (responsesModal) window.location.href = `/api/forms/${responsesModal.id}/responses/export`;
                }}
              >
                <Download className="w-4 h-4" /> Exportar CSV
              </Button>
            </div>
          </div>
        }
      >
        {responses === null ? (
          <div className="py-12 text-center text-sm text-[var(--color-text-muted)] flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            <span>Carregando respostas enviadas...</span>
          </div>
        ) : responses.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto mb-3 text-[var(--color-text-faint)]">
              <FileText className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm text-white">Nenhuma resposta registrada</h4>
            <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto mt-1">
              Compartilhe o link do formulário com a equipe para receber vistorias e evidências.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* BARRA DE ESTATÍSTICAS DIDÁTICAS */}
            <div className="grid grid-cols-3 gap-2.5 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3 p-2 rounded-xl bg-black/20">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-dim)] text-[var(--color-primary)] flex items-center justify-center font-bold text-xs">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)]">
                    Total Envios
                  </p>
                  <p className="text-sm font-extrabold text-white">{stats.total}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2 rounded-xl bg-black/20">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)]">
                    Técnicos
                  </p>
                  <p className="text-sm font-extrabold text-white">{stats.techs}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2 rounded-xl bg-black/20">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-xs">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)]">
                    Fotos Anexadas
                  </p>
                  <p className="text-sm font-extrabold text-white">{stats.photos}</p>
                </div>
              </div>
            </div>

            {/* BARRA DE FILTRO, PESQUISA E ALTERNÂNCIA DE VISUALIZAÇÃO */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
                <Input
                  value={responseSearch}
                  onChange={(e) => setResponseSearch(e.target.value)}
                  placeholder="Pesquisar por técnico, WFC, node, task TOA, cidade ou termo..."
                  className="pl-9 h-9 text-xs rounded-xl"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Seletor de visualização (Planilha vs Cartões) */}
                <div className="flex items-center rounded-xl bg-white/[0.04] p-0.5 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setResponseViewMode('table')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      responseViewMode === 'table'
                        ? 'bg-[var(--color-primary)] text-white shadow-sm'
                        : 'text-[var(--color-text-muted)] hover:text-white'
                    }`}
                    title="Visualização tipo planilha"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span>Planilha</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseViewMode('cards')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      responseViewMode === 'cards'
                        ? 'bg-[var(--color-primary)] text-white shadow-sm'
                        : 'text-[var(--color-text-muted)] hover:text-white'
                    }`}
                    title="Visualização em cartões"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Cartões</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setResponseSortNewest(!responseSortNewest)}
                  className="h-8 px-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs font-semibold text-[var(--color-text-muted)] hover:text-white flex items-center gap-1.5 transition-colors shrink-0"
                  title="Alternar ordenação por data"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>{responseSortNewest ? 'Mais recentes' : 'Mais antigos'}</span>
                </button>
              </div>
            </div>

            {/* CONTEÚDO PRINCIPAL: MODO PLANILHA OU MODO CARTÕES */}
            {filteredResponses.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--color-text-muted)] rounded-2xl bg-white/[0.02] border border-white/5">
                Nenhum registro encontrado para a busca "{responseSearch}".
              </div>
            ) : responseViewMode === 'table' ? (
              /* MODO PLANILHA (TABELA INTERATIVA COM BOTÃO EDITAR) */
              <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden shadow-xl">
                <div className="overflow-x-auto max-h-[58vh]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 z-20 bg-[#0d121d] border-b border-white/10 text-[var(--color-text-faint)] uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="py-3 px-3 w-28 text-center sticky left-0 z-30 bg-[#0d121d] border-r border-white/10 shadow-[2px_0_6px_rgba(0,0,0,0.4)]">
                          Ações
                        </th>
                        <th className="py-3 px-3 whitespace-nowrap">ID</th>
                        <th className="py-3 px-3 whitespace-nowrap">Data / Hora</th>
                        <th className="py-3 px-3 whitespace-nowrap">Técnico</th>
                        <th className="py-3 px-3 whitespace-nowrap">E-mail</th>
                        {dynamicColumns.map((colKey) => {
                          const isWfc = colKey.toLowerCase().includes('wfc');
                          return (
                            <th
                              key={colKey}
                              className={`py-3 px-3 whitespace-nowrap ${
                                isWfc
                                  ? 'bg-amber-500/10 text-amber-300 font-extrabold border-x border-amber-500/20'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                {isWfc && <ShieldCheck className="w-3 h-3 text-amber-400" />}
                                <span>{cleanLabel(colKey)}</span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredResponses.map((r) => {
                        return (
                          <tr key={r.id} className="hover:bg-white/[0.04] transition-colors group">
                            {/* Ações sticky com botão Editar */}
                            <td className="py-2.5 px-3 sticky left-0 z-10 bg-[#0a0e17] group-hover:bg-[#121824] border-r border-white/10 shadow-[2px_0_6px_rgba(0,0,0,0.4)] text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditResponse(r)}
                                  className="h-7 px-2.5 rounded-lg bg-[var(--color-primary-dim)] hover:bg-[var(--color-primary)] text-[var(--color-primary)] hover:text-white text-xs font-semibold flex items-center gap-1 border border-[var(--color-primary)]/30 transition-all shadow-sm"
                                  title="Editar informações / Controle de WFC"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Editar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteResponse(r)}
                                  className="w-7 h-7 rounded-lg text-[var(--color-text-faint)] hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors"
                                  title="Excluir resposta"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>

                            <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--color-text-faint)]">
                              #{r.id}
                            </td>

                            <td className="py-2.5 px-3 whitespace-nowrap text-[var(--color-text-muted)]">
                              {formatSubmissionDate(r.submitted_at)}
                            </td>

                            <td className="py-2.5 px-3 whitespace-nowrap font-bold text-white">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-md bg-[var(--color-primary-dim)] text-[var(--color-primary)] flex items-center justify-center text-[10px] font-extrabold">
                                  {(r.technician_name || 'T')[0].toUpperCase()}
                                </div>
                                <span>{r.technician_name || 'Anônimo'}</span>
                              </div>
                            </td>

                            <td className="py-2.5 px-3 whitespace-nowrap text-[var(--color-text-faint)] text-[11px]">
                              {r.technician_email || '-'}
                            </td>

                            {dynamicColumns.map((colKey) => {
                              const rawVal = r.answers[colKey];
                              const isWfc = colKey.toLowerCase().includes('wfc');
                              const isHfc = colKey.toLowerCase().includes('hfc');
                              const isPhoto = isPhotoField(rawVal);

                              if (isWfc) {
                                const strVal = String(rawVal || '').trim();
                                return (
                                  <td
                                    key={colKey}
                                    className="py-2.5 px-3 whitespace-nowrap bg-amber-500/[0.03] border-x border-amber-500/15"
                                  >
                                    {strVal ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30 text-xs shadow-sm">
                                          <ShieldCheck className="w-3 h-3 text-amber-400 shrink-0" />
                                          <span>{strVal}</span>
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => openEditResponse(r)}
                                          className="text-[var(--color-text-faint)] hover:text-amber-300 p-1 rounded"
                                          title="Editar WFC"
                                        >
                                          <Pencil className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => openEditResponse(r)}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-amber-400/80 hover:text-amber-200 bg-amber-500/5 hover:bg-amber-500/15 border border-dashed border-amber-500/30 transition-colors"
                                        title="Clique para preencher WFC interno"
                                      >
                                        <Plus className="w-3 h-3" />
                                        <span>Preencher WFC</span>
                                      </button>
                                    )}
                                  </td>
                                );
                              }

                              if (isHfc) {
                                const strVal = String(rawVal || '').trim();
                                return (
                                  <td key={colKey} className="py-2.5 px-3 whitespace-nowrap">
                                    {strVal.toUpperCase() === 'HFC' ? (
                                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-bold border border-blue-500/30 text-[11px]">
                                        HFC
                                      </span>
                                    ) : strVal.toUpperCase() === 'FIBRA' ? (
                                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30 text-[11px]">
                                        Fibra
                                      </span>
                                    ) : (
                                      <span className="text-white/80">{strVal || '-'}</span>
                                    )}
                                  </td>
                                );
                              }

                              if (isPhoto) {
                                const urls = extractPhotoUrls(rawVal);
                                return (
                                  <td key={colKey} className="py-2.5 px-3 whitespace-nowrap">
                                    {urls.length === 0 ? (
                                      <span className="text-[var(--color-text-faint)]">-</span>
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        {urls.slice(0, 3).map((u, i) => (
                                          <img
                                            key={i}
                                            src={u}
                                            alt="Evidência"
                                            onClick={() => setPreviewPhotoUrl(u)}
                                            className="w-7 h-7 rounded object-cover border border-white/20 hover:scale-110 transition-transform cursor-pointer shadow-sm"
                                            title="Clique para ampliar foto"
                                          />
                                        ))}
                                        {urls.length > 3 && (
                                          <span className="text-[10px] font-bold text-[var(--color-text-faint)]">
                                            +{urls.length - 3}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              }

                              const strVal = Array.isArray(rawVal) ? rawVal.join(', ') : String(rawVal || '');
                              return (
                                <td
                                  key={colKey}
                                  className="py-2.5 px-3 whitespace-nowrap max-w-[240px] truncate text-white/90"
                                  title={strVal}
                                >
                                  {strVal.trim() || '-'}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* MODO CARTÕES DIDÁTICOS */
              <div className="space-y-4 max-h-[58vh] overflow-y-auto pr-1">
                {filteredResponses.map((r) => {
                  const photoSections: { key: string; label: string; urls: string[] }[] = [];
                  const textSections: { key: string; label: string; value: string }[] = [];

                  Object.entries(r.answers).forEach(([k, v]) => {
                    if (k.endsWith('_other') || k === 'form_slug') return;
                    if (isPhotoField(v)) {
                      const urls = extractPhotoUrls(v);
                      if (urls.length > 0) {
                        photoSections.push({
                          key: k,
                          label: cleanLabel(k),
                          urls,
                        });
                      }
                    } else {
                      const valStr = Array.isArray(v) ? v.join(', ') : String(v || '');
                      if (valStr.trim()) {
                        textSections.push({
                          key: k,
                          label: cleanLabel(k),
                          value: valStr.trim(),
                        });
                      }
                    }
                  });

                  return (
                    <Card
                      key={r.id}
                      className="p-5 flex flex-col gap-4 border border-white/10 hover:border-white/20 transition-all rounded-2xl bg-black/40 shadow-lg"
                    >
                      {/* HEADER DO CARD COM BOTÃO EDITAR */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-primary-dim)] to-white/5 border border-white/10 flex items-center justify-center text-sm font-bold text-white shadow-inner">
                            {(r.technician_name || 'T')[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm text-white">{r.technician_name || 'Técnico Anônimo'}</h4>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-[var(--color-text-faint)] border border-white/10">
                                #{r.id}
                              </span>
                            </div>
                            {r.technician_email && (
                              <p className="text-[11px] text-[var(--color-text-faint)]">{r.technician_email}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-faint)] bg-white/[0.02] border border-white/5 px-2.5 py-1 rounded-full">
                            <Calendar className="w-3 h-3 text-[var(--color-primary)]" />
                            <span>{formatSubmissionDate(r.submitted_at)}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => openEditResponse(r)}
                            className="h-7 px-2.5 rounded-full bg-[var(--color-primary-dim)] hover:bg-[var(--color-primary)] text-[var(--color-primary)] hover:text-white border border-[var(--color-primary)]/30 text-[11px] font-semibold flex items-center gap-1 transition-all"
                            title="Editar resposta"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => copyResponseSummary(r)}
                            className="h-7 px-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-white flex items-center gap-1 transition-colors"
                            title="Copiar dados desta resposta"
                          >
                            {copiedId === r.id ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* GRADE DE CAMPOS */}
                      {textSections.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {textSections.map(({ key, label, value }) => {
                            const isAddress = label.toLowerCase().includes('endereço') || label.toLowerCase().includes('rua');
                            const isWfc = label.toLowerCase().includes('wfc');
                            const isHfc = label.toLowerCase().includes('hfc');

                            return (
                              <div
                                key={key}
                                className={`p-3 rounded-xl border flex flex-col justify-between ${
                                  isWfc
                                    ? 'bg-amber-500/10 border-amber-500/30'
                                    : 'bg-white/[0.02] border-white/5'
                                } ${isAddress ? 'sm:col-span-2 lg:col-span-2' : ''}`}
                              >
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1 ${
                                    isWfc ? 'text-amber-300' : 'text-[var(--color-text-faint)]'
                                  }`}
                                >
                                  {isWfc ? <ShieldCheck className="w-3 h-3 text-amber-400" /> : null}
                                  {isAddress ? <MapPin className="w-3 h-3 text-cyan-400" /> : null}
                                  {label}
                                </span>
                                <span className="text-xs font-semibold text-white/90 break-words">
                                  {isHfc && value.toUpperCase() === 'HFC' ? (
                                    <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[11px]">
                                      HFC
                                    </span>
                                  ) : isHfc && value.toUpperCase() === 'FIBRA' ? (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px]">
                                      Fibra
                                    </span>
                                  ) : (
                                    value
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* SEÇÃO DE FOTOS COM ACCORDION */}
                      {photoSections.map((sec) => (
                        <div key={sec.key} className="pt-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <Camera className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                              <span>{sec.label}</span>
                            </span>
                            <span className="text-[11px] text-[var(--color-text-faint)] font-medium">
                              {sec.urls.length} foto{sec.urls.length > 1 ? 's' : ''} anexada{sec.urls.length > 1 ? 's' : ''}
                            </span>
                          </div>

                          <AccordionGallery
                            images={sec.urls.map((url, uIdx) => ({
                              url,
                              title: `${sec.label} · Foto ${uIdx + 1}`,
                              subtitle: `${r.technician_name || 'Técnico'} — ${formatSubmissionDate(r.submitted_at)}`,
                              description: `Evidência registrada no formulário ${responsesModal?.title || 'Inspeção'}`,
                            }))}
                            height="h-56 sm:h-64"
                          />
                        </div>
                      ))}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL DE EDIÇÃO DE RESPOSTA — COM CONTROLE DE WFC E DEMAIS INFORMAÇÕES */}
      <Modal
        open={!!editingResponse}
        onClose={() => setEditingResponse(null)}
        title={`Editar Resposta #${editingResponse?.id || ''}`}
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingResponse(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveResponse} disabled={isSavingResponse}>
              {isSavingResponse ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </>
        }
      >
        {editResponseError && (
          <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {editResponseError}
          </div>
        )}

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* Card Especial de Destaque: Controle de WFC (Preenchimento interno) */}
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wide">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                Controle de WFC ( Preenchimento interno )
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Uso Interno
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Insira ou atualize o código / status de controle de WFC para esta vistoria.
            </p>
            <Input
              value={String(
                editAnswers['Controle de WFC ( Preenchimento interno )'] ||
                  editAnswers['Controle de WFC'] ||
                  editAnswers['WFC'] ||
                  ''
              )}
              onChange={(e) =>
                setEditAnswers((prev) => ({
                  ...prev,
                  'Controle de WFC ( Preenchimento interno )': e.target.value,
                }))
              }
              placeholder="Ex: WFC-2026-9842 / Aprovado / Em Análise"
              className="border-amber-500/40 focus:border-amber-400 bg-amber-950/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nome do Técnico">
              <Input
                value={editTechName}
                onChange={(e) => setEditTechName(e.target.value)}
                placeholder="Nome completo do técnico"
              />
            </Field>

            <Field label="E-mail">
              <Input
                value={editTechEmail}
                onChange={(e) => setEditTechEmail(e.target.value)}
                placeholder="email@claro.com.br"
              />
            </Field>
          </div>

          {/* Mudança 1: Rede HFC ou Fibra */}
          <Field label="Rede HFC ou Fibra">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.02]">
                <input
                  type="radio"
                  name="edit_hfc_fibra"
                  value="HFC"
                  checked={String(editAnswers['Rede HFC ou Fibra'] || editAnswers['HFC ou Fibra'] || '').toUpperCase() === 'HFC'}
                  onChange={() =>
                    setEditAnswers((prev) => ({
                      ...prev,
                      'Rede HFC ou Fibra': 'HFC',
                    }))
                  }
                  className="w-4 h-4 accent-blue-500"
                />
                <span className="text-xs font-bold text-blue-400">HFC</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.02]">
                <input
                  type="radio"
                  name="edit_hfc_fibra"
                  value="Fibra"
                  checked={String(editAnswers['Rede HFC ou Fibra'] || editAnswers['HFC ou Fibra'] || '').toUpperCase() === 'FIBRA'}
                  onChange={() =>
                    setEditAnswers((prev) => ({
                      ...prev,
                      'Rede HFC ou Fibra': 'Fibra',
                    }))
                  }
                  className="w-4 h-4 accent-emerald-500"
                />
                <span className="text-xs font-bold text-emerald-400">Fibra</span>
              </label>
            </div>
          </Field>

          {/* Mudança 2: Nome do Node ou rota de fibra */}
          <Field label="Nome do Node ou rota de fibra">
            <Input
              value={String(
                editAnswers['Nome do Node ou rota de fibra'] ||
                  editAnswers['Node'] ||
                  editAnswers['Rota de fibra'] ||
                  ''
              )}
              onChange={(e) =>
                setEditAnswers((prev) => ({
                  ...prev,
                  'Nome do Node ou rota de fibra': e.target.value,
                }))
              }
              placeholder="Ex: NODE-CG04 / ROTA-FIBRA-NORTE"
            />
          </Field>

          {/* Número task TOA */}
          <Field label="Número task TOA">
            <Input
              value={String(
                editAnswers['Número task TOA'] ||
                  editAnswers['numero task TOA'] ||
                  editAnswers['Task TOA'] ||
                  ''
              )}
              onChange={(e) =>
                setEditAnswers((prev) => ({
                  ...prev,
                  'Número task TOA': e.target.value,
                }))
              }
              placeholder="Ex: 84920412"
            />
          </Field>

          {/* Demais respostas dinâmicas cadastradas */}
          {Object.entries(editAnswers).map(([k, v]) => {
            if (
              k.endsWith('_other') ||
              k === 'form_slug' ||
              k === 'Controle de WFC ( Preenchimento interno )' ||
              k === 'Controle de WFC' ||
              k === 'WFC' ||
              k === 'Rede HFC ou Fibra' ||
              k === 'HFC ou Fibra' ||
              k === 'Nome do Node ou rota de fibra' ||
              k === 'Node' ||
              k === 'Rota de fibra' ||
              k === 'Número task TOA' ||
              k === 'numero task TOA' ||
              k === 'Task TOA'
            ) {
              return null;
            }

            if (isPhotoField(v)) {
              const urls = extractPhotoUrls(v);
              return (
                <div key={k} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] block mb-2">
                    {cleanLabel(k)} ({urls.length} fotos anexadas)
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {urls.map((u, i) => (
                      <img
                        key={i}
                        src={u}
                        alt="Foto"
                        onClick={() => setPreviewPhotoUrl(u)}
                        className="w-12 h-12 rounded-lg object-cover border border-white/20 hover:scale-105 transition-transform cursor-pointer"
                        title="Ampliar foto"
                      />
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <Field key={k} label={cleanLabel(k)}>
                <Input
                  value={Array.isArray(v) ? v.join(', ') : String(v || '')}
                  onChange={(e) =>
                    setEditAnswers((prev) => ({
                      ...prev,
                      [k]: e.target.value,
                    }))
                  }
                />
              </Field>
            );
          })}
        </div>
      </Modal>

      {/* MODAL LIGHTBOX DE FOTO EM TELA CHEIA */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-black/90 border border-white/20 rounded-2xl overflow-hidden p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/20 transition-all z-10"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewPhotoUrl}
              alt="Visualização de evidência"
              className="max-h-[82vh] w-auto mx-auto object-contain rounded-xl"
            />
            <div className="p-2 text-center">
              <a
                href={previewPhotoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--color-primary)] hover:underline inline-flex items-center gap-1 font-semibold"
              >
                Abrir imagem em alta resolução <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE IMPORTAÇÃO CSV */}
      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Importar Respostas (CSV)"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitImport} disabled={isImporting}>
              {isImporting ? 'Importando...' : 'Processar e Salvar'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          Cole abaixo os dados em formato CSV (com cabeçalho na primeira linha) exportados do Google Forms ou planilha de campo.
        </p>
        <Field label="Conteúdo CSV">
          <Textarea
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Carimbo de data/hora,Endereço de e-mail,Nome do Técnico,Cidade..."
            className="font-mono text-xs"
          />
        </Field>
      </Modal>
    </div>
  );
}