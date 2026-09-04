interface VehiclePreviewProps {
  type: string;
  model: string;
  hasRack?: boolean;
  hasBasket?: boolean;
  hasGiroflex?: boolean;
  hasInverter?: boolean;
  plate?: string;
  className?: string;
}

export default function VehiclePreview({
  type = 'Utilitário',
  model = '',
  hasRack = false,
  hasBasket = false,
  hasGiroflex = false,
  hasInverter = false,
  className = '',
}: VehiclePreviewProps) {
  const modelUpper = (model || '').toUpperCase();
  const typeUpper = (type || '').toUpperCase();

  const isMoto = typeUpper.includes('MOTO') || modelUpper.includes('MOTO') || modelUpper.includes('CG');
  const isVan = typeUpper.includes('VAN') || modelUpper.includes('DUCATO') || modelUpper.includes('MASTER') || modelUpper.includes('SPRINTER');
  const isCaminhao = typeUpper.includes('CAMINH') || modelUpper.includes('HR') || modelUpper.includes('DAILY');
  const isFiorino = modelUpper.includes('FIORINO') || modelUpper.includes('FURGAO') || modelUpper.includes('KANGOO') || modelUpper.includes('PARTNER') || modelUpper.includes('STRADA') || modelUpper.includes('SAVEIRO');
  const isCarro = !isMoto && !isVan && !isCaminhao && !isFiorino;

  return (
    <div
      className={`relative w-full h-32 rounded-2xl overflow-hidden bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/5 flex flex-col justify-between p-3.5 group/preview transition-all duration-300 hover:border-white/15 ${className}`}
    >
      {/* Top subtle tags */}
      <div className="flex items-center justify-between text-[11px] text-[var(--color-text-faint)]">
        <span className="font-semibold text-white/80">{model || type}</span>
        <div className="flex items-center gap-1.5">
          {hasRack && (
            <span className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[10px] font-medium text-white/70">
              Rack Escada
            </span>
          )}
          {hasGiroflex && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] font-medium text-amber-300">
              Giroflex
            </span>
          )}
          {hasBasket && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-300">
              Cesto
            </span>
          )}
          {hasInverter && (
            <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-medium text-cyan-300">
              Inversor
            </span>
          )}
        </div>
      </div>

      {/* Center Studio Showcase */}
      <div className="relative flex-1 flex items-center justify-center my-1">
        {/* Soft studio floor shadow */}
        <div className="absolute bottom-0 w-36 h-2 rounded-full bg-black/50 blur-sm group-hover/preview:w-40 transition-all duration-300" />

        <div className="relative transform transition-transform duration-300 ease-out group-hover/preview:-translate-y-1">
          {isFiorino && <CleanFiorino hasRack={hasRack} hasGiroflex={hasGiroflex} />}
          {isVan && <CleanVan hasGiroflex={hasGiroflex} />}
          {isCaminhao && <CleanCaminhao hasBasket={hasBasket} />}
          {isMoto && <CleanMoto />}
          {isCarro && <CleanCarro hasRack={hasRack} />}
        </div>
      </div>

      {/* Bottom subtle status line */}
      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-faint)] border-t border-white/5 pt-1.5">
        <span>Veículo Operacional</span>
        <span className="text-emerald-400 font-medium flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Ativo na Frota
        </span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// CLEAN & REALISTIC MODERN AUTOMOTIVE SILHOUETTES
// -----------------------------------------------------------------------------

function CleanFiorino({ hasRack, hasGiroflex }: { hasRack?: boolean; hasGiroflex?: boolean }) {
  return (
    <div className="relative w-44 h-16 flex items-center justify-center">
      {hasGiroflex && (
        <div className="absolute top-0 left-20 w-3 h-1.5 rounded-t-sm bg-amber-400/90 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
      )}
      {hasRack && (
        <div className="absolute top-1 left-16 right-10 h-1 border-t-2 border-slate-400/80 flex items-center justify-center">
          <div className="w-full h-0.5 bg-yellow-500/90 rounded-full" />
        </div>
      )}
      <svg viewBox="0 0 200 70" className="w-full h-full drop-shadow-md">
        {/* Shadow */}
        <ellipse cx="100" cy="64" rx="85" ry="4" fill="rgba(0,0,0,0.4)" />

        {/* Wheels */}
        <g>
          <circle cx="50" cy="56" r="11" fill="#1e293b" stroke="#475569" strokeWidth="2.5" />
          <circle cx="50" cy="56" r="4.5" fill="#94a3b8" />
          <circle cx="152" cy="56" r="11" fill="#1e293b" stroke="#475569" strokeWidth="2.5" />
          <circle cx="152" cy="56" r="4.5" fill="#94a3b8" />
        </g>

        {/* Body Cargo Box + Cabin */}
        <path
          d="M 24 54 L 38 54 A 12 12 0 0 1 62 54 L 140 54 A 12 12 0 0 1 164 54 L 180 54 Q 186 54 186 46 L 186 24 Q 186 20 178 20 L 105 20 L 105 32 L 68 32 L 40 44 L 22 48 Q 20 54 24 54 Z"
          fill="#334155"
          stroke="#64748b"
          strokeWidth="1.2"
        />

        {/* Front Cabin Window */}
        <path d="M 100 34 L 70 34 L 48 44 L 100 44 Z" fill="#0f172a" stroke="#475569" strokeWidth="0.8" />

        {/* Cargo Separation Line */}
        <line x1="105" y1="20" x2="105" y2="54" stroke="#475569" strokeWidth="1" />

        {/* Headlight & Taillight subtle accents */}
        <path d="M 22 48 L 26 50 L 22 52 Z" fill="#e2e8f0" />
        <rect x="183" y="24" width="3" height="8" rx="1" fill="#ef4444" />
      </svg>
    </div>
  );
}

function CleanVan({ hasGiroflex }: { hasGiroflex?: boolean }) {
  return (
    <div className="relative w-46 h-16 flex items-center justify-center">
      {hasGiroflex && (
        <div className="absolute top-0 left-16 w-3 h-1.5 rounded-t-sm bg-amber-400/90 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
      )}
      <svg viewBox="0 0 200 70" className="w-full h-full drop-shadow-md">
        <ellipse cx="100" cy="64" rx="88" ry="4" fill="rgba(0,0,0,0.4)" />

        <circle cx="52" cy="56" r="11" fill="#1e293b" stroke="#475569" strokeWidth="2.5" />
        <circle cx="52" cy="56" r="4.5" fill="#94a3b8" />
        <circle cx="156" cy="56" r="11" fill="#1e293b" stroke="#475569" strokeWidth="2.5" />
        <circle cx="156" cy="56" r="4.5" fill="#94a3b8" />

        <path
          d="M 22 54 L 40 54 A 12 12 0 0 1 64 54 L 144 54 A 12 12 0 0 1 168 54 L 186 54 Q 190 54 190 44 L 190 18 Q 190 15 182 15 L 68 15 L 36 36 L 20 46 Q 18 54 22 54 Z"
          fill="#334155"
          stroke="#64748b"
          strokeWidth="1.2"
        />

        {/* Windows */}
        <path d="M 64 19 L 40 36 L 64 36 Z" fill="#0f172a" stroke="#475569" strokeWidth="0.8" />
        <rect x="70" y="19" width="40" height="17" rx="1" fill="#0f172a" stroke="#475569" strokeWidth="0.8" />

        {/* Taillight */}
        <rect x="187" y="20" width="3" height="12" rx="1" fill="#ef4444" />
      </svg>
    </div>
  );
}

function CleanCarro({ hasRack }: { hasRack?: boolean }) {
  return (
    <div className="relative w-44 h-16 flex items-center justify-center">
      {hasRack && (
        <div className="absolute top-1 left-16 right-16 h-1 border-t-2 border-slate-400/80 flex items-center justify-center" />
      )}
      <svg viewBox="0 0 200 70" className="w-full h-full drop-shadow-md">
        <ellipse cx="100" cy="64" rx="85" ry="4" fill="rgba(0,0,0,0.4)" />

        <circle cx="50" cy="56" r="10.5" fill="#1e293b" stroke="#475569" strokeWidth="2.5" />
        <circle cx="50" cy="56" r="4" fill="#94a3b8" />
        <circle cx="150" cy="56" r="10.5" fill="#1e293b" stroke="#475569" strokeWidth="2.5" />
        <circle cx="150" cy="56" r="4" fill="#94a3b8" />

        <path
          d="M 22 54 L 38 54 A 12 12 0 0 1 62 54 L 138 54 A 12 12 0 0 1 162 54 L 180 54 Q 186 54 182 45 L 160 38 L 134 24 L 68 24 L 40 40 L 20 45 Q 16 54 22 54 Z"
          fill="#334155"
          stroke="#64748b"
          strokeWidth="1.2"
        />

        {/* Windows */}
        <path d="M 68 27 L 130 27 L 150 38 L 46 38 Z" fill="#0f172a" stroke="#475569" strokeWidth="0.8" />
        <line x1="98" y1="27" x2="98" y2="38" stroke="#475569" strokeWidth="1" />

        {/* Lights */}
        <path d="M 20 46 L 25 48 L 20 50 Z" fill="#e2e8f0" />
        <rect x="180" y="44" width="3" height="6" rx="1" fill="#ef4444" />
      </svg>
    </div>
  );
}

function CleanCaminhao({ hasBasket }: { hasBasket?: boolean }) {
  return (
    <div className="relative w-46 h-16 flex items-center justify-center">
      {hasBasket && (
        <div className="absolute top-0 left-24 px-1.5 py-0.5 rounded-sm bg-emerald-500/20 border border-emerald-500/40 text-[8px] font-bold text-emerald-300">
          CESTO
        </div>
      )}
      <svg viewBox="0 0 200 70" className="w-full h-full drop-shadow-md">
        <ellipse cx="100" cy="64" rx="88" ry="4" fill="rgba(0,0,0,0.4)" />

        <circle cx="48" cy="56" r="11" fill="#1e293b" stroke="#475569" strokeWidth="2.5" />
        <circle cx="48" cy="56" r="4.5" fill="#94a3b8" />
        <circle cx="140" cy="56" r="11" fill="#1e293b" stroke="#475569" strokeWidth="2.5" />
        <circle cx="140" cy="56" r="4.5" fill="#94a3b8" />
        <circle cx="168" cy="56" r="11" fill="#1e293b" stroke="#475569" strokeWidth="2.5" />
        <circle cx="168" cy="56" r="4.5" fill="#94a3b8" />

        {/* Cabin */}
        <path d="M 18 54 L 36 54 A 12 12 0 0 1 60 54 L 75 54 L 75 22 L 48 22 L 28 40 L 18 46 Z" fill="#334155" stroke="#64748b" strokeWidth="1.2" />
        <path d="M 46 25 L 29 40 L 68 40 L 68 25 Z" fill="#0f172a" stroke="#475569" strokeWidth="0.8" />

        {/* Cargo Bed */}
        <rect x="78" y="16" width="112" height="38" rx="2" fill="#1e293b" stroke="#475569" strokeWidth="1.2" />
      </svg>
    </div>
  );
}

function CleanMoto() {
  return (
    <div className="relative w-36 h-16 flex items-center justify-center">
      <svg viewBox="0 0 160 70" className="w-full h-full drop-shadow-md">
        <ellipse cx="80" cy="64" rx="70" ry="4" fill="rgba(0,0,0,0.4)" />

        <circle cx="35" cy="54" r="12" fill="none" stroke="#475569" strokeWidth="3" />
        <circle cx="35" cy="54" r="3" fill="#94a3b8" />
        <circle cx="125" cy="54" r="12" fill="none" stroke="#475569" strokeWidth="3" />
        <circle cx="125" cy="54" r="3" fill="#94a3b8" />

        <path d="M 35 54 L 65 38 L 95 38 L 125 54 L 95 54 L 75 44 L 52 54 Z" fill="#334155" stroke="#64748b" strokeWidth="1.5" />
        <path d="M 65 38 L 72 24 L 60 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="98" y="28" width="18" height="14" rx="2" fill="#1e293b" stroke="#475569" strokeWidth="1" />
      </svg>
    </div>
  );
}