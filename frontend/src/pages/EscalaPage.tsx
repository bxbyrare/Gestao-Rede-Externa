import { useEffect, useMemo, useState } from 'react';
import { Save, Search, Clock, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import { Button, Card, Input, PageHeader, Select } from '../components/ui';
import Modal from '../components/Modal';

const STATUSES = ['Trabalho', 'Folga', 'Férias', 'BH', 'Feriado', 'Atestado', 'Treinamento', 'Plantão'];

const STATUS_STYLE: Record<string, string> = {
  Trabalho: 'bg-white/[0.05] text-[var(--color-text-muted)] hover:bg-white/[0.1]',
  Folga: 'bg-[var(--color-danger)]/20 text-red-300 border border-red-500/30',
  Férias: 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/30',
  BH: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  Feriado: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  Atestado: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  Treinamento: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
  Plantão: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
};

const WORK_HOURS_OPTIONS = [
  { value: '08 às 17:48hs', label: '08:00 às 17:48 (Comercial Padrão)' },
  { value: '07 às 16:48hs', label: '07:00 às 16:48 (Turno Manhã)' },
  { value: '08 às 17:00hs', label: '08:00 às 17:00 (Turno Normal)' },
  { value: '09 às 18:48hs', label: '09:00 às 18:48 (Turno Intermediário)' },
  { value: '13 às 22:00hs', label: '13:00 às 22:00 (Turno Tarde)' },
  { value: '22 às 06:00hs', label: '22:00 às 06:00 (Turno Noturno)' },
  { value: 'Plantão 12x36', label: 'Plantão 12x36' },
  { value: 'Plantão 24h', label: 'Plantão 24 Horas' },
  { value: 'custom', label: 'Outro horário (personalizado)...' },
];

interface DaySchedule { status: string; work_hours: string; on_call: string }
interface ScheduleDay { date: string; day_num: number; day_label: string; day_name: string; is_weekend: boolean }
interface ScheduleTech { id: number; name: string; role: string; company: string; area: string; schedules: Record<string, DaySchedule> }
interface ScheduleResponse {
  area_required: boolean;
  month: string;
  area?: string;
  areas_list: string[];
  days_in_month: ScheduleDay[];
  technicians: ScheduleTech[];
}

function currentMonthSlug() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function EscalaPage() {
  const [month, setMonth] = useState(currentMonthSlug());
  const [area, setArea] = useState('');
  const [company, setCompany] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeStatus, setActiveStatus] = useState('Trabalho');
  const [selectedHoursPreset, setSelectedHoursPreset] = useState('08 às 17:48hs');
  const [customHoursInput, setCustomHoursInput] = useState('');
  const [onCallActive, setOnCallActive] = useState(false);
  const [pending, setPending] = useState<Record<string, { tech_id: number; date: string; status: string; work_hours: string; on_call: string }>>({});
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Single cell edit modal
  const [editingCell, setEditingCell] = useState<{ tech: ScheduleTech; date: string; dayLabel: string } | null>(null);
  const [modalStatus, setModalStatus] = useState('Trabalho');
  const [modalHours, setModalHours] = useState('08 às 17:48hs');
  const [modalOnCall, setModalOnCall] = useState(false);

  function load() {
    setLoading(true);
    api.get<ScheduleResponse>('/api/schedules', { month, area: area || undefined, company: company || undefined, search: search || undefined })
      .then((res) => {
        setData(res);
        if (res.areas_list?.length > 0 && !area) {
          // Keep user selection or let them pick
        }
      })
      .catch(() => {
        setData(null);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [month, area, company]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]);

  const pendingCount = Object.keys(pending).length;

  const effectiveWorkHours = useMemo(() => {
    if (activeStatus !== 'Trabalho' && activeStatus !== 'Plantão') {
      return activeStatus;
    }
    if (selectedHoursPreset === 'custom') {
      return customHoursInput.trim() || '08 às 17:48hs';
    }
    return selectedHoursPreset;
  }, [activeStatus, selectedHoursPreset, customHoursInput]);

  function cellValue(tech: ScheduleTech, date: string): DaySchedule {
    const key = `${tech.id}:${date}`;
    if (pending[key]) {
      return {
        status: pending[key].status,
        work_hours: pending[key].work_hours,
        on_call: pending[key].on_call
      };
    }
    return tech.schedules[date] || { status: 'Trabalho', work_hours: '08 às 17:48hs', on_call: '0' };
  }

  function paintCell(tech: ScheduleTech, date: string) {
    const key = `${tech.id}:${date}`;
    const work_hours = effectiveWorkHours;
    const on_call = onCallActive ? '1' : '0';
    setPending((p) => ({
      ...p,
      [key]: { tech_id: tech.id, date, status: activeStatus, work_hours, on_call }
    }));
  }

  function openCellDetail(tech: ScheduleTech, date: string, dayLabel: string) {
    const cell = cellValue(tech, date);
    setEditingCell({ tech, date, dayLabel });
    setModalStatus(cell.status);
    setModalHours(cell.work_hours);
    setModalOnCall(cell.on_call === '1');
  }

  function saveCellDetail() {
    if (!editingCell) return;
    const key = `${editingCell.tech.id}:${editingCell.date}`;
    setPending((p) => ({
      ...p,
      [key]: {
        tech_id: editingCell.tech.id,
        date: editingCell.date,
        status: modalStatus,
        work_hours: modalHours.trim() || modalStatus,
        on_call: modalOnCall ? '1' : '0'
      }
    }));
    setEditingCell(null);
  }

  async function saveAll() {
    const updates = Object.values(pending);
    if (!updates.length) return;
    setStatusMsg({ type: 'info', text: 'Salvando modificações na escala...' });
    try {
      const res = await api.post<{ updated: number }>('/api/schedules/batch', { updates });
      setStatusMsg({ type: 'success', text: `✅ ${res.updated || updates.length} dia(s) salvo(s) com sucesso na escala!` });
      setPending({});
      load();
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `❌ Erro ao salvar escala: ${err.message || 'Falha no servidor'}` });
    }
  }

  const technicians = useMemo(() => data?.technicians || [], [data]);

  return (
    <div>
      <PageHeader
        title="Escala"
        subtitle="Escala de trabalho mensal por área e horários de turno"
        actions={
          pendingCount > 0 ? (
            <Button onClick={saveAll} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/20">
              <Save className="w-4 h-4" /> Salvar {pendingCount} alteraç{pendingCount === 1 ? 'ão' : 'ões'}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-11 px-4 rounded-full bg-white/[0.03] border border-white/10 text-sm font-medium focus:border-[var(--color-primary)] focus:outline-none"
        />
        <Select value={area} onChange={(e) => setArea(e.target.value)} className="max-w-[220px]">
          <option value="">Selecione uma área...</option>
          {(data?.areas_list || []).map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select value={company} onChange={(e) => setCompany(e.target.value)} className="max-w-[180px]">
          <option value="">Todas as empresas</option>
          <option value="Claro">Claro</option>
          <option value="FFA">FFA</option>
          <option value="Procisa">Procisa</option>
          <option value="Servilog">Servilog</option>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, cargo, telefone..." className="pl-11 rounded-full" />
        </div>
      </div>

      {statusMsg && (
        <div
          className={`mb-4 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : statusMsg.type === 'error'
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
          }`}
        >
          {statusMsg.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
          {statusMsg.type === 'error' && <AlertCircle className="w-4 h-4" />}
          {statusMsg.text}
        </div>
      )}

      {!area ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">
          Selecione uma área no filtro acima para visualizar e gerenciar a escala.
        </Card>
      ) : (
        <>
          {/* Controls: Paint Status & Work Hours Selector */}
          <Card className="p-4 mb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider mr-1">
                Status do Dia:
              </span>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setActiveStatus(s)}
                  className={`h-8 px-3.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    STATUS_STYLE[s] || 'bg-white/10'
                  } ${activeStatus === s ? 'ring-2 ring-[var(--color-primary)] scale-105 shadow-md' : 'opacity-70'}`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Horários de Turno (Work Hours) to include */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span className="text-xs font-semibold text-slate-300">Horário a Incluir:</span>
              </div>

              <select
                value={selectedHoursPreset}
                onChange={(e) => setSelectedHoursPreset(e.target.value)}
                disabled={activeStatus !== 'Trabalho' && activeStatus !== 'Plantão'}
                className="h-9 px-3 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-40"
              >
                {WORK_HOURS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {selectedHoursPreset === 'custom' && (activeStatus === 'Trabalho' || activeStatus === 'Plantão') && (
                <input
                  type="text"
                  value={customHoursInput}
                  onChange={(e) => setCustomHoursInput(e.target.value)}
                  placeholder="Ex: 06:00 às 15:00 / 12x36"
                  className="h-9 px-3 rounded-xl bg-slate-900 border border-[var(--color-primary)] text-xs text-white focus:outline-none w-48 font-mono"
                />
              )}

              <label className="flex items-center gap-2 ml-auto text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onCallActive}
                  onChange={(e) => setOnCallActive(e.target.checked)}
                  className="rounded bg-slate-900 border-white/20 text-orange-500 focus:ring-0"
                />
                <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
                <span>Sobreaviso / Plantão Ativo</span>
              </label>
            </div>
          </Card>

          {loading ? (
            <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">Carregando dados da escala...</p>
          ) : technicians.length === 0 ? (
            <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">
              Nenhum colaborador encontrado para esta área.
            </Card>
          ) : (
            <Card className="overflow-x-auto shadow-2xl">
              <table className="text-sm border-collapse w-full">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-[#121622] px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] min-w-[210px] border-b border-white/10">
                      Colaborador
                    </th>
                    {(data?.days_in_month || []).map((d) => (
                      <th
                        key={d.date}
                        className={`px-1.5 py-3 text-center text-[10px] font-bold min-w-[42px] border-b border-white/10 ${
                          d.is_weekend ? 'text-rose-400 bg-rose-500/5' : 'text-slate-300'
                        }`}
                      >
                        <div className="text-xs">{d.day_num}</div>
                        <div className="font-normal text-[9px] opacity-70 uppercase">{d.day_name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {technicians.map((t) => (
                    <tr key={t.id} className="border-t border-white/5 hover:bg-white/[0.01]">
                      <td className="sticky left-0 z-10 bg-[#0E121C] px-4 py-2 whitespace-nowrap border-r border-white/5 shadow-md">
                        <div className="font-bold text-xs text-white truncate max-w-[190px]">{t.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {t.role} · <strong className="text-slate-300">{t.company}</strong>
                        </div>
                      </td>
                      {(data?.days_in_month || []).map((d) => {
                        const cell = cellValue(t, d.date);
                        const isDirty = Boolean(pending[`${t.id}:${d.date}`]);
                        const isOnCall = cell.on_call === '1';

                        return (
                          <td key={d.date} className="p-0.5 relative">
                            <button
                              onClick={() => paintCell(t, d.date)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                openCellDetail(t, d.date, d.day_label);
                              }}
                              title={`${t.name} (${d.day_label})\nStatus: ${cell.status}\nHorário: ${cell.work_hours}${
                                isOnCall ? '\n[Sobreaviso / Plantão]' : ''
                              }\n(Clique com botão direito para detalhes)`}
                              className={`w-full h-9 rounded-lg text-[9px] font-bold flex flex-col items-center justify-center transition-all cursor-pointer select-none ${
                                STATUS_STYLE[cell.status] || STATUS_STYLE.Trabalho
                              } ${isDirty ? 'ring-2 ring-[var(--color-primary)] scale-95' : ''}`}
                            >
                              <span>{cell.status === 'Trabalho' ? 'TRAB' : cell.status.slice(0, 4).toUpperCase()}</span>
                              {isOnCall && (
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 absolute top-1 right-1" />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* Modal: Edit single day detail */}
      {editingCell && (
        <Modal
          open={Boolean(editingCell)}
          onClose={() => setEditingCell(null)}
          title={`Ajustar Escala — ${editingCell.tech.name}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditingCell(null)}>
                Cancelar
              </Button>
              <Button onClick={saveCellDetail}>Aplicar Alteração</Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="p-3 bg-white/5 rounded-xl text-xs space-y-1">
              <div>
                <strong>Colaborador:</strong> {editingCell.tech.name} ({editingCell.tech.role})
              </div>
              <div>
                <strong>Empresa:</strong> {editingCell.tech.company} | <strong>Área:</strong> {editingCell.tech.area}
              </div>
              <div>
                <strong>Data:</strong> {editingCell.dayLabel} ({editingCell.date})
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Status:</label>
              <Select value={modalStatus} onChange={(e) => setModalStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Horário de Trabalho:</label>
              <Input
                value={modalHours}
                onChange={(e) => setModalHours(e.target.value)}
                placeholder="Ex: 08 às 17:48hs / 07:00 às 16:48"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={modalOnCall}
                onChange={(e) => setModalOnCall(e.target.checked)}
                className="rounded bg-slate-900 border-white/20 text-orange-500"
              />
              <ShieldCheck className="w-4 h-4 text-orange-400" />
              <span>Marcar Sobreaviso / Plantão para este dia</span>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
