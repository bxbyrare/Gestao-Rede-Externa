import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { Card, PageHeader, Select, Textarea } from '../components/ui';

const AREAS = ['Baixada', 'Metropolitana', 'Norte Fluminense', 'Serra Fluminense', 'Sul Fluminense', 'Lagos'];

const MONTHS_LIST = [
  'janeiro-26', 'fevereiro-26', 'março-26', 'abril-26', 'maio-26', 'junho-26',
  'julho-26', 'agosto-26', 'setembro-26', 'outubro-26', 'novembro-26', 'dezembro-26',
  'janeiro-27', 'fevereiro-27', 'março-27', 'abril-27', 'maio-27', 'junho-27',
  'julho-27', 'agosto-27', 'setembro-27', 'outubro-27', 'novembro-27', 'dezembro-27',
];

const THRESHOLDS: Record<string, number> = { ral: 90, rec: 85, hfc: 80, gpon: 70, me11: 90, me3_hfc: 25, me3_gpon: 25 };

type Override = '' | 'red' | 'green' | 'black';
interface PctRow { area: string; total: number; fp: number; override_color: Override }
interface TimeRow { area: string; time: string; override_color: Override }

function defaultPctRows(values: Record<string, [number, number]>): PctRow[] {
  return AREAS.map((area) => ({ area, total: values[area]?.[0] ?? 0, fp: values[area]?.[1] ?? 0, override_color: '' }));
}
function defaultTimeRows(values: Record<string, string>): TimeRow[] {
  return AREAS.map((area) => ({ area, time: values[area] ?? '-', override_color: '' }));
}

function defaultData() {
  return {
    ral: defaultPctRows({ Baixada: [82, 7], Metropolitana: [53, 5], 'Norte Fluminense': [20, 1], 'Serra Fluminense': [32, 3], 'Sul Fluminense': [48, 0], Lagos: [13, 0] }),
    rec: defaultPctRows({ Baixada: [75, 12], Metropolitana: [52, 13], 'Norte Fluminense': [8, 2], 'Serra Fluminense': [6, 0], 'Sul Fluminense': [25, 1], Lagos: [7, 1] }),
    hfc: defaultPctRows({ Baixada: [4, 0], Metropolitana: [7, 1], 'Norte Fluminense': [0, 0], 'Serra Fluminense': [0, 0], 'Sul Fluminense': [2, 0], Lagos: [0, 0] }),
    gpon: defaultPctRows({ Baixada: [5, 2], Metropolitana: [10, 6], 'Norte Fluminense': [1, 0], 'Serra Fluminense': [3, 0], 'Sul Fluminense': [6, 2], Lagos: [5, 1] }),
    me11: defaultPctRows({ Baixada: [0, 0], Metropolitana: [0, 0], 'Norte Fluminense': [0, 0], 'Serra Fluminense': [0, 0], 'Sul Fluminense': [0, 0], Lagos: [0, 0] }),
    me3_hfc: defaultTimeRows({ Baixada: '20.07', Metropolitana: '34.06', 'Norte Fluminense': '1.99', 'Serra Fluminense': '1.92', 'Sul Fluminense': '8.54', Lagos: '-' }),
    me3_gpon: defaultTimeRows({ Baixada: '48.53', Metropolitana: '5.97', 'Norte Fluminense': '17.15', 'Serra Fluminense': '0', 'Sul Fluminense': '1.58', Lagos: '0' }),
    justificativas: '',
  };
}

type IndicatorData = ReturnType<typeof defaultData>;

function cycleOverride(o: Override): Override {
  if (o === 'red') return 'green';
  if (o === 'green') return 'black';
  if (o === 'black') return '';
  return 'red';
}

function pctOf(row: PctRow): number | null {
  return row.total > 0 ? Math.max(0, ((row.total - row.fp) / row.total) * 100) : null;
}

function cellClass(override: Override, belowTarget: boolean) {
  if (override === 'green') return 'bg-[var(--color-success)] text-black';
  if (override === 'red') return 'bg-[var(--color-danger)] text-white';
  if (override === 'black') return '';
  return belowTarget ? 'bg-[var(--color-danger)] text-white' : '';
}

function PctTable({ title, keyName, rows, onChange }: { title: string; keyName: string; rows: PctRow[]; onChange: (rows: PctRow[]) => void }) {
  const threshold = THRESHOLDS[keyName];
  const sumTotal = rows.reduce((s, r) => s + r.total, 0);
  const sumFp = rows.reduce((s, r) => s + r.fp, 0);
  const totalPct = sumTotal > 0 ? Math.max(0, ((sumTotal - sumFp) / sumTotal) * 100) : null;

  function update(idx: number, patch: Partial<PctRow>) {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  }

  return (
    <Card className="p-4 overflow-x-auto">
      <h3 className="font-bold text-sm mb-3">{title} <span className="text-[var(--color-text-faint)] font-normal">(meta ≥ {threshold}%)</span></h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
            <th className="py-2 pr-2">Área</th><th className="py-2 px-2">%</th><th className="py-2 px-2">Total</th><th className="py-2 px-2">FP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const pct = pctOf(row);
            return (
              <tr key={row.area} className="border-b border-white/5 last:border-0">
                <td className="py-1.5 pr-2 font-medium">{row.area}</td>
                <td className="py-1.5 px-2">
                  <button
                    onClick={() => update(idx, { override_color: cycleOverride(row.override_color) })}
                    className={`w-full rounded px-2 py-1 font-bold text-center ${cellClass(row.override_color, pct !== null && pct < threshold)}`}
                    title="Clique para alternar cor"
                  >
                    {pct === null ? '-' : `${pct.toFixed(2)}%`}
                  </button>
                </td>
                <td className="py-1.5 px-2">
                  <input type="number" value={row.total} onChange={(e) => update(idx, { total: Number(e.target.value) })} className="w-20 h-8 px-2 rounded bg-white/[0.03] border border-white/10 text-sm" />
                </td>
                <td className="py-1.5 px-2">
                  <input type="number" value={row.fp} onChange={(e) => update(idx, { fp: Number(e.target.value) })} className="w-20 h-8 px-2 rounded bg-white/[0.03] border border-white/10 text-sm" />
                </td>
              </tr>
            );
          })}
          <tr className="font-extrabold">
            <td className="py-2 pr-2">Interior</td>
            <td className="py-2 px-2">{totalPct === null ? '-' : `${totalPct.toFixed(2)}%`}</td>
            <td className="py-2 px-2">{sumTotal}</td>
            <td className="py-2 px-2">{sumFp}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function TimeTable({ title, keyName, rows, onChange }: { title: string; keyName: string; rows: TimeRow[]; onChange: (rows: TimeRow[]) => void }) {
  const threshold = THRESHOLDS[keyName];
  function update(idx: number, patch: Partial<TimeRow>) {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  return (
    <Card className="p-4 overflow-x-auto">
      <h3 className="font-bold text-sm mb-3">{title} <span className="text-[var(--color-text-faint)] font-normal">(meta ≤ {threshold})</span></h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
            <th className="py-2 pr-2">Área</th><th className="py-2 px-2">Tempo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const num = parseFloat(row.time.replace(',', '.'));
            const above = !isNaN(num) && num > threshold;
            return (
              <tr key={row.area} className="border-b border-white/5 last:border-0">
                <td className="py-1.5 pr-2 font-medium">{row.area}</td>
                <td className="py-1.5 px-2">
                  <input
                    value={row.time}
                    onClick={() => update(idx, { override_color: cycleOverride(row.override_color) })}
                    onChange={(e) => update(idx, { time: e.target.value })}
                    className={`w-24 h-8 px-2 rounded border border-white/10 text-sm text-center cursor-pointer ${cellClass(row.override_color, above)}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export default function IndicatorsPage() {
  const [month, setMonth] = useState('julho-26');
  const [data, setData] = useState<IndicatorData>(defaultData());
  const [status, setStatus] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setStatus('');
    api.get<{ month: string; data: IndicatorData | null }>('/api/indicators', { month }).then((res) => {
      setData(res.data || defaultData());
    });
  }, [month]);

  const scheduleSave = useCallback((next: IndicatorData) => {
    setStatus('Salvando...');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.post('/api/indicators', { month, data: next });
        setStatus('Salvo automaticamente.');
      } catch {
        setStatus('Erro ao salvar.');
      }
    }, 500);
  }, [month]);

  function updateField<K extends keyof IndicatorData>(key: K, value: IndicatorData[K]) {
    setData((d) => {
      const next = { ...d, [key]: value };
      scheduleSave(next);
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        title="Indicadores"
        subtitle="Acompanhamento mensal de metas por área"
        actions={
          <div className="flex items-center gap-3">
            {status && <span className="text-xs text-[var(--color-text-faint)]">{status}</span>}
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="!w-auto">
              {MONTHS_LIST.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <PctTable title="RAL" keyName="ral" rows={data.ral} onChange={(rows) => updateField('ral', rows)} />
        <PctTable title="REC" keyName="rec" rows={data.rec} onChange={(rows) => updateField('rec', rows)} />
        <PctTable title="HFC" keyName="hfc" rows={data.hfc} onChange={(rows) => updateField('hfc', rows)} />
        <PctTable title="GPON" keyName="gpon" rows={data.gpon} onChange={(rows) => updateField('gpon', rows)} />
        <PctTable title="ME11" keyName="me11" rows={data.me11} onChange={(rows) => updateField('me11', rows)} />
        <TimeTable title="ME3 - HFC" keyName="me3_hfc" rows={data.me3_hfc} onChange={(rows) => updateField('me3_hfc', rows)} />
        <TimeTable title="ME3 - GPON" keyName="me3_gpon" rows={data.me3_gpon} onChange={(rows) => updateField('me3_gpon', rows)} />
      </div>

      <Card className="p-4">
        <h3 className="font-bold text-sm mb-2">Justificativas</h3>
        <Textarea rows={4} value={data.justificativas} onChange={(e) => updateField('justificativas', e.target.value)} placeholder="Justificativas sobre os indicadores do mês..." />
      </Card>
    </div>
  );
}
