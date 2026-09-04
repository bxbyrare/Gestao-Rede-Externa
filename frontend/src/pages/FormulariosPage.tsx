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
  Filter
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';
import AccordionGallery from '../components/AccordionGallery';

interface FormItem {
  id: number;
  title: string;
  slug: string;
  category: string;
  description: string | null;
  link: string | null;
  created_at: string;
}

interface FormResponse {
  id: number;
  technician_name: string;
  technician_email: string;
  answers: Record<string, string | string[]>;
  submitted_at: string;
}

const CATEGORIES = ['Inspeção', 'Vistoria', 'Rede Externa', 'Técnico', 'Relatório', 'Outros'];
const emptyForm = { title: '', category: 'Inspeção', link: '', description: '' };

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
  // Se for tudo maiúsculo, converte para Title Case agradável
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
      value.startsWith('http') && value.match(/\.(png|jpg|jpeg|webp|gif)$/i) !== null ||
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
  const [forms, setForms] = useState<FormItem[] | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FormItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [responsesModal, setResponsesModal] = useState<FormItem | null>(null);
  const [responses, setResponses] = useState<FormResponse[] | null>(null);
  const [responseSearch, setResponseSearch] = useState('');
  const [responseSortNewest, setResponseSortNewest] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

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

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(f: FormItem) {
    setEditing(f);
    setForm({ title: f.title, category: f.category, link: f.link || '', description: f.description || '' });
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
    const url =
      f.link && (f.link.startsWith('http://') || f.link.startsWith('https://'))
        ? f.link
        : `${window.location.origin}/f/${f.slug}`;
    navigator.clipboard.writeText(url).then(
      () => alert('Link copiado para a área de transferência!'),
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
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Cadastrar Formulário
          </Button>
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
          {filtered.map((f) => (
            <Card key={f.id} className="p-5 flex flex-col gap-3 animate-in hover:border-white/20 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[var(--color-primary-dim)] text-[var(--color-primary)]">
                  {f.category}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(f)}
                    aria-label="Editar formulário"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteForm(f)}
                    aria-label="Excluir formulário"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <h4 className="font-bold text-base leading-snug">{f.title}</h4>
              <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                {f.description || 'Sem instruções adicionais.'}
              </p>
              <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
                <button
                  onClick={() => copyLink(f)}
                  className="flex-1 h-9 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07] transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar Link
                </button>
                <button
                  onClick={() => openResponses(f)}
                  className="flex-1 h-9 rounded-full bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/20 flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/25 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" /> Respostas
                </button>
              </div>
            </Card>
          ))}
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
            <Button onClick={submitForm} disabled={isSaving}>
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
          label="Link do Google Forms (opcional)"
          hint="Cole um link do Google Forms para copiar as perguntas automaticamente — o formulário precisa estar com acesso público."
        >
          <Input
            value={form.link}
            onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
            placeholder="https://forms.gle/... ou docs.google.com/forms/..."
          />
        </Field>
        <Field label="Descrição / Instruções de Preenchimento">
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
      </Modal>

      {/* MODAL DE RESPOSTAS — DESIGN DIDÁTICO E ACCORDION GALLERY */}
      <Modal
        open={!!responsesModal}
        onClose={() => setResponsesModal(null)}
        title={`Respostas — ${responsesModal?.title || ''}`}
        maxWidth="max-w-5xl"
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

            {/* BARRA DE FILTRO & PESQUISA */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
                <Input
                  value={responseSearch}
                  onChange={(e) => setResponseSearch(e.target.value)}
                  placeholder="Pesquisar por técnico, cidade, endereço ou termo..."
                  className="pl-9 h-9 text-xs rounded-xl"
                />
              </div>
              <button
                type="button"
                onClick={() => setResponseSortNewest(!responseSortNewest)}
                className="h-9 px-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs font-semibold text-[var(--color-text-muted)] hover:text-white flex items-center gap-1.5 transition-colors shrink-0"
                title="Alternar ordenação"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>{responseSortNewest ? 'Mais recentes' : 'Mais antigos'}</span>
              </button>
            </div>

            {/* LISTA DE RESPOSTAS */}
            <div className="space-y-4 max-h-[58vh] overflow-y-auto pr-1">
              {filteredResponses.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--color-text-muted)] rounded-2xl bg-white/[0.02] border border-white/5">
                  Nenhum registro encontrado para a busca "{responseSearch}".
                </div>
              ) : (
                filteredResponses.map((r, rIdx) => {
                  // Separar perguntas em: Fotos, Informações Principais, Textos/Observações
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
                      {/* HEADER DO CARD DA RESPOSTA */}
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

                      {/* GRADE DE CAMPOS E RESPOSTAS DIDÁTICAS */}
                      {textSections.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {textSections.map(({ key, label, value }) => {
                            const isAddress = label.toLowerCase().includes('endereço') || label.toLowerCase().includes('rua');
                            const isCity = label.toLowerCase().includes('cidade') || label.toLowerCase().includes('cluster') || label.toLowerCase().includes('bairro');

                            return (
                              <div
                                key={key}
                                className={`p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between ${
                                  isAddress ? 'sm:col-span-2 lg:col-span-2' : ''
                                }`}
                              >
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] mb-1 flex items-center gap-1">
                                  {isAddress ? <MapPin className="w-3 h-3 text-cyan-400" /> : null}
                                  {label}
                                </span>
                                <span className="text-xs font-semibold text-white/90 break-words">
                                  {value}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* SEÇÃO DE EVIDÊNCIAS FOTOGRÁFICAS — ACCORDION GALLERY */}
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
                              description: `Evidência registrada no formulário ${responsesModal.title}`,
                            }))}
                            height="h-56 sm:h-64"
                          />
                        </div>
                      ))}
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        )}
      </Modal>

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