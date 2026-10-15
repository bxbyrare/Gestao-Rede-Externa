import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { Button, Card, Field, PageHeader, Select, Textarea } from '../components/ui';
import Modal from '../components/Modal';

const AREAS = ['Baixada', 'Metropolitana', 'Norte Fluminense', 'Serra Fluminense', 'Sul Fluminense', 'Lagos'];

const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

function generateMonthsList(): string[] {
  const list: string[] = [];
  const years = [2025, 2026, 2027, 2028];
  for (const y of years) {
    const yr = String(y).slice(-2);
    for (const m of MONTH_NAMES_PT) {
      list.push(`${m}-${yr}`);
    }
  }
  return list;
}

const MONTHS_LIST = generateMonthsList();

function getCurrentMonthKey(): string {
  const now = new Date();
  const m = MONTH_NAMES_PT[now.getMonth()];
  const yr = String(now.getFullYear()).slice(-2);
  const key = `${m}-${yr}`;
  return MONTHS_LIST.includes(key) ? key : `${MONTH_NAMES_PT[now.getMonth()]}-26`;
}

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
  const [month, setMonth] = useState<string>(getCurrentMonthKey);
  const [data, setData] = useState<IndicatorData>(defaultData());
  const [status, setStatus] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CSV Import State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleExportCsv() {
    window.location.href = `/api/indicators/export?month=${encodeURIComponent(month)}`;
  }

  function handleDownloadTemplate() {
    window.location.href = '/api/indicators/template';
  }

  function openImport() {
    setCsvText('');
    setImportError(null);
    setImportSuccess(null);
    setImportModalOpen(true);
  }

  function handleFileRead(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setCsvText(text);
      setImportError(null);
    };
    reader.onerror = () => {
      setImportError('Erro ao ler o arquivo selecionado.');
    };
    reader.readAsText(file, 'utf-8');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileRead(file);
  }

  async function submitImport() {
    if (!csvText.trim()) {
      setImportError('Insira ou carregue os dados em formato CSV para importar.');
      return;
    }
    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const res = await api.post<{ success: boolean; month: string; imported: number; data: IndicatorData }>(
        '/api/indicators/import',
        { month, csv_data: csvText }
      );
      if (res.data) {
        setData(res.data);
      }
      setImportSuccess(`${res.imported} registro(s) de indicador importado(s) com sucesso para ${month.toUpperCase()}!`);
      setTimeout(() => {
        setImportModalOpen(false);
        setImportSuccess(null);
        setCsvText('');
      }, 1400);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Erro ao processar arquivo CSV.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Indicadores"
        subtitle="Acompanhamento mensal de metas por área"
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {status && <span className="text-xs text-[var(--color-text-faint)]">{status}</span>}
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="!w-auto">
              {MONTHS_LIST.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </Select>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              title={`Exportar indicadores de ${month.toUpperCase()} em formato CSV`}
            >
              <Download className="w-4 h-4 text-[var(--color-primary)]" />
              <span>Exportar CSV</span>
            </Button>
            <Button
              variant="outline"
              onClick={openImport}
              title="Importar indicadores via planilha ou texto CSV"
            >
              <Upload className="w-4 h-4 text-[var(--color-accent)]" />
              <span>Importar CSV</span>
            </Button>
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

      {/* MODAL DE IMPORTAÇÃO CSV */}
      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title={`Importar Indicadores (CSV) - ${month.toUpperCase()}`}
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportModalOpen(false)} disabled={isImporting}>
              Cancelar
            </Button>
            <Button onClick={submitImport} disabled={isImporting}>
              {isImporting ? 'Processando...' : 'Processar Importação'}
            </Button>
          </>
        }
      >
        {importError && (
          <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)] flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{importError}</span>
          </div>
        )}

        {importSuccess && (
          <div className="mb-4 rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-3 text-sm text-[var(--color-success)] flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{importSuccess}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            Carregue uma planilha CSV ou cole o conteúdo abaixo para atualizar os dados de <strong className="text-[var(--color-text)]">{month.toUpperCase()}</strong>.
          </p>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="text-xs text-[var(--color-primary)] hover:underline inline-flex items-center gap-1.5 shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Baixar Modelo CSV
          </button>
        </div>

        {/* Upload drag/drop area */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 mb-4 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
              : 'border-white/10 hover:border-white/25 hover:bg-white/[0.02]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          <Upload className="w-6 h-6 mx-auto mb-2 text-[var(--color-text-muted)]" />
          <p className="text-sm font-medium text-[var(--color-text)]">
            Clique para selecionar o arquivo .csv ou arraste para cá
          </p>
          <p className="text-xs text-[var(--color-text-faint)] mt-1">
            Formatos aceitos: CSV ou TXT delimitado por ponto e vírgula (;) ou vírgula (,)
          </p>
        </div>

        <Field
          label="Ou cole / edite o conteúdo CSV diretamente"
          hint="Colunas: Indicador;Área;Total;FP;Tempo (ex: RAL;Baixada;82;7 ou ME3 - HFC;Baixada;;;20.07)"
        >
          <Textarea
            rows={7}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={`Indicador;Área;Total;FP;Tempo\nRAL;Baixada;82;7;\nREC;Metropolitana;52;13;\nME3 - HFC;Baixada;;;20.07\nJUSTIFICATIVAS;Observações do mês...`}
            className="font-mono text-xs"
          />
        </Field>
      </Modal>
    </div>
  );
}
