import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  ChevronRight,
  Copy,
  Download,
  Eye,
  File,
  FolderOpen,
  FolderPlus,
  Home,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Route as RouteIcon,
  Activity,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { RouteFile, RouteFolder, RouteItem, RouteLine } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';

const emptyRouteForm = { name: '', type: 'Empresarial', description: '' };
const emptyLineForm = {
  stretch_name: '',
  pop_box: '',
  cable_type: '',
  notes: '',
  address: '',
  event_type: 'RAL',
  measurement: ''
};

interface Crumb {
  id: number | null;
  name: string;
}

function formatBytes(n?: number | null) {
  if (!n || isNaN(Number(n))) return '0 B';
  const num = Number(n);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

function getEventBadge(type?: string | null) {
  const t = (type || '').trim().toUpperCase();
  if (t === 'RAL') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-red-500/10 text-red-400 border border-red-500/30">
        <AlertTriangle className="w-3 h-3 text-red-400" /> RAL
      </span>
    );
  }
  if (t === 'REC') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-sky-500/10 text-sky-400 border border-sky-500/30">
        <Activity className="w-3 h-3 text-sky-400" /> REC
      </span>
    );
  }
  if (t === 'OUTAGE') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-purple-500/10 text-purple-400 border border-purple-500/30">
        <Zap className="w-3 h-3 text-purple-400" /> OUTAGE
      </span>
    );
  }
  if (t === 'PREVENTIVA') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
        <CheckCircle2 className="w-3 h-3 text-amber-400" /> PREVENTIVA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {t || 'NORMAL'}
    </span>
  );
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
    alert('Descrição copiada para a área de transferência!');
  }

  const [editingRoute, setEditingRoute] = useState<RouteItem | null>(null);
  const [routeForm, setRouteForm] = useState(emptyRouteForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function loadRoutes() {
    api
      .get<RouteItem[]>('/api/routes', typeFilter ? { type: typeFilter } : undefined)
      .then(setRoutes)
      .catch(() => setRoutes([]));
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
    if (!routeForm.name.trim()) {
      setError('Nome da rota é obrigatório.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      if (editingRoute) await api.put(`/api/routes/${editingRoute.id}`, routeForm);
      else await api.post('/api/routes', routeForm);
      setRouteModalOpen(false);
      loadRoutes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar rota.');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRoute(r: RouteItem, e: MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Excluir permanentemente a rota "${r.name}"? Todas as medições e arquivos serão removidos.`)) return;
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
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Rotas"
        subtitle="Catalogação técnica de trechos ópticos, medições de campo e histórico de ocorrências"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => { window.location.href = '/api/routes/export'; }}
              className="border-white/10 hover:border-red-500/40 text-slate-200"
            >
              <Download className="w-4 h-4 text-red-500 mr-1.5" /> Exportar Todas as Rotas (CSV)
            </Button>
            <Button
              onClick={openCreateRoute}
              className="bg-red-600 hover:bg-red-500 text-white font-semibold shadow-lg shadow-red-600/20"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Nova Rota
            </Button>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar rota por nome, trecho ou observação..."
            className="pl-10 bg-[#0F1422] border-white/10 focus:border-red-500/50 rounded-xl text-slate-100"
          />
        </div>
        <div className="flex gap-2 p-1 bg-[#0F1422] border border-white/10 rounded-xl">
          {['', 'Empresarial', 'Residencial'].map((t) => (
            <button
              key={t || 'all'}
              onClick={() => setTypeFilter(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                typeFilter === t
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              {t || 'Todas as Redes'}
            </button>
          ))}
        </div>
      </div>

      {routes === null ? (
        <div className="p-12 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          Carregando catálogo de rotas...
        </div>
      ) : filteredRoutes.length === 0 ? (
        <Card className="p-12 text-center text-sm text-slate-400 bg-[#0F1422]/60 border-white/10">
          <RouteIcon className="w-10 h-10 mx-auto text-slate-600 mb-3" />
          <div className="font-semibold text-slate-300">
            {search ? 'Nenhuma rota encontrada para o termo pesquisado.' : 'Nenhuma rota cadastrada no momento.'}
          </div>
          <p className="text-xs text-slate-500 mt-1">Clique em "Nova Rota" acima para iniciar o mapeamento.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRoutes.map((r) => (
            <Card
              key={r.id}
              className="p-5 flex flex-col gap-3 cursor-pointer bg-[#0F1422] border-white/10 hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/5 transition-all group"
              onClick={() => setSelectedRoute(r)}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-white/5">
                  {r.type}
                </span>
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => openViewRoute(r, e)}
                    aria-label="Visualizar ficha técnica"
                    title="Visualizar ficha técnica"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sky-400 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => openEditRoute(r, e)}
                    aria-label="Editar rota"
                    title="Editar rota"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] border border-transparent transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => deleteRoute(r, e)}
                    aria-label="Excluir rota"
                    title="Excluir rota"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-base text-slate-100 flex items-center gap-2 group-hover:text-red-400 transition-colors">
                  <RouteIcon className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="truncate">{r.name}</span>
                </h4>
                {r.description && (
                  <p className="text-xs text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">
                    {r.description}
                  </p>
                )}
              </div>

              <div className="text-[11px] text-slate-400 mt-auto pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="font-medium text-slate-300">{r.lines_count} medição(ões) técnica(s)</span>
                <span>{r.created_at_fmt}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Visualizar Rota */}
      <Modal
        open={!!viewingRoute}
        onClose={() => setViewingRoute(null)}
        title={viewingRoute ? `Ficha Técnica: ${viewingRoute.name}` : ''}
        footer={
          <div className="flex items-center justify-between w-full">
            {viewingRoute && (
              <Button variant="outline" onClick={() => copyRouteDesc(viewingRoute)} className="border-white/10 text-slate-200">
                <Copy className="w-4 h-4 mr-1.5" /> Copiar Descrição
              </Button>
            )}
            <Button onClick={() => setViewingRoute(null)} className="bg-slate-700 hover:bg-slate-600 text-white">
              Fechar
            </Button>
          </div>
        }
      >
        {viewingRoute && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-white/10">
                {viewingRoute.type}
              </span>
              <span className="text-xs text-slate-400">{viewingRoute.lines_count} medição(ões) cadastradas</span>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Especificação da Rota / Trecho
              </label>
              <div className="p-4 rounded-xl bg-[#090D16] border border-white/10 text-slate-100 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                {viewingRoute.description || 'Nenhuma descrição técnica detalhada informada.'}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Criar / Editar Rota */}
      <Modal
        open={routeModalOpen}
        onClose={() => setRouteModalOpen(false)}
        title={editingRoute ? 'Editar Rota' : 'Nova Rota'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRouteModalOpen(false)} className="text-slate-400">
              Cancelar
            </Button>
            <Button
              onClick={submitRoute}
              disabled={isSaving}
              className="bg-red-600 hover:bg-red-500 text-white font-semibold"
            >
              {isSaving ? 'Salvando...' : 'Salvar Rota'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <Field label="Nome da Rota">
            <Input
              value={routeForm.name}
              onChange={(e) => setRouteForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: ROTA_FIBRA_CENTRO_SUL_01"
              className="bg-[#090D16] border-white/10 text-slate-100"
            />
          </Field>
          <Field label="Tipo da Rede">
            <Select
              value={routeForm.type}
              onChange={(e) => setRouteForm((f) => ({ ...f, type: e.target.value }))}
              className="bg-[#090D16] border-white/10 text-slate-100"
            >
              <option value="Empresarial">Empresarial</option>
              <option value="Residencial">Residencial</option>
            </Select>
          </Field>
          <Field label="Descrição Técnica da Rota">
            <Textarea
              rows={4}
              value={routeForm.description}
              onChange={(e) => setRouteForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descreva POPs de origem/destino, anéis de fibra, bandejas e observações de infraestrutura..."
              className="bg-[#090D16] border-white/10 text-slate-100"
            />
          </Field>
        </div>
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

  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: 'Arquivos Técnicos' }]);
  const [loadingContents, setLoadingContents] = useState(false);
  const [folders, setFolders] = useState<RouteFolder[]>([]);
  const [files, setFiles] = useState<RouteFile[]>([]);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const currentFolderId = crumbs[crumbs.length - 1]?.id ?? null;

  function loadLines() {
    api
      .get<{ route: RouteItem; lines: RouteLine[] }>(`/api/routes/${route.id}`)
      .then((res) => setLines(Array.isArray(res?.lines) ? res.lines : []))
      .catch(() => setLines([]));
  }

  function loadContents() {
    setLoadingContents(true);
    api
      .get<{ folders?: RouteFolder[]; files?: RouteFile[] }>(`/api/routes/${route.id}/contents`, {
        folder_id: currentFolderId ?? undefined
      })
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

  useEffect(() => {
    if (tab === 'medicoes') loadLines();
  }, [tab]);

  useEffect(() => {
    if (tab === 'arquivos') loadContents();
  }, [tab, currentFolderId]);

  function openCreateLine() {
    setEditingLine(null);
    setLineForm(emptyLineForm);
    setError(null);
    setLineModalOpen(true);
  }

  function openEditLine(l: RouteLine) {
    setEditingLine(l);
    setLineForm({
      stretch_name: l.stretch_name,
      pop_box: l.pop_box || '',
      cable_type: l.cable_type || '',
      notes: l.notes || '',
      address: l.address || '',
      event_type: l.event_type || 'RAL',
      measurement: l.measurement || l.cable_type || ''
    });
    setError(null);
    setLineModalOpen(true);
  }

  async function submitLine() {
    if (!lineForm.stretch_name.trim()) {
      setError('Data da medição / Trecho é obrigatória.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      if (editingLine) await api.put(`/api/routes/lines/${editingLine.id}`, lineForm);
      else await api.post(`/api/routes/${route.id}/lines`, lineForm);
      setLineModalOpen(false);
      loadLines();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar medição.');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteLine(l: RouteLine) {
    if (!confirm('Excluir esta medição técnica da rota?')) return;
    await api.delete(`/api/routes/lines/${l.id}`);
    loadLines();
  }

  async function submitImport() {
    if (!csvText.trim()) {
      setError('Cole os dados no formato CSV para importar.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const res = await api.post<{ imported: number }>(`/api/routes/${route.id}/bulk`, { csv_data: csvText });
      alert(`${res.imported} medição(ões) importada(s) com sucesso!`);
      setImportModalOpen(false);
      setCsvText('');
      loadLines();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao importar medições.');
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
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-sm font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors"
      >
        <ChevronRight className="w-4 h-4 rotate-180" /> Voltar para o Catálogo de Rotas
      </button>

      <PageHeader
        title={route.name}
        subtitle={`${route.type} · ${totalMedicoes} medições registradas`}
        actions={
          tab === 'medicoes' ? (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => { setCsvText(''); setError(null); setImportModalOpen(true); }}
                className="border-white/10 text-slate-200 hover:border-slate-500"
              >
                <Upload className="w-4 h-4 mr-1.5" /> Importar CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => { window.location.href = `/api/routes/${route.id}/export`; }}
                className="border-white/10 text-slate-200 hover:border-red-500/40"
              >
                <Download className="w-4 h-4 text-red-500 mr-1.5" /> Exportar Esta Rota (CSV)
              </Button>
              <Button
                onClick={openCreateLine}
                className="bg-red-600 hover:bg-red-500 text-white font-semibold shadow-lg shadow-red-600/20"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Nova Medição
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => setFolderModalOpen(true)}
                className="border-white/10 text-slate-200"
              >
                <FolderPlus className="w-4 h-4 mr-1.5 text-sky-400" /> Nova Pasta
              </Button>
              <label className="inline-flex">
                <input type="file" multiple className="hidden" onChange={(e) => handleFileUpload(e.target.files)} />
                <span className="h-10 px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer shadow-lg shadow-red-600/20 transition-all">
                  <Upload className="w-4 h-4" /> Enviar Arquivos
                </span>
              </label>
            </div>
          )
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setTab('medicoes')}
          className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
            tab === 'medicoes'
              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          Medições Técnicas ({totalMedicoes})
        </button>
        <button
          onClick={() => setTab('arquivos')}
          className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
            tab === 'arquivos'
              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          Arquivos & Documentos
        </button>
      </div>

      {tab === 'medicoes' ? (
        lines === null ? (
          <div className="p-12 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            Carregando medições...
          </div>
        ) : lines.length === 0 ? (
          <Card className="p-12 text-center text-sm text-slate-400 bg-[#0F1422]/60 border-white/10">
            <Activity className="w-10 h-10 mx-auto text-slate-600 mb-3" />
            <div className="font-semibold text-slate-300">Nenhuma medição cadastrada para esta rota.</div>
            <p className="text-xs text-slate-500 mt-1">Utilize os botões acima para cadastrar manualmente ou importar CSV.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto bg-[#0F1422] border-white/10 rounded-2xl shadow-xl">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-white/10 bg-white/[0.02]">
                  <th className="px-4 py-3.5 font-bold">Data / Trecho</th>
                  <th className="px-4 py-3.5 font-bold">Tipo Evento</th>
                  <th className="px-4 py-3.5 font-bold">Caixa POP</th>
                  <th className="px-4 py-3.5 font-bold">Tipo Cabo</th>
                  <th className="px-4 py-3.5 font-bold">Medição</th>
                  <th className="px-4 py-3.5 font-bold">Endereço / Referência</th>
                  <th className="px-4 py-3.5 font-bold">Observações</th>
                  <th className="px-4 py-3.5 text-right font-bold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lines.map((l) => (
                  <tr key={l.id} className="hover:bg-white/[0.03] transition-colors group">
                    <td className="px-4 py-3 font-semibold text-slate-100 whitespace-nowrap">
                      {l.stretch_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getEventBadge(l.event_type)}
                    </td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-xs font-mono border border-white/5">
                        {l.pop_box || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap text-xs">
                      {l.cable_type || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-mono font-medium text-xs whitespace-nowrap">
                      {l.measurement || l.cable_type || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate" title={l.address || ''}>
                      {l.address ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" /> {l.address}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate" title={l.notes || ''}>
                      {l.notes || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditLine(l)}
                          title="Editar medição"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.08] transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteLine(l)}
                          title="Excluir medição"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
          <div className="flex items-center gap-1.5 mb-4 text-sm flex-wrap p-2.5 bg-[#0F1422] rounded-xl border border-white/5">
            {crumbs.map((c, idx) => (
              <span key={idx} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                <button
                  onClick={() => goToCrumb(idx)}
                  className={`flex items-center gap-1 transition-colors ${
                    idx === crumbs.length - 1
                      ? 'font-bold text-red-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {idx === 0 && <Home className="w-3.5 h-3.5" />} {c.name}
                </button>
              </span>
            ))}
          </div>

          {loadingContents ? (
            <Card className="p-12 text-center text-sm text-slate-400 animate-pulse bg-[#0F1422]/60 border-white/10">
              Carregando estrutura de pastas e arquivos...
            </Card>
          ) : folders.length === 0 && files.length === 0 ? (
            <Card className="p-12 text-center text-sm text-slate-400 bg-[#0F1422]/60 border-white/10">
              <FolderOpen className="w-10 h-10 mx-auto text-slate-600 mb-3" />
              <div className="font-semibold text-slate-300">Pasta vazia.</div>
              <p className="text-xs text-slate-500 mt-1">Crie pastas ou envie arquivos KMZ, relatórios e croquis desta rota.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {folders.map((f) => (
                <Card
                  key={`f-${f.id}`}
                  className="p-4 flex items-center gap-3 bg-[#0F1422] border-white/10 hover:border-red-500/40 transition-all group"
                >
                  <button onClick={() => enterFolder(f)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <FolderOpen className="w-8 h-8 text-sky-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-200 group-hover:text-red-400 transition-colors truncate">
                        {f.name}
                      </div>
                      <div className="text-[11px] text-slate-500">Pasta técnica</div>
                    </div>
                  </button>
                  <button
                    onClick={() => deleteFolder(f)}
                    title="Excluir pasta"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Card>
              ))}

              {files.map((f) => (
                <Card
                  key={`file-${f.id}`}
                  className="p-4 flex items-center gap-3 bg-[#0F1422] border-white/10 hover:border-white/20 transition-all group"
                >
                  <File className="w-8 h-8 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-slate-200 truncate">{f.filename}</div>
                    <div className="text-[11px] text-slate-400">
                      {formatBytes(f.filesize)} · {f.uploaded_at || ''}
                    </div>
                  </div>
                  <a
                    href={`/uploads/${f.filepath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] transition-colors"
                    title="Baixar arquivo"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => deleteFile(f)}
                    title="Excluir arquivo"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal Nova / Editar Medição */}
      <Modal
        open={lineModalOpen}
        onClose={() => setLineModalOpen(false)}
        title={editingLine ? 'Editar Medição Técnica' : 'Nova Medição Técnica'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLineModalOpen(false)} className="text-slate-400">
              Cancelar
            </Button>
            <Button
              onClick={submitLine}
              disabled={isSaving}
              className="bg-red-600 hover:bg-red-500 text-white font-semibold"
            >
              {isSaving ? 'Salvando...' : 'Salvar Medição'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Data da Medição / Trecho">
            <Input
              value={lineForm.stretch_name}
              onChange={(e) => setLineForm((f) => ({ ...f, stretch_name: e.target.value }))}
              placeholder="Ex: 20/10/2026 - Trecho A"
              className="bg-[#090D16] border-white/10 text-slate-100"
            />
          </Field>
          <Field label="Tipo de Evento / Ocorrência">
            <Select
              value={lineForm.event_type}
              onChange={(e) => setLineForm((f) => ({ ...f, event_type: e.target.value }))}
              className="bg-[#090D16] border-white/10 text-slate-100"
            >
              <option value="RAL">RAL</option>
              <option value="REC">REC</option>
              <option value="OUTAGE">OUTAGE</option>
              <option value="PREVENTIVA">PREVENTIVA</option>
              <option value="NORMAL">NORMAL / ROTINA</option>
            </Select>
          </Field>
          <Field label="Caixa / POP">
            <Input
              value={lineForm.pop_box}
              onChange={(e) => setLineForm((f) => ({ ...f, pop_box: e.target.value }))}
              placeholder="Ex: CX-04 / POP_CENTRO"
              className="bg-[#090D16] border-white/10 text-slate-100"
            />
          </Field>
          <Field label="Tipo de Cabo / Tecnologia">
            <Input
              value={lineForm.cable_type}
              onChange={(e) => setLineForm((f) => ({ ...f, cable_type: e.target.value }))}
              placeholder="Ex: Fibra 72 FO / HFC / Drop"
              className="bg-[#090D16] border-white/10 text-slate-100"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Medição (Distância / Atenuação)">
              <Input
                value={lineForm.measurement}
                onChange={(e) => setLineForm((f) => ({ ...f, measurement: e.target.value }))}
                placeholder="Ex: 145 metros / -18.4 dBm / 1.8 km"
                className="bg-[#090D16] border-white/10 text-slate-100"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Endereço / Referência no Terreno">
              <Input
                value={lineForm.address}
                onChange={(e) => setLineForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Ex: Av. Presidente Vargas, 1200 - Posto Shell"
                className="bg-[#090D16] border-white/10 text-slate-100"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Observações Técnicas">
              <Textarea
                rows={2}
                value={lineForm.notes}
                onChange={(e) => setLineForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Detalhes de emenda, atenuação, fibra rompida ou intervenção realizada..."
                className="bg-[#090D16] border-white/10 text-slate-100"
              />
            </Field>
          </div>
        </div>
      </Modal>

      {/* Modal Importar CSV */}
      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Importar Medições em Lote (CSV)"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportModalOpen(false)} className="text-slate-400">
              Cancelar
            </Button>
            <Button
              onClick={submitImport}
              disabled={isSaving}
              className="bg-red-600 hover:bg-red-500 text-white font-semibold"
            >
              {isSaving ? 'Processando Importação...' : 'Importar Dados'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <div className="space-y-3">
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-slate-300">
            <div className="font-bold text-red-400 mb-1">Estrutura das Colunas (separadas por ponto-e-vírgula):</div>
            <code className="text-slate-200 block font-mono">
              Data/Trecho;Caixa POP;Tipo de Cabo;Observações;Endereço;Tipo Evento;Medição
            </code>
          </div>
          <Field label="Conteúdo CSV">
            <Textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="20/10/2026;POP-01;Fibra 72 FO;Medição nominal;Av. Brasil, 500;RAL;180m&#10;20/10/2026;POP-02;Fibra 36 FO;Atenuação corrigida;Rua das Flores, 80;REC;-19.2 dBm"
              className="bg-[#090D16] border-white/10 text-slate-100 font-mono text-xs"
            />
          </Field>
        </div>
      </Modal>

      {/* Modal Nova Pasta */}
      <Modal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        title="Criar Nova Pasta Técnica"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFolderModalOpen(false)} className="text-slate-400">
              Cancelar
            </Button>
            <Button onClick={submitFolder} className="bg-red-600 hover:bg-red-500 text-white font-semibold">
              Criar Pasta
            </Button>
          </>
        }
      >
        <Field label="Nome da Pasta">
          <Input
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Ex: Croquis_KMZ / Relatorios_OTDR"
            className="bg-[#090D16] border-white/10 text-slate-100"
          />
        </Field>
      </Modal>
    </div>
  );
}
