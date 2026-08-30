import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ExternalLink, File, FolderOpen, FolderPlus, Home, Paperclip, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Project, ProjectFolder } from '../api/types';
import { Button, Card, Field, Input, PageHeader, Textarea } from '../components/ui';
import Modal from '../components/Modal';
import { isCoordenador, useAuth } from '../state/AuthContext';

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

const emptyProjectForm = { name: '', description: '', area: '' };

export default function ProjectsPage() {
  const { user } = useAuth();
  const canManage = isCoordenador(user);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: 'Projetos' }]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<ProjectFolder | null>(null);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [kmzFiles, setKmzFiles] = useState<FileList | null>(null);
  const [pdfFiles, setPdfFiles] = useState<FileList | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentFolderId = crumbs[crumbs.length - 1].id;

  function load(folderId: number | null) {
    setLoading(true);
    api.get<{ folders: ProjectFolder[]; projects: Project[] }>('/api/folders', { parent_id: folderId ?? undefined })
      .then((res) => { setFolders(sortFoldersByLeadingNumber(res.folders)); setProjects(res.projects); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(currentFolderId); }, [currentFolderId]);

  function enterFolder(folder: ProjectFolder) {
    setCrumbs((c) => [...c, { id: folder.id, name: folder.name }]);
  }
  function goToCrumb(idx: number) {
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
    setKmzFiles(null);
    setPdfFiles(null);
    setError(null);
    setProjectModalOpen(true);
  }
  function openEditProject(p: Project) {
    setEditingProject(p);
    setProjectForm({ name: p.name, description: p.description || '', area: p.area || '' });
    setKmzFiles(null);
    setPdfFiles(null);
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
      if (kmzFiles) Array.from(kmzFiles).forEach((f) => fd.append('kmz_file', f));
      if (pdfFiles) Array.from(pdfFiles).forEach((f) => fd.append('pdf_file', f));
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
    if (!q) return projects;
    return projects.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.area || '').toLowerCase().includes(q)
    );
  }, [projects, search]);

  return (
    <div>
      <PageHeader
        title="Projetos"
        subtitle="Projetos de rede externa organizados em pastas"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openCreateFolder}><FolderPlus className="w-4 h-4" /> Nova Pasta</Button>
            <Button onClick={openCreateProject}><Plus className="w-4 h-4" /> Novo Projeto</Button>
          </div>
        }
      />

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar pastas ou projetos por nome, área..."
          className="pl-11 rounded-full"
        />
      </div>

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
              {canManage && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => openRenameFolder(f)} aria-label="Renomear pasta" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteFolder(f)} aria-label="Excluir pasta" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]"><Trash2 className="w-3.5 h-3.5" /></button>
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
              <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
                <a href={`/p/project/${p.id}`} target="_blank" rel="noopener noreferrer" className="flex-1 h-9 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07] transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> Ver Público
                </a>
                <button onClick={() => openEditProject(p)} aria-label="Editar projeto" className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]"><Pencil className="w-4 h-4" /></button>
                {canManage && (
                  <button onClick={() => deleteProject(p)} aria-label="Excluir projeto" className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

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
        <Field label="Mapas (.kmz, .kml)" hint={editingProject?.kmz_path ? 'Enviar novos arquivos substitui os existentes.' : undefined}>
          <input type="file" multiple accept=".kmz,.kml" onChange={(e) => setKmzFiles(e.target.files)} className="w-full text-sm text-[var(--color-text-muted)] file:mr-3 file:h-9 file:px-4 file:rounded-full file:border-0 file:bg-white/[0.06] file:text-[var(--color-text)] file:text-sm" />
        </Field>
        <Field label="Documentos (PDF, planilhas...)" hint={editingProject?.pdf_path ? 'Enviar novos arquivos substitui os existentes.' : undefined}>
          <input type="file" multiple onChange={(e) => setPdfFiles(e.target.files)} className="w-full text-sm text-[var(--color-text-muted)] file:mr-3 file:h-9 file:px-4 file:rounded-full file:border-0 file:bg-white/[0.06] file:text-[var(--color-text)] file:text-sm" />
        </Field>
        {editingProject && (editingProject.kmz_path || editingProject.pdf_path) && (
          <div className="text-xs text-[var(--color-text-faint)] flex items-center gap-1.5"><File className="w-3.5 h-3.5" /> Anexos atuais: {attachmentCount(editingProject)}</div>
        )}
      </Modal>
    </div>
  );
}
