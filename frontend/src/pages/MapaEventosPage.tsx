import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import {
  Zap,
  Flame,
  ShieldAlert,
  BarChart3,
  Map as MapIcon,
  AlertTriangle,
  TrendingUp,
  Route as RouteIcon,
  Clock
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { api } from '../api/client';
import { Card, PageHeader } from '../components/ui';
import type { EstratificacaoData } from '../api/types';

interface MapEvent {
  id: number;
  topic: string;
  designation: string;
  ticket: string;
  date: string;
  subcluster?: string;
  address: string;
  cause: string;
  event_type: string;
  lat: number;
  lng: number;
}

interface MapaData {
  total: number;
  events: MapEvent[];
  last_updated: string;
}

const EVENT_TYPES = [
  { key: 'CURTO CIRCUITO', label: 'Curto Circuito', color: '#f59e0b' },
  { key: 'REDE BAIXA', label: 'Rede Baixa', color: '#38bdf8' },
  { key: 'VANDALISMO', label: 'Vandalismo', color: '#ef4444' },
];

const RIO_CENTER: [number, number] = [-22.35, -42.9];

export default function MapaEventosPage() {
  const [activeTab, setActiveTab] = useState<'mapa' | 'estratificacao'>('mapa');

  // Mapa state
  const [data, setData] = useState<MapaData | null>(null);
  const [activeTypes, setActiveTypes] = useState<string[]>(EVENT_TYPES.map((t) => t.key));
  const [isLoading, setIsLoading] = useState(true);

  // Estratificacao state
  const [stratData, setStratData] = useState<EstratificacaoData | null>(null);
  const [stratTopic, setStratTopic] = useState('TODAS');
  const [stratArea, setStratArea] = useState('TODAS');
  const [isStratLoading, setIsStratLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'mapa') {
      setIsLoading(true);
      api
        .get<MapaData>('/api/mapa-eventos/data', { event_types: activeTypes.join(',') })
        .then(setData)
        .catch(() => setData(null))
        .finally(() => setIsLoading(false));
    }
  }, [activeTypes, activeTab]);

  useEffect(() => {
    if (activeTab === 'estratificacao') {
      setIsStratLoading(true);
      api
        .get<EstratificacaoData>('/api/mapa-eventos/estratificacao', {
          topic: stratTopic !== 'TODAS' ? stratTopic : undefined,
          area: stratArea !== 'TODAS' ? stratArea : undefined
        })
        .then(setStratData)
        .catch(() => setStratData(null))
        .finally(() => setIsStratLoading(false));
    }
  }, [stratTopic, stratArea, activeTab]);

  const colorFor = useMemo(() => {
    const map = new Map(EVENT_TYPES.map((t) => [t.key, t.color]));
    return (type: string) => map.get(type) || '#94a3b8';
  }, []);

  function toggleType(key: string) {
    setActiveTypes((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eventos & Estratificação de Rede"
        subtitle="Monitoramento geolocalizado de ocorrências e inteligência preditiva de reincidências"
        actions={
          <div className="flex gap-2 p-1 bg-[#0F1422] rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab('mapa')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'mapa'
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" /> Mapa Geolocalizado
            </button>
            <button
              onClick={() => setActiveTab('estratificacao')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'estratificacao'
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Estratificação & Análise
            </button>
          </div>
        }
      />

      {activeTab === 'mapa' ? (
        <>
          <Card className="p-4 bg-[#0F1422] border-white/10 rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Filtrar por:</span>
              {EVENT_TYPES.map((t) => {
                const active = activeTypes.includes(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleType(t.key)}
                    className="px-3.5 h-9 rounded-xl text-xs font-bold uppercase tracking-wide transition-all border"
                    style={
                      active
                        ? { background: `${t.color}20`, borderColor: t.color, color: t.color }
                        : { background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', color: '#94a3b8' }
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-6 text-right">
              <div>
                <span className="block text-xl font-extrabold text-red-500 font-mono">{data?.total ?? 0}</span>
                <span className="text-[11px] text-slate-400">Total de eventos</span>
              </div>
              <div>
                <span className="flex items-center gap-1.5 font-bold text-sm text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Ao vivo
                </span>
                <span className="text-[11px] text-slate-400">{data?.last_updated || '—'}</span>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
            <Card className="p-4 bg-[#0F1422] border-white/10 rounded-2xl max-h-[580px] overflow-y-auto">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-red-500" /> Últimas Ocorrências
              </h3>
              <div className="space-y-2">
                {(data?.events ?? []).slice(0, 30).map((ev) => (
                  <div key={ev.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(ev.event_type) }} />
                      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: colorFor(ev.event_type) }}>
                        {ev.event_type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 truncate font-medium" title={ev.address}>{ev.address && !ev.address.toLowerCase().includes("sem endere") ? ev.address : (ev.designation && ev.designation !== "-" ? `${ev.designation} · ${ev.subcluster || ""}` : ev.subcluster || "Rede Externa")}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{ev.date} · {ev.cause}</p>
                  </div>
                ))}
                {!isLoading && (data?.events ?? []).length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-6">Nenhum evento no filtro atual.</p>
                )}
              </div>
            </Card>

            <Card className="overflow-hidden bg-[#0F1422] border-white/10 rounded-2xl shadow-xl" style={{ minHeight: 580 }}>
              <MapContainer center={RIO_CENTER} zoom={9} style={{ height: '100%', minHeight: 580, width: '100%' }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {(data?.events ?? []).map((ev) => (
                  <CircleMarker
                    key={ev.id}
                    center={[ev.lat, ev.lng]}
                    radius={7}
                    pathOptions={{ color: colorFor(ev.event_type), fillColor: colorFor(ev.event_type), fillOpacity: 0.8, weight: 2 }}
                  >
                    <Popup>
                      <div className="text-xs p-1">
                        <strong className="text-slate-900 block font-bold mb-1">{ev.event_type}</strong>
                        <div className="text-slate-700 font-medium mb-1">{ev.address && !ev.address.toLowerCase().includes("sem endere") ? ev.address : (ev.designation && ev.designation !== "-" ? `${ev.designation} · ${ev.subcluster || ""}` : ev.subcluster || "Rede Externa")}</div>
                        <span className="text-slate-500 text-[11px]">{ev.date} • {ev.cause}</span>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Flame, label: 'Curto Circuito', key: 'CURTO CIRCUITO', color: '#f59e0b' },
              { icon: Zap, label: 'Rede Baixa', key: 'REDE BAIXA', color: '#38bdf8' },
              { icon: ShieldAlert, label: 'Vandalismo', key: 'VANDALISMO', color: '#ef4444' },
            ].map(({ icon: Icon, label, key, color }) => {
              const count = (data?.events ?? []).filter((e) => e.event_type === key).length;
              return (
                <Card key={key} className="p-4 bg-[#0F1422] border-white/10 rounded-2xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}15`, color }}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xl font-extrabold font-mono text-slate-100">{count}</div>
                    <div className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">{label}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        /* Aba Estratificação */
        <div className="space-y-6">
          {/* Filtros da Estratificação */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between p-4 bg-[#0F1422] border border-white/10 rounded-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tópico:</span>
              {['TODAS', 'RAL', 'REC', 'OUTAGE'].map((tp) => (
                <button
                  key={tp}
                  onClick={() => setStratTopic(tp)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    stratTopic === tp
                      ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tp}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Região:</span>
              {['TODAS', 'Capital', 'Interior'].map((ar) => (
                <button
                  key={ar}
                  onClick={() => setStratArea(ar)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    stratArea === ar
                      ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          {isStratLoading ? (
            <div className="p-16 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              Calculando estratificação de rede e índices de reincidência...
            </div>
          ) : !stratData ? (
            <Card className="p-12 text-center text-sm text-slate-400 bg-[#0F1422]/60 border-white/10">
              Nenhum dado estratificado disponível para os filtros selecionados.
            </Card>
          ) : (
            <>
              {/* 4 KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-5 bg-[#0F1422] border-white/10 rounded-2xl">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Total de Ocorrências
                  </div>
                  <div className="text-3xl font-extrabold font-mono text-slate-100">
                    {stratData.total_records.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500 mt-2">Base auditada de campo</div>
                </Card>

                <Card className="p-5 bg-[#0F1422] border-white/10 rounded-2xl">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center justify-between">
                    <span>Taxa de Reincidência</span>
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-3xl font-extrabold font-mono text-amber-400">
                    {stratData.reincidencia_rate}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    {stratData.reincidencia_count} eventos em pontos reincidentes
                  </div>
                </Card>

                <Card className="p-5 bg-[#0F1422] border-white/10 rounded-2xl">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-red-400 mb-1">
                    Maior Ofensor
                  </div>
                  <div className="text-lg font-bold text-slate-100 truncate mt-1" title={stratData.top_ofensor}>
                    {stratData.top_ofensor}
                  </div>
                  <div className="text-xs text-slate-500 mt-2">Ponto crítico da infraestrutura</div>
                </Card>

                <Card className="p-5 bg-[#0F1422] border-white/10 rounded-2xl">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400 mb-1">
                    Principal Causa-Raiz
                  </div>
                  <div className="text-lg font-bold text-slate-100 truncate mt-1" title={stratData.top_causa}>
                    {stratData.top_causa}
                  </div>
                  <div className="text-xs text-slate-500 mt-2">Motivo predominante de falha</div>
                </Card>
              </div>

              {/* Maiores Ofensores & Principais Causas */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-5 bg-[#0F1422] border-white/10 rounded-2xl space-y-4">
                  <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-red-500" /> Ranking de Maiores Ofensores
                  </h3>
                  <div className="space-y-2.5">
                    {stratData.maiores_ofensores.slice(0, 7).map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-300 truncate max-w-[260px]">{item.name}</span>
                          <span className="font-mono text-red-400">{item.count} ({item.pct})</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-600 to-amber-500 rounded-full"
                            style={{ width: item.pct }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5 bg-[#0F1422] border-white/10 rounded-2xl space-y-4">
                  <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-sky-400" /> Distribuição de Causas Raiz
                  </h3>
                  <div className="space-y-2.5">
                    {stratData.principais_causas.slice(0, 7).map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-300 truncate max-w-[260px]">{item.name}</span>
                          <span className="font-mono text-sky-400">{item.count} ({item.pct})</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-sky-600 to-indigo-500 rounded-full"
                            style={{ width: item.pct }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Rotas Críticas Reincidentes */}
              <Card className="p-5 bg-[#0F1422] border-white/10 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <RouteIcon className="w-4 h-4 text-red-500" />
                    Rotas Críticas com Reincidência ({stratData.reincidencias_routes.length})
                  </h3>
                  <span className="text-xs text-slate-500">Ordenado por volume de ocorrências</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-white/10">
                        <th className="py-2.5 px-3">Rota / Identificador</th>
                        <th className="py-2.5 px-3">Ocorrências</th>
                        <th className="py-2.5 px-3">Subcluster</th>
                        <th className="py-2.5 px-3">Último Endereço</th>
                        <th className="py-2.5 px-3">Última Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {stratData.reincidencias_routes.slice(0, 15).map((r, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3 font-semibold text-slate-200">{r.name}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-mono text-xs font-bold border border-red-500/30">
                              {r.count}x
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-xs">{r.subcluster}</td>
                          <td className="py-2.5 px-3 text-slate-400 text-xs max-w-xs truncate">{r.last_address}</td>
                          <td className="py-2.5 px-3 text-slate-500 text-xs font-mono">{r.last_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
