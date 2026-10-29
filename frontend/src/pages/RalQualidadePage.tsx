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
  FileCheck2,
} from 'lucide-react';
import { api } from '../api/client';
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';
import { hasPermission, useAuth } from '../state/AuthContext';

export interface RalQualidadeItem {
  id: number;
  ticket_number: string;
  opening_date: string;
  opening_date_formatted: string;
  month_key: string;
  month_label: string;
  designation: string;
  area: string;
  status: 'Concluido' | 'Em Andamento' | 'Pendente' | 'Cancelado' | string;
  summary: string;
  created_by?: string;
  created_at?: string;
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

function getDefaultOpeningDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export default function RalQualidadePage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, 'ral_qualidade.create') || true;
  const canEdit = hasPermission(user, 'ral_qualidade.edit') || true;
  const canDelete = hasPermission(user, 'ral_qualidade.delete') || true;

  // Lista de itens e status
  const [items, setItems] = useState<RalQualidadeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mês selecionado
  const [selectedMonth, setSelectedMonth] = useState<string>(getInitialMonthKey());

  // Filtros rápidos
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Concluido' | 'Em Andamento' | 'Pendente' | 'Cancelado'>('ALL');

  // Modais de Cadastro / Edição
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RalQualidadeItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Campos do formulário
  const [formTicketNumber, setFormTicketNumber] = useState('');
  const [formOpeningDate, setFormOpeningDate] = useState(getDefaultOpeningDate());
  const [formDesignation, setFormDesignation] = useState('');
  const [formArea, setFormArea] = useState('');
  const [formStatus, setFormStatus] = useState<'Concluido' | 'Em Andamento' | 'Pendente' | 'Cancelado'>('Concluido');
  const [formSummary, setFormSummary] = useState('');

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
      const data = await api.get<RalQualidadeItem[]>(`/api/ral-qualidade${q}`);
      setItems(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar RAL de Qualidade:', err);
      setError(err?.message || 'Falha ao carregar registros do RAL de Qualidade.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lista dinâmica de meses nos últimos 12 meses
  const monthOptions = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    const date = new Date();
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
    const emAndamento = items.filter(i => (i.status || '').toLowerCase() === 'em andamento' || (i.status || '').toLowerCase() === 'pendente').length;
    const percentConcluido = total > 0 ? Math.round((concluidos / total) * 100) : 0;
    return { total, concluidos, emAndamento, percentConcluido };
  }, [items]);

  // Itens filtrados
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const fullText = `${item.ticket_number} ${item.designation} ${item.area} ${item.status} ${item.summary || ''}`.toLowerCase();
        if (!fullText.includes(q)) return false;
      }
      if (statusFilter !== 'ALL') {
        const itemStatus = (item.status || '').toLowerCase();
        const filterStatus = statusFilter.toLowerCase();
        if (itemStatus !== filterStatus) return false;
      }
      return true;
    });
  }, [items, search, statusFilter]);

  // Abertura Modal Novo Cadastro
  function handleOpenCreate() {
    setEditingItem(null);
    setFormTicketNumber('');
    setFormOpeningDate(getDefaultOpeningDate());
    setFormDesignation('');
    setFormArea('');
    setFormStatus('Concluido');
    setFormSummary('');
    setModalError('');
    setModalOpen(true);
  }

  // Abertura Modal Edição
  function handleOpenEdit(item: RalQualidadeItem) {
    setEditingItem(item);
    setFormTicketNumber(item.ticket_number || '');
    setFormOpeningDate(item.opening_date || getDefaultOpeningDate());
    setFormDesignation(item.designation || '');
    setFormArea(item.area || '');
    setFormStatus((item.status as any) || 'Concluido');
    setFormSummary(item.summary || '');
    setModalError('');
    setModalOpen(true);
  }

  // Duplicar Registro
  function handleDuplicate(item: RalQualidadeItem) {
    setEditingItem(null);
    setFormTicketNumber(`${item.ticket_number || ''} (Cópia)`);
    setFormOpeningDate(item.opening_date || getDefaultOpeningDate());
    setFormDesignation(item.designation || '');
    setFormArea(item.area || '');
    setFormStatus((item.status as any) || 'Concluido');
    setFormSummary(item.summary || '');
    setModalError('');
    setModalOpen(true);
    showToast('Registro duplicado no formulário. Revise os campos e clique em Salvar.');
  }

  // Salvar registro
  async function handleSave() {
    if (!formTicketNumber.trim()) {
      setModalError('O campo NÚMERO é obrigatório.');
      return;
    }
    if (!formDesignation.trim()) {
      setModalError('O campo DESIGNAÇÃO é obrigatório.');
      return;
    }

    setSaving(true);
    setModalError('');

    const payload = {
      ticket_number: formTicketNumber.trim(),
      opening_date: formOpeningDate,
      designation: formDesignation.trim(),
      area: formArea.trim(),
      status: formStatus,
      summary: formSummary.trim(),
    };

    try {
      if (editingItem) {
        await api.put(`/api/ral-qualidade/${editingItem.id}`, payload);
        showToast('Atividade de qualidade atualizada com sucesso!');
      } else {
        await api.post('/api/ral-qualidade', payload);
        showToast('Nova atividade de qualidade cadastrada com sucesso!');
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Erro ao salvar RAL de Qualidade:', err);
      setModalError(err?.message || 'Falha ao salvar atividade.');
    } finally {
      setSaving(false);
    }
  }

  // Deletar registro
  async function handleDelete(id: number) {
    if (!window.confirm('Tem certeza que deseja excluir esta atividade de RAL de Qualidade?')) return;
    try {
      await api.delete(`/api/ral-qualidade/${id}`);
      showToast('Atividade removida com sucesso!');
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Erro ao remover atividade.');
    }
  }

  // Copiar para WhatsApp
  function handleCopyWhatsApp(item: RalQualidadeItem) {
    const text = `📋 *RAL DE QUALIDADE — CLARO BRASIL* 📋
━━━━━━━━━━━━━━━━━━━━━━
🔢 *NÚMERO:* ${item.ticket_number}
📅 *DATA ABERTURA:* ${item.opening_date_formatted || item.opening_date}
🎯 *DESIGNAÇÃO:* ${item.designation}
📍 *AREA:* ${item.area || 'Não informada'}
📊 *STATUS:* ${item.status}
📝 *RESUMO:* ${item.summary || 'Sem observações adicionais'}
━━━━━━━━━━━━━━━━━━━━━━
_Gestão de Rede Externa Claro_`;

    navigator.clipboard.writeText(text).then(
      () => {
        showToast('Texto formatado para WhatsApp copiado para a área de transferência!');
      },
      () => {
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

  // Exportar Tarefas CSV
  function handleExportCsv() {
    const url = `/api/ral-qualidade/export${selectedMonth && selectedMonth !== 'ALL' ? `?month=${selectedMonth}` : ''}`;
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

      {/* Erro de Carregamento */}
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
        title="RAL de Qualidade"
        subtitle="Controle e auditoria de tickets de qualidade da rede externa Claro"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Mês */}
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

            {/* Exportar Tarefas (CSV) */}
            <Button
              variant="outline"
              onClick={handleExportCsv}
              className="gap-2 text-xs uppercase tracking-wider h-11"
              title="Exportar para Excel (.csv com UTF-8 BOM)"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>EXPORTAR TAREFAS (CSV)</span>
            </Button>

            {/* + Nova Atividade */}
            {canCreate && (
              <Button
                variant="primary"
                onClick={handleOpenCreate}
                className="gap-2 h-11 !bg-[#e20613] !border-[#e20613] !text-white hover:!bg-[#c20511] shadow-lg shadow-[#e20613]/25 font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>+ Nova Atividade</span>
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total */}
        <Card className="p-5 border border-white/10 relative overflow-hidden group hover:border-white/20 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold tracking-wider uppercase text-[var(--color-text-muted)]">
              Total no Mês ({currentMonthDisplayLabel})
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-black tracking-tight text-white">{stats.total}</div>
            <span className="text-xs text-[var(--color-text-faint)]">atividades registradas</span>
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

        {/* Em Andamento / Pendentes */}
        <Card className="p-5 border border-amber-500/20 bg-amber-500/[0.03] relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold tracking-wider uppercase text-amber-400">
              Em Andamento / Pendentes
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-black tracking-tight text-amber-400">{stats.emAndamento}</div>
            <span className="text-xs font-bold text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              {stats.total > 0 ? 100 - stats.percentConcluido : 0}% em aberto
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

      {/* Barra de Filtros */}
      <Card className="p-4 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, designação, área ou resumo..."
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

        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center rounded-full glass border border-white/10 p-1 text-xs">
            <span className="px-2 font-semibold text-[var(--color-text-muted)]">Status:</span>
            {(['ALL', 'Concluido', 'Em Andamento', 'Pendente', 'Cancelado'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full font-semibold transition-all ${
                  statusFilter === s
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-white'
                }`}
              >
                {s === 'ALL' ? 'Todos' : s}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
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

      {/* Tabela com 6 colunas + Ações */}
      <Card className="border border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-[var(--color-text-muted)] uppercase tracking-wider font-bold">
                <th className="py-3.5 px-4">NÚMERO</th>
                <th className="py-3.5 px-4">DATA ABERTURA</th>
                <th className="py-3.5 px-4">DESIGNAÇÃO</th>
                <th className="py-3.5 px-4">AREA</th>
                <th className="py-3.5 px-4 text-center">status</th>
                <th className="py-3.5 px-4">resumo</th>
                <th className="py-3.5 px-4 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--color-text-muted)]">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--color-primary)]" />
                    Carregando atividades de qualidade...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--color-text-muted)]">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40 text-[var(--color-text-muted)]" />
                    <p className="font-semibold text-sm text-white">Nenhuma atividade encontrada</p>
                    <p className="text-xs text-[var(--color-text-faint)] mt-1">
                      {search || statusFilter !== 'ALL'
                        ? 'Tente ajustar os filtros ou buscar por outro termo.'
                        : `Nenhum cadastro de qualidade para o mês de ${currentMonthDisplayLabel}.`}
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
                  const statusNormalized = (item.status || '').toLowerCase();
                  const isConcluido = statusNormalized === 'concluido' || statusNormalized === 'concluído';
                  const isCancelado = statusNormalized === 'cancelado';
                  const isPendente = statusNormalized === 'pendente';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-white/[0.03] transition-colors group"
                    >
                      {/* 1. NÚMERO */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-white text-sm tracking-tight">
                          {item.ticket_number}
                        </span>
                      </td>

                      {/* 2. DATA ABERTURA */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-[var(--color-text)]">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-[var(--color-text-faint)]" />
                          <span>{item.opening_date_formatted || item.opening_date}</span>
                        </div>
                      </td>

                      {/* 3. DESIGNAÇÃO */}
                      <td className="py-3.5 px-4 font-semibold text-white">
                        <span className="truncate max-w-[280px] block" title={item.designation}>
                          {item.designation}
                        </span>
                      </td>

                      {/* 4. AREA */}
                      <td className="py-3.5 px-4 text-[var(--color-text)]">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <span className="font-mono font-medium text-xs">
                            {item.area || '—'}
                          </span>
                        </div>
                      </td>

                      {/* 5. status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                            isConcluido
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : isCancelado
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : isPendente
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isConcluido
                                ? 'bg-emerald-400'
                                : isCancelado
                                ? 'bg-rose-400'
                                : isPendente
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-sky-400 animate-pulse'
                            }`}
                          />
                          {item.status}
                        </span>
                      </td>

                      {/* 6. resumo */}
                      <td className="py-3.5 px-4 text-[var(--color-text-muted)] max-w-[260px]">
                        <p className="truncate text-xs" title={item.summary}>
                          {item.summary || '—'}
                        </p>
                      </td>

                      {/* AÇÕES: Copiar WhatsApp, Duplicar Registro, Editar, Deletar */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {/* Copiar WhatsApp (green) */}
                          <button
                            onClick={() => handleCopyWhatsApp(item)}
                            title="Copiar WhatsApp"
                            className="p-1.5 rounded-lg text-emerald-400 hover:text-white hover:bg-emerald-500/20 border border-transparent hover:border-emerald-500/30 transition-all active:scale-90"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>

                          {/* Duplicar Registro (cyan) */}
                          {canCreate && (
                            <button
                              onClick={() => handleDuplicate(item)}
                              title="Duplicar Registro"
                              className="p-1.5 rounded-lg text-sky-400 hover:text-white hover:bg-sky-500/20 border border-transparent hover:border-sky-500/30 transition-all active:scale-90"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}

                          {/* Editar (yellow) */}
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEdit(item)}
                              title="Editar"
                              className="p-1.5 rounded-lg text-amber-400 hover:text-white hover:bg-amber-500/20 border border-transparent hover:border-amber-500/30 transition-all active:scale-90"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}

                          {/* Deletar (pink) */}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(item.id)}
                              title="Deletar"
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

      {/* Modal de Criação / Edição */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingItem ? `Editar Atividade #${editingItem.id}` : 'Nova Atividade — RAL de Qualidade'}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          {modalError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* NÚMERO */}
            <Field label="NÚMERO *" hint="Número identificador do ticket Claro">
              <Input
                value={formTicketNumber}
                onChange={(e) => setFormTicketNumber(e.target.value)}
                placeholder="Ex: 139796"
                className="font-mono"
              />
            </Field>

            {/* DATA ABERTURA */}
            <Field label="DATA ABERTURA *" hint="Data e hora do registro">
              <Input
                type="datetime-local"
                value={formOpeningDate}
                onChange={(e) => setFormOpeningDate(e.target.value)}
              />
            </Field>
          </div>

          {/* DESIGNAÇÃO */}
          <Field label="DESIGNAÇÃO *" hint="Descrição do enlace, anel ou rota">
            <Input
              value={formDesignation}
              onChange={(e) => setFormDesignation(e.target.value)}
              placeholder="Ex: SWAP ALTAREDE PTS X XERE"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AREA */}
            <Field label="AREA" hint="Sigla da área ou regional">
              <Input
                value={formArea}
                onChange={(e) => setFormArea(e.target.value)}
                placeholder="Ex: BX1-FO, BX2-FO, RO-FO..."
                list="ral-areas-list"
              />
              <datalist id="ral-areas-list">
                <option value="BX1-FO" />
                <option value="BX2-FO" />
                <option value="BX-HFC" />
                <option value="RO-FO" />
                <option value="RO-HFC" />
                <option value="CAPITAL" />
                <option value="INTERIOR" />
              </datalist>
            </Field>

            {/* STATUS */}
            <Field label="STATUS" hint="Situação atual da atividade">
              <Select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as any)}
              >
                <option value="Concluido">Concluido</option>
                <option value="Em Andamento">Em Andamento</option>
                <option value="Pendente">Pendente</option>
                <option value="Cancelado">Cancelado</option>
              </Select>
            </Field>
          </div>

          {/* RESUMO */}
          <Field label="RESUMO" hint="Observações gerais da atividade, anomalias ou detalhes adicionais">
            <textarea
              value={formSummary}
              onChange={(e) => setFormSummary(e.target.value)}
              placeholder="Digite o resumo ou observações da vistoria..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-[#e20613] text-sm resize-none"
            />
          </Field>

          {/* Botões do Modal */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
              className="gap-2 !bg-[#e20613] !border-[#e20613] !text-white hover:!bg-[#c20511]"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{editingItem ? 'Salvar Alterações' : 'Salvar Registro'}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
