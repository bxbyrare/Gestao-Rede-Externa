import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, MessageCircle, Pencil, Search, Upload, X } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';
import Modal from '../components/Modal';
import { isCoordenador, useAuth } from '../state/AuthContext';

const TOPICS = ['RAL', 'REC', 'HFC', 'GPON'];
const MAX_ROUTE_SUGGESTIONS = 30;

// A plain <select> with tens of thousands of <option>s (this base has
// 60k+ records → ~29k distinct routes) freezes the browser on open.
// Filters client-side and only ever renders a handful of suggestions.
function RouteFilterCombobox({ routes, value, onChange }: { routes: string[]; value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => setQuery(value), [value]);

  const suggestions = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return routes.slice(0, MAX_ROUTE_SUGGESTIONS);
    return routes.filter((r) => r.toUpperCase().includes(q)).slice(0, MAX_ROUTE_SUGGESTIONS);
  }, [routes, query]);

  function pick(r: string) {
    onChange(r);
    setQuery(r);
    setOpen(false);
  }
  function clear() {
    onChange('');
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="relative sm:max-w-[280px] w-full">
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Filtrar por rota..."
        className="rounded-full pr-9"
      />
      {value && (
        <button onMouseDown={(e) => { e.preventDefault(); clear(); }} aria-label="Limpar filtro de rota" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text)]">
          <X className="w-4 h-4" />
        </button>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl glass border border-white/10 shadow-2xl">
          {suggestions.map((r) => (
            <button
              key={r}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-white/[0.07] truncate"
            >
              {r}
            </button>
          ))}
          {routes.length > MAX_ROUTE_SUGGESTIONS && suggestions.length === MAX_ROUTE_SUGGESTIONS && (
            <div className="px-4 py-2 text-[11px] text-[var(--color-text-faint)] border-t border-white/5">Digite para refinar — {routes.length} rotas no total.</div>
          )}
        </div>
      )}
    </div>
  );
}

interface BuscadorResponse {
  topic: string;
  columns: string[];
  last_updated: string;
  record_count: number;
  total_records: number;
  routes: string[];
  records: Array<[string, string, string, string, string, string, string, string, string, number, boolean]>;
  error?: string;
}

export default function BuscadorPage() {
  const { user } = useAuth();
  const canManage = isCoordenador(user);
  const [topic, setTopic] = useState('RAL');
  const [search, setSearch] = useState('');
  const [route, setRoute] = useState('');
  const [data, setData] = useState<BuscadorResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDistance, setEditDistance] = useState('');
  const [editRef, setEditRef] = useState('');

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<BuscadorResponse>('/api/buscador/records', { topic, search: search || undefined, route: route || undefined })
      .then(setData)
      .finally(() => setLoading(false));
  }, [topic, search, route]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => { setRoute(''); setSearch(''); }, [topic]);

  function openEdit(id: number, distance: string, ref: string) {
    setEditingId(id);
    setEditDistance(distance === '-' ? '' : distance);
    setEditRef(ref === '-' ? '' : ref);
    setError(null);
    setEditModalOpen(true);
  }

  async function submitEdit() {
    if (editingId === null) return;
    try {
      await api.put(`/api/buscador/records/${editingId}`, { distance: editDistance, ref: editRef });
      setEditModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    }
  }

  async function submitUpload() {
    if (!uploadFile) { setError('Selecione uma planilha para carregar.'); return; }
    setError(null);
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('topic', topic);
      await api.postFormData<{ message?: string; error?: string }>('/api/buscador/upload', fd);
      setUploadModalOpen(false);
      setUploadFile(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao processar o upload da base.');
    } finally {
      setIsUploading(false);
    }
  }

  function sendWhatsapp() {
    const records = data?.records || [];
    if (!records.length) {
      alert('Nenhum resultado para enviar no WhatsApp.');
      return;
    }
    let msg = `🚨 *REDE EXTERNA - RELATÓRIO DE FALHAS (${topic})* 🚨\n`;
    if (search) msg += `🔍 *Filtro de Pesquisa:* ${search}\n`;
    if (route) msg += `🛣️ *Filtro de Rota:* ${route}\n`;
    msg += `📊 *Total Encontrado:* ${records.length} ocorrência(s)\n`;
    msg += `-------------------------------------------\n\n`;
    const limit = Math.min(records.length, 15);
    for (let i = 0; i < limit; i++) {
      const r = records[i];
      msg += `• ${r[0] || '-'} | ${r[1] || '-'} | Dist: ${r[4] || '-'}\n`;
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  const columns = data?.columns || [];

  const rows = useMemo(() => data?.records || [], [data]);

  return (
    <div>
      <PageHeader
        title="Buscador"
        subtitle="Consulta de bases de falhas RAL, REC, HFC e GPON"
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => { setUploadFile(null); setError(null); setUploadModalOpen(true); }}>
                <Upload className="w-4 h-4" /> Carregar Base
              </Button>
            )}
            <Button variant="outline" onClick={() => { window.location.href = `/api/buscador/export?topic=${topic}`; }}>
              <Download className="w-4 h-4" /> Exportar
            </Button>
            <Button variant="outline" onClick={sendWhatsapp}>
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </Button>
          </div>
        }
      />

      <div className="flex gap-2 mb-4">
        {TOPICS.map((t) => (
          <button
            key={t}
            onClick={() => setTopic(t)}
            className={`h-10 px-5 rounded-full text-sm font-bold transition-colors ${topic === t ? 'bg-[var(--color-primary-dim)] text-[var(--color-primary)] border border-[var(--color-primary)]/30' : 'bg-white/[0.03] border border-white/10 text-[var(--color-text-muted)]'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-4 mb-4 text-sm text-[var(--color-text-muted)]">
          <span>Última atualização: <strong className="text-[var(--color-text)]">{data.last_updated}</strong></span>
          <span>{data.record_count} registro(s) exibido(s) de {data.total_records}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar em todas as colunas..." className="pl-11 rounded-full" />
        </div>
        <RouteFilterCombobox routes={data?.routes || []} value={route} onChange={setRoute} />
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--color-text-muted)]">Nenhum registro encontrado para esta base.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] border-b border-white/10">
                {columns.map((c) => <th key={c} className="px-4 py-3">{c}</th>)}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [c1, c2, c3, c4, dist, ref, c6, c7, c8, id, isEdited] = r;
                return (
                  <tr key={id} className={`border-b border-white/5 last:border-0 hover:bg-white/[0.02] ${isEdited ? 'bg-[var(--color-accent)]/5' : ''}`}>
                    <td className="px-4 py-2.5">{c1 || '-'}</td>
                    <td className="px-4 py-2.5 mono">{c2 || '-'}</td>
                    <td className="px-4 py-2.5">{c3 || '-'}</td>
                    <td className="px-4 py-2.5">{c4 || '-'}</td>
                    <td className="px-4 py-2.5 font-semibold">{dist || '-'}</td>
                    <td className="px-4 py-2.5">{ref || '-'}</td>
                    <td className="px-4 py-2.5">{c6 || '-'}</td>
                    <td className="px-4 py-2.5">{c7 || '-'}</td>
                    <td className="px-4 py-2.5">{c8 || '-'}</td>
                    <td className="px-4 py-2.5">
                      {canManage && (
                        <button onClick={() => openEdit(id, dist, ref)} aria-label="Editar distância e ref" className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/[0.07]">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Editar Distância & REF"
        footer={<><Button variant="ghost" onClick={() => setEditModalOpen(false)}>Cancelar</Button><Button onClick={submitEdit}>Salvar</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Distância">
          <Input value={editDistance} onChange={(e) => setEditDistance(e.target.value)} placeholder="ex: 10km, 500m" />
        </Field>
        <Field label="REF (Referência)">
          <Input value={editRef} onChange={(e) => setEditRef(e.target.value)} placeholder="ex: REF-001" />
        </Field>
      </Modal>

      <Modal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title={`Carregar Nova Base (${topic})`}
        footer={<><Button variant="ghost" onClick={() => setUploadModalOpen(false)}>Cancelar</Button><Button onClick={submitUpload} disabled={isUploading}>{isUploading ? 'Substituindo base...' : 'Substituir Base'}</Button></>}
      >
        {error && <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
        <Field label="Planilha (.xlsx, .xlsm, .xls, .csv)" hint="Substitui toda a base atual deste tópico.">
          <input
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv"
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            className="w-full text-sm text-[var(--color-text-muted)] file:mr-3 file:h-9 file:px-4 file:rounded-full file:border-0 file:bg-white/[0.06] file:text-[var(--color-text)] file:text-sm"
          />
        </Field>
      </Modal>
    </div>
  );
}
