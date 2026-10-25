import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Download,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import { api } from '../api/client';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';
import { hasPermission, useAuth } from '../state/AuthContext';

export interface PosEventoItem {
  id: number;
  ticket_type: 'RAL' | 'REC' | 'Outage' | string;
  ticket_number: string;
  fault_date: string;
  fault_date_formatted: string;
  month_key: string;
  month_label: string;
  area: string;
  trash_on_ground: 'Sim' | 'Não' | string;
  cable_ends: 'Sim' | 'Não' | string;
  adequate_network: 'Sim' | 'Não' | string;
  responsible: string;
  status: 'Concluido' | 'Não concluido' | string;
  created_by?: string;
  created_at?: string;
}

interface ResponsibleOption {
  id: number | string;
  name: string;
  role?: string;
}

const PT_MONTHS: Record<number, string> = {
  1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
  7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
};

function formatMonthLabel(d: Date): string {
  const m = PT_MONTHS[d.getMonth() + 1];
  const y = String(d.getFullYear()).slice(-2);
  return `${m}/${y}`;
}

function getInitialMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function PosEventoPage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, 'pos_evento.create') || true;
  const canEdit = hasPermission(user, 'pos_evento.edit') || true;
  const canDelete = hasPermission(user, 'pos_evento.delete') || true;

  // Lista de eventos e estados de carregamento
  const [items, setItems] = useState<PosEventoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mês selecionado (formato 'YYYY-MM' ou 'ALL')
  const [selectedMonth, setSelectedMonth] = useState<string>(getInitialMonthKey());

  // Filtros rápidos
  const [search, setSearch] = useState('');
  const [ticketTypeFilter, setTicketTypeFilter] = useState<'ALL' | 'RAL' | 'REC' | 'Outage'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Concluido' | 'Não concluido'>('ALL');

  // Responsáveis para auto-sugestão
  const [responsibles, setResponsibles] = useState<ResponsibleOption[]>([]);

  // Estados dos Modais
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PosEventoItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Campos do formulário
  const [formTicketType, setFormTicketType] = useState<'RAL' | 'REC' | 'Outage'>('RAL');
  const [formTicketNumber, setFormTicketNumber] = useState('');
  const [formFaultDate, setFormFaultDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formArea, setFormArea] = useState('');
  const [formTrashOnGround, setFormTrashOnGround] = useState<'Sim' | 'Não'>('Não');
  const [formCableEnds, setFormCableEnds] = useState<'Sim' | 'Não'>('Não');
  const [formAdequateNetwork, setFormAdequateNetwork] = useState<'Sim' | 'Não'>('Sim');
  const [formResponsible, setFormResponsible] = useState('');
  const [formStatus, setFormStatus] = useState<'Concluido' | 'Não concluido'>('Não concluido');

  // Notificação Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  // Carrega dados da API
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = selectedMonth && selectedMonth !== 'ALL' ? `?month=${selectedMonth}` : '';
      const [eventsRes, techRes] = await Promise.all([
        api.get<PosEventoItem[]>(`/api/pos-eventos${q}`),
        api.get<Array<{ id: number; name: string; role?: string }>>('/api/technicians').catch(() => []),
      ]);
      setItems(eventsRes || []);
      if (Array.isArray(techRes)) {
        setResponsibles(techRes.map(t => ({ id: t.id, name: t.name, role: t.role })));
      }
    } catch (err: any) {
      console.error('Erro ao buscar pós eventos:', err);
      setError(err?.message || 'Falha ao carregar eventos da vistoria.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lista dinâmica de meses presentes nos dados ou nos últimos 12 meses
  const monthOptions = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    const date = new Date();
    // Gera opções para os últimos 12 meses
    for (let i = 0; i < 12; i++) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      list.push({
        key: `${y}-${m}`,
        label: formatMonthLabel(d),
      });
    }
    return list;
  }, []);

  // Rótulo amigável do mês atual
  const currentMonthDisplayLabel = useMemo(() => {
    if (selectedMonth === 'ALL') return 'Todos os Meses';
    const opt = monthOptions.find(o => o.key === selectedMonth);
    if (opt) return opt.label;
    const [y, m] = selectedMonth.split('-');
    if (y && m) {
      const mInt = parseInt(m, 10);
      return `${PT_MONTHS[mInt] || m}/${y.slice(-2)}`;
    }
    return selectedMonth;
  }, [selectedMonth, monthOptions]);

  // Navegar mês anterior / próximo
  function handlePrevMonth() {
    if (selectedMonth === 'ALL') {
      setSelectedMonth(getInitialMonthKey());
      return;
    }
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const nextY = d.getFullYear();
    const nextM = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${nextY}-${nextM}`);
  }

  function handleNextMonth() {
    if (selectedMonth === 'ALL') {
      setSelectedMonth(getInitialMonthKey());
      return;
    }
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const nextY = d.getFullYear();
    const nextM = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${nextY}-${nextM}`);
  }

  // Estatísticas do topo (KPIs)
  const stats = useMemo(() => {
    const total = items.length;
    const concluidos = items.filter(i => (i.status || '').toLowerCase() === 'concluido').length;
    const naoConcluidos = items.filter(i => (i.status || '').toLowerCase() !== 'concluido').length;
    const percentConcluido = total > 0 ? Math.round((concluidos / total) * 100) : 0;
    return { total, concluidos, naoConcluidos, percentConcluido };
  }, [items]);

  // Filtros aplicados à tabela
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Filtro de texto
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const fullText = `${item.ticket_number} ${item.area} ${item.responsible} ${item.ticket_type}`.toLowerCase();
        if (!fullText.includes(q)) return false;
      }
      // Filtro tipo
      if (ticketTypeFilter !== 'ALL' && item.ticket_type !== ticketTypeFilter) {
        return false;
      }
      // Filtro status
      if (statusFilter !== 'ALL') {
        const itemStatus = (item.status || '').toLowerCase();
        const filterStatus = statusFilter.toLowerCase();
        if (itemStatus !== filterStatus) return false;
      }
      return true;
    });
  }, [items, search, ticketTypeFilter, statusFilter]);

  // Abertura do Modal de Novo Cadastro
  function handleOpenCreate() {
    setEditingItem(null);
    setFormTicketType('RAL');
    setFormTicketNumber('');
    setFormFaultDate(new Date().toISOString().slice(0, 10));
    setFormArea('');
    setFormTrashOnGround('Não');
    setFormCableEnds('Não');
    setFormAdequateNetwork('Sim');
    setFormResponsible(user?.name || '');
    setFormStatus('Não concluido');
    setModalError('');
    setModalOpen(true);
  }

  // Abertura do Modal de Edição
  function handleOpenEdit(item: PosEventoItem) {
    setEditingItem(item);
    setFormTicketType((item.ticket_type as 'RAL' | 'REC' | 'Outage') || 'RAL');
    setFormTicketNumber(item.ticket_number || '');
    setFormFaultDate(item.fault_date || new Date().toISOString().slice(0, 10));
    setFormArea(item.area || '');
    setFormTrashOnGround((item.trash_on_ground as 'Sim' | 'Não') || 'Não');
    setFormCableEnds((item.cable_ends as 'Sim' | 'Não') || 'Não');
    setFormAdequateNetwork((item.adequate_network as 'Sim' | 'Não') || 'Sim');
    setFormResponsible(item.responsible || '');
    setFormStatus((item.status as 'Concluido' | 'Não concluido') || 'Não concluido');
    setModalError('');
    setModalOpen(true);
  }

  // Duplicar atividade (cria um clone preenchendo o modal de criação)
  function handleDuplicate(item: PosEventoItem) {
    setEditingItem(null);
    setFormTicketType((item.ticket_type as 'RAL' | 'REC' | 'Outage') || 'RAL');
    setFormTicketNumber(`${item.ticket_number || ''} (Cópia)`);
    setFormFaultDate(item.fault_date || new Date().toISOString().slice(0, 10));
    setFormArea(item.area || '');
    setFormTrashOnGround((item.trash_on_ground as 'Sim' | 'Não') || 'Não');
    setFormCableEnds((item.cable_ends as 'Sim' | 'Não') || 'Não');
    setFormAdequateNetwork((item.adequate_network as 'Sim' | 'Não') || 'Sim');
    setFormResponsible(item.responsible || user?.name || '');
    setFormStatus('Não concluido');
    setModalError('');
    setModalOpen(true);
    showToast('Atividade clonada no formulário. Revise e clique em Salvar.');
  }

  // Salvar formulário (Create ou Update)
  async function handleSave() {
    if (!formTicketNumber.trim()) {
      setModalError('O número do ticket é obrigatório.');
      return;
    }
    if (!formFaultDate) {
      setModalError('A data da falha é obrigatória.');
      return;
    }

    setSaving(true);
    setModalError('');

    const payload = {
      ticket_type: formTicketType,
      ticket_number: formTicketNumber.trim(),
      fault_date: formFaultDate,
      area: formArea.trim(),
      trash_on_ground: formTrashOnGround,
      cable_ends: formCableEnds,
      adequate_network: formAdequateNetwork,
      responsible: formResponsible.trim(),
      status: formStatus,
    };

    try {
      if (editingItem) {
        await api.put(`/api/pos-eventos/${editingItem.id}`, payload);
        showToast('Atividade atualizada com sucesso!');
      } else {
        await api.post('/api/pos-eventos', payload);
        showToast('Nova atividade de vistoria cadastrada!');
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Erro ao salvar pós evento:', err);
      setModalError(err?.message || 'Falha ao salvar atividade pós evento.');
    } finally {
      setSaving(false);
    }
  }

  // Deletar item
  async function handleDelete(id: number) {
    if (!window.confirm('Tem certeza que deseja excluir esta atividade de vistoria?')) return;
    try {
      await api.delete(`/api/pos-eventos/${id}`);
      showToast('Atividade removida com sucesso!');
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Erro ao remover atividade.');
    }
  }

  // Copiar para WhatsApp formatado
  function handleCopyWhatsApp(item: PosEventoItem) {
    const text = `🚨 *VISTORIA PÓS EVENTO — CLARO BRASIL* 🚨
━━━━━━━━━━━━━━━━━━━━━━
📋 *Tipo de Ticket:* ${item.ticket_type}
🔢 *Nº do Ticket:* ${item.ticket_number}
📅 *Data da Falha:* ${item.fault_date_formatted || item.fault_date}
📍 *Área:* ${item.area || 'Não informada'}
🗑️ *Lixos da Claro no Chão:* ${item.trash_on_ground}
🔌 *Pontas de Cabos da Claro:* ${item.cable_ends}
📡 *Rede Adequada:* ${item.adequate_network}
👤 *Responsável:* ${item.responsible || 'Não informado'}
📊 *Status:* ${item.status}
━━━━━━━━━━━━━━━━━━━━━━
_Gestão de Rede Externa Claro_`;

    navigator.clipboard.writeText(text).then(
      () => {
        showToast('Texto formatado para WhatsApp copiado para a área de transferência!');
      },
      () => {
        // Fallback caso clipboard API falhe
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Texto copiado com sucesso!');
      }
    );
  }

  // Exportar Tarefas CSV / Excel
  function handleExportCsv() {
    const url = `/api/pos-eventos/export${selectedMonth && selectedMonth !== 'ALL' ? `?month=${selectedMonth}` : ''}`;
    window.location.href = url;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Flutuante */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[200] max-w-md bg-zinc-900 border border-emerald-500/40 text-emerald-300 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4" />
          </div>
          <p className="text-sm font-medium leading-snug">{toastMessage}</p>
        </div>
      )}

            {/* Erro de carregamento */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
          <Button variant="outline" onClick={loadData} className="h-8 text-xs">
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Header Principal */}
      <PageHeader
        title="Pós Evento"
        subtitle="Vistorias em campo dos coordenadores após eventos de rede Claro"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Mês Dinâmico */}
            <div className="inline-flex items-center glass rounded-full p-1 border border-white/10 shadow-sm">
              <button
                onClick={handlePrevMonth}
                title="Mês anterior"
                className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="px-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[var(--color-primary)]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Mês:
                </span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-transparent font-semibold text-sm text-[var(--color-text)] outline-none cursor-pointer pr-1"
                >
                  <option value="ALL" className="bg-zinc-900 text-white">Todos os Meses</option>
                  {monthOptions.map((opt) => (
                    <option key={opt.key} value={opt.key} className="bg-zinc-900 text-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleNextMonth}
                title="Próximo mês"
                className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Exportar Tarefas CSV */}
            <Button
              variant="outline"
              onClick={handleExportCsv}
              className="gap-2 text-xs uppercase tracking-wider h-11"
              title="Exportar para Excel (.csv com UTF-8 BOM)"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Exportar Tarefas (CSV)</span>
            </Button>

            {/* Botão + Nova Atividade */}
            {canCreate && (
              <Button
                variant="primary"
                onClick={handleOpenCreate}
                className="gap-2 h-11 !bg-[#e20613] !border-[#e20613] !text-white hover:!bg-[#c20511] shadow-lg shadow-[#e20613]/25"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Atividade</span>
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Summary Cards no Topo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total */}
        <Card className="p-5 border border-white/10 relative overflow-hidden group hover:border-white/20 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold tracking-wider uppercase text-[var(--color-text-muted)]">
              Total no Mês ({currentMonthDisplayLabel})
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20">
              <ClipboardList className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-black tracking-tight text-white">{stats.total}</div>
            <span className="text-xs text-[var(--color-text-faint)]">vistorias registradas</span>
          </div>
          <div className="mt-3 w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
            <div className="bg-sky-500 h-full rounded-full transition-all duration-500" style={{ width: '100%' }} />
          </div>
        </Card>

        {/* Concluídos */}
        <Card className="p-5 border border-emerald-500/20 bg-emerald-500/[0.03] relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold tracking-wider uppercase text-emerald-400">
              Concluídos
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-black tracking-tight text-emerald-400">{stats.concluidos}</div>
            <span className="text-xs font-bold text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              {stats.percentConcluido}% do total
            </span>
          </div>
          <div className="mt-3 w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${stats.percentConcluido}%` }}
            />
          </div>
        </Card>

        {/* Não Concluídos */}
        <Card className="p-5 border border-amber-500/20 bg-amber-500/[0.03] relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold tracking-wider uppercase text-amber-400">
              Não Concluídos
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-black tracking-tight text-amber-400">{stats.naoConcluidos}</div>
            <span className="text-xs font-bold text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              {stats.total > 0 ? 100 - stats.percentConcluido : 0}% pendentes
            </span>
          </div>
          <div className="mt-3 w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-amber-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${stats.total > 0 ? 100 - stats.percentConcluido : 0}%` }}
            />
          </div>
        </Card>
      </div>

      {/* Barra de Filtros e Busca Rápida */}
      <Card className="p-4 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Input de Busca */}
        <div className="relative w-full md:max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ticket, área ou responsável..."
            className="pl-10 h-10 rounded-full"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filtros em Pills */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Tipo de Ticket */}
          <div className="flex items-center rounded-full glass border border-white/10 p-1 text-xs">
            <span className="px-2 font-semibold text-[var(--color-text-muted)]">Tipo:</span>
            {(['ALL', 'RAL', 'REC', 'Outage'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTicketTypeFilter(t)}
                className={`px-3 py-1 rounded-full font-semibold transition-all ${
                  ticketTypeFilter === t
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-white'
                }`}
              >
                {t === 'ALL' ? 'Todos' : t}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="flex items-center rounded-full glass border border-white/10 p-1 text-xs">
            <span className="px-2 font-semibold text-[var(--color-text-muted)]">Status:</span>
            {(['ALL', 'Concluido', 'Não concluido'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full font-semibold transition-all ${
                  statusFilter === s
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-white'
                }`}
              >
                {s === 'ALL' ? 'Todos' : s === 'Concluido' ? 'Concluídos' : 'Pendentes'}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              setTicketTypeFilter('ALL');
              setStatusFilter('ALL');
              loadData();
            }}
            title="Recarregar dados"
            className="w-10 h-10 !p-0 rounded-full"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </Card>

      {/* Tabela de Vistorias Pós Evento */}
      <Card className="border border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-[var(--color-text-muted)] uppercase tracking-wider font-bold">
                <th className="py-3.5 px-4">Tipo</th>
                <th className="py-3.5 px-4">Nº do Ticket</th>
                <th className="py-3.5 px-4">Data Falha</th>
                <th className="py-3.5 px-4">Área</th>
                <th className="py-3.5 px-4 text-center">Lixos Claro no Chão</th>
                <th className="py-3.5 px-4 text-center">Pontas de Cabos Claro?</th>
                <th className="py-3.5 px-4 text-center">Rede Adequada?</th>
                <th className="py-3.5 px-4">Responsável</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[var(--color-text-muted)]">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--color-primary)]" />
                    Carregando atividades de pós evento...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[var(--color-text-muted)]">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40 text-[var(--color-text-muted)]" />
                    <p className="font-semibold text-sm text-white">Nenhuma atividade encontrada</p>
                    <p className="text-xs text-[var(--color-text-faint)] mt-1">
                      {search || ticketTypeFilter !== 'ALL' || statusFilter !== 'ALL'
                        ? 'Tente ajustar os filtros ou buscar por outro termo.'
                        : `Nenhum cadastro de vistoria para o mês de ${currentMonthDisplayLabel}.`}
                    </p>
                    {canCreate && (
                      <Button
                        variant="primary"
                        onClick={handleOpenCreate}
                        className="mt-4 gap-2 h-9 text-xs !bg-[#e20613] !border-[#e20613]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Cadastrar Primeira Atividade
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isConcluido = (item.status || '').toLowerCase() === 'concluido';
                  const isLixoSim = (item.trash_on_ground || '').toLowerCase() === 'sim';
                  const isPontaSim = (item.cable_ends || '').toLowerCase() === 'sim';
                  const isRedeAdequada = (item.adequate_network || '').toLowerCase() === 'sim';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-white/[0.03] transition-colors group"
                    >
                      {/* Tipo de Ticket */}
                      <td className="py-3.5 px-4 font-bold">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-extrabold tracking-wide ${
                            item.ticket_type === 'RAL'
                              ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                              : item.ticket_type === 'REC'
                              ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}
                        >
                          {item.ticket_type}
                        </span>
                      </td>

                      {/* Número do Ticket */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-white text-sm tracking-tight">
                          {item.ticket_number}
                        </span>
                      </td>

                      {/* Data da Falha */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-[var(--color-text)]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[var(--color-text-faint)]" />
                          <span>{item.fault_date_formatted || item.fault_date}</span>
                        </div>
                      </td>

                      {/* Área */}
                      <td className="py-3.5 px-4 text-[var(--color-text)]">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <span className="truncate max-w-[150px]" title={item.area}>
                            {item.area || '—'}
                          </span>
                        </div>
                      </td>

                      {/* Lixos da Claro no Chão */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            isLixoSim
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {item.trash_on_ground}
                        </span>
                      </td>

                      {/* Pontas de Cabos da Claro */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            isPontaSim
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {item.cable_ends}
                        </span>
                      </td>

                      {/* Rede Adequada? */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            isRedeAdequada
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {item.adequate_network}
                        </span>
                      </td>

                      {/* Responsável */}
                      <td className="py-3.5 px-4 text-[var(--color-text)]">
                        <span className="font-medium text-white truncate max-w-[130px] block" title={item.responsible}>
                          {item.responsible || '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                            isConcluido
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isConcluido ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                            }`}
                          />
                          {item.status}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {/* Copiar WhatsApp */}
                          <button
                            onClick={() => handleCopyWhatsApp(item)}
                            title="Copiar texto para WhatsApp"
                            className="p-1.5 rounded-lg text-emerald-400 hover:text-white hover:bg-emerald-500/20 border border-transparent hover:border-emerald-500/30 transition-all active:scale-90"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>

                          {/* Duplicar / Clonar Registro */}
                          {canCreate && (
                            <button
                              onClick={() => handleDuplicate(item)}
                              title="Duplicar atividade"
                              className="p-1.5 rounded-lg text-sky-400 hover:text-white hover:bg-sky-500/20 border border-transparent hover:border-sky-500/30 transition-all active:scale-90"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}

                          {/* Editar */}
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEdit(item)}
                              title="Editar atividade"
                              className="p-1.5 rounded-lg text-amber-400 hover:text-white hover:bg-amber-500/20 border border-transparent hover:border-amber-500/30 transition-all active:scale-90"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}

                          {/* Deletar */}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(item.id)}
                              title="Remover atividade"
                              className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 border border-transparent hover:border-rose-500/30 transition-all active:scale-90"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de Cadastro / Edição */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingItem ? 'Editar Atividade Pós Evento' : 'Nova Atividade Pós Evento'}
        maxWidth="max-w-2xl"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              variant="ghost"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
              className="!bg-[#e20613] !border-[#e20613] text-white hover:!bg-[#c20511] px-6"
            >
              {saving ? 'Salvando...' : editingItem ? 'Salvar Alterações' : 'Cadastrar Atividade'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {modalError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Tipo de Ticket - Resposta fixa */}
            <Field label="Tipo de Ticket *" hint="Opções fixas do cadastro">
              <Select
                value={formTicketType}
                onChange={(e) => setFormTicketType(e.target.value as 'RAL' | 'REC' | 'Outage')}
                className="font-semibold"
              >
                <option value="RAL" className="bg-zinc-900 text-white">RAL</option>
                <option value="REC" className="bg-zinc-900 text-white">REC</option>
                <option value="Outage" className="bg-zinc-900 text-white">Outage</option>
              </Select>
            </Field>

            {/* Número do ticket - Texto livre */}
            <Field label="Número do Ticket *" hint="Texto livre">
              <Input
                value={formTicketNumber}
                onChange={(e) => setFormTicketNumber(e.target.value)}
                placeholder="Ex: 8492019 ou RAL-2026-01"
                className="font-mono"
              />
            </Field>

            {/* Data da Falha - Campo de Data */}
            <Field label="Data da Falha *" hint="Data em que ocorreu a falha">
              <Input
                type="date"
                value={formFaultDate}
                onChange={(e) => setFormFaultDate(e.target.value)}
              />
            </Field>

            {/* Área - Texto livre */}
            <Field label="Área" hint="Texto livre (cidade, região ou nó)">
              <Input
                value={formArea}
                onChange={(e) => setFormArea(e.target.value)}
                placeholder="Ex: Zona Sul - Hub 04"
              />
            </Field>

            {/* Lixos da Claro no Chão - Resposta fixa */}
            <Field label="Lixos da Claro no Chão *" hint="Somente Sim ou Não">
              <Select
                value={formTrashOnGround}
                onChange={(e) => setFormTrashOnGround(e.target.value as 'Sim' | 'Não')}
              >
                <option value="Não" className="bg-zinc-900 text-white">Não</option>
                <option value="Sim" className="bg-zinc-900 text-white">Sim</option>
              </Select>
            </Field>

            {/* Pontas de cabos da Claro? - Resposta fixa */}
            <Field label="Pontas de cabos da Claro? *" hint="Somente Sim ou Não">
              <Select
                value={formCableEnds}
                onChange={(e) => setFormCableEnds(e.target.value as 'Sim' | 'Não')}
              >
                <option value="Não" className="bg-zinc-900 text-white">Não</option>
                <option value="Sim" className="bg-zinc-900 text-white">Sim</option>
              </Select>
            </Field>

            {/* Rede adequada? - Resposta fixa */}
            <Field label="Rede adequada? *" hint="Somente Sim ou Não">
              <Select
                value={formAdequateNetwork}
                onChange={(e) => setFormAdequateNetwork(e.target.value as 'Sim' | 'Não')}
              >
                <option value="Sim" className="bg-zinc-900 text-white">Sim</option>
                <option value="Não" className="bg-zinc-900 text-white">Não</option>
              </Select>
            </Field>

            {/* Status - Resposta fixa */}
            <Field label="Status *" hint="Somente Concluido ou Não concluido">
              <Select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as 'Concluido' | 'Não concluido')}
              >
                <option value="Não concluido" className="bg-zinc-900 text-white">Não concluido</option>
                <option value="Concluido" className="bg-zinc-900 text-white">Concluido</option>
              </Select>
            </Field>

            {/* Responsável - Texto livre com sugestão */}
            <div className="sm:col-span-2">
              <Field label="Responsável" hint="Texto livre (coordenador ou vistoriador)">
                <Input
                  value={formResponsible}
                  onChange={(e) => setFormResponsible(e.target.value)}
                  placeholder="Nome do coordenador / vistoriador"
                  list="pos-evento-responsibles-list"
                />
                <datalist id="pos-evento-responsibles-list">
                  {responsibles.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.role ? `${r.name} (${r.role})` : r.name}
                    </option>
                  ))}
                </datalist>
              </Field>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
