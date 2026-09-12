import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, Filter, Download, FileText,
  CheckCircle2, XCircle, Clock, AlertTriangle, Trash2,
  Upload, Image as ImageIcon, User
} from 'lucide-react';
import { api, assetUrl } from '../api/client';
import type { Auditoria, Technician } from '../api/types';
import { useAuth } from '../state/AuthContext';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';
import AccordionGallery from '../components/AccordionGallery';

function getTodayFormatted(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

function getTodayISO(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${year}-${month}-${day}`;
}

export interface ResponsibleOption {
  id: number;
  name: string;
  username?: string;
  role: string;
  company?: string;
  type: 'user' | 'tech';
}

export default function AuditoriaPage() {
  const { user } = useAuth();
  const [auditorias, setAuditorias] = useState<Auditoria[]>([]);
  const [responsibles, setResponsibles] = useState<ResponsibleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal Nova Auditoria
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newOs, setNewOs] = useState('');
  const [newResponsible, setNewResponsible] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Modal Relatorio Auditoria
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState<Auditoria | null>(null);
  const [reportStatus, setReportStatus] = useState<'Acionado' | 'Aprovado' | 'Reprovado' | 'Reclassificado'>('Acionado');
  const [reportObservations, setReportObservations] = useState('');
  const [reportAuditDate, setReportAuditDate] = useState('');
  const [reportPhotos, setReportPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [reportError, setReportError] = useState('');

  // Delete modal/action
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [auditData, techListData, usersListData] = await Promise.all([
        api.get<Auditoria[]>('/api/auditorias').catch(() => []),
        api.get<Technician[]>('/api/technicians').catch(() => []),
        api.get<{ users: ResponsibleOption[]; technicians: ResponsibleOption[] }>('/api/auditorias/users-list').catch(() => ({ users: [], technicians: [] })),
      ]);
      setAuditorias(auditData || []);

      const combined: ResponsibleOption[] = [];

      // 1. Add all technicians from #pessoas (technicians table)
      if (Array.isArray(techListData)) {
        techListData.forEach((t) => {
          if (t && t.name) {
            combined.push({
              id: t.id,
              name: t.name,
              role: t.role || 'Técnico',
              company: t.company || undefined,
              type: 'tech',
            });
          }
        });
      }

      // 2. Add from usersListData if available
      if (usersListData?.technicians) {
        usersListData.technicians.forEach((t) => {
          if (t && t.name) {
            combined.push({ ...t, type: 'tech' });
          }
        });
      }
      if (usersListData?.users) {
        usersListData.users.forEach((u) => {
          if (u && u.name) {
            combined.push({ ...u, type: 'user' });
          }
        });
      }

      // 3. Deduplicate by lowercased trimmed name
      const uniqueMap = new Map<string, ResponsibleOption>();
      combined.forEach((item) => {
        if (item && item.name) {
          const key = item.name.toLowerCase().trim();
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, item);
          }
        }
      });

      const sortedList = Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setResponsibles(sortedList);
    } catch (err) {
      console.error('Erro ao carregar auditorias:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setNewOs('');
    setNewResponsible('');
    setCreateError('');
    setCreateModalOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const cleanOs = newOs.trim();
    const cleanResp = newResponsible.trim();

    if (!cleanOs) {
      setCreateError('Informe a Ordem de Serviço (OS)');
      return;
    }
    if (!cleanResp) {
      setCreateError('Selecione o responsável técnico');
      return;
    }

    setCreating(true);
    setCreateError('');
    try {
      const selectedResp = responsibles.find((r) => r.name === cleanResp);
      await api.post('/api/auditorias', {
        os: cleanOs,
        responsible: cleanResp,
        responsible_id: selectedResp ? selectedResp.id : null,
        status: 'Acionado',
      });
      setCreateModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Erro ao criar auditoria:', err);
      setCreateError(err.message || 'Erro ao criar auditoria. Verifique os dados e tente novamente.');
    } finally {
      setCreating(false);
    }
  }

  function handleOpenReport(audit: Auditoria) {
    setSelectedAudit(audit);
    setReportStatus(audit.status);
    setReportObservations(audit.observations || '');
    setReportAuditDate(audit.audit_date || getTodayISO());
    setReportPhotos(audit.photos || []);
    setReportError('');
    setReportModalOpen(true);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (reportPhotos.length + files.length > 10) {
      setReportError(`Limite de 10 fotos excedido. Você já tem ${reportPhotos.length} fotos e tentou enviar mais ${files.length}.`);
      return;
    }

    setUploadingPhotos(true);
    setReportError('');

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('photos', files[i]);
      }
      const res = await api.postFormData<{ photos: string[] }>('/api/auditorias/upload-photos', formData);
      if (res && res.photos) {
        setReportPhotos(prev => [...prev, ...res.photos]);
      }
    } catch (err: any) {
      setReportError(err.message || 'Erro no upload das fotos');
    } finally {
      setUploadingPhotos(false);
      e.target.value = '';
    }
  }

  function handleRemovePhoto(indexToRemove: number) {
    setReportPhotos(prev => prev.filter((_, idx) => idx !== indexToRemove));
  }

  async function handleSaveReport() {
    if (!selectedAudit) return;
    setSavingReport(true);
    setReportError('');
    try {
      await api.put(`/api/auditorias/${selectedAudit.id}`, {
        status: reportStatus,
        observations: reportObservations,
        audit_date: reportAuditDate || null,
        photos: reportPhotos,
      });
      setReportModalOpen(false);
      await loadData();
    } catch (err: any) {
      setReportError(err.message || 'Erro ao salvar relatório');
    } finally {
      setSavingReport(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Tem certeza que deseja remover este registro de auditoria?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/auditorias/${id}`);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir');
    } finally {
      setDeletingId(null);
    }
  }

  // Estatísticas
  const stats = useMemo(() => {
    const total = auditorias.length;
    const acionadas = auditorias.filter(a => a.status === 'Acionado').length;
    const aprovadas = auditorias.filter(a => a.status === 'Aprovado').length;
    const reprovadas = auditorias.filter(a => a.status === 'Reprovado').length;
    const reclassificadas = auditorias.filter(a => a.status === 'Reclassificado').length;
    return { total, acionadas, aprovadas, reprovadas, reclassificadas };
  }, [auditorias]);

  // Filtros
  const filteredAuditorias = useMemo(() => {
    return auditorias.filter(item => {
      const matchSearch =
        item.os.toLowerCase().includes(search.toLowerCase()) ||
        item.responsible.toLowerCase().includes(search.toLowerCase()) ||
        item.created_by.toLowerCase().includes(search.toLowerCase()) ||
        (item.observations && item.observations.toLowerCase().includes(search.toLowerCase()));

      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [auditorias, search, statusFilter]);

  function renderStatusBadge(status: Auditoria['status']) {
    switch (status) {
      case 'Aprovado':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> Aprovado
          </span>
        );
      case 'Reprovado':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
            <XCircle className="w-3.5 h-3.5" /> Reprovado
          </span>
        );
      case 'Reclassificado':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <AlertTriangle className="w-3.5 h-3.5" /> Reclassificado
          </span>
        );
      case 'Acionado':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <Clock className="w-3.5 h-3.5" /> Acionado
          </span>
        );
    }
  }

  function formatDisplayDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '-';
    if (dateStr.includes('/')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoria de Campo"
        subtitle="Controle de ordens de serviço, vistorias e evidências fotográficas em campo"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => { window.location.href = '/api/auditorias/export'; }}
              className="gap-2 text-xs"
            >
              <Download className="w-4 h-4 text-[var(--color-primary)]" />
              Exportar
            </Button>
            <Button
              variant="primary"
              onClick={handleOpenCreate}
              className="gap-2 text-xs shadow-[0_0_20px_rgba(238,44,36,0.3)]"
            >
              <Plus className="w-4 h-4" />
              Nova Auditoria
            </Button>
          </div>
        }
      />

      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card className="p-4 flex items-center gap-3 border border-white/5 bg-white/[0.02]">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-faint)] font-medium">Total OS</div>
            <div className="text-xl font-black text-white">{stats.total}</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border border-sky-500/20 bg-sky-500/5">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-sky-300 font-medium">Acionadas</div>
            <div className="text-xl font-black text-sky-400">{stats.acionadas}</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border border-emerald-500/20 bg-emerald-500/5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-emerald-300 font-medium">Aprovadas</div>
            <div className="text-xl font-black text-emerald-400">{stats.aprovadas}</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border border-red-500/20 bg-red-500/5">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-red-300 font-medium">Reprovadas</div>
            <div className="text-xl font-black text-red-400">{stats.reprovadas}</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border border-amber-500/20 bg-amber-500/5 col-span-2 sm:col-span-1">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-300 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-amber-200 font-medium">Reclassificadas</div>
            <div className="text-xl font-black text-amber-300">{stats.reclassificadas}</div>
          </div>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="p-4 border border-white/5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por OS, responsável, criador ou observação..."
              className="pl-10 text-xs sm:text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-44 text-xs font-semibold"
            >
              <option value="ALL">Todos os Status</option>
              <option value="Acionado">Acionado</option>
              <option value="Aprovado">Aprovado</option>
              <option value="Reprovado">Reprovado</option>
              <option value="Reclassificado">Reclassificado</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Tabela de Auditorias */}
      <Card className="overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-[var(--color-text-faint)] font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">OS</th>
                <th className="py-3.5 px-4">Data</th>
                <th className="py-3.5 px-4">Criada por</th>
                <th className="py-3.5 px-4">Responsável</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Data Auditoria</th>
                <th className="py-3.5 px-4 text-center">Fotos</th>
                <th className="py-3.5 px-4 text-center">Abrir Relatório</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[var(--color-text-faint)]">
                    <div className="inline-flex items-center gap-2">
                      <Clock className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
                      Carregando auditorias...
                    </div>
                  </td>
                </tr>
              ) : filteredAuditorias.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[var(--color-text-faint)]">
                    Nenhuma auditoria encontrada.
                  </td>
                </tr>
              ) : (
                filteredAuditorias.map((item) => {
                  const isReclass = item.status === 'Reclassificado';
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-white/[0.03] transition-colors ${
                        isReclass ? 'bg-amber-500/[0.05]' : ''
                      }`}
                    >
                      {/* OS com destaque amarelo se reclassificado ou duplicado */}
                      <td className="py-3.5 px-4 font-bold">
                        <div className="flex items-center gap-2">
                          {isReclass ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-400 text-black font-extrabold text-xs shadow-sm flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {item.os}
                            </span>
                          ) : (
                            <span className="text-white font-mono font-bold">
                              {item.os}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[var(--color-text-muted)]">
                        {formatDisplayDate(item.created_date)}
                      </td>
                      <td className="py-3.5 px-4 text-[var(--color-text)] font-medium">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-[var(--color-text-faint)]" />
                          {item.created_by}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-white font-semibold">
                        {item.responsible}
                      </td>
                      <td className="py-3.5 px-4">
                        {renderStatusBadge(item.status)}
                      </td>
                      <td className="py-3.5 px-4 text-[var(--color-text-muted)]">
                        {formatDisplayDate(item.audit_date)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {item.photos && item.photos.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-white/10 text-white">
                            <ImageIcon className="w-3 h-3 text-[var(--color-primary)]" />
                            {item.photos.length}
                          </span>
                        ) : (
                          <span className="text-[var(--color-text-faint)] text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <Button
                          variant="outline"
                          onClick={() => handleOpenReport(item)}
                          className="h-8 px-3 rounded-xl text-xs gap-1.5 bg-white/[0.04] hover:bg-[var(--color-primary)]/20 hover:border-[var(--color-primary)]/40 hover:text-white border-white/10"
                        >
                          <Plus className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                          <span>Incluir / Ver</span>
                        </Button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          className="p-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Excluir Auditoria"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL NOVA AUDITORIA */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Nova Auditoria de OS"
        maxWidth="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={creating || !newOs.trim() || !newResponsible.trim()}
            >
              {creating ? 'Criando...' : 'Criar Auditoria'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <Field label="Ordem de Serviço (OS)" hint="Se o número da OS já existir, o registro anterior será reclassificado automaticamente.">
            <Input
              value={newOs}
              onChange={(e) => setNewOs(e.target.value)}
              placeholder="Ex: OS-984321 ou 123456"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data de Entrada">
              <Input
                value={getTodayFormatted()}
                disabled
                className="opacity-70 bg-white/[0.02] cursor-not-allowed"
              />
            </Field>

            <Field label="Criado por">
              <Input
                value={user?.username || 'Administrador'}
                disabled
                className="opacity-70 bg-white/[0.02] cursor-not-allowed"
              />
            </Field>
          </div>

          <Field label="Responsável Técnico (#pessoas / Usuário)" hint="Selecione qualquer colaborador cadastrado em #pessoas ou usuário do CRM.">
            <Select
              value={newResponsible}
              onChange={(e) => setNewResponsible(e.target.value)}
              className="font-semibold text-sm"
              required
            >
              <option value="">Selecione o responsável técnico...</option>
              {responsibles.map((r) => (
                <option key={`${r.type}_${r.id}_${r.name}`} value={r.name}>
                  {r.name} {r.role ? `— ${r.role}` : ''} {r.company ? `(${r.company})` : ''}
                </option>
              ))}
            </Select>
            {responsibles.length === 0 && (
              <Input
                value={newResponsible}
                onChange={(e) => setNewResponsible(e.target.value)}
                placeholder="Nome do técnico ou usuário responsável"
                className="mt-2"
              />
            )}
          </Field>

          <Field label="Status Inicial">
            <div className="h-11 px-4 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-sm font-bold flex items-center gap-2">
              <Clock className="w-4 h-4" /> Acionado (Padrão)
            </div>
          </Field>
        </form>
      </Modal>

      {/* MODAL RELATÓRIO DE AUDITORIA (+ / INCLUIR) */}
      <Modal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        title={`Relatório de Auditoria — OS ${selectedAudit?.os || ''}`}
        maxWidth="max-w-3xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button variant="outline" onClick={() => setReportModalOpen(false)}>
              Fechar
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveReport}
              disabled={savingReport || uploadingPhotos}
              className="gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {savingReport ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {reportError && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{reportError}</span>
            </div>
          )}

          {/* Dados Resumidos da OS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/5 text-xs">
            <div>
              <span className="text-[var(--color-text-faint)] block">OS:</span>
              <span className="font-bold text-white text-sm">{selectedAudit?.os}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-faint)] block">Data de Criação:</span>
              <span className="text-white font-medium">{formatDisplayDate(selectedAudit?.created_date)}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-faint)] block">Criado Por:</span>
              <span className="text-white font-medium">{selectedAudit?.created_by}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-faint)] block">Responsável:</span>
              <span className="text-white font-medium">{selectedAudit?.responsible}</span>
            </div>
          </div>

          {/* Status & Data da Auditoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Status da Auditoria">
              <Select
                value={reportStatus}
                onChange={(e) => setReportStatus(e.target.value as any)}
                className="font-bold text-sm"
              >
                <option value="Acionado">Acionado (Aguardando vistoria)</option>
                <option value="Aprovado">Aprovado (Conforme padrão)</option>
                <option value="Reprovado">Reprovado (Não atende normas)</option>
                <option value="Reclassificado">Reclassificado (OS Reincidente)</option>
              </Select>
            </Field>

            <Field label="Data da Auditoria / Vistoria">
              <Input
                type="date"
                value={reportAuditDate}
                onChange={(e) => setReportAuditDate(e.target.value)}
              />
            </Field>
          </div>

          {/* Seção de Fotos (Até 10 fotos) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                  Evidências Fotográficas ({reportPhotos.length}/10)
                </label>
                <p className="text-[11px] text-[var(--color-text-faint)]">
                  Envie até 10 fotos de vistoria do local, caixa de emenda, cabeamento ou postes.
                </p>
              </div>

              {reportPhotos.length < 10 && (
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-white cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span>{uploadingPhotos ? 'Enviando...' : 'Adicionar Fotos'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={uploadingPhotos}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Visualização de Fotos via AccordionGallery quando há 2 ou mais fotos */}
            {reportPhotos.length >= 2 ? (
              <div className="space-y-3">
                <AccordionGallery
                  images={reportPhotos.map((url, idx) => ({
                    url: assetUrl(url),
                    title: `Evidência ${idx + 1} · OS ${selectedAudit?.os || ''}`,
                    subtitle: `Técnico: ${selectedAudit?.responsible || 'Campo'} — Foto ${idx + 1} de ${reportPhotos.length}`,
                    description: `Registro fotográfico de auditoria da OS ${selectedAudit?.os || ''}`,
                  }))}
                  height="h-64 sm:h-72"
                />

                {/* Lista de miniaturas para exclusão individual */}
                <div className="flex items-center gap-2 overflow-x-auto py-2">
                  {reportPhotos.map((photo, idx) => (
                    <div key={idx} className="relative group shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-white/10 bg-black/40">
                      <img src={assetUrl(photo)} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute inset-0 bg-red-950/80 text-red-300 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        title="Remover foto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : reportPhotos.length === 1 ? (
              <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 p-2">
                <div className="relative h-64 rounded-xl overflow-hidden group">
                  <img
                    src={assetUrl(reportPhotos[0])}
                    alt="Evidência única"
                    className="w-full h-full object-contain bg-black/60"
                  />
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(0)}
                      className="p-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white backdrop-blur-md transition-colors"
                      title="Remover foto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 border-2 border-dashed border-white/10 rounded-2xl text-center flex flex-col items-center justify-center gap-2 text-[var(--color-text-faint)] bg-white/[0.01]">
                <ImageIcon className="w-8 h-8 opacity-40" />
                <p className="text-xs font-medium">Nenhuma foto anexada ainda.</p>
                <p className="text-[11px]">Clique em "Adicionar Fotos" acima para anexar evidências de campo.</p>
              </div>
            )}
          </div>

          {/* Campo de Observações da Auditoria / Descrever Aceitação */}
          <Field
            label="Pontos Importantes da Auditoria / Descrever Aceitação"
            hint="Descreva anotações técnicas, não conformidades, detalhes do reparo ou justificativa de aprovação/reprovação."
          >
            <Textarea
              rows={4}
              value={reportObservations}
              onChange={(e) => setReportObservations(e.target.value)}
              placeholder="Digite aqui as observações detalhadas da auditoria..."
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
