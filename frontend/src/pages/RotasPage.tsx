import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { ChevronRight, Copy, Download, Eye, File, FolderOpen, FolderPlus, Home, Pencil, Plus, Search, Trash2, Upload, Route as RouteIcon } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { RouteFile, RouteFolder, RouteItem, RouteLine } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';

const emptyRouteForm = { name: '', type: 'Empresarial', description: '' };
const emptyLineForm = { stretch_name: '', pop_box: '', cable_type: '', notes: '', address: '' };

interface Crumb { id: number | null; name: string }

function formatBytes(n?: number | null) {
  if (!n || isNaN(Number(n))) return '0 B';
  const num = Number(n);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RotasPage() {
  const [routes, setRoutes] = useState<RouteItem[] | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<RouteItem | null>(null);

  const [routeModalOpen, setRouteModalOpen] = useState(false);
    const [viewingRoute, setViewingRoute] = useState<RouteItem | null>(null);

  function openViewRoute(r: RouteItem, e: MouseEvent) {
    e.stopPropagation();
    setViewingRoute(r);
  }

  function copyRouteDesc(r: RouteItem) {
    const text = `*ROTA: ${r.name}* (${r.type})\n\n${r.description || 'Sem descrição.'}`;
    navigator.clipboard.writeText(text);
    alert('Descrição copiada!');
  }
  const [editingRoute, setEditingRoute] = useState<RouteItem | null>(null);
  const [routeForm, setRouteForm] = useState(emptyRouteForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function loadRoutes() {
    api.get<RouteItem[]>('/api/routes', typeFilter ? { type: typeFilter } : undefined).then(setRoutes).catch(() => setRoutes([]));
  }
  useEffect(loadRoutes, [typeFilter]);

  function openCreateRoute() {
    setEditingRoute(null);
    setRouteForm(emptyRouteForm);
    setError(null);
    setRouteModalOpen(true);
  }
  function openEditRoute(r: RouteItem, e: MouseEvent) {
    e.stopPropagation();
    setEditingRoute(r);
    setRouteForm({ name: r.name, type: r.type, description: r.description || '' });
    setError(null);
    setRouteModalOpen(true);
  }
  async function submitRoute() {
    if (!routeForm.name.trim()) { setError('Nome da rota é obrigatório.'); return; }
    setError(null);
    setIsSaving(true);
    try {
      if (editingRoute) await api.put(`/api/routes/${editingRoute.id}`, routeForm);
      else await api.post('/api/routes', routeForm);
      setRouteModalOpen(false);
      loadRoutes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }
  async function deleteRoute(r: RouteItem, e: MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Excluir a rota "${r.name}"? Todas as medições e arquivos serão perdidos.`)) return;
    await api.delete(`/api/routes/${r.id}`);
    loadRoutes();
  }

  if (selectedRoute) {
    return <RouteDetail route={selectedRoute} onBack={() => { setSelectedRoute(null); loadRoutes(); }} />;
  }

  const filteredRoutes = (routes || []).filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q);
  });

  return (
    <div>
      <PageHeader
        title="Rotas"
        subtitle="Medições de rotas e arquivos técnicos por trecho"
        actions={<Button onClick={openCreateRoute}><Plus className="w-4 h-4" /> Nova Rota</Button>}
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar rota por nome ou descrição..." className="pl-11 rounded-full" />
        </div>
        <div className="flex gap-2">
          {['', 'Empresarial', 'Residencial'].map((t) => (
            <button
              key={t || 'all'}
              onClick={() => setTypeFilter(t)}
              className={`h-10 px-5 rounded-full text-sm font-bold transition-colors ${typeFilter === t ? 'bg-[var(--color-primary-dim)] text-[var(--color-primary)] border border-[var(--color-primary)]/30' : 'bg-white/[0.03] border border-white/10 text-[var(--color-text-muted)]'}`}
            >
              {t || 'Todas'}
            </button>
          ))}
        </div>
      </div>

      {routes === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : filteredRoutes.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">{search ? 'Nenhuma rota encontrada para essa busca.' : 'Nenhuma rota cadastrada.'}</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRoutes.map((r) => (
            <Card key={r.id} className="p-5 flex flex-col gap-2 cursor-pointer animate-in hover:border-white/20 transition-colors" onClick={() => setSelectedRoute(r)}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[var(--color-accent-dim)] text-[var(--color-accent)]">{r.type}</span>
                <div className="flex items-center gap-1">
                  <button onClick={(e) => openViewRoute(r, e)} aria-label="Visualizar descrição" title="Visualizar descrição" className="w-8 h-8 rounded-full flex items-center justify-center text-[#60a5fa] bg-[#3b82f6]/10 border border-[#3b82f6]/30 hover:bg-[#3b82f6]/20 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                  <button onClick={(e) => openEditRoute(r, e)} aria-label="Editar rota" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={(e) => deleteRoute(r, e)} aria-label="Excluir rota" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <h4 className="font-bold text-base flex items-center gap-2"><RouteIcon className="w-4 h-4 text-[var(--color-text-faint)]" /> {r.name}</h4>
              {r.description && <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">{r.description}</p>}
              <div className="text-[11px] text-[var(--color-text-faint)] mt-auto pt-2 border-t border-white/5">{r.lines_count} medição(ões) · {r.created_at_fmt}</div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!viewingRoute}
        onClose={() => setViewingRoute(null)}
        title={viewingRoute ? `Rota: ${viewingRoute.name}` : ''}
        footer={
          <div className="flex items-center justify-between w-full">
            {viewingRoute && (
              <Button variant="outline" onClick={() => copyRouteDesc(viewingRoute)}>
                <Copy className="w-4 h-4" /> Copiar Descrição
              </Button>
            )}
            <Button onClick={() => setViewingRoute(null)}>Fechar</Button>
          </div>
        }
      >
        {viewingRoute && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[var(--color-accent-dim)] text-[var(--color-accent)]">{viewingRoute.type}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{viewingRoute.lines_count} medição(ões)</span>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-faint)] block mb-2">Descrição Técnica da Rota</label>
              <div className="p-4 rounded-xl bg-[#111115] border border-white/10 text-slate-100 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                {viewingRoute.description || 'Nenhuma descrição detalhada informada para esta rota.'}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={routeModalOpen}
        onClose={() => setRouteModalOpen(false)}
        title={editingRoute ? 'Editar Rota' : 'Nova Rota'}
        footer={<><Button variant="ghost" onClick={() => setRouteModalOpen(false)}>Cancelar</Button><Button onClick={submitRoute} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Nome da Rota">
          <Input value={routeForm.name} onChange={(e) => setRouteForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Tipo">
          <Select value={routeForm.type} onChange={(e) => setRouteForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="Empresarial">Empresarial</option>
            <option value="Residencial">Residencial</option>
          </Select>
        </Field>
        <Field label="Descrição">
          <Textarea rows={3} value={routeForm.description} onChange={(e) => setRouteForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
      </Modal>
    </div>
  );
}

function RouteDetail({ route, onBack }: { route: RouteItem; onBack: () => void }) {
  const [tab, setTab] = useState<'medicoes' | 'arquivos'>('medicoes');
  const [lines, setLines] = useState<RouteLine[] | null>(null);

  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<RouteLine | null>(null);
  const [lineForm, setLineForm] = useState(emptyLineForm);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: 'Arquivos' }]);
  const [loadingContents, setLoadingContents] = useState(false);
  const [folders, setFolders] = useState<RouteFolder[]>([]);
  const [files, setFiles] = useState<RouteFile[]>([]);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const currentFolderId = crumbs[crumbs.length - 1]?.id ?? null;

  function loadLines() {
    api.get<{ route: RouteItem; lines: RouteLine[] }>(`/api/routes/${route.id}`)
      .then((res) => setLines(Array.isArray(res?.lines) ? res.lines : []))
      .catch(() => setLines([]));
  }

  function loadContents() {
    setLoadingContents(true);
    api.get<{ folders?: RouteFolder[]; files?: RouteFile[] }>(`/api/routes/${route.id}/contents`, { folder_id: currentFolderId ?? undefined })
      .then((res) => {
        setFolders(Array.isArray(res?.folders) ? res.folders : []);
        setFiles(Array.isArray(res?.files) ? res.files : []);
      })
      .catch((err) => {
        console.error('Erro ao carregar conteúdos da rota:', err);
        setFolders([]);
        setFiles([]);
      })
      .finally(() => {
        setLoadingContents(false);
      });
  }

  useEffect(() => { if (tab === 'medicoes') loadLines(); }, [tab]);
  useEffect(() => { if (tab === 'arquivos') loadContents(); }, [tab, currentFolderId]);

  function openCreateLine() {
    setEditingLine(null);
    setLineForm(emptyLineForm);
    setError(null);
    setLineModalOpen(true);
  }
  function openEditLine(l: RouteLine) {
    setEditingLine(l);
    setLineForm({ stretch_name: l.stretch_name, pop_box: l.pop_box || '', cable_type: l.cable_type || '', notes: l.notes || '', address: l.address || '' });
    setError(null);
    setLineModalOpen(true);
  }
  async function submitLine() {
    if (!lineForm.stretch_name.trim()) { setError('Data da medição é obrigatória.'); return; }
    setError(null);
    setIsSaving(true);
    try {
      if (editingLine) await api.put(`/api/routes/lines/${editingLine.id}`, lineForm);
      else await api.post(`/api/routes/${route.id}/lines`, lineForm);
      setLineModalOpen(false);
      loadLines();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }
  async function deleteLine(l: RouteLine) {
    if (!confirm('Excluir esta medição?')) return;
    await api.delete(`/api/routes/lines/${l.id}`);
    loadLines();
  }
  async function submitImport() {
    if (!csvText.trim()) { setError('Cole os dados para importar.'); return; }
    setError(null);
    setIsSaving(true);
    try {
      const res = await api.post<{ imported: number }>(`/api/routes/${route.id}/bulk`, { csv_data: csvText });
      alert(`${res.imported} medição(ões) importada(s)!`);
      setImportModalOpen(false);
      setCsvText('');
      loadLines();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao importar.');
    } finally {
      setIsSaving(false);
    }
  }

  function enterFolder(f: RouteFolder) {
    setCrumbs((c) => [...c, { id: f.id, name: f.name }]);
  }
  function goToCrumb(idx: number) {
    setCrumbs((c) => c.slice(0, idx + 1));
  }
  async function submitFolder() {
    if (!folderName.trim()) return;
    await api.post(`/api/routes/${route.id}/folders`, { name: folderName, parent_id: currentFolderId });
    setFolderModalOpen(false);
    setFolderName('');
    loadContents();
  }
  async function deleteFolder(f: RouteFolder) {
    if (!confirm(`Excluir a pasta "${f.name}"?`)) return;
    await api.delete(`/api/routes/folders/${f.id}`);
    loadContents();
  }
  async function deleteFile(f: RouteFile) {
    if (!confirm(`Excluir o arquivo "${f.filename}"?`)) return;
    await api.delete(`/api/routes/files/${f.id}`);
    loadContents();
  }
  async function handleFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const fd = new FormData();
    Array.from(fileList).forEach((f) => fd.append('files', f));
    if (currentFolderId !== null) fd.append('folder_id', String(currentFolderId));
    try {
      await api.postFormData(`/api/routes/${route.id}/upload`, fd);
      loadContents();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao enviar arquivos.');
    }
  }

  const totalMedicoes = useMemo(() => lines?.length || 0, [lines]);

  return (
    <div>
      <button onClick={onBack} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-4 flex items-center gap-1.5">
        <ChevronRight className="w-4 h-4 rotate-180" /> Voltar para Rotas
      </button>
      <PageHeader
        title={route.name}
        subtitle={`${route.type} · ${totalMedicoes} medição(ões)`}
        actions={
          tab === 'medicoes' ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setCsvText(''); setError(null); setImportModalOpen(true); }}><Upload className="w-4 h-4" /> Importar</Button>
              <Button variant="outline" onClick={() => { window.location.href = `/api/routes/${route.id}/export`; }}><Download className="w-4 h-4" /> Exportar</Button>
              <Button onClick={openCreateLine}><Plus className="w-4 h-4" /> Nova Medição</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setFolderModalOpen(true)}><FolderPlus className="w-4 h-4" /> Nova Pasta</Button>
              <label className="inline-flex">
                <input type="file" multiple className="hidden" onChange={(e) => handleFileUpload(e.target.files)} />
                <span className="h-10 px-5 rounded-full bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/30 text-[var(--color-primary)] text-sm font-semibold flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4" /> Enviar Arquivos</span>
              </label>
            </div>
          )
        }
      />

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('medicoes')} className={`h-10 px-5 rounded-full text-sm font-bold transition-colors ${tab === 'medicoes' ? 'bg-[var(--color-primary-dim)] text-[var(--color-primary)] border border-[var(--color-primary)]/30' : 'bg-white/[0.03] border border-white/10 text-[var(--color-text-muted)]'}`}>Medições</button>
        <button onClick={() => setTab('arquivos')} className={`h-10 px-5 rounded-full text-sm font-bold transition-colors ${tab === 'arquivos' ? 'bg-[var(--color-primary-dim)] text-[var(--color-primary)] border border-[var(--color-primary)]/30' : 'bg-white/[0.03] border border-white/10 text-[var(--color-text-muted)]'}`}>Arquivos</button>
      </div>

      {tab === 'medicoes' ? (
        lines === null ? (
          <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
        ) : lines.length === 0 ? (
          <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhuma medição cadastrada.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
                  <th className="px-4 py-3">Data/Trecho</th><th className="px-4 py-3">Caixa POP</th><th className="px-4 py-3">Tipo de Cabo</th><th className="px-4 py-3">Endereço</th><th className="px-4 py-3">Obs.</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 font-medium">{l.stretch_name}</td>
                    <td className="px-4 py-2.5">{l.pop_box || '-'}</td>
                    <td className="px-4 py-2.5">{l.cable_type || '-'}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{l.address || '-'}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{l.notes || '-'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEditLine(l)} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteLine(l)} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : (
        <>
          <div className="flex items-center gap-1.5 mb-4 text-sm flex-wrap">
            {crumbs.map((c, idx) => (
              <span key={idx} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-faint)]" />}
                <button onClick={() => goToCrumb(idx)} className={`flex items-center gap-1 hover:text-[var(--color-text)] transition-colors ${idx === crumbs.length - 1 ? 'font-bold text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}>
                  {idx === 0 && <Home className="w-3.5 h-3.5" />} {c.name}
                </button>
              </span>
            ))}
          </div>
          {loadingContents ? (
            <Card className="p-10 text-center text-sm text-[var(--color-text-muted)] animate-pulse">
              Carregando pastas e arquivos...
            </Card>
          ) : (folders.length === 0 && files.length === 0) ? (
            <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Pasta vazia. Nenhum arquivo ou subpasta encontrado.</Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {folders.map((f) => (
                <Card key={`f-${f.id}`} className="p-4 flex items-center gap-3 animate-in group hover:border-white/20 transition-all">
                  <button onClick={() => enterFolder(f)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <FolderOpen className="w-8 h-8 text-[var(--color-accent)] shrink-0" />
                    <div className="min-w-0"><div className="font-semibold text-sm truncate">{f.name}</div></div>
                  </button>
                  <button onClick={() => deleteFolder(f)} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                </Card>
              ))}
              {files.map((f) => (
                <Card key={`file-${f.id}`} className="p-4 flex items-center gap-3 hover:border-white/20 transition-all">
                  <File className="w-8 h-8 text-[var(--color-text-faint)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{f.filename}</div>
                    <div className="text-[11px] text-[var(--color-text-faint)]">{formatBytes(f.filesize)} · {f.uploaded_at || ''}</div>
                  </div>
                  <a href={`/uploads/${f.filepath}`} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07] transition-colors"><Download className="w-3.5 h-3.5" /></a>
                  <button onClick={() => deleteFile(f)} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={lineModalOpen}
        onClose={() => setLineModalOpen(false)}
        title={editingLine ? 'Editar Medição' : 'Nova Medição'}
        footer={<><Button variant="ghost" onClick={() => setLineModalOpen(false)}>Cancelar</Button><Button onClick={submitLine} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Data / Trecho"><Input value={lineForm.stretch_name} onChange={(e) => setLineForm((f) => ({ ...f, stretch_name: e.target.value }))} /></Field>
        <Field label="Caixa POP"><Input value={lineForm.pop_box} onChange={(e) => setLineForm((f) => ({ ...f, pop_box: e.target.value }))} /></Field>
        <Field label="Tipo de Cabo"><Input value={lineForm.cable_type} onChange={(e) => setLineForm((f) => ({ ...f, cable_type: e.target.value }))} /></Field>
        <Field label="Endereço"><Input value={lineForm.address} onChange={(e) => setLineForm((f) => ({ ...f, address: e.target.value }))} /></Field>
        <Field label="Observações"><Textarea rows={2} value={lineForm.notes} onChange={(e) => setLineForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Importar Medições (CSV)"
        footer={<><Button variant="ghost" onClick={() => setImportModalOpen(false)}>Cancelar</Button><Button onClick={submitImport} disabled={isSaving}>{isSaving ? 'Processando...' : 'Importar'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Dados CSV" hint="Colunas: Data/Trecho;Caixa POP;Tipo de Cabo;Observações;Endereço">
          <Textarea rows={8} value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="01/08/2026;POP-01;Óptico;Sem observações;Rua Exemplo, 100" />
        </Field>
      </Modal>

      <Modal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        title="Nova Pasta"
        footer={<><Button variant="ghost" onClick={() => setFolderModalOpen(false)}>Cancelar</Button><Button onClick={submitFolder}>Criar</Button></>}
      >
        <Field label="Nome da Pasta"><Input value={folderName} onChange={(e) => setFolderName(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
