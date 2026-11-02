import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Download,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  Home,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  Upload,
  CheckCircle2,
  MapPin,
  FileText,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Project, ProjectFolder } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Textarea } from '../components/ui';
import Modal from '../components/Modal';
import { hasPermission, useAuth } from '../state/AuthContext';

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface Crumb { id: number | null; name: string }

function sortFoldersByLeadingNumber(folders: ProjectFolder[]): ProjectFolder[] {
  return [...folders].sort((a, b) => {
    const na = parseInt(a.name.match(/^\d+/)?.[0] ?? '', 10);
    const nb = parseInt(b.name.match(/^\d+/)?.[0] ?? '', 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return a.name.localeCompare(b.name);
  });
}

function getProjectFiles(p: Project): { name: string; url: string; type: string }[] {
  const list: { name: string; url: string; type: string }[] = [];
  if (p.kmz_path) {
    p.kmz_path.split(';').forEach((path) => {
      const clean = path.trim();
      if (clean) {
        list.push({
          name: clean.split('/').pop() || clean,
          url: `/uploads/${clean}`,
          type: 'KMZ/KML'
        });
      }
    });
  }
  if (p.pdf_path) {
    p.pdf_path.split(';').forEach((path) => {
      const clean = path.trim();
      if (clean) {
        list.push({
          name: clean.split('/').pop() || clean,
          url: `/uploads/${clean}`,
          type: 'Documento / PDF'
        });
      }
    });
  }
  return list;
}

function shareProjectWhatsapp(p: Project) {
  const publicUrl = `${window.location.origin}/p/project/${p.id}`;
  const text = `*PROJETO DE REDE:* ${p.name}${p.area ? `\n*Área:* ${p.area}` : ''}${p.description ? `\n*Descrição:* ${p.description}` : ''}\n\n*Acesse o projeto e baixe os arquivos aqui:* ${publicUrl}`;
  const zapUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(zapUrl, '_blank');
}

const emptyProjectForm = { name: '', description: '', area: '' };

export default function ProjectsPage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, 'projetos.create');
  const canEdit = hasPermission(user, 'projetos.edit');
  const canDelete = hasPermission(user, 'projetos.delete');
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: 'Projetos' }]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<ProjectFolder | null>(null);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [downloadProjectModal, setDownloadProjectModal] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [kmzFiles, setKmzFiles] = useState<File[]>([]);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);

  // Modal de Upload Rápido de Arquivos
  const [quickUploadProject, setQuickUploadProject] = useState<Project | null>(null);
  const [quickFiles, setQuickFiles] = useState<File[]>([]);
  const [isQuickUploading, setIsQuickUploading] = useState(false);
  const [quickUploadError, setQuickUploadError] = useState<string | null>(null);
  const [quickUploadSuccess, setQuickUploadSuccess] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentFolderId = crumbs[crumbs.length - 1].id;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  function load(folderId: number | null, query: string = debouncedSearch) {
    setLoading(true);
    const params: Record<string, any> = {};
    if (query) {
      params.search = query;
    } else if (folderId !== null) {
      params.parent_id = folderId;
    }
    api.get<{ folders: ProjectFolder[]; projects: Project[] }>('/api/folders', params)
      .then((res) => {
        setFolders(sortFoldersByLeadingNumber(res.folders));
        setProjects(res.projects);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(currentFolderId, debouncedSearch);
  }, [currentFolderId, debouncedSearch]);

  function enterFolder(folder: ProjectFolder) {
    if (debouncedSearch) {
      setSearch('');
      setDebouncedSearch('');
      setCrumbs([{ id: null, name: 'Projetos' }, { id: folder.id, name: folder.name }]);
    } else {
      setCrumbs((c) => [...c, { id: folder.id, name: folder.name }]);
    }
  }
  function goToCrumb(idx: number) {
    if (debouncedSearch) {
      setSearch('');
      setDebouncedSearch('');
    }
    setCrumbs((c) => c.slice(0, idx + 1));
  }

  function openCreateFolder() {
    setEditingFolder(null);
    setFolderName('');
    setError(null);
    setFolderModalOpen(true);
  }
  function openRenameFolder(f: ProjectFolder) {
    setEditingFolder(f);
    setFolderName(f.name);
    setError(null);
    setFolderModalOpen(true);
  }
  async function submitFolder() {
    if (!folderName.trim()) { setError('Nome da pasta é obrigatório.'); return; }
    setError(null);
    setIsSaving(true);
    try {
      if (editingFolder) await api.put(`/api/folders/${editingFolder.id}`, { name: folderName });
      else await api.post('/api/folders', { name: folderName, parent_id: currentFolderId });
      setFolderModalOpen(false);
      load(currentFolderId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }
  async function deleteFolder(f: ProjectFolder) {
    if (!confirm(`Excluir a pasta "${f.name}"? Isso não pode ser desfeito.`)) return;
    await api.delete(`/api/folders/${f.id}`);
    load(currentFolderId);
  }

  function openCreateProject() {
    setEditingProject(null);
    setProjectForm(emptyProjectForm);
    setKmzFiles([]);
    setPdfFiles([]);
    setError(null);
    setProjectModalOpen(true);
  }
  function openEditProject(p: Project) {
    setEditingProject(p);
    setProjectForm({ name: p.name, description: p.description || '', area: p.area || '' });
    setKmzFiles([]);
    setPdfFiles([]);
    setError(null);
    setProjectModalOpen(true);
  }
  async function submitProject() {
    if (!projectForm.name.trim()) { setError('Nome do projeto é obrigatório.'); return; }
    setError(null);
    setIsSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', projectForm.name);
      fd.append('description', projectForm.description);
      fd.append('area', projectForm.area);
      if (!editingProject) fd.append('folder_id', currentFolderId === null ? '' : String(currentFolderId));
      kmzFiles.forEach((f) => fd.append('kmz_file', f));
      pdfFiles.forEach((f) => fd.append('pdf_file', f));
      if (editingProject) await api.putFormData(`/api/projects/${editingProject.id}`, fd);
      else await api.postFormData('/api/projects', fd);
      setProjectModalOpen(false);
      load(currentFolderId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleQuickUpload() {
    if (!quickUploadProject || quickFiles.length === 0) return;
    setIsQuickUploading(true);
    setQuickUploadError(null);
    setQuickUploadSuccess(null);
    try {
      const fd = new FormData();
      quickFiles.forEach((f) => fd.append('files', f));
      const res = await api.postFormData<{ success: boolean; message: string }>(
        `/api/projects/${quickUploadProject.id}/upload`,
        fd
      );
      setQuickUploadSuccess(res.message);
      load(currentFolderId);
      setTimeout(() => {
        setQuickUploadProject(null);
        setQuickFiles([]);
        setQuickUploadSuccess(null);
      }, 1600);
    } catch (err: any) {
      setQuickUploadError(err.message || 'Erro ao anexar arquivo(s).');
    } finally {
      setIsQuickUploading(false);
    }
  }
  async function deleteProject(p: Project) {
    if (!confirm(`Excluir o projeto "${p.name}"?`)) return;
    await api.delete(`/api/projects/${p.id}`);
    load(currentFolderId);
  }

  const attachmentCount = useMemo(() => (p: Project) => {
    const kmz = p.kmz_path ? p.kmz_path.split(';').length : 0;
    const pdf = p.pdf_path ? p.pdf_path.split(';').length : 0;
    return kmz + pdf;
  }, []);

  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, search]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (areaFilter && !(p.area || '').toLowerCase().includes(areaFilter.toLowerCase())) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.area || '').toLowerCase().includes(q)
      );
    });
  }, [projects, search, areaFilter]);

  return (
    <div>
      <PageHeader
        title="Projetos"
        subtitle="Projetos de rede externa organizados em pastas"
        actions={
          canCreate ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={openCreateFolder}><FolderPlus className="w-4 h-4" /> Nova Pasta</Button>
              <Button onClick={openCreateProject}><Plus className="w-4 h-4" /> Novo Projeto</Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pastas ou projetos em todo o sistema..."
            className="pl-11 pr-10 rounded-full"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setDebouncedSearch(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[var(--color-text-faint)] hover:text-[var(--color-text)] hover:bg-white/[0.08] transition-colors"
              title="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {debouncedSearch && (
          <span className="text-xs bg-[var(--color-accent-dim)] text-[var(--color-accent)] px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 w-fit">
            Buscando por "{debouncedSearch}" em todas as pastas
          </span>
        )}
        <div className="flex gap-2 p-1 bg-[#0F1422] rounded-xl border border-white/10 ml-auto">
          {['', 'Capital', 'Interior'].map((ar) => (
            <button
              key={ar || 'all'}
              onClick={() => setAreaFilter(ar)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                areaFilter === ar
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {ar || 'Todas as Áreas'}
            </button>
          ))}
        </div>
      </div>

      {!debouncedSearch && (
        <div className="flex items-center gap-1.5 mb-6 text-sm flex-wrap">
          {crumbs.map((c, idx) => (
            <span key={idx} className="flex items-center gap-1.5">
              {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-faint)]" />}
              <button
                onClick={() => goToCrumb(idx)}
                className={`flex items-center gap-1 hover:text-[var(--color-text)] transition-colors ${idx === crumbs.length - 1 ? 'font-bold text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}
              >
                {idx === 0 && <Home className="w-3.5 h-3.5" />} {c.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : filteredFolders.length === 0 && filteredProjects.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">{search ? 'Nenhum projeto ou pasta encontrado para essa busca.' : 'Pasta vazia.'}</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFolders.map((f) => (
            <Card key={`f-${f.id}`} className="p-4 flex items-center gap-3.5 animate-in group hover:border-white/20 hover:-translate-y-0.5 transition-all">
              <button onClick={() => enterFolder(f)} className="flex items-center gap-3.5 flex-1 min-w-0 text-left">
                <div className="w-11 h-11 rounded-xl bg-[var(--color-accent-dim)] flex items-center justify-center shrink-0">
                  <FolderOpen className="w-5 h-5 text-[var(--color-accent)]" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{f.name}</div>
                  <div className="text-[11px] text-[var(--color-text-faint)] mt-0.5">{f.folder_count} pasta(s) · {f.file_count} projeto(s)</div>
                </div>
              </button>
              {(canEdit || canDelete) && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {canEdit && <button onClick={() => openRenameFolder(f)} aria-label="Renomear pasta" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]"><Pencil className="w-3.5 h-3.5" /></button>}
                  {canDelete && <button onClick={() => deleteFolder(f)} aria-label="Excluir pasta" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              )}
            </Card>
          ))}
          {filteredProjects.map((p) => (
            <Card key={`p-${p.id}`} className="p-4 flex flex-col gap-2 animate-in">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-sm leading-snug">{p.name}</h4>
                {p.area && <span className="text-[10px] font-bold uppercase text-[var(--color-text-faint)] shrink-0">{p.area}</span>}
              </div>
              {p.description && <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">{p.description}</p>}
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-faint)]">
                <Paperclip className="w-3 h-3" /> {attachmentCount(p)} anexo(s)
              </div>
              <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-white/5 flex-wrap">
                <button
                  type="button"
                  onClick={() => shareProjectWhatsapp(p)}
                  title="Enviar por WhatsApp"
                  className="h-8 px-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors flex items-center gap-1.5 text-xs font-semibold"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> Zap
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const files = getProjectFiles(p);
                    if (files.length === 0) {
                      alert('Nenhum arquivo anexado a este projeto.');
                      return;
                    }
                    if (files.length === 1) {
                      window.open(files[0].url, '_blank');
                      return;
                    }
                    setDownloadProjectModal(p);
                  }}
                  title={attachmentCount(p) > 0 ? "Baixar arquivos" : "Sem anexos"}
                  className={`h-8 px-2.5 rounded-full border flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                    attachmentCount(p) > 0
                      ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300'
                      : 'bg-white/[0.02] border-white/5 text-[var(--color-text-faint)] opacity-40 cursor-not-allowed'
                  }`}
                  disabled={attachmentCount(p) === 0}
                >
                  <Download className="w-3.5 h-3.5" /> Baixar
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickUploadProject(p);
                      setQuickFiles([]);
                      setQuickUploadError(null);
                      setQuickUploadSuccess(null);
                    }}
                    title="Carregar / Anexar arquivos neste projeto"
                    className="h-8 px-2.5 rounded-full bg-[#e20613]/10 border border-[#e20613]/30 text-rose-400 hover:bg-[#e20613]/20 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
                  >
                    <Upload className="w-3.5 h-3.5" /> Anexar
                  </button>
                )}
                <a
                  href={`/p/project/${p.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver página pública"
                  className="h-8 px-2.5 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center gap-1 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07] transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Público
                </a>
                <div className="flex items-center gap-1 ml-auto">
                  {canEdit && (
                    <button onClick={() => openEditProject(p)} aria-label="Editar projeto" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]"><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                  {canDelete && (
                    <button onClick={() => deleteProject(p)} aria-label="Excluir projeto" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!downloadProjectModal}
        onClose={() => setDownloadProjectModal(null)}
        title={downloadProjectModal ? `Arquivos: ${downloadProjectModal.name}` : 'Baixar Arquivos'}
        footer={<Button variant="ghost" onClick={() => setDownloadProjectModal(null)}>Fechar</Button>}
      >
        {downloadProjectModal && (
          <div className="space-y-2.5">
            <p className="text-xs text-[var(--color-text-muted)] mb-3">Selecione o arquivo que deseja baixar:</p>
            {getProjectFiles(downloadProjectModal).map((file, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10 gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate text-[var(--color-text)]">{file.name}</div>
                  <div className="text-[11px] text-[var(--color-text-faint)]">{file.type}</div>
                </div>
                <a
                  href={file.url}
                  download={file.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 px-3 rounded-full bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/30 text-[var(--color-primary)] text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--color-primary)] hover:text-white transition-colors shrink-0"
                >
                  <Download className="w-3.5 h-3.5" /> Baixar
                </a>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        title={editingFolder ? 'Renomear Pasta' : 'Nova Pasta'}
        footer={<><Button variant="ghost" onClick={() => setFolderModalOpen(false)}>Cancelar</Button><Button onClick={submitFolder} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Nome da Pasta">
          <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title={editingProject ? 'Editar Projeto' : 'Novo Projeto'}
        footer={<><Button variant="ghost" onClick={() => setProjectModalOpen(false)}>Cancelar</Button><Button onClick={submitProject} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Projeto'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Nome">
          <Input value={projectForm.name} onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Área">
          <Input value={projectForm.area} onChange={(e) => setProjectForm((f) => ({ ...f, area: e.target.value }))} />
        </Field>
        <Field label="Descrição">
          <Textarea rows={3} value={projectForm.description} onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        {/* MAPAS (.KMZ, .KML) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-rose-400" />
              <span>Mapas de Rede (.kmz, .kml)</span>
            </span>
            <span className="text-[11px] font-normal text-zinc-400">{kmzFiles.length} selecionado(s)</span>
          </label>
          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files) {
                const dropped = Array.from(e.dataTransfer.files).filter(f => {
                  const ext = f.name.toLowerCase();
                  return ext.endsWith('.kmz') || ext.endsWith('.kml');
                });
                if (dropped.length > 0) setKmzFiles(prev => [...prev, ...dropped]);
              }
            }}
            className="border-2 border-dashed border-white/10 hover:border-rose-500/50 rounded-xl p-4 text-center transition-colors bg-white/[0.02]"
          >
            <input
              type="file"
              id="kmz-upload-input"
              multiple
              accept=".kmz,.kml"
              onChange={(e) => {
                if (e.target.files) setKmzFiles(prev => [...prev, ...Array.from(e.target.files!)]);
              }}
              className="hidden"
            />
            <label htmlFor="kmz-upload-input" className="cursor-pointer flex flex-col items-center gap-1.5">
              <Upload className="w-5 h-5 text-rose-400" />
              <span className="text-xs font-semibold text-white">Clique para selecionar mapas ou arraste aqui</span>
              <span className="text-[11px] text-zinc-500">Aceita arquivos KMZ e KML do Google Earth / Autocad</span>
            </label>
          </div>

          {kmzFiles.length > 0 && (
            <div className="space-y-1.5 mt-2 max-h-32 overflow-y-auto">
              {kmzFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10 text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="text-white truncate font-medium">{file.name}</span>
                    <span className="text-zinc-500 text-[10px] shrink-0">({formatBytes(file.size)})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setKmzFiles(prev => prev.filter((_, i) => i !== idx))}
                    className="p-1 text-zinc-400 hover:text-rose-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DOCUMENTOS (PDF, EXCEL, ETC) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>Documentos e Anexos (PDF, Planilhas, Imagens)</span>
            </span>
            <span className="text-[11px] font-normal text-zinc-400">{pdfFiles.length} selecionado(s)</span>
          </label>
          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files) {
                const dropped = Array.from(e.dataTransfer.files);
                if (dropped.length > 0) setPdfFiles(prev => [...prev, ...dropped]);
              }
            }}
            className="border-2 border-dashed border-white/10 hover:border-sky-500/50 rounded-xl p-4 text-center transition-colors bg-white/[0.02]"
          >
            <input
              type="file"
              id="pdf-upload-input"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.txt"
              onChange={(e) => {
                if (e.target.files) setPdfFiles(prev => [...prev, ...Array.from(e.target.files!)]);
              }}
              className="hidden"
            />
            <label htmlFor="pdf-upload-input" className="cursor-pointer flex flex-col items-center gap-1.5">
              <Upload className="w-5 h-5 text-sky-400" />
              <span className="text-xs font-semibold text-white">Clique para selecionar documentos ou arraste aqui</span>
              <span className="text-[11px] text-zinc-500">PDF, Excel (.xlsx), Word (.docx), Imagens e ZIP</span>
            </label>
          </div>

          {pdfFiles.length > 0 && (
            <div className="space-y-1.5 mt-2 max-h-32 overflow-y-auto">
              {pdfFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10 text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="text-white truncate font-medium">{file.name}</span>
                    <span className="text-zinc-500 text-[10px] shrink-0">({formatBytes(file.size)})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPdfFiles(prev => prev.filter((_, i) => i !== idx))}
                    className="p-1 text-zinc-400 hover:text-rose-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ANEXOS ATUAIS SE EM EDIÇÃO */}
        {editingProject && (editingProject.kmz_path || editingProject.pdf_path) && (
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
            <div className="text-xs font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-amber-400" />
                <span>Anexos já salvos neste projeto:</span>
              </span>
              <span className="text-[11px] text-zinc-400">{attachmentCount(editingProject)} arquivo(s)</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {getProjectFiles(editingProject).map((f, i) => (
                <a
                  key={i}
                  href={f.url}
                  download={f.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3 h-3 text-sky-400" />
                  <span className="truncate max-w-[160px]">{f.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL DE UPLOAD RÁPIDO / CARREGAR ARQUIVO NO PROJETO */}
      <Modal
        open={Boolean(quickUploadProject)}
        onClose={() => {
          if (!isQuickUploading) {
            setQuickUploadProject(null);
            setQuickFiles([]);
            setQuickUploadError(null);
            setQuickUploadSuccess(null);
          }
        }}
        title={`Carregar Arquivo: ${quickUploadProject?.name || ''}`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setQuickUploadProject(null);
                setQuickFiles([]);
                setQuickUploadError(null);
                setQuickUploadSuccess(null);
              }}
              disabled={isQuickUploading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleQuickUpload}
              disabled={isQuickUploading || quickFiles.length === 0}
              className="gap-2 !bg-[#e20613] !border-[#e20613] !text-white hover:!bg-[#c20511] font-bold"
            >
              {isQuickUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Enviar Arquivos ({quickFiles.length})</span>
                </>
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-400">
            Adicione novos mapas ou documentos a este projeto. Eles ficarão disponíveis imediatamente para download e consulta técnica.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files) {
                const dropped = Array.from(e.dataTransfer.files);
                if (dropped.length > 0) setQuickFiles(prev => [...prev, ...dropped]);
              }
            }}
            className="border-2 border-dashed border-white/15 hover:border-[#e20613]/60 rounded-2xl p-6 text-center transition-colors bg-white/[0.02]"
          >
            <input
              type="file"
              id="quick-project-upload-input"
              multiple
              onChange={(e) => {
                if (e.target.files) setQuickFiles(prev => [...prev, ...Array.from(e.target.files!)]);
              }}
              className="hidden"
            />
            <label htmlFor="quick-project-upload-input" className="cursor-pointer flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-rose-400 flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-sm font-semibold text-white">
                Clique para selecionar ou arraste arquivos aqui
              </div>
              <div className="text-xs text-zinc-500">
                Suporta Mapas (.kmz, .kml), Documentos (.pdf, .xlsx, .docx) e Imagens
              </div>
            </label>
          </div>

          {quickFiles.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              <div className="text-xs font-bold text-white flex items-center justify-between">
                <span>Arquivos prontos para envio:</span>
                <span className="text-zinc-400">{quickFiles.length} item(ns)</span>
              </div>
              {quickFiles.map((file, idx) => {
                const isMap = file.name.toLowerCase().endsWith('.kmz') || file.name.toLowerCase().endsWith('.kml');
                return (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                    <div className="flex items-center gap-2.5 truncate">
                      {isMap ? (
                        <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                      )}
                      <span className="text-white truncate font-medium">{file.name}</span>
                      <span className="text-zinc-500 text-[10px] shrink-0">({formatBytes(file.size)})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuickFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1 text-zinc-400 hover:text-rose-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {quickUploadError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{quickUploadError}</span>
            </div>
          )}

          {quickUploadSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{quickUploadSuccess}</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
