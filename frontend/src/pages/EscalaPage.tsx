import { useEffect, useMemo, useState } from 'react';
import { Save, Search } from 'lucide-react';
import { api } from '../api/client';
import { Button, Card, Input, PageHeader, Select } from '../components/ui';

const STATUSES = ['Trabalho', 'Folga', 'Férias', 'BH', 'Feriado'];

const STATUS_STYLE: Record<string, string> = {
  Trabalho: 'bg-white/[0.05] text-[var(--color-text-muted)]',
  Folga: 'bg-[var(--color-danger)]/15 text-red-300',
  Férias: 'bg-yellow-500/15 text-yellow-200 border border-yellow-500/30',
  BH: 'bg-blue-500/15 text-blue-300',
  Feriado: 'bg-green-500/15 text-green-300',
};

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
  const [activeStatus, setActiveStatus] = useState('Folga');
  const [pending, setPending] = useState<Record<string, { tech_id: number; date: string; status: string; work_hours: string; on_call: string }>>({});
  const [status, setStatus] = useState('');

  function load() {
    setLoading(true);
    api.get<ScheduleResponse>('/api/schedules', { month, area: area || undefined, company: company || undefined, search: search || undefined })
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(load, [month, area, company]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]);

  const pendingCount = Object.keys(pending).length;

  function cellValue(tech: ScheduleTech, date: string): DaySchedule {
    const key = `${tech.id}:${date}`;
    if (pending[key]) return { status: pending[key].status, work_hours: pending[key].work_hours, on_call: pending[key].on_call };
    return tech.schedules[date] || { status: 'Trabalho', work_hours: '08 às 17:48hs', on_call: '0' };
  }

  function paintCell(tech: ScheduleTech, date: string) {
    const key = `${tech.id}:${date}`;
    const work_hours = activeStatus === 'Trabalho' ? '08 às 17:48hs' : activeStatus;
    setPending((p) => ({ ...p, [key]: { tech_id: tech.id, date, status: activeStatus, work_hours, on_call: cellValue(tech, date).on_call } }));
  }

  async function saveAll() {
    const updates = Object.values(pending);
    if (!updates.length) return;
    setStatus('Salvando...');
    try {
      await api.post<{ updated: number }>('/api/schedules/batch', { updates });
      setStatus(`${updates.length} dia(s) salvo(s) com sucesso.`);
      setPending({});
      load();
    } catch {
      setStatus('Erro ao salvar alterações.');
    }
  }

  const technicians = useMemo(() => data?.technicians || [], [data]);

  return (
    <div>
      <PageHeader
        title="Escala"
        subtitle="Escala de trabalho mensal por área"
        actions={
          pendingCount > 0 ? (
            <Button onClick={saveAll}><Save className="w-4 h-4" /> Salvar {pendingCount} alteraç{pendingCount === 1 ? 'ão' : 'ões'}</Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-11 px-4 rounded-full bg-white/[0.03] border border-white/10 text-sm" />
        <Select value={area} onChange={(e) => setArea(e.target.value)} className="max-w-[220px]">
          <option value="">Selecione uma área...</option>
          {(data?.areas_list || []).map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select value={company} onChange={(e) => setCompany(e.target.value)} className="max-w-[180px]">
          <option value="">Todas as empresas</option>
          <option value="Claro">Claro</option>
          <option value="FFA">FFA</option>
          <option value="Procisa">Procisa</option>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, cargo, telefone..." className="pl-11 rounded-full" />
        </div>
      </div>

      {status && <p className="text-xs text-[var(--color-text-faint)] mb-4">{status}</p>}

      {!area ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Selecione uma área para visualizar a escala.</Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs text-[var(--color-text-faint)] self-center mr-1">Pintar como:</span>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setActiveStatus(s)}
                className={`h-8 px-4 rounded-full text-xs font-bold transition-all ${STATUS_STYLE[s]} ${activeStatus === s ? 'ring-2 ring-[var(--color-accent)]' : 'opacity-70'}`}
              >
                {s}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
          ) : technicians.length === 0 ? (
            <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhum colaborador encontrado para esta área.</Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[var(--color-surface-2)] px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] min-w-[200px]">Colaborador</th>
                    {(data?.days_in_month || []).map((d) => (
                      <th key={d.date} className={`px-2 py-3 text-center text-[10px] font-bold min-w-[44px] ${d.is_weekend ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-faint)]'}`}>
                        <div>{d.day_num}</div>
                        <div className="font-normal opacity-70">{d.day_name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {technicians.map((t) => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="sticky left-0 z-10 bg-[var(--color-surface)] px-4 py-2 whitespace-nowrap">
                        <div className="font-semibold text-xs">{t.name}</div>
                        <div className="text-[10px] text-[var(--color-text-faint)]">{t.role} · {t.company}</div>
                      </td>
                      {(data?.days_in_month || []).map((d) => {
                        const cell = cellValue(t, d.date);
                        const isDirty = !!pending[`${t.id}:${d.date}`];
                        return (
                          <td key={d.date} className="p-0.5">
                            <button
                              onClick={() => paintCell(t, d.date)}
                              title={cell.work_hours}
                              className={`w-full h-9 rounded text-[9px] font-bold flex items-center justify-center ${STATUS_STYLE[cell.status] || STATUS_STYLE.Trabalho} ${isDirty ? 'ring-1 ring-[var(--color-accent)]' : ''}`}
                            >
                              {cell.status === 'Trabalho' ? '' : cell.status.slice(0, 3)}
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
    </div>
  );
}
