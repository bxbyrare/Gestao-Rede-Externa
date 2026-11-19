import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../state/AuthContext';

interface SyncMeta {
  last_sync_at: string | null;
  status: string;
  error: string | null;
  interval_seconds: number;
  seconds_to_next: number;
  manual_override_active?: boolean;
  manual_updated_at?: string | null;
  manual_updated_by?: string | null;
  github_last_changed_at?: string | null;
  github_stale_minutes?: number;
  github_is_stale?: boolean;
}

interface RegionalTotals {
  ral: number;
  rec: number;
  qualidade: number;
}

interface CfSummary {
  cf: string;
  label: string;
  regional: 'ES' | 'INTERIOR' | 'CAPITAL';
  ral: number;
  rec: number;
  qualidade: number;
  new_ral: number;
  new_rec: number;
  new_qualidade: number;
  overdue_ral: number;
  overdue_rec: number;
}

interface NewFeedItem {
  id: number;
  ticket_number: string;
  ticket_type: 'RAL' | 'REC';
  cf: string;
  regional: string;
  designation: string;
  cliente: string;
  tipo_ral: string;
  is_qualidade: boolean;
  abertura_raw: string;
  sla_status: string;
  sla_label: string;
}

interface TicketNote {
  id: number;
  content: string;
  author_user_id: number | null;
  author_name: string;
  created_at: string;
  updated_at: string;
}

interface GrafanaTicket {
  id: number;
  ticket_key: string;
  ticket_type: 'RAL' | 'REC';
  ticket_number: string;
  cf: string;
  cf_label: string;
  regional: string;
  cf_exec_raw: string;
  designation: string;
  tipo_ral: string;
  is_qualidade: boolean;
  cliente: string;
  anorm: string;
  abertura_raw: string;
  abertura_iso: string | null;
  duracao_raw: string;
  status_andamento: string;
  responsible_user_id: number | null;
  responsible_name: string;
  distancia?: string;
  referencia?: string;
  endereco?: string;
  is_new: boolean;
  notes: TicketNote[];
  sla_hours: number;
  sla_status: 'ok' | 'overdue' | 'unknown';
  sla_label: string;
  sla_whatsapp: string;
  sla_delta_minutes: number;
}

interface ClearedTicket {
  id: number;
  ticket_type: 'RAL' | 'REC';
  ticket_number: string;
  cf: string;
  regional: string;
  designation: string;
  tipo_ral: string;
  is_qualidade: boolean;
  cliente: string;
  abertura_raw: string;
  status_andamento: string;
  responsible_name: string;
  distancia?: string;
  referencia?: string;
  endereco?: string;
  notes: TicketNote[];
  cleared_at: string;
}

interface PersonOption {
  key: string;
  tech_id: number | null;
  user_id: number | null;
  name: string;
  username: string;
  role: string;
  company: string;
}

interface RalTimelineItem {
  ticket_type?: 'RAL' | 'REC';
  ticket_number: string;
  cf: string;
  regional: 'ES' | 'INTERIOR' | 'CAPITAL';
  designation: string;
  cliente?: string;
  abertura_raw: string;
  elapsed_minutes: number | null;
}

type QueueType = 'RAL' | 'REC' | 'QUALIDADE';
type SortField = 'classification' | 'abertura' | 'cliente';

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  'Equipe acionada': { bg: 'bg-[#3b82f6]', text: 'text-white', dot: 'bg-[#3b82f6]', border: 'border-[#3b82f6]/50' },
  'Transferir': { bg: 'bg-[#c4b5fd]', text: 'text-slate-950', dot: 'bg-[#c4b5fd]', border: 'border-[#c4b5fd]/50' },
  'Falha concorrente': { bg: 'bg-[#fed7aa]', text: 'text-slate-950', dot: 'bg-[#fed7aa]', border: 'border-[#fed7aa]/50' },
  'Validação': { bg: 'bg-[#fde047]', text: 'text-slate-950', dot: 'bg-[#fde047]', border: 'border-[#fde047]/50' },
  'Conjunta': { bg: 'bg-[#fb923c]', text: 'text-slate-950', dot: 'bg-[#fb923c]', border: 'border-[#fb923c]/50' },
  'Área de Risco': { bg: 'bg-[#ef4444]', text: 'text-white', dot: 'bg-[#ef4444]', border: 'border-[#ef4444]/50' },
  'Pendencia Encerramento': { bg: 'bg-[#bef264]', text: 'text-slate-950', dot: 'bg-[#bef264]', border: 'border-[#bef264]/50' },
  'Acesso': { bg: 'bg-[#9ca3af]', text: 'text-white', dot: 'bg-[#9ca3af]', border: 'border-[#9ca3af]/50' },
  'Indisp. Técnica': { bg: 'bg-[#b91c1c]', text: 'text-white', dot: 'bg-[#b91c1c]', border: 'border-[#b91c1c]/50' },
  'Capex': { bg: 'bg-[#06b6d4]', text: 'text-slate-950', dot: 'bg-[#06b6d4]', border: 'border-[#06b6d4]/50' },
  'Sem classificação': { bg: 'bg-white/10', text: 'text-slate-300', dot: 'bg-slate-400', border: 'border-white/15' },
};

const ALL_STATUSES = [
  'Equipe acionada',
  'Transferir',
  'Falha concorrente',
  'Validação',
  'Conjunta',
  'Área de Risco',
  'Pendencia Encerramento',
  'Acesso',
  'Indisp. Técnica',
  'Capex',
  'Sem classificação',
];

function formatCountdown(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function GrafanaCountdownBadge({
  syncSeconds,
  syncTick,
  onRefresh,
}: {
  syncSeconds: number;
  syncTick: number;
  onRefresh: () => void;
}) {
  const [sec, setSec] = useState(syncSeconds);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    setSec(syncSeconds);
  }, [syncSeconds, syncTick]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (sec === 0) {
      onRefreshRef.current();
      setSec(300);
    }
  }, [sec]);

  return (
    <span>
      Auto-atualização em <strong className="text-emerald-400 font-mono">{formatCountdown(sec)}</strong>
    </span>
  );
}

function getCountTone(count: number, type: QueueType): string {
  if (count === 0) return 'bg-white/[0.03] border-white/5 text-slate-500';
  if (type === 'QUALIDADE') {
    return count >= 5
      ? 'bg-violet-500/20 border-violet-400/40 text-violet-200'
      : 'bg-violet-500/10 border-violet-500/25 text-violet-300';
  }
  if (count >= 10) return 'bg-[#e20613]/20 border-[#e20613]/45 text-red-200';
  if (count >= 5) return 'bg-amber-500/18 border-amber-400/40 text-amber-200';
  return 'bg-emerald-500/14 border-emerald-500/30 text-emerald-300';
}

export default function GrafanaPage() {
  const { user: currentUser } = useAuth();
  const myAreasStorageKey = useMemo(() => {
    const uid = currentUser?.id ?? currentUser?.username ?? 'anon';
    return `grafana_my_areas_${uid}`;
  }, [currentUser?.id, currentUser?.username]);
  const myAreasActiveKey = useMemo(() => `${myAreasStorageKey}_active`, [myAreasStorageKey]);

  const [myAreas, setMyAreas] = useState<string[]>([]);
  const [myAreasActive, setMyAreasActive] = useState<boolean>(false);
  const [showMyAreasModal, setShowMyAreasModal] = useState<boolean>(false);
  const [draftMyAreas, setDraftMyAreas] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(myAreasStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setMyAreas(Array.isArray(parsed) ? parsed : []);
      const rawActive = localStorage.getItem(myAreasActiveKey);
      setMyAreasActive(rawActive === 'true' && Array.isArray(parsed) && parsed.length > 0);
    } catch {
      setMyAreas([]);
      setMyAreasActive(false);
    }
  }, [myAreasStorageKey, myAreasActiveKey]);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [totals, setTotals] = useState<Record<string, RegionalTotals>>({
    ALL: { ral: 0, rec: 0, qualidade: 0 },
    ES: { ral: 0, rec: 0, qualidade: 0 },
    INTERIOR: { ral: 0, rec: 0, qualidade: 0 },
    CAPITAL: { ral: 0, rec: 0, qualidade: 0 },
  });
  const [cfs, setCfs] = useState<CfSummary[]>([]);
  const [qualChart, setQualChart] = useState<{ cf: string; label: string; count: number }[]>([]);
  const [ralTimeline, setRalTimeline] = useState<RalTimelineItem[]>([]);
  const [timelineTypeFilter, setTimelineTypeFilter] = useState<'RAL' | 'REC'>('RAL');
  const [timelineAreaFilter, setTimelineAreaFilter] = useState<string>('ALL');
  const [timelineWindowFilter, setTimelineWindowFilter] = useState<'ALL' | 'WITHIN_24H' | 'OVER_24H'>('ALL');
  const [selectedTimelineBucket, setSelectedTimelineBucket] = useState<string | null>(null);
  const [newFeed, setNewFeed] = useState<{ ral: NewFeedItem[]; rec: NewFeedItem[] }>({ ral: [], rec: [] });
  const [clearedTotal, setClearedTotal] = useState(0);
  const [syncMeta, setSyncMeta] = useState<SyncMeta>({
    last_sync_at: null,
    status: 'pending',
    error: null,
    interval_seconds: 300,
    seconds_to_next: 300,
  });
  const [syncSeconds, setSyncSeconds] = useState(300);
  const [syncTick, setSyncTick] = useState(0);
  const [serverTime, setServerTime] = useState('');

  // Drill-down selection
  const [selectedCf, setSelectedCf] = useState<string | null>(null);
  const [selectedQueue, setSelectedQueue] = useState<QueueType>('RAL');
  const [tickets, setTickets] = useState<GrafanaTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('abertura');
  const [sortAsc, setSortAsc] = useState(true);
  const [chartMode, setChartMode] = useState<QueueType>('RAL');

  // Cleared (Sanadas) drawer/modal
  const [showCleared, setShowCleared] = useState(false);
  const [clearedList, setClearedList] = useState<ClearedTicket[]>([]);
  const [clearedSearch, setClearedSearch] = useState('');
  const [loadingCleared, setLoadingCleared] = useState(false);

  // Export menu
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Per-ticket UI state
  const [openStatusFor, setOpenStatusFor] = useState<number | null>(null);
  const [addingNoteFor, setAddingNoteFor] = useState<number | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [distRefDrafts, setDistRefDrafts] = useState<Record<number, { distancia: string; referencia: string; endereco: string }>>({});
  const [savedDistRefId, setSavedDistRefId] = useState<number | null>(null);
  const [clearedDistRefDrafts, setClearedDistRefDrafts] = useState<Record<number, { distancia: string; referencia: string; endereco: string }>>({});
  const [savedClearedDistRefId, setSavedClearedDistRefId] = useState<number | null>(null);

  // People autocomplete
  const [peopleList, setPeopleList] = useState<PersonOption[]>([]);
  const [respEditingFor, setRespEditingFor] = useState<number | null>(null);
  const [respQuery, setRespQuery] = useState('');

  // Manual base upload modal
  const [showManualUpload, setShowManualUpload] = useState(false);
  const [manualRalFile, setManualRalFile] = useState<File | null>(null);
  const [manualRecFile, setManualRecFile] = useState<File | null>(null);
  const [manualUploading, setManualUploading] = useState(false);
  const [manualUploadError, setManualUploadError] = useState<string | null>(null);
  const [manualUploadResult, setManualUploadResult] = useState<{
    ral_loaded: number;
    qua_loaded: number;
    rec_loaded: number;
    new_count: number;
    cleared_now: number;
    updated_types: string[];
  } | null>(null);

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.get<any>('/api/grafana/dashboard');
      setTotals(data.totals || {});
      setCfs(data.cfs || []);
      setQualChart(data.qualidade_chart || []);
      setRalTimeline(data.ral_timeline || []);
      setNewFeed(data.new_feed || { ral: [], rec: [] });
      setClearedTotal(data.cleared_total || 0);
      if (data.sync) {
        setSyncMeta(data.sync);
        setSyncSeconds(data.sync.seconds_to_next ?? 300);
        setSyncTick((n) => n + 1);
      }
      if (data.server_time_brt) setServerTime(data.server_time_brt);
    } catch (err) {
      console.error('Erro ao carregar Grafana:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTickets = useCallback(async (cf: string, queue: QueueType) => {
    setLoadingTickets(true);
    try {
      const data = await api.get<any>('/api/grafana/tickets', { cf, queue });
      setTickets(data.tickets || []);
      if (data.server_time_brt) setServerTime(data.server_time_brt);
    } catch (err) {
      console.error('Erro ao carregar tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  const fetchPeople = useCallback(async () => {
    try {
      const data = await api.get<any>('/api/grafana/people');
      setPeopleList(data.people || []);
    } catch (err) {
      console.error('Erro ao carregar pessoas:', err);
    }
  }, []);

  const fetchCleared = useCallback(async (q = '') => {
    setLoadingCleared(true);
    try {
      const data = await api.get<any>('/api/grafana/cleared', q ? { search: q } : undefined);
      setClearedList(data.cleared || []);
    } catch (err) {
      console.error('Erro ao carregar base sanadas:', err);
    } finally {
      setLoadingCleared(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchPeople();
  }, [fetchDashboard, fetchPeople]);

  const handleAutoRefresh = useCallback(() => {
    fetchDashboard(true);
    if (selectedCf) fetchTickets(selectedCf, selectedQueue);
  }, [fetchDashboard, fetchTickets, selectedCf, selectedQueue]);

  const filteredPeopleOptions = useMemo(() => {
    const q = respQuery.trim().toLowerCase();
    if (!q) return peopleList.slice(0, 8);
    return peopleList
      .filter((p) => p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q))
      .slice(0, 8);
  }, [peopleList, respQuery]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  async function handleManualSync() {
    setSyncing(true);
    try {
      await api.post('/api/grafana/sync');
      await fetchDashboard(true);
      if (selectedCf) await fetchTickets(selectedCf, selectedQueue);
    } catch (err) {
      console.error('Erro ao sincronizar:', err);
    } finally {
      setSyncing(false);
    }
  }

  function openManualUploadModal() {
    setManualUploadError(null);
    setManualUploadResult(null);
    setManualRalFile(null);
    setManualRecFile(null);
    setShowManualUpload(true);
  }

  async function handleManualUploadSubmit() {
    if (!manualRalFile && !manualRecFile) {
      setManualUploadError('Selecione ao menos uma base (RAL ou REC) para enviar.');
      return;
    }
    setManualUploading(true);
    setManualUploadError(null);
    setManualUploadResult(null);
    try {
      const fd = new FormData();
      if (manualRalFile) fd.append('ral_file', manualRalFile);
      if (manualRecFile) fd.append('rec_file', manualRecFile);
      const res = await api.postFormData<{
        success: boolean;
        updated_types: string[];
        ral_loaded: number;
        qua_loaded: number;
        rec_loaded: number;
        new_count: number;
        cleared_now: number;
      }>('/api/grafana/manual-upload', fd);
      setManualUploadResult({
        ral_loaded: res.ral_loaded || 0,
        qua_loaded: res.qua_loaded || 0,
        rec_loaded: res.rec_loaded || 0,
        new_count: res.new_count || 0,
        cleared_now: res.cleared_now || 0,
        updated_types: res.updated_types || [],
      });
      await fetchDashboard(true);
      if (selectedCf) await fetchTickets(selectedCf, selectedQueue);
    } catch (err: any) {
      setManualUploadError(err?.message || 'Falha ao enviar base manual.');
    } finally {
      setManualUploading(false);
    }
  }

  function handleSelectQueue(cf: string, queue: QueueType) {
    setSelectedCf(cf);
    setSelectedQueue(queue);
    setSearchTerm('');
    setStatusFilter('');
    setOpenStatusFor(null);
    setAddingNoteFor(null);
    setRespEditingFor(null);
    fetchTickets(cf, queue);
  }

  async function handleUpdateStatus(ticketId: number, statusVal: string) {
    setOpenStatusFor(null);
    try {
      await api.put(`/api/grafana/tickets/${ticketId}/status`, { status_andamento: statusVal });
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status_andamento: statusVal } : t))
      );
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
  }

  async function handleSetResponsible(ticketId: number, person: PersonOption | null) {
    setRespEditingFor(null);
    setRespQuery('');
    try {
      const data = await api.put<any>(`/api/grafana/tickets/${ticketId}/responsible`, {
        tech_id: person ? person.tech_id : null,
        user_id: person ? person.user_id : null,
      });
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId
            ? {
                ...t,
                responsible_user_id: data.responsible_user_id ?? null,
                responsible_name: data.responsible_name ?? '',
              }
            : t
        )
      );
    } catch (err) {
      console.error('Erro ao definir responsável:', err);
    }
  }

  async function handleAddNote(ticketId: number) {
    const content = newNoteText.trim();
    if (!content) return;
    try {
      const data = await api.post<any>(`/api/grafana/tickets/${ticketId}/notes`, { content });
      if (data.note) {
        setTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, notes: [...t.notes, data.note] } : t))
        );
      }
      setAddingNoteFor(null);
      setNewNoteText('');
    } catch (err) {
      console.error('Erro ao adicionar nota:', err);
    }
  }

  async function handleSaveEditNote(ticketId: number, noteId: number) {
    const content = editNoteText.trim();
    if (!content) return;
    try {
      const data = await api.put<any>(`/api/grafana/notes/${noteId}`, { content });
      if (data.note) {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId
              ? { ...t, notes: t.notes.map((n) => (n.id === noteId ? data.note : n)) }
              : t
          )
        );
      }
      setEditingNoteId(null);
      setEditNoteText('');
    } catch (err) {
      console.error('Erro ao editar nota:', err);
    }
  }

  async function handleDeleteNote(ticketId: number, noteId: number) {
    try {
      await api.delete(`/api/grafana/notes/${noteId}`);
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId ? { ...t, notes: t.notes.filter((n) => n.id !== noteId) } : t
        )
      );
    } catch (err) {
      console.error('Erro ao remover nota:', err);
    }
  }

  async function copyQuickText(key: string, value: string) {
    const clean = (value || '').trim();
    if (!clean || clean === '-') return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(clean);
      } else {
        const ta = document.createElement('textarea');
        ta.value = clean;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedId(key);
      setTimeout(() => setCopiedId((curr) => (curr === key ? null : curr)), 1800);
    } catch {
      // ignore clipboard errors
    }
  }

  async function handleSaveDistRef(ticket: GrafanaTicket) {
    const draft = distRefDrafts[ticket.id];
    const distancia = (draft ? draft.distancia : ticket.distancia || '').trim();
    const referencia = (draft ? draft.referencia : ticket.referencia || '').trim();
    const endereco = (draft ? draft.endereco : ticket.endereco || '').trim();
    if (
      distancia === (ticket.distancia || '') &&
      referencia === (ticket.referencia || '') &&
      endereco === (ticket.endereco || '')
    ) {
      return;
    }
    try {
      const res = await api.put<{ success: boolean; distancia: string; referencia: string; endereco: string }>(
        `/api/grafana/tickets/${ticket.id}/dist-ref`,
        { distancia, referencia, endereco }
      );
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticket.id
            ? {
                ...t,
                distancia: res.distancia ?? distancia,
                referencia: res.referencia ?? referencia,
                endereco: res.endereco ?? endereco,
              }
            : t
        )
      );
      setSavedDistRefId(ticket.id);
      setTimeout(() => setSavedDistRefId((curr) => (curr === ticket.id ? null : curr)), 2000);
    } catch (err) {
      console.error('Erro ao salvar DIST/REF/Endereço:', err);
    }
  }

  async function handleSaveClearedDistRef(item: ClearedTicket) {
    const draft = clearedDistRefDrafts[item.id];
    const distancia = (draft ? draft.distancia : item.distancia || '').trim();
    const referencia = (draft ? draft.referencia : item.referencia || '').trim();
    const endereco = (draft ? draft.endereco : item.endereco || '').trim();
    if (
      distancia === (item.distancia || '') &&
      referencia === (item.referencia || '') &&
      endereco === (item.endereco || '')
    ) {
      return;
    }
    try {
      const res = await api.put<{ success: boolean; distancia: string; referencia: string; endereco: string }>(
        `/api/grafana/cleared/${item.id}/dist-ref`,
        { distancia, referencia, endereco }
      );
      setClearedList((prev) =>
        prev.map((c) =>
          c.id === item.id
            ? {
                ...c,
                distancia: res.distancia ?? distancia,
                referencia: res.referencia ?? referencia,
                endereco: res.endereco ?? endereco,
              }
            : c
        )
      );
      setSavedClearedDistRefId(item.id);
      setTimeout(() => setSavedClearedDistRefId((curr) => (curr === item.id ? null : curr)), 2000);
    } catch (err) {
      console.error('Erro ao salvar DIST/REF/Endereço no histórico:', err);
    }
  }

  function formatSingleWhatsapp(t: GrafanaTicket): string {
    const lines =
      t.ticket_type === 'REC'
        ? [
            `🏷 *${t.ticket_number}* — 📍 CF ${t.cf}`,
            `📋 Designação: ${t.designation || '-'}`,
            `👤 Cliente: ${t.cliente || '-'}`,
            `📅 Abertura: ${t.abertura_raw || '-'}`,
            `⏳ SLA: ${t.sla_whatsapp}`,
          ]
        : [
            `🏷 *${t.ticket_number}* — 📍 CF ${t.cf}`,
            `📋 Designação: ${t.designation || '-'}`,
            `🛠 Tipo: ${t.tipo_ral || '-'}`,
            `📅 Abertura: ${t.abertura_raw || '-'}`,
            `⏳ SLA: ${t.sla_whatsapp}`,
          ];

    if (t.status_andamento && t.status_andamento !== 'Sem classificação') {
      lines.push(`📌 Status: ${t.status_andamento}`);
    }
    if (t.responsible_name) {
      lines.push(`👷 Acionado / Responsável: ${t.responsible_name}`);
    }
    if (t.distancia) {
      lines.push(`📏 DIST (Distância): ${t.distancia}`);
    }
    if (t.referencia) {
      lines.push(`📍 REF (Referência): ${t.referencia}`);
    }
    if (t.endereco) {
      lines.push(`🗺 Endereço da Falha: ${t.endereco}`);
    }
    if (t.notes && t.notes.length > 0) {
      if (t.notes.length === 1) {
        const n = t.notes[0];
        lines.push(`📝 Observação: ${n.content} _(${n.author_name} · ${n.created_at})_`);
      } else {
        lines.push('📝 Observações:');
        for (const n of t.notes) {
          lines.push(`  • ${n.content} _(${n.author_name} · ${n.created_at})_`);
        }
      }
    }
    return lines.join('\n');
  }

  function copyText(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId((curr) => (curr === key ? null : curr)), 2000);
  }

  function handleCopyAllArea() {
    if (!selectedCf || filteredTickets.length === 0) return;
    const cfInfo = cfs.find((c) => c.cf === selectedCf);
    const cfLabel = cfInfo ? `${selectedCf} - ${cfInfo.label}` : selectedCf;
    const isRec = selectedQueue === 'REC';
    const typePlural = isRec ? "REC's" : "RAL's";
    const countLabel = isRec ? 'RECs' : 'RALs';
    const stamp = serverTime || new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const header = `🚨 *COP REDE — ${typePlural} em tela no CF ${cfLabel}*\n📊 ${filteredTickets.length} ${countLabel} · 📅 ${stamp}`;
    const body = filteredTickets.map(formatSingleWhatsapp).join('\n\n');
    copyText('batch', `${header}\n\n${body}`);
  }

  function handleExportCsv(scope: 'active' | 'filtered' | 'cleared' | 'all') {
    setShowExportMenu(false);
    const params = new URLSearchParams();
    if (scope === 'filtered') {
      params.set('scope', 'active');
      if (selectedCf) params.set('cf', selectedCf);
      if (selectedCf) params.set('queue', selectedQueue);
      if (statusFilter) params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
    } else {
      params.set('scope', scope);
    }
    window.open(`/api/grafana/export?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  const filteredTickets = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = tickets.filter((t) => {
      if (statusFilter && t.status_andamento !== statusFilter) return false;
      if (!q) return true;
      return (
        t.ticket_number.toLowerCase().includes(q) ||
        (t.designation || '').toLowerCase().includes(q) ||
        (t.cliente || '').toLowerCase().includes(q) ||
        (t.tipo_ral || '').toLowerCase().includes(q) ||
        (t.responsible_name || '').toLowerCase().includes(q) ||
        (t.distancia || '').toLowerCase().includes(q) ||
        (t.referencia || '').toLowerCase().includes(q) ||
        (t.endereco || '').toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'classification') {
        cmp = (a.status_andamento || '').localeCompare(b.status_andamento || '', 'pt-BR');
      } else if (sortField === 'cliente') {
        cmp = (a.cliente || a.tipo_ral || '').localeCompare(b.cliente || b.tipo_ral || '', 'pt-BR');
      } else {
        cmp = (a.abertura_iso || '').localeCompare(b.abertura_iso || '');
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [tickets, searchTerm, statusFilter, sortField, sortAsc]);

  const myAreaSet = useMemo(() => new Set(myAreas), [myAreas]);
  const isMyAreasFiltered = myAreasActive && myAreas.length > 0;

  const visibleCfs = useMemo(() => {
    if (!isMyAreasFiltered) return cfs;
    return cfs.filter((c) => myAreaSet.has(c.cf));
  }, [cfs, isMyAreasFiltered, myAreaSet]);

  const visibleTotals = useMemo<Record<string, RegionalTotals>>(() => {
    if (!isMyAreasFiltered) return totals;
    const base: Record<string, RegionalTotals> = {
      ALL: { ral: 0, rec: 0, qualidade: 0 },
      ES: { ral: 0, rec: 0, qualidade: 0 },
      INTERIOR: { ral: 0, rec: 0, qualidade: 0 },
      CAPITAL: { ral: 0, rec: 0, qualidade: 0 },
    };
    for (const c of visibleCfs) {
      base.ALL.ral += c.ral;
      base.ALL.rec += c.rec;
      base.ALL.qualidade += c.qualidade;
      if (base[c.regional]) {
        base[c.regional].ral += c.ral;
        base[c.regional].rec += c.rec;
        base[c.regional].qualidade += c.qualidade;
      }
    }
    return base;
  }, [isMyAreasFiltered, totals, visibleCfs]);

  const visibleNewFeed = useMemo(() => {
    if (!isMyAreasFiltered) return newFeed;
    return {
      ral: newFeed.ral.filter((item) => myAreaSet.has(item.cf)),
      rec: newFeed.rec.filter((item) => myAreaSet.has(item.cf)),
    };
  }, [isMyAreasFiltered, newFeed, myAreaSet]);

  function openMyAreasSelector() {
    setDraftMyAreas(myAreas);
    setShowMyAreasModal(true);
  }

  function applyMyAreas(nextAreas: string[], activate = true) {
    const clean = Array.from(new Set(nextAreas));
    setMyAreas(clean);
    const shouldActivate = activate && clean.length > 0;
    setMyAreasActive(shouldActivate);
    try {
      localStorage.setItem(myAreasStorageKey, JSON.stringify(clean));
      localStorage.setItem(myAreasActiveKey, String(shouldActivate));
    } catch {
      // ignore storage errors
    }
    if (shouldActivate && selectedCf && !clean.includes(selectedCf)) {
      setSelectedCf(null);
    }
    setShowMyAreasModal(false);
  }

  function toggleMyAreasOff() {
    setMyAreasActive(false);
    try {
      localStorage.setItem(myAreasActiveKey, 'false');
    } catch {
      // ignore storage errors
    }
    setShowMyAreasModal(false);
  }

  const activeChartSeries = useMemo(() => {
    if (chartMode === 'QUALIDADE' && cfs.length === 0) {
      return isMyAreasFiltered ? qualChart.filter((q) => myAreaSet.has(q.cf)) : qualChart;
    }
    return visibleCfs.map((item) => ({
      cf: item.cf,
      label: item.label,
      count: chartMode === 'RAL' ? item.ral : chartMode === 'REC' ? item.rec : item.qualidade,
    }));
  }, [cfs.length, visibleCfs, qualChart, chartMode, isMyAreasFiltered, myAreaSet]);

  const maxChartValue = useMemo(() => {
    return Math.max(1, ...activeChartSeries.map((item) => item.count));
  }, [activeChartSeries]);

  const timelineStats = useMemo(() => {
    const areaFiltered = ralTimeline.filter((item) => {
      if ((item.ticket_type || 'RAL') !== timelineTypeFilter) return false;
      if (isMyAreasFiltered && !myAreaSet.has(item.cf)) return false;
      if (timelineAreaFilter === 'ALL') return true;
      if (timelineAreaFilter.startsWith('REG:')) {
        return item.regional === timelineAreaFilter.slice(4);
      }
      return item.cf === timelineAreaFilter;
    });

    const buckets = [
      { id: '0-2h', label: '0–2h', zone: 'within_24h' as const, min: 0, max: 120, items: [] as RalTimelineItem[] },
      { id: '2-4h', label: timelineTypeFilter === 'REC' ? '2–4h (SLA)' : '2–4h', zone: 'within_24h' as const, min: 120, max: 240, items: [] as RalTimelineItem[] },
      { id: '4-6h', label: timelineTypeFilter === 'RAL' ? '4–6h (SLA)' : '4–6h', zone: 'within_24h' as const, min: 240, max: 360, items: [] as RalTimelineItem[] },
      { id: '6-12h', label: '6–12h', zone: 'within_24h' as const, min: 360, max: 720, items: [] as RalTimelineItem[] },
      { id: '12-24h', label: '12–24h', zone: 'within_24h' as const, min: 720, max: 1440, items: [] as RalTimelineItem[] },
      { id: '24-48h', label: '24–48h', zone: 'over_24h' as const, min: 1440, max: 2880, items: [] as RalTimelineItem[] },
      { id: '48-72h', label: '48–72h', zone: 'over_24h' as const, min: 2880, max: 4320, items: [] as RalTimelineItem[] },
      { id: '72h+', label: '+72h', zone: 'over_24h' as const, min: 4320, max: Infinity, items: [] as RalTimelineItem[] },
    ];

    let within24 = 0;
    let over24 = 0;

    for (const item of areaFiltered) {
      const m = item.elapsed_minutes;
      if (m === null || m === undefined) continue;
      if (m <= 1440) within24 += 1;
      else over24 += 1;

      const target = buckets.find((b) => (b.max === Infinity ? m > b.min : m >= b.min && m <= b.max && (b.min === 0 || m > b.min)));
      if (target) target.items.push(item);
    }

    const visibleBuckets = buckets.filter((b) => {
      if (timelineWindowFilter === 'WITHIN_24H') return b.zone === 'within_24h';
      if (timelineWindowFilter === 'OVER_24H') return b.zone === 'over_24h';
      return true;
    });

    const maxBucket = Math.max(1, ...visibleBuckets.map((b) => b.items.length));
    const total = within24 + over24;
    const withinPct = total > 0 ? Math.round((within24 / total) * 100) : 0;
    const overPct = total > 0 ? 100 - withinPct : 0;

    return { buckets: visibleBuckets, maxBucket, within24, over24, total, withinPct, overPct };
  }, [ralTimeline, timelineTypeFilter, timelineAreaFilter, timelineWindowFilter, isMyAreasFiltered, myAreaSet]);

  const regionGroups: Array<{ key: 'ES' | 'INTERIOR' | 'CAPITAL'; title: string; countLabel: string }> = [
    { key: 'ES', title: 'ES', countLabel: '4 CFs' },
    { key: 'INTERIOR', title: 'INTERIOR', countLabel: '6 CFs' },
    { key: 'CAPITAL', title: 'CAPITAL', countLabel: '6 CFs' },
  ];

  const selectedCfMeta = cfs.find((c) => c.cf === selectedCf);

  return (
    <div className="space-y-6 pb-10">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-[#090C13]/90 border border-white/10 rounded-2xl p-5 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Grafana · COP REDE
            </h1>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
              RAL 6h · REC 4h
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Última sincronização: <strong className="text-slate-200">{syncMeta.last_sync_at || 'Aguardando...'}</strong>
            </span>
            <span className="text-slate-500">•</span>
            <GrafanaCountdownBadge syncSeconds={syncSeconds} syncTick={syncTick} onRefresh={handleAutoRefresh} />
            {syncMeta.manual_override_active && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200 font-semibold">
                <Database className="w-3 h-3" />
                Modo Manual Ativo ({syncMeta.manual_updated_by || 'Operador'} · {syncMeta.manual_updated_at || ''})
              </span>
            )}
            {syncMeta.github_is_stale && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-500/15 border border-red-400/40 text-red-200 font-semibold">
                <AlertTriangle className="w-3 h-3" />
                GitHub sem atualização há {Math.floor((syncMeta.github_stale_minutes || 0) / 60)}h {(syncMeta.github_stale_minutes || 0) % 60}min
              </span>
            )}
            {syncMeta.status === 'error' && (
              <span className="text-red-400 inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Falha na última leitura CSV
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={openMyAreasSelector}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
              isMyAreasFiltered
                ? 'bg-[#3b82f6]/15 border-[#3b82f6]/60 text-blue-200 hover:bg-[#3b82f6]/25 shadow-lg shadow-blue-500/10'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
            }`}
            title="Selecionar suas áreas (CFs) personalizadas"
          >
            <Layers className={`w-3.5 h-3.5 ${isMyAreasFiltered ? 'text-blue-300' : 'text-slate-300'}`} />
            MINHAS ÁREAS
            {myAreas.length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                  isMyAreasFiltered
                    ? 'bg-blue-500/30 text-blue-100'
                    : 'bg-white/10 text-slate-300'
                }`}
              >
                {myAreas.length}
              </span>
            )}
          </button>

          <button
            onClick={openManualUploadModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200 transition"
            title="Subir manualmente as bases RAL (separa RAL e QUA) e/ou REC"
          >
            <Upload className="w-3.5 h-3.5" />
            Atualizar Base Manual
          </button>

          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Atualizar Agora'}
          </button>

          <button
            onClick={() => {
              setShowCleared(true);
              fetchCleared();
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 transition"
          >
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            Sanadas
            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px]">
              {clearedTotal}
            </span>
          </button>

          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#e20613] hover:bg-[#c80510] text-white transition shadow-lg shadow-[#e20613]/20"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-60 rounded-xl bg-[#10141d] border border-white/15 shadow-2xl p-1.5 z-50">
                <button
                  onClick={() => handleExportCsv('active')}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-white/10 transition"
                >
                  Base Ativa Completa (RAL + REC)
                </button>
                {selectedCf && (
                  <button
                    onClick={() => handleExportCsv('filtered')}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-emerald-300 hover:bg-white/10 transition"
                  >
                    Exportar Parcial ({selectedCf} · {selectedQueue})
                  </button>
                )}
                <button
                  onClick={() => handleExportCsv('cleared')}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-amber-300 hover:bg-white/10 transition"
                >
                  Base Apartada (Falhas Sanadas)
                </button>
                <button
                  onClick={() => handleExportCsv('all')}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/10 transition border-t border-white/10 mt-1 pt-2"
                >
                  Tudo (Ativas + Sanadas)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {(isMyAreasFiltered
          ? [
              { key: 'ALL', title: 'MINHAS ÁREAS', isCustom: true },
              ...regionGroups
                .filter((g) => visibleCfs.some((c) => c.regional === g.key))
                .map((g) => ({ key: g.key, title: g.title, isCustom: false })),
            ]
          : [
              { key: 'ALL', title: 'TOTAL RRE', isCustom: false },
              { key: 'ES', title: 'ES', isCustom: false },
              { key: 'INTERIOR', title: 'INTERIOR', isCustom: false },
              { key: 'CAPITAL', title: 'CAPITAL', isCustom: false },
            ]
        ).map((card) => {
          const t = visibleTotals[card.key] || { ral: 0, rec: 0, qualidade: 0 };
          return (
            <div
              key={card.key}
              className={`bg-[#090C13]/95 rounded-2xl p-4 flex flex-col justify-between border ${
                card.isCustom ? 'border-[#3b82f6]/50 shadow-lg shadow-blue-500/5' : 'border-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                {card.isCustom ? (
                  <button
                    onClick={openMyAreasSelector}
                    className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wider uppercase text-blue-300 hover:text-blue-200 transition"
                    title="Alterar áreas selecionadas"
                  >
                    {card.title}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">
                    {card.title}
                  </span>
                )}
                {card.isCustom && (
                  <button
                    onClick={toggleMyAreasOff}
                    className="text-[10px] font-semibold text-slate-400 hover:text-white underline underline-offset-2 transition"
                  >
                    Ver Todas
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-2.5 py-2">
                  <div className="text-[10px] font-semibold text-slate-400">RAL</div>
                  <div className="text-xl font-bold text-white tabular-nums">{t.ral}</div>
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-2.5 py-2">
                  <div className="text-[10px] font-semibold text-slate-400">REC</div>
                  <div className="text-xl font-bold text-amber-300 tabular-nums">{t.rec}</div>
                </div>
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-2.5 py-2">
                  <div className="text-[10px] font-semibold text-violet-300">QUALID.</div>
                  <div className="text-xl font-bold text-violet-200 tabular-nums">{t.qualidade}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Board: 16 CFs Grid + Right New Faults Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-9 space-y-3">
          {loading ? (
            <div className="bg-[#090C13]/90 border border-white/10 rounded-2xl p-10 text-center text-sm text-slate-400">
              Sincronizando quadro COP REDE...
            </div>
          ) : (
            regionGroups.map((group) => {
              const groupCfs = visibleCfs.filter((c) => c.regional === group.key);
              if (isMyAreasFiltered && groupCfs.length === 0) return null;
              return (
                <div
                  key={group.key}
                  className="bg-[#090C13]/90 border border-white/10 rounded-2xl p-3.5 flex flex-col lg:flex-row gap-3"
                >
                  <div className="lg:w-28 shrink-0 border-l-2 border-[#3b82f6] pl-3 flex flex-row lg:flex-col justify-between lg:justify-center">
                    <span className="text-xs font-bold tracking-wider text-white uppercase">
                      {group.title}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {groupCfs.length} {groupCfs.length === 1 ? 'CF' : 'CFs'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 flex-1">
                    {groupCfs.map((cfItem) => {
                      const hasNew = cfItem.new_ral > 0 || cfItem.new_rec > 0 || cfItem.new_qualidade > 0;
                      const isCfActive = selectedCf === cfItem.cf;
                      return (
                        <div
                          key={cfItem.cf}
                          className={`relative rounded-xl p-2.5 border transition ${
                            isCfActive
                              ? 'bg-[#121826] border-[#e20613]/70 shadow-lg shadow-[#e20613]/10'
                              : 'bg-[#0d111a] border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-2">
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white leading-tight flex items-center gap-1.5">
                                {cfItem.cf}
                                {hasNew && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-[#e20613] text-white text-[9px] font-bold uppercase animate-pulse">
                                    Novo
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate" title={cfItem.label}>
                                {cfItem.label}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1">
                            <button
                              onClick={() => handleSelectQueue(cfItem.cf, 'RAL')}
                              className={`rounded-lg py-1.5 px-1 border text-center transition hover:brightness-125 ${getCountTone(
                                cfItem.ral,
                                'RAL'
                              )} ${
                                isCfActive && selectedQueue === 'RAL' ? 'ring-1 ring-white/70' : ''
                              }`}
                              title={`Ver RALs de ${cfItem.cf}`}
                            >
                              <div className="text-[9px] font-semibold uppercase opacity-80">RAL</div>
                              <div className="text-sm font-bold tabular-nums">{cfItem.ral}</div>
                            </button>

                            <button
                              onClick={() => handleSelectQueue(cfItem.cf, 'REC')}
                              className={`rounded-lg py-1.5 px-1 border text-center transition hover:brightness-125 ${getCountTone(
                                cfItem.rec,
                                'REC'
                              )} ${
                                isCfActive && selectedQueue === 'REC' ? 'ring-1 ring-white/70' : ''
                              }`}
                              title={`Ver RECs de ${cfItem.cf}`}
                            >
                              <div className="text-[9px] font-semibold uppercase opacity-80">REC</div>
                              <div className="text-sm font-bold tabular-nums">{cfItem.rec}</div>
                            </button>

                            <button
                              onClick={() => handleSelectQueue(cfItem.cf, 'QUALIDADE')}
                              className={`rounded-lg py-1.5 px-1 border text-center transition hover:brightness-125 ${getCountTone(
                                cfItem.qualidade,
                                'QUALIDADE'
                              )} ${
                                isCfActive && selectedQueue === 'QUALIDADE'
                                  ? 'ring-1 ring-violet-300'
                                  : ''
                              }`}
                              title={`Ver RAL de Qualidade de ${cfItem.cf}`}
                            >
                              <div className="text-[9px] font-semibold uppercase opacity-80">QUAL</div>
                              <div className="text-sm font-bold tabular-nums">{cfItem.qualidade}</div>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Panel: New Faults Signal */}
        <div className="xl:col-span-3 bg-[#090C13]/95 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#e20613]" />
              Novas Falhas
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-200">
              {visibleNewFeed.ral.length + visibleNewFeed.rec.length}
            </span>
          </div>

          <div className="divide-y divide-white/10">
            <div className="p-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-2">
                <span>RAL</span>
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                  {visibleNewFeed.ral.length}
                </span>
              </div>
              {visibleNewFeed.ral.length === 0 ? (
                <p className="text-xs italic text-slate-500 py-3 text-center">
                  Nenhuma nova RAL nas suas áreas.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {visibleNewFeed.ral.map((item) => (
                    <div
                      key={item.id}
                      onClick={() =>
                        handleSelectQueue(item.cf, item.is_qualidade ? 'QUALIDADE' : 'RAL')
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleSelectQueue(item.cf, item.is_qualidade ? 'QUALIDADE' : 'RAL');
                        }
                      }}
                      className="w-full text-left p-2 rounded-xl bg-white/[0.03] hover:bg-white/10 border border-white/10 transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-xs font-bold text-white select-text" data-allow-copy="true">
                            {item.ticket_number}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyQuickText(`feed-ral-num-${item.id}`, item.ticket_number);
                            }}
                            title={`Copiar RAL ${item.ticket_number}`}
                            className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-sky-300 transition cursor-pointer"
                          >
                            {copiedId === `feed-ral-num-${item.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#e20613]/20 text-red-300 shrink-0">
                          {item.cf}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <div className="text-[11px] text-slate-400 truncate select-text" data-allow-copy="true">
                          {item.designation}
                        </div>
                        {item.designation && item.designation !== '-' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyQuickText(`feed-ral-desig-${item.id}`, item.designation);
                            }}
                            title="Copiar trecho"
                            className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-white transition shrink-0 cursor-pointer"
                          >
                            {copiedId === `feed-ral-desig-${item.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-2">
                <span>REC</span>
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                  {visibleNewFeed.rec.length}
                </span>
              </div>
              {visibleNewFeed.rec.length === 0 ? (
                <p className="text-xs italic text-slate-500 py-3 text-center">
                  Nenhuma nova REC nas suas áreas.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {visibleNewFeed.rec.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectQueue(item.cf, 'REC')}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleSelectQueue(item.cf, 'REC');
                        }
                      }}
                      className="w-full text-left p-2 rounded-xl bg-white/[0.03] hover:bg-white/10 border border-white/10 transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-xs font-bold text-white select-text" data-allow-copy="true">
                            {item.ticket_number}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyQuickText(`feed-rec-num-${item.id}`, item.ticket_number);
                            }}
                            title={`Copiar REC ${item.ticket_number}`}
                            className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-sky-300 transition cursor-pointer"
                          >
                            {copiedId === `feed-rec-num-${item.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
                          {item.cf}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <div className="text-[11px] text-slate-400 truncate select-text" data-allow-copy="true">
                          {item.cliente || item.designation}
                        </div>
                        {(item.designation || item.cliente) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyQuickText(`feed-rec-desig-${item.id}`, item.designation || item.cliente);
                            }}
                            title="Copiar trecho"
                            className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-white transition shrink-0 cursor-pointer"
                          >
                            {copiedId === `feed-rec-desig-${item.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drill-down Tickets Panel */}
      {selectedCf && (
        <div className="bg-[#090C13]/95 border border-white/15 rounded-2xl p-5 space-y-4 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base sm:text-lg font-bold text-white">
                {selectedQueue === 'REC'
                  ? "REC's"
                  : selectedQueue === 'QUALIDADE'
                  ? 'RAL de Qualidade'
                  : "RAL's"}{' '}
                em tela no CF {selectedCf} - {selectedCfMeta?.label || selectedCf}
              </h2>

              <div className="inline-flex rounded-xl bg-white/5 p-0.5 border border-white/10">
                {(['RAL', 'REC', 'QUALIDADE'] as QueueType[]).map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSelectQueue(selectedCf, q)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                      selectedQueue === q
                        ? 'bg-[#e20613] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {q === 'QUALIDADE' ? 'RAL Qualidade' : q}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyAllArea}
                disabled={filteredTickets.length === 0}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 transition disabled:opacity-40"
              >
                {copiedId === 'batch' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedId === 'batch' ? 'COPIADO!' : 'COPIAR ATIVIDADES'}
              </button>
              <button
                onClick={() => setSelectedCf(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition"
                title="Fechar painel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search & Sort Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar tickets por número, designação, cliente ou responsável..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0d111a] border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#e20613]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#0d111a] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-[#e20613]"
              >
                <option value="">Todos os status</option>
                {ALL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>

              <span className="text-xs text-slate-500 ml-1">Ordenar:</span>
              {(
                [
                  { id: 'classification', label: 'CLASSIFICAÇÃO' },
                  { id: 'abertura', label: 'ABERTURA' },
                  { id: 'cliente', label: 'CLIENTE' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    if (sortField === opt.id) setSortAsc((v) => !v);
                    else {
                      setSortField(opt.id);
                      setSortAsc(true);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition ${
                    sortField === opt.id
                      ? 'bg-white/15 border-white/30 text-white'
                      : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label} {sortField === opt.id ? (sortAsc ? '↑' : '↓') : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Tickets Grid */}
          {loadingTickets ? (
            <div className="py-10 text-center text-sm text-slate-400">Carregando atividades...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Nenhuma atividade encontrada neste filtro.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredTickets.map((t) => {
                const stStyle = STATUS_STYLES[t.status_andamento] || STATUS_STYLES['Sem classificação'];
                const filteredPeople = filteredPeopleOptions;

                return (
                  <div
                    key={t.id}
                    className="relative bg-[#0d111a] border border-white/10 rounded-2xl p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2.5">
                      {/* Card Top */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-3 h-3 rounded-full shrink-0 ${stStyle.dot}`} />
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                            {t.cf}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyQuickText(`num-${t.id}`, t.ticket_number)}
                            title={`Copiar número ${t.ticket_type}: ${t.ticket_number}`}
                            className="group/copy inline-flex items-center gap-1.5 text-sm font-bold text-white hover:text-sky-300 transition truncate select-text cursor-pointer"
                          >
                            <span className="truncate">{t.ticket_number}</span>
                            {copiedId === `num-${t.id}` ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-400 shrink-0">
                                <Check className="w-3 h-3" /> Copiado
                              </span>
                            ) : (
                              <Copy className="w-3 h-3 text-slate-400 group-hover/copy:text-sky-300 shrink-0 transition" />
                            )}
                          </button>
                          {t.is_new && (
                            <span className="px-1.5 py-0.5 rounded bg-[#e20613] text-white text-[9px] font-bold uppercase shrink-0">
                              Novo
                            </span>
                          )}
                        </div>

                        <span
                          className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-bold text-center leading-tight ${
                            t.sla_status === 'overdue'
                              ? 'bg-[#e20613]/15 text-red-300 border border-[#e20613]/35'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {t.sla_label}
                        </span>
                      </div>

                      {/* Designation & Metadata */}
                      <div>
                        <div className="flex items-start justify-between gap-2 group/desig">
                          <div className="text-sm font-mono font-semibold text-slate-100 break-all select-text">
                            {t.designation || '-'}
                          </div>
                          {t.designation && t.designation !== '-' && (
                            <button
                              type="button"
                              onClick={() => copyQuickText(`desig-${t.id}`, t.designation)}
                              title="Copiar trecho / designação"
                              className="shrink-0 mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-[10px] font-semibold text-slate-300 hover:text-white transition cursor-pointer"
                            >
                              {copiedId === `desig-${t.id}` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">Copiado</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Trecho</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400 mt-1 gap-2">
                          <span>{t.abertura_raw || '-'}</span>
                          <span className="font-semibold text-slate-300 truncate">
                            {t.ticket_type === 'REC' ? t.cliente || '-' : t.tipo_ral || '-'}
                          </span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${stStyle.bg} ${stStyle.text} ${stStyle.border}`}
                        >
                          {t.status_andamento}
                        </span>
                      </div>

                      {/* Responsible Autocomplete */}
                      <div className="relative">
                        {respEditingFor === t.id ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                autoFocus
                                value={respQuery}
                                onChange={(e) => setRespQuery(e.target.value)}
                                placeholder="Digite o nome do responsável..."
                                className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#090C13] border border-[#3b82f6] text-xs text-white focus:outline-none"
                              />
                              <button
                                onClick={() => {
                                  setRespEditingFor(null);
                                  setRespQuery('');
                                }}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-xl bg-[#10141d] border border-white/15 shadow-2xl z-40 divide-y divide-white/5">
                              {t.responsible_name && (
                                <button
                                  onClick={() => handleSetResponsible(t.id, null)}
                                  className="w-full text-left px-3 py-1.5 text-xs text-red-300 hover:bg-white/10"
                                >
                                  Remover responsável
                                </button>
                              )}
                              {filteredPeople.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-slate-500">
                                  Nenhuma pessoa encontrada.
                                </div>
                              ) : (
                                filteredPeople.map((p) => (
                                  <button
                                    key={p.key}
                                    onClick={() => handleSetResponsible(t.id, p)}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 flex items-center justify-between gap-2"
                                  >
                                    <span className="truncate">{p.name}</span>
                                    <span className="text-[10px] text-slate-400 shrink-0">
                                      {[p.company, p.role].filter(Boolean).join(' · ')}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setRespEditingFor(t.id);
                              setRespQuery('');
                            }}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-xs text-slate-300 transition"
                          >
                            <span className="inline-flex items-center gap-1.5 truncate">
                              <UserCheck className="w-3.5 h-3.5 text-[#3b82f6] shrink-0" />
                              {t.responsible_name || 'Atribuir responsável...'}
                            </span>
                            <Pencil className="w-3 h-3 text-slate-500 shrink-0" />
                          </button>
                        )}
                      </div>

                      {/* DIST (Distância), REF (Referência) & Endereço da Falha Boxes */}
                      <div className="rounded-xl bg-white/[0.02] border border-white/10 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Histórico · Distância, Referência & Endereço
                          </span>
                          {savedDistRefId === t.id ? (
                            <span className="text-[10px] font-semibold text-emerald-400 inline-flex items-center gap-1">
                              <Check className="w-3 h-3" /> Salvo no histórico
                            </span>
                          ) : (() => {
                            const d = distRefDrafts[t.id];
                            const dirty =
                              d &&
                              (d.distancia.trim() !== (t.distancia || '') ||
                                d.referencia.trim() !== (t.referencia || '') ||
                                d.endereco.trim() !== (t.endereco || ''));
                            return dirty ? (
                              <button
                                type="button"
                                onClick={() => handleSaveDistRef(t)}
                                className="px-2 py-0.5 rounded bg-[#3b82f6] hover:bg-blue-500 text-white text-[10px] font-bold transition"
                              >
                                Salvar
                              </button>
                            ) : null;
                          })()}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-300/90 mb-1">
                              DIST (Distância)
                            </label>
                            <input
                              type="text"
                              value={
                                distRefDrafts[t.id] !== undefined
                                  ? distRefDrafts[t.id].distancia
                                  : t.distancia || ''
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                setDistRefDrafts((prev) => ({
                                  ...prev,
                                  [t.id]: {
                                    distancia: val,
                                    referencia:
                                      prev[t.id] !== undefined
                                        ? prev[t.id].referencia
                                        : t.referencia || '',
                                    endereco:
                                      prev[t.id] !== undefined
                                        ? prev[t.id].endereco
                                        : t.endereco || '',
                                  },
                                }));
                              }}
                              onBlur={() => handleSaveDistRef(t)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveDistRef(t);
                                }
                              }}
                              placeholder="Ex: 1.450m / 2,3 km"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#090C13] border border-white/10 focus:border-amber-400/60 text-xs text-white placeholder-slate-500 focus:outline-none font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-sky-300/90 mb-1">
                              REF (Referência)
                            </label>
                            <input
                              type="text"
                              value={
                                distRefDrafts[t.id] !== undefined
                                  ? distRefDrafts[t.id].referencia
                                  : t.referencia || ''
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                setDistRefDrafts((prev) => ({
                                  ...prev,
                                  [t.id]: {
                                    distancia:
                                      prev[t.id] !== undefined
                                        ? prev[t.id].distancia
                                        : t.distancia || '',
                                    referencia: val,
                                    endereco:
                                      prev[t.id] !== undefined
                                        ? prev[t.id].endereco
                                        : t.endereco || '',
                                  },
                                }));
                              }}
                              onBlur={() => handleSaveDistRef(t)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveDistRef(t);
                                }
                              }}
                              placeholder="Ex: Próx. CEO-12 / Rua X"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#090C13] border border-white/10 focus:border-sky-400/60 text-xs text-white placeholder-slate-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Endereço da Falha (abaixo da Distância) */}
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-300/90 mb-1">
                            Endereço da Falha
                          </label>
                          <input
                            type="text"
                            value={
                              distRefDrafts[t.id] !== undefined
                                ? distRefDrafts[t.id].endereco
                                : t.endereco || ''
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              setDistRefDrafts((prev) => ({
                                ...prev,
                                [t.id]: {
                                  distancia:
                                    prev[t.id] !== undefined
                                      ? prev[t.id].distancia
                                      : t.distancia || '',
                                  referencia:
                                    prev[t.id] !== undefined
                                      ? prev[t.id].referencia
                                      : t.referencia || '',
                                  endereco: val,
                                },
                              }));
                            }}
                            onBlur={() => handleSaveDistRef(t)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveDistRef(t);
                              }
                            }}
                            placeholder="Inserir endereço completo da falha (Rua, Nº, Bairro)..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#090C13] border border-white/10 focus:border-emerald-400/60 text-xs text-white placeholder-slate-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Notes List */}
                      <div className="space-y-1.5">
                        {t.notes.map((n) => (
                          <div
                            key={n.id}
                            className="rounded-xl bg-[#090C13] border-l-2 border-[#3b82f6] border border-white/10 px-3 py-2"
                          >
                            {editingNoteId === n.id ? (
                              <div className="space-y-1.5">
                                <textarea
                                  rows={2}
                                  value={editNoteText}
                                  onChange={(e) => setEditNoteText(e.target.value)}
                                  className="w-full px-2 py-1.5 rounded-lg bg-[#0d111a] border border-white/15 text-xs text-white focus:outline-none"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => setEditingNoteId(null)}
                                    className="px-2 py-1 rounded text-[11px] text-slate-400 hover:text-white"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={() => handleSaveEditNote(t.id, n.id)}
                                    className="px-2.5 py-1 rounded bg-[#3b82f6] text-white text-[11px] font-semibold"
                                  >
                                    Salvar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs text-slate-200 whitespace-pre-wrap break-words">
                                    {n.content}
                                  </p>
                                  <p className="text-[10px] text-slate-500 mt-1">
                                    {n.author_name} · {n.created_at}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => {
                                      setEditingNoteId(n.id);
                                      setEditNoteText(n.content);
                                    }}
                                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
                                    title="Editar nota"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteNote(t.id, n.id)}
                                    className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-300"
                                    title="Apagar nota"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {addingNoteFor === t.id ? (
                          <div className="space-y-1.5 pt-1">
                            <textarea
                              rows={2}
                              autoFocus
                              value={newNoteText}
                              onChange={(e) => setNewNoteText(e.target.value)}
                              placeholder="Escreva a nota de tratativa..."
                              className="w-full px-2.5 py-1.5 rounded-xl bg-[#090C13] border border-[#3b82f6] text-xs text-white focus:outline-none"
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setAddingNoteFor(null);
                                  setNewNoteText('');
                                }}
                                className="px-2.5 py-1 rounded-lg text-[11px] text-slate-400 hover:text-white"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleAddNote(t.id)}
                                className="px-3 py-1 rounded-lg bg-[#3b82f6] text-white text-[11px] font-semibold"
                              >
                                Salvar Nota
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAddingNoteFor(t.id);
                              setNewNoteText('');
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-[11px] font-medium text-slate-300 transition"
                          >
                            <Pencil className="w-3 h-3 text-[#3b82f6]" />
                            <Plus className="w-3 h-3" />
                            Nota
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/10 relative">
                      <button
                        onClick={() => copyText(`ticket-${t.id}`, formatSingleWhatsapp(t))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition"
                      >
                        {copiedId === `ticket-${t.id}` ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedId === `ticket-${t.id}` ? 'COPIADO' : 'COPIAR'}
                      </button>

                      <div className="relative">
                        <button
                          onClick={() =>
                            setOpenStatusFor((curr) => (curr === t.id ? null : t.id))
                          }
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 transition"
                          title="Classificar andamento do ticket"
                        >
                          ··· Status
                        </button>

                        {openStatusFor === t.id && (
                          <div className="absolute right-0 bottom-10 w-56 rounded-2xl bg-[#10141d] border border-white/20 shadow-2xl p-2 z-50 space-y-1">
                            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Classificar Ticket
                            </div>
                            {ALL_STATUSES.map((st) => {
                              const style = STATUS_STYLES[st] || STATUS_STYLES['Sem classificação'];
                              const active = t.status_andamento === st;
                              return (
                                <button
                                  key={st}
                                  onClick={() => handleUpdateStatus(t.id, st)}
                                  className={`w-full px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide flex items-center justify-between transition hover:brightness-110 ${style.bg} ${style.text}`}
                                >
                                  <span>{st}</span>
                                  {active && <Check className="w-3.5 h-3.5" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bottom Chart: Distribuição por Área (RAL / REC / RAL de Qualidade) */}
      <div className="bg-[#090C13]/95 border border-white/10 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  chartMode === 'RAL'
                    ? 'bg-emerald-400'
                    : chartMode === 'REC'
                    ? 'bg-amber-400'
                    : 'bg-violet-400'
                }`}
              />
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-white">
                  {chartMode === 'RAL'
                    ? 'RAL de Falha por Área'
                    : chartMode === 'REC'
                    ? 'REC por Área'
                    : 'RAL de Qualidade por Área'}
                </h3>
                <p className="text-[11px] text-slate-500">Clique em uma coluna para filtrar o CF</p>
              </div>
            </div>

            <div className="inline-flex rounded-xl bg-[#06080d] p-0.5 border border-white/10">
              {(
                [
                  { id: 'RAL', label: 'RAL', activeCls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' },
                  { id: 'REC', label: 'REC', activeCls: 'bg-amber-500/20 text-amber-300 border border-amber-500/40' },
                  { id: 'QUALIDADE', label: 'RAL de Qualidade', activeCls: 'bg-violet-500/20 text-violet-300 border border-violet-500/40' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setChartMode(tab.id)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition ${
                    chartMode === tab.id ? tab.activeCls : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-[#06080d] border border-white/10 text-xs text-slate-400">
            <strong className="text-white tabular-nums">
              {chartMode === 'RAL'
                ? totals.ALL?.ral ?? 0
                : chartMode === 'REC'
                ? totals.ALL?.rec ?? 0
                : totals.ALL?.qualidade ?? 0}
            </strong>
            <span>total · 16 áreas</span>
          </div>
        </div>

        <div className="relative flex gap-3">
          {/* Y-Axis Scale */}
          <div className="h-52 flex flex-col justify-between text-[10px] font-mono text-slate-500 pt-5 pb-6 select-none shrink-0 text-right w-6">
            <span>{maxChartValue}</span>
            <span>{Math.ceil(maxChartValue / 2)}</span>
            <span>0</span>
          </div>

          {/* Chart Canvas with Hairline Grid */}
          <div className="relative flex-1 h-52 flex items-end justify-between gap-1.5 sm:gap-2.5 pt-5 pb-6 border-b border-white/10">
            <div className="pointer-events-none absolute inset-x-0 top-5 border-t border-dashed border-white/[0.06]" />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-white/[0.06]" />

            {activeChartSeries.map((bar) => {
              const pct = bar.count > 0 ? Math.max(8, Math.round((bar.count / maxChartValue) * 100)) : 0;
              const isSelected = selectedCf === bar.cf && selectedQueue === chartMode;
              const barStyle =
                chartMode === 'RAL'
                  ? 'from-emerald-500/30 via-emerald-500/75 to-emerald-400 border-t border-emerald-300/70'
                  : chartMode === 'REC'
                  ? 'from-amber-500/30 via-amber-500/75 to-amber-400 border-t border-amber-200/70'
                  : 'from-violet-500/30 via-violet-500/75 to-violet-400 border-t border-violet-300/70';
              const selectedText =
                chartMode === 'RAL'
                  ? 'text-emerald-300'
                  : chartMode === 'REC'
                  ? 'text-amber-300'
                  : 'text-violet-300';
              return (
                <button
                  key={bar.cf}
                  onClick={() => handleSelectQueue(bar.cf, chartMode)}
                  className="relative flex-1 h-full flex flex-col items-center justify-end group rounded-lg hover:bg-white/[0.025] transition px-0.5"
                  title={`${bar.cf} (${bar.label}): ${bar.count} ${chartMode}`}
                >
                  <span className="text-[11px] font-semibold text-slate-300 mb-1 tabular-nums h-4 leading-4">
                    {bar.count > 0 ? bar.count : ''}
                  </span>
                  <div className="w-full max-w-[30px] flex-1 flex items-end justify-center">
                    {bar.count > 0 ? (
                      <div
                        style={{ height: `${pct}%` }}
                        className={`w-full rounded-t-md bg-gradient-to-t ${barStyle} transition-all duration-500 group-hover:brightness-115 ${
                          isSelected ? 'ring-1 ring-white/80' : ''
                        }`}
                      />
                    ) : (
                      <div className="w-full h-[2px] bg-white/[0.08] rounded-full" />
                    )}
                  </div>
                  <span
                    className={`absolute -bottom-5 text-[10px] font-medium tracking-tight ${
                      isSelected ? selectedText : 'text-slate-400 group-hover:text-white'
                    }`}
                  >
                    {bar.cf}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Linha do Tempo · RAL / REC (Dentro de 24h vs Mais de 24h por Área) */}
      <div className="bg-[#090C13]/95 border border-white/10 rounded-2xl p-6 space-y-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full ${timelineTypeFilter === 'REC' ? 'bg-amber-400' : 'bg-sky-400'}`} />
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-white">
                  Linha do Tempo · {timelineTypeFilter}
                </h3>
                <p className="text-[11px] text-slate-500">Distribuição por tempo decorrido (≤ 24h vs &gt; 24h)</p>
              </div>
            </div>

            <div className="inline-flex rounded-xl bg-[#06080d] p-0.5 border border-white/10">
              {(
                [
                  { id: 'RAL', label: 'RAL', activeCls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' },
                  { id: 'REC', label: 'REC', activeCls: 'bg-amber-500/20 text-amber-300 border border-amber-500/40' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setTimelineTypeFilter(tab.id);
                    setSelectedTimelineBucket(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition ${
                    timelineTypeFilter === tab.id ? tab.activeCls : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-xl bg-[#06080d] p-0.5 border border-white/10">
              {(
                [
                  { id: 'ALL', label: 'Todas', activeCls: 'bg-white/10 text-white border border-white/15' },
                  { id: 'WITHIN_24H', label: '≤ 24h', activeCls: 'bg-sky-500/20 text-sky-300 border border-sky-500/40' },
                  { id: 'OVER_24H', label: '> 24h', activeCls: 'bg-[#e20613]/20 text-red-300 border border-[#e20613]/40' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setTimelineWindowFilter(tab.id);
                    setSelectedTimelineBucket(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition ${
                    timelineWindowFilter === tab.id ? tab.activeCls : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={timelineAreaFilter}
              onChange={(e) => {
                setTimelineAreaFilter(e.target.value);
                setSelectedTimelineBucket(null);
              }}
              className="px-3 py-1.5 rounded-xl bg-[#06080d] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-white/30"
            >
              <option value="ALL">Todas as áreas (16 CFs)</option>
              <optgroup label="Regionais">
                <option value="REG:ES">Regional ES (4 CFs)</option>
                <option value="REG:INTERIOR">Regional INTERIOR (6 CFs)</option>
                <option value="REG:CAPITAL">Regional CAPITAL (6 CFs)</option>
              </optgroup>
              <optgroup label="Centros Funcionais (CF)">
                {cfs.map((c) => (
                  <option key={c.cf} value={c.cf}>
                    {c.cf} — {c.label}
                  </option>
                ))}
              </optgroup>
            </select>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#06080d] border border-white/10 text-xs text-slate-400">
              <strong className="text-white tabular-nums">{timelineStats.total}</strong>
              <span>{timelineTypeFilter === 'REC' ? 'RECs' : 'RALs de falha'}</span>
            </div>
          </div>
        </div>

        {/* 24h Split Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() =>
              setTimelineWindowFilter((curr) => (curr === 'WITHIN_24H' ? 'ALL' : 'WITHIN_24H'))
            }
            className={`text-left rounded-xl p-3.5 border transition ${
              timelineWindowFilter === 'WITHIN_24H'
                ? 'bg-sky-500/10 border-sky-400/45'
                : 'bg-[#06080d]/70 border-white/10 hover:border-sky-500/30'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-sky-300">Dentro de 24h (≤ 24h)</span>
              <span className="font-semibold text-white tabular-nums">
                {timelineStats.within24} <span className="text-slate-400 font-normal">({timelineStats.withinPct}%)</span>
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden mt-2.5">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-cyan-300 rounded-full transition-all duration-500"
                style={{ width: `${timelineStats.withinPct}%` }}
              />
            </div>
          </button>

          <button
            onClick={() =>
              setTimelineWindowFilter((curr) => (curr === 'OVER_24H' ? 'ALL' : 'OVER_24H'))
            }
            className={`text-left rounded-xl p-3.5 border transition ${
              timelineWindowFilter === 'OVER_24H'
                ? 'bg-[#e20613]/10 border-[#e20613]/45'
                : 'bg-[#06080d]/70 border-white/10 hover:border-[#e20613]/30'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-red-300">Mais de 24h (&gt; 24h)</span>
              <span className="font-semibold text-white tabular-nums">
                {timelineStats.over24} <span className="text-slate-400 font-normal">({timelineStats.overPct}%)</span>
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden mt-2.5">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-[#e20613] rounded-full transition-all duration-500"
                style={{ width: `${timelineStats.overPct}%` }}
              />
            </div>
          </button>
        </div>

        {/* Timeline Bars with Y-Axis & Hairline Grid */}
        <div className="relative flex gap-3">
          <div className="h-48 flex flex-col justify-between text-[10px] font-mono text-slate-500 pt-5 pb-6 select-none shrink-0 text-right w-6">
            <span>{timelineStats.maxBucket}</span>
            <span>{Math.ceil(timelineStats.maxBucket / 2)}</span>
            <span>0</span>
          </div>

          <div className="relative flex-1 h-48 flex items-end justify-between gap-2 sm:gap-3 pt-5 pb-6 border-b border-white/10">
            <div className="pointer-events-none absolute inset-x-0 top-5 border-t border-dashed border-white/[0.06]" />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-white/[0.06]" />

            {timelineStats.buckets.map((b, idx) => {
              const count = b.items.length;
              const pct = count > 0 ? Math.max(8, Math.round((count / timelineStats.maxBucket) * 100)) : 0;
              const isOver = b.zone === 'over_24h';
              const isSelected = selectedTimelineBucket === b.id;
              const prevZone = idx > 0 ? timelineStats.buckets[idx - 1].zone : b.zone;
              const showDivider = idx > 0 && prevZone !== b.zone;

              return (
                <div key={b.id} className="relative flex-1 h-full flex items-end gap-2">
                  {showDivider && (
                    <div
                      className="h-full w-px border-l border-dashed border-white/20 shrink-0 relative"
                      title="Limite de 24 horas"
                    >
                      <span className="absolute -top-4 -left-2.5 text-[9px] font-mono text-slate-500 bg-[#090C13] px-1">
                        24h
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => setSelectedTimelineBucket((curr) => (curr === b.id ? null : b.id))}
                    className="relative flex-1 h-full flex flex-col items-center justify-end group rounded-lg hover:bg-white/[0.025] transition px-0.5"
                    title={`${b.label}: ${count} ${timelineTypeFilter}(s)`}
                  >
                    <span className="text-[11px] font-semibold text-slate-300 mb-1 tabular-nums h-4 leading-4">
                      {count > 0 ? count : ''}
                    </span>
                    <div className="w-full max-w-[38px] flex-1 flex items-end justify-center">
                      {count > 0 ? (
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full rounded-t-md bg-gradient-to-t transition-all duration-500 group-hover:brightness-115 ${
                            isOver
                              ? 'from-[#e20613]/30 via-[#e20613]/75 to-red-400 border-t border-red-300/70'
                              : 'from-sky-500/30 via-sky-500/75 to-sky-400 border-t border-sky-300/70'
                          } ${isSelected ? 'ring-1 ring-white/80' : ''}`}
                        />
                      ) : (
                        <div className="w-full h-[2px] bg-white/[0.08] rounded-full" />
                      )}
                    </div>
                    <span
                      className={`absolute -bottom-5 text-[10px] font-medium whitespace-nowrap tracking-tight ${
                        isSelected
                          ? isOver
                            ? 'text-red-300'
                            : 'text-sky-300'
                          : 'text-slate-400 group-hover:text-white'
                      }`}
                    >
                      {b.label}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Optional Bucket Drill-down List */}
        {selectedTimelineBucket && (() => {
          const activeBucket = timelineStats.buckets.find((b) => b.id === selectedTimelineBucket);
          if (!activeBucket) return null;
          return (
            <div className="rounded-xl bg-[#0d111a] border border-white/10 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white">
                  Faixa {activeBucket.label} · {activeBucket.items.length} {timelineTypeFilter}(s)
                </span>
                <button
                  onClick={() => setSelectedTimelineBucket(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {activeBucket.items.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nenhuma {timelineTypeFilter} nesta faixa para a área selecionada.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {activeBucket.items.map((item) => (
                    <div
                      key={item.ticket_number}
                      onClick={() => handleSelectQueue(item.cf, timelineTypeFilter)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleSelectQueue(item.cf, timelineTypeFilter);
                        }
                      }}
                      className="text-left p-2 rounded-lg bg-white/[0.03] hover:bg-white/10 border border-white/10 transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-xs font-bold text-white select-text" data-allow-copy="true">
                            {item.ticket_number}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyQuickText(`tl-num-${item.ticket_number}`, item.ticket_number);
                            }}
                            title={`Copiar ${timelineTypeFilter} ${item.ticket_number}`}
                            className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-sky-300 transition cursor-pointer"
                          >
                            {copiedId === `tl-num-${item.ticket_number}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 shrink-0">
                          {item.cf}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <div className="text-[11px] font-mono text-slate-300 truncate select-text" data-allow-copy="true">
                          {item.designation}
                        </div>
                        {item.designation && item.designation !== '-' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyQuickText(`tl-desig-${item.ticket_number}`, item.designation);
                            }}
                            title="Copiar trecho"
                            className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-white transition shrink-0 cursor-pointer"
                          >
                            {copiedId === `tl-desig-${item.ticket_number}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-between gap-2">
                        <span>{item.abertura_raw}</span>
                        {item.cliente && <span className="truncate text-amber-300/90">{item.cliente}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Cleared Faults (Base Sanadas) Modal */}
      {showCleared && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d111a] border border-white/15 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Archive className="w-4 h-4 text-amber-400" />
                  Base Apartada — Falhas Sanadas ({clearedTotal})
                </h3>
                <p className="text-xs text-slate-400">
                  Falhas removidas da base ativa automaticamente. Não entram nos gráficos nem nos contadores ativos.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportCsv('cleared')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar Sanadas
                </button>
                <button
                  onClick={() => setShowCleared(false)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-white/10 flex gap-2">
              <input
                type="text"
                value={clearedSearch}
                onChange={(e) => setClearedSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchCleared(clearedSearch)}
                placeholder="Buscar na base sanadas por número, designação ou cliente..."
                className="flex-1 px-3.5 py-2 rounded-xl bg-[#090C13] border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400"
              />
              <button
                onClick={() => fetchCleared(clearedSearch)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
              >
                Buscar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingCleared ? (
                <div className="py-10 text-center text-xs text-slate-400">Carregando base sanadas...</div>
              ) : clearedList.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  Nenhuma falha sanada registrada até o momento.
                </div>
              ) : (
                clearedList.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-[#090C13] border border-white/10 space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-bold text-slate-200">
                            {item.ticket_type}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-[10px] font-bold text-indigo-300">
                            {item.cf}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyQuickText(`clr-num-${item.id}`, item.ticket_number)}
                            title={`Copiar número ${item.ticket_type}: ${item.ticket_number}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-white hover:text-sky-300 transition select-text cursor-pointer"
                          >
                            <span>{item.ticket_number}</span>
                            {copiedId === `clr-num-${item.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-400" />
                            )}
                          </button>
                          <span className="text-[11px] text-slate-400">
                            {item.cliente || item.tipo_ral}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="text-xs font-mono text-slate-300 truncate select-text">
                            {item.designation}
                          </div>
                          {item.designation && item.designation !== '-' && (
                            <button
                              type="button"
                              onClick={() => copyQuickText(`clr-desig-${item.id}`, item.designation)}
                              title="Copiar trecho"
                              className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/10 border border-white/10 text-[10px] text-slate-300 hover:text-white transition cursor-pointer"
                            >
                              {copiedId === `clr-desig-${item.id}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                        {item.responsible_name && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Responsável: {item.responsible_name}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] font-semibold text-amber-300">
                          Sanada em {item.cleared_at}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Status final: {item.status_andamento}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 shrink-0 w-14">
                            DIST:
                          </span>
                          <input
                            type="text"
                            value={
                              clearedDistRefDrafts[item.id] !== undefined
                                ? clearedDistRefDrafts[item.id].distancia
                                : item.distancia || ''
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              setClearedDistRefDrafts((prev) => ({
                                ...prev,
                                [item.id]: {
                                  distancia: val,
                                  referencia:
                                    prev[item.id] !== undefined
                                      ? prev[item.id].referencia
                                      : item.referencia || '',
                                  endereco:
                                    prev[item.id] !== undefined
                                      ? prev[item.id].endereco
                                      : item.endereco || '',
                                },
                              }));
                            }}
                            onBlur={() => handleSaveClearedDistRef(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveClearedDistRef(item);
                              }
                            }}
                            placeholder="Distância (ex: 1.450m)"
                            className="flex-1 px-2.5 py-1 rounded-lg bg-[#0d111a] border border-white/10 text-xs text-white font-mono focus:outline-none focus:border-amber-400/60"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300 shrink-0 w-14">
                            REF:
                          </span>
                          <input
                            type="text"
                            value={
                              clearedDistRefDrafts[item.id] !== undefined
                                ? clearedDistRefDrafts[item.id].referencia
                                : item.referencia || ''
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              setClearedDistRefDrafts((prev) => ({
                                ...prev,
                                [item.id]: {
                                  distancia:
                                    prev[item.id] !== undefined
                                      ? prev[item.id].distancia
                                      : item.distancia || '',
                                  referencia: val,
                                  endereco:
                                    prev[item.id] !== undefined
                                      ? prev[item.id].endereco
                                      : item.endereco || '',
                                },
                              }));
                            }}
                            onBlur={() => handleSaveClearedDistRef(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveClearedDistRef(item);
                              }
                            }}
                            placeholder="Referência (ex: CEO-12)"
                            className="flex-1 px-2.5 py-1 rounded-lg bg-[#0d111a] border border-white/10 text-xs text-white focus:outline-none focus:border-sky-400/60"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 shrink-0 w-14">
                          END.:
                        </span>
                        <input
                          type="text"
                          value={
                            clearedDistRefDrafts[item.id] !== undefined
                              ? clearedDistRefDrafts[item.id].endereco
                              : item.endereco || ''
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            setClearedDistRefDrafts((prev) => ({
                              ...prev,
                              [item.id]: {
                                distancia:
                                  prev[item.id] !== undefined
                                    ? prev[item.id].distancia
                                    : item.distancia || '',
                                referencia:
                                  prev[item.id] !== undefined
                                    ? prev[item.id].referencia
                                    : item.referencia || '',
                                endereco: val,
                              },
                            }));
                          }}
                          onBlur={() => handleSaveClearedDistRef(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveClearedDistRef(item);
                            }
                          }}
                          placeholder="Endereço da falha (Rua, Nº, Bairro)..."
                          className="flex-1 px-2.5 py-1 rounded-lg bg-[#0d111a] border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-400/60"
                        />
                        {savedClearedDistRefId === item.id && (
                          <span className="text-[10px] font-semibold text-emerald-400 shrink-0">
                            Salvo ✓
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Selecionar Minhas Áreas */}
      {showMyAreasModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-[#090C13] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Minhas Áreas (CFs Personalizados)</h3>
                  <p className="text-[11px] text-slate-400">
                    Selecione os CFs que deseja acompanhar. A preferência fica salva para o seu usuário.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMyAreasModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 bg-white/[0.02]">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setDraftMyAreas(cfs.map((c) => c.cf))}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 transition"
                >
                  Selecionar Todas
                </button>
                <button
                  onClick={() => setDraftMyAreas([])}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition"
                >
                  Limpar
                </button>
              </div>
              <span className="text-[11px] text-blue-300 font-semibold">
                {draftMyAreas.length} área{draftMyAreas.length === 1 ? '' : 's'} selecionada{draftMyAreas.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {regionGroups.map((group) => {
                const groupItems = cfs.filter((c) => c.regional === group.key);
                if (groupItems.length === 0) return null;
                const allGroupSelected = groupItems.every((c) => draftMyAreas.includes(c.cf));
                return (
                  <div key={group.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                        {group.title}
                      </span>
                      <button
                        onClick={() => {
                          const groupCodes = groupItems.map((c) => c.cf);
                          if (allGroupSelected) {
                            setDraftMyAreas((prev) => prev.filter((cf) => !groupCodes.includes(cf)));
                          } else {
                            setDraftMyAreas((prev) => Array.from(new Set([...prev, ...groupCodes])));
                          }
                        }}
                        className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                      >
                        {allGroupSelected ? `Desmarcar ${group.title}` : `Marcar toda ${group.title}`}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {groupItems.map((item) => {
                        const checked = draftMyAreas.includes(item.cf);
                        return (
                          <button
                            key={item.cf}
                            type="button"
                            onClick={() =>
                              setDraftMyAreas((prev) =>
                                prev.includes(item.cf)
                                  ? prev.filter((x) => x !== item.cf)
                                  : [...prev, item.cf]
                              )
                            }
                            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left transition ${
                              checked
                                ? 'bg-blue-500/15 border-blue-400/60 text-white'
                                : 'bg-white/[0.02] border-white/10 text-slate-300 hover:border-white/25'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold leading-tight">{item.cf}</div>
                              <div className="text-[10px] text-slate-400 truncate">{item.label}</div>
                            </div>
                            <span
                              className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                                checked
                                  ? 'bg-blue-500 border-blue-400 text-white'
                                  : 'border-white/20 bg-white/5'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3 stroke-[3]" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3.5 border-t border-white/10 bg-white/[0.02] flex flex-wrap items-center justify-between gap-2">
              {isMyAreasFiltered ? (
                <button
                  onClick={toggleMyAreasOff}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition"
                >
                  Mostrar Todas as Áreas
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMyAreasModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => applyMyAreas(draftMyAreas, draftMyAreas.length > 0)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#e20613] hover:bg-[#c80510] text-white transition shadow-lg shadow-[#e20613]/20"
                >
                  {draftMyAreas.length > 0
                    ? `Aplicar Minhas Áreas (${draftMyAreas.length})`
                    : 'Aplicar (Mostrar Todas)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Atualização Manual das Bases (RAL -> RAL + QUA, REC -> REC) */}
      {showManualUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-[#0B0F17] border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center text-amber-300">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Atualização Manual de Bases Grafana</h3>
                  <p className="text-[11px] text-slate-400">
                    Envie RAL (separa automaticamente RAL + QUA) e/ou REC (.csv, .xlsx, .xlsm, .xls)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowManualUpload(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3 text-xs text-amber-100/90 leading-relaxed">
                Enquanto os arquivos do GitHub não receberem uma nova atualização, seus dados manuais ficam protegidos e não serão sobrescritos. Assim que o GitHub atualizar, a sincronização automática retorna sozinha.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Base RAL */}
                <label className="block cursor-pointer rounded-xl border border-dashed border-white/20 hover:border-amber-400/60 bg-white/[0.02] hover:bg-white/[0.04] p-4 transition">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xlsm,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setManualRalFile(f);
                      setManualUploadError(null);
                    }}
                  />
                  <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
                    <FileSpreadsheet className="w-4 h-4 text-[#e20613]" />
                    Base RAL (RAL + QUA)
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2">
                    Separa automaticamente filas RAL e QUALIDADE.
                  </p>
                  <div className="text-[11px] font-medium truncate px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200">
                    {manualRalFile ? manualRalFile.name : 'Selecionar arquivo RAL...'}
                  </div>
                </label>

                {/* Base REC */}
                <label className="block cursor-pointer rounded-xl border border-dashed border-white/20 hover:border-amber-400/60 bg-white/[0.02] hover:bg-white/[0.04] p-4 transition">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xlsm,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setManualRecFile(f);
                      setManualUploadError(null);
                    }}
                  />
                  <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
                    <FileSpreadsheet className="w-4 h-4 text-sky-400" />
                    Base REC
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2">
                    Atualiza exclusivamente a fila de Reclamações (REC).
                  </p>
                  <div className="text-[11px] font-medium truncate px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200">
                    {manualRecFile ? manualRecFile.name : 'Selecionar arquivo REC...'}
                  </div>
                </label>
              </div>

              {manualUploadError && (
                <div className="rounded-xl bg-red-500/15 border border-red-500/40 px-3.5 py-2.5 text-xs text-red-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{manualUploadError}</span>
                </div>
              )}

              {manualUploadResult && (
                <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-3.5 py-2.5 text-xs text-emerald-100 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-emerald-300">
                    <Check className="w-4 h-4" />
                    Base manual aplicada com sucesso!
                  </div>
                  <div className="text-[11px] text-emerald-100/90">
                    {manualUploadResult.updated_types.includes('RAL') && (
                      <span>RAL carregadas: <strong>{manualUploadResult.ral_loaded}</strong> · QUA carregadas: <strong>{manualUploadResult.qua_loaded}</strong>{' · '}</span>
                    )}
                    {manualUploadResult.updated_types.includes('REC') && (
                      <span>REC carregadas: <strong>{manualUploadResult.rec_loaded}</strong>{' · '}</span>
                    )}
                    Novos: <strong>{manualUploadResult.new_count}</strong> · Sanados: <strong>{manualUploadResult.cleared_now}</strong>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-white/10 bg-white/[0.02] flex items-center justify-end gap-2">
              <button
                onClick={() => setShowManualUpload(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
              >
                Fechar
              </button>
              <button
                onClick={handleManualUploadSubmit}
                disabled={manualUploading || (!manualRalFile && !manualRecFile)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {manualUploading ? 'Processando...' : 'Aplicar Base Manual'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
