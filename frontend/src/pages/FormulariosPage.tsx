import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, FileText, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';

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
  answers: Record<string, string>;
  submitted_at: string;
}

const CATEGORIES = ['Inspeção', 'Vistoria', 'Rede Externa', 'Técnico', 'Relatório', 'Outros'];
const emptyForm = { title: '', category: 'Inspeção', link: '', description: '' };

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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  function load() {
    api.get<FormItem[]>('/api/forms', categoryFilter ? { category: categoryFilter } : undefined).then(setForms).catch(() => setForms([]));
  }

  useEffect(load, [categoryFilter]);

  const filtered = useMemo(() => {
    if (!forms) return [];
    const q = search.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter((f) => f.title.toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q));
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
    if (!form.title.trim()) { setError('Nome do formulário é obrigatório.'); return; }
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
    const url = f.link && (f.link.startsWith('http://') || f.link.startsWith('https://')) ? f.link : `${window.location.origin}/f/${f.slug}`;
    navigator.clipboard.writeText(url).then(
      () => alert('Link copiado para a área de transferência!'),
      () => prompt('Copie o link do formulário:', url)
    );
  }

  function openResponses(f: FormItem) {
    setResponsesModal(f);
    setResponses(null);
    api.get<FormResponse[]>(`/api/forms/${f.id}/responses`).then(setResponses).catch(() => setResponses([]));
  }

  async function submitImport() {
    if (!responsesModal) return;
    if (!csvText.trim()) { setError('Cole os dados CSV para importar.'); return; }
    setError(null);
    setIsImporting(true);
    try {
      const res = await api.post<{ imported: number }>(`/api/forms/${responsesModal.id}/responses/import`, { csv_data: csvText });
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
        subtitle="Formulários de campo, links externos e respostas"
        actions={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Cadastrar Formulário
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar formulário por nome ou descrição..." className="pl-11 rounded-full" />
        </div>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="sm:max-w-[220px]">
          <option value="">Todas as categorias</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>

      {forms === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhum formulário cadastrado.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f) => (
            <Card key={f.id} className="p-5 flex flex-col gap-3 animate-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[var(--color-primary-dim)] text-[var(--color-primary)]">{f.category}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(f)} aria-label="Editar formulário" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteForm(f)} aria-label="Excluir formulário" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <h4 className="font-bold text-base leading-snug">{f.title}</h4>
              <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">{f.description || 'Sem instruções adicionais.'}</p>
              <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
                <button onClick={() => copyLink(f)} className="flex-1 h-9 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07] transition-colors">
                  <Copy className="w-3.5 h-3.5" /> Copiar Link
                </button>
                <button onClick={() => openResponses(f)} className="flex-1 h-9 rounded-full bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/20 flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/25 transition-colors">
                  <FileText className="w-3.5 h-3.5" /> Respostas
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Formulário' : 'Novo Formulário'}
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button><Button onClick={submitForm} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Formulário'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Nome do Formulário">
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex: Formulário de Vistoria de Campo / POP" />
        </Field>
        <Field label="Categoria">
          <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Link do Google Forms (opcional)" hint="Cole um link do Google Forms para copiar as perguntas automaticamente — o formulário precisa estar com acesso público.">
          <Input value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} placeholder="https://forms.gle/... ou docs.google.com/forms/..." />
        </Field>
        <Field label="Descrição / Instruções de Preenchimento">
          <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
      </Modal>

      <Modal
        open={!!responsesModal}
        onClose={() => setResponsesModal(null)}
        title={`Respostas — ${responsesModal?.title || ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setCsvText(''); setError(null); setImportModalOpen(true); }}><Upload className="w-4 h-4" /> Importar CSV</Button>
            <Button variant="outline" onClick={() => { if (responsesModal) window.location.href = `/api/forms/${responsesModal.id}/responses/export`; }}><Download className="w-4 h-4" /> Exportar CSV</Button>
          </>
        }
      >
        {responses === null ? (
          <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
        ) : responses.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Nenhuma resposta registrada ainda.</p>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {responses.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{r.technician_name}</span>
                  <span className="text-[11px] text-[var(--color-text-faint)]">{r.submitted_at}</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(r.answers).map(([k, v]) => (
                    <div key={k} className="text-xs flex gap-2">
                      <span className="text-[var(--color-text-faint)] shrink-0">{k}:</span>
                      <span className="text-[var(--color-text-muted)]">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Importar Respostas (CSV)"
        footer={<><Button variant="ghost" onClick={() => setImportModalOpen(false)}>Cancelar</Button><Button onClick={submitImport} disabled={isImporting}>{isImporting ? 'Processando...' : 'Processar Importação'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Subir arquivo (.csv)" hint="Google Forms: Respostas → planilha → Arquivo → Fazer download → Valores separados por vírgula (.csv). Preenche o campo abaixo automaticamente.">
          <input
            type="file"
            accept=".csv,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setCsvText(String(reader.result || ''));
              reader.readAsText(file, 'utf-8');
            }}
            className="w-full text-sm text-[var(--color-text-muted)] file:mr-3 file:h-9 file:px-4 file:rounded-full file:border-0 file:bg-white/[0.06] file:text-[var(--color-text)] file:text-sm"
          />
        </Field>
        <Field label="Ou cole os dados CSV">
          <Textarea rows={8} value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="Cabeçalho;Coluna2;Coluna3&#10;Valor1;Valor2;Valor3" />
        </Field>
      </Modal>
    </div>
  );
}
