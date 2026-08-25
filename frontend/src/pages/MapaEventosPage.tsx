import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Activity, Zap, Flame, ShieldAlert } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { api } from '../api/client';
import { Card, PageHeader } from '../components/ui';

interface MapEvent {
  id: number;
  topic: string;
  designation: string;
  ticket: string;
  date: string;
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
  { key: 'REDE BAIXA', label: 'Rede Baixa', color: '#92400e' },
  { key: 'VANDALISMO', label: 'Vandalismo', color: '#ef4444' },
];

const RIO_CENTER: [number, number] = [-22.35, -42.9];

export default function MapaEventosPage() {
  const [data, setData] = useState<MapaData | null>(null);
  const [activeTypes, setActiveTypes] = useState<string[]>(EVENT_TYPES.map((t) => t.key));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    api
      .get<MapaData>('/api/mapa-eventos/data', { event_types: activeTypes.join(',') })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  }, [activeTypes]);

  const colorFor = useMemo(() => {
    const map = new Map(EVENT_TYPES.map((t) => [t.key, t.color]));
    return (type: string) => map.get(type) || '#94a3b8';
  }, []);

  function toggleType(key: string) {
    setActiveTypes((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]));
  }

  return (
    <div>
      <PageHeader
        title="Mapa de Eventos"
        subtitle="Ocorrências de rede geolocalizadas em tempo real"
      />

      <Card className="p-4 mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] mr-1">Evento:</span>
          {EVENT_TYPES.map((t) => {
            const active = activeTypes.includes(t.key);
            return (
              <button
                key={t.key}
                onClick={() => toggleType(t.key)}
                className="px-3.5 h-9 rounded-full text-xs font-bold uppercase tracking-wide transition-all border"
                style={
                  active
                    ? { background: t.color, borderColor: t.color, color: '#fff' }
                    : { background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: 'var(--color-text-muted)' }
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <span className="block text-xl font-extrabold text-[var(--color-primary)] mono">{data?.total ?? 0}</span>
            <span className="text-[11px] text-[var(--color-text-faint)]">Total de eventos</span>
          </div>
          <div>
            <span className="flex items-center gap-1.5 font-bold text-sm">
              <span className="w-2 h-2 rounded-full bg-[var(--color-success)] live-dot" /> Ao vivo
            </span>
            <span className="text-[11px] text-[var(--color-text-faint)]">{data?.last_updated || '—'}</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <Card className="p-4 order-2 lg:order-1 max-h-[560px] overflow-y-auto">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-faint)] mb-3">Últimas ocorrências</h3>
          <div className="space-y-2">
            {(data?.events ?? []).slice(0, 30).map((ev) => (
              <div key={ev.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(ev.event_type) }} />
                  <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: colorFor(ev.event_type) }}>{ev.event_type}</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] truncate">{ev.address}</p>
                <p className="text-[11px] text-[var(--color-text-faint)] mono mt-0.5">{ev.date}</p>
              </div>
            ))}
            {!isLoading && (data?.events ?? []).length === 0 && (
              <p className="text-xs text-[var(--color-text-faint)] text-center py-6">Nenhum evento no filtro atual.</p>
            )}
          </div>
        </Card>

        <Card className="order-1 lg:order-2 overflow-hidden" style={{ minHeight: 560 }}>
          <MapContainer center={RIO_CENTER} zoom={9} style={{ height: '100%', minHeight: 560, width: '100%' }}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap &copy; CARTO'
            />
            {(data?.events ?? []).map((ev) => (
              <CircleMarker
                key={ev.id}
                center={[ev.lat, ev.lng]}
                radius={7}
                pathOptions={{ color: colorFor(ev.event_type), fillColor: colorFor(ev.event_type), fillOpacity: 0.75, weight: 2 }}
              >
                <Popup>
                  <div className="text-xs">
                    <strong>{ev.event_type}</strong>
                    <br />{ev.address}
                    <br /><span className="text-[var(--color-text-faint)]">{ev.date} • {ev.cause}</span>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-5">
        {[
          { icon: Flame, label: 'Curto Circuito', key: 'CURTO CIRCUITO' },
          { icon: Zap, label: 'Rede Baixa', key: 'REDE BAIXA' },
          { icon: ShieldAlert, label: 'Vandalismo', key: 'VANDALISMO' },
        ].map(({ icon: Icon, label, key }) => {
          const count = (data?.events ?? []).filter((e) => e.event_type === key).length;
          return (
            <Card key={key} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${colorFor(key)}22`, color: colorFor(key) }}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-lg font-extrabold mono">{count}</div>
                <div className="text-[11px] text-[var(--color-text-faint)] uppercase tracking-wide">{label}</div>
              </div>
            </Card>
          );
        })}
      </div>
      {isLoading && <p className="text-xs text-[var(--color-text-faint)] mt-3 flex items-center gap-2"><Activity className="w-3.5 h-3.5 animate-pulse" /> Atualizando dados...</p>}
    </div>
  );
}
