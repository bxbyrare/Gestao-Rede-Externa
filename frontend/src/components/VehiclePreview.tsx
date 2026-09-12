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
  const isVan = typeUpper.includes('VAN') || modelUpper.includes('DUCATO') || modelUpper.includes('MASTER') || modelUpper.includes('SPRINTER') || modelUpper.includes('BOXER');
  const isCaminhao = typeUpper.includes('CAMINH') || modelUpper.includes('HR') || modelUpper.includes('DAILY') || modelUpper.includes('ACCELO');
  const isPickup = modelUpper.includes('STRADA') || modelUpper.includes('SAVEIRO') || modelUpper.includes('TORO') || modelUpper.includes('HILUX') || modelUpper.includes('MONTANA');
  const isFiorino = modelUpper.includes('FIORINO') || modelUpper.includes('FURGAO') || modelUpper.includes('KANGOO') || modelUpper.includes('PARTNER') || modelUpper.includes('DOBLO');
  const isKwid = modelUpper.includes('KWID') || modelUpper.includes('MOBI');
  const isCarro = !isMoto && !isVan && !isCaminhao && !isPickup && !isFiorino && !isKwid;

  return (
    <div
      className={`relative w-full h-36 rounded-2xl overflow-hidden bg-gradient-to-b from-[#18202f] via-[#101520] to-[#0a0d14] border border-white/10 flex flex-col justify-between p-3.5 group/preview transition-all duration-300 hover:border-white/20 shadow-inner ${className}`}
    >
      {/* Background Studio Light Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-500/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-sky-400/10 blur-xl pointer-events-none" />

      {/* Top Floating Feature Badges */}
      <div className="relative z-10 flex items-center justify-between gap-1.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/90 border border-white/10 backdrop-blur-md">
          {model || type}
        </span>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {hasRack && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[9px] font-bold text-amber-300 flex items-center gap-1 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Rack Escada
            </span>
          )}
          {hasGiroflex && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-[9px] font-bold text-amber-300 animate-pulse flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_#f59e0b]" />
              Giroflex
            </span>
          )}
          {hasBasket && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold text-emerald-300 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Cesto Aéreo
            </span>
          )}
          {hasInverter && (
            <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-[9px] font-bold text-cyan-300 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Inversor
            </span>
          )}
        </div>
      </div>

      {/* Center Studio Showcase with Refined Realistic Automotive Illustration */}
      <div className="relative z-10 flex-1 flex items-center justify-center my-1">
        {/* Soft ground pedestal shadow */}
        <div className="absolute bottom-1 w-48 h-3 rounded-full bg-black/70 blur-md group-hover/preview:w-52 transition-all duration-300" />

        <div className="relative transform transition-transform duration-300 ease-out group-hover/preview:-translate-y-1.5 scale-105 sm:scale-110">
          {isFiorino && <StudioFiorino hasRack={hasRack} hasGiroflex={hasGiroflex} />}
          {isPickup && <StudioPickup hasRack={hasRack} hasGiroflex={hasGiroflex} />}
          {isVan && <StudioVan hasGiroflex={hasGiroflex} />}
          {isCaminhao && <StudioCaminhao hasBasket={hasBasket} />}
          {isMoto && <StudioMoto />}
          {isKwid && <StudioKwid hasRack={hasRack} />}
          {isCarro && <StudioGol hasRack={hasRack} />}
        </div>
      </div>

      {/* Bottom subtle status line */}
      <div className="relative z-10 flex items-center justify-between text-[10px] text-[var(--color-text-faint)] border-t border-white/5 pt-1.5">
        <span className="font-medium text-white/50">{type || 'Frota Operacional'}</span>
        <span className="text-emerald-400 font-bold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          Ativo na Operação
        </span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// PREMIUM DETAILED AUTOMOTIVE VECTOR ARTWORK (METALLIC SHADERS & GLOW)
// -----------------------------------------------------------------------------

function StudioFiorino({ hasRack, hasGiroflex }: { hasRack?: boolean; hasGiroflex?: boolean }) {
  return (
    <div className="relative w-52 h-20 flex items-center justify-center">
      {hasGiroflex && (
        <div className="absolute top-1.5 left-24 w-3.5 h-2 rounded-t-sm bg-amber-400 shadow-[0_0_10px_#f59e0b] z-20" />
      )}
      {hasRack && (
        <div className="absolute top-2 left-14 right-8 h-1.5 border-t-2 border-slate-300 z-20 flex items-center justify-center">
          <div className="w-full h-1 bg-yellow-500 rounded-sm shadow-sm" />
        </div>
      )}
      <svg viewBox="0 0 220 80" className="w-full h-full drop-shadow-xl">
        <defs>
          <linearGradient id="fiorinoBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="40%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
          <linearGradient id="fiorinoCargo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>

        {/* Chassis Shadow */}
        <ellipse cx="110" cy="74" rx="95" ry="4" fill="rgba(0,0,0,0.6)" />

        {/* Rear Cargo Box */}
        <rect x="92" y="24" width="102" height="38" rx="4" fill="url(#fiorinoCargo)" stroke="#334155" strokeWidth="1.2" />
        {/* Cargo Side Trim Groove */}
        <line x1="94" y1="44" x2="192" y2="44" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="160" y1="26" x2="160" y2="60" stroke="#64748b" strokeWidth="1" strokeDasharray="2,2" />

        {/* Front Cabin */}
        <path
          d="M 22 62 L 40 62 A 13 13 0 0 1 66 62 L 94 62 L 94 34 L 72 34 L 46 48 L 22 52 Q 18 58 22 62 Z"
          fill="url(#fiorinoBody)"
          stroke="#334155"
          strokeWidth="1.2"
        />

        {/* Front Window with Blue Reflection */}
        <path d="M 90 37 L 70 37 L 48 48 L 90 48 Z" fill="url(#glassGrad)" stroke="#1e293b" strokeWidth="1" />

        {/* Front Headlight LED */}
        <polygon points="20,52 26,53 23,58" fill="#38bdf8" />
        <polygon points="20,52 24,53 22,56" fill="#ffffff" />

        {/* Rear Taillight */}
        <rect x="191" y="28" width="3.5" height="14" rx="1.5" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />

        {/* Wheels & Alloy Rims */}
        <g>
          {/* Front Wheel */}
          <circle cx="53" cy="62" r="12" fill="#0f172a" stroke="#334155" strokeWidth="3" />
          <circle cx="53" cy="62" r="7.5" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
          <circle cx="53" cy="62" r="3" fill="#0f172a" />
          <line x1="53" y1="55" x2="53" y2="69" stroke="#64748b" strokeWidth="1.5" />
          <line x1="46" y1="62" x2="60" y2="62" stroke="#64748b" strokeWidth="1.5" />

          {/* Rear Wheel */}
          <circle cx="165" cy="62" r="12" fill="#0f172a" stroke="#334155" strokeWidth="3" />
          <circle cx="165" cy="62" r="7.5" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
          <circle cx="165" cy="62" r="3" fill="#0f172a" />
          <line x1="165" y1="55" x2="165" y2="69" stroke="#64748b" strokeWidth="1.5" />
          <line x1="158" y1="62" x2="172" y2="62" stroke="#64748b" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}

function StudioGol({ hasRack }: { hasRack?: boolean }) {
  return (
    <div className="relative w-52 h-20 flex items-center justify-center">
      {hasRack && (
        <div className="absolute top-2.5 left-18 right-16 h-1 border-t-2 border-slate-300 z-20" />
      )}
      <svg viewBox="0 0 220 80" className="w-full h-full drop-shadow-xl">
        <defs>
          <linearGradient id="golBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f1f5f9" />
            <stop offset="35%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id="golGlass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#090d16" />
          </linearGradient>
        </defs>

        {/* Ground Shadow */}
        <ellipse cx="110" cy="74" rx="92" ry="4" fill="rgba(0,0,0,0.6)" />

        {/* Aerodynamic Hatchback Body */}
        <path
          d="M 24 62 L 42 62 A 13 13 0 0 1 68 62 L 148 62 A 13 13 0 0 1 174 62 L 194 62 Q 200 62 198 52 L 180 44 L 144 26 L 76 26 L 44 44 L 20 48 Q 16 58 24 62 Z"
          fill="url(#golBody)"
          stroke="#334155"
          strokeWidth="1.2"
        />

        {/* Windows (Front & Rear Tinted Glass) */}
        <path d="M 76 29 L 140 29 L 172 44 L 48 44 Z" fill="url(#golGlass)" stroke="#0f172a" strokeWidth="1" />
        <line x1="108" y1="29" x2="108" y2="44" stroke="#334155" strokeWidth="1.5" />
        <line x1="142" y1="29" x2="142" y2="44" stroke="#334155" strokeWidth="1.5" />

        {/* Sport Door Crease */}
        <path d="M 68 49 Q 110 47 165 49" fill="none" stroke="#e2e8f0" strokeWidth="1.2" />

        {/* Headlight Projector */}
        <polygon points="18,49 26,50 22,56" fill="#38bdf8" />
        <polygon points="18,49 23,50 20,54" fill="#ffffff" />

        {/* Taillight LED Signature */}
        <polygon points="196,48 200,49 198,55 194,54" fill="#ef4444" stroke="#991b1b" strokeWidth="0.5" />

        {/* Wheels with Sport Alloy Rims */}
        <g>
          {/* Front Wheel */}
          <circle cx="55" cy="62" r="12" fill="#0f172a" stroke="#334155" strokeWidth="3" />
          <circle cx="55" cy="62" r="7.5" fill="#f8fafc" stroke="#475569" strokeWidth="1.5" />
          <circle cx="55" cy="62" r="3" fill="#0284c7" />
          <line x1="55" y1="55" x2="55" y2="69" stroke="#64748b" strokeWidth="1.5" />
          <line x1="48" y1="62" x2="62" y2="62" stroke="#64748b" strokeWidth="1.5" />

          {/* Rear Wheel */}
          <circle cx="161" cy="62" r="12" fill="#0f172a" stroke="#334155" strokeWidth="3" />
          <circle cx="161" cy="62" r="7.5" fill="#f8fafc" stroke="#475569" strokeWidth="1.5" />
          <circle cx="161" cy="62" r="3" fill="#0284c7" />
          <line x1="161" y1="55" x2="161" y2="69" stroke="#64748b" strokeWidth="1.5" />
          <line x1="154" y1="62" x2="168" y2="62" stroke="#64748b" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}

function StudioPickup({ hasRack, hasGiroflex }: { hasRack?: boolean; hasGiroflex?: boolean }) {
  return (
    <div className="relative w-52 h-20 flex items-center justify-center">
      {hasGiroflex && (
        <div className="absolute top-2 left-22 w-3.5 h-2 rounded-t-sm bg-amber-400 shadow-[0_0_10px_#f59e0b] z-20" />
      )}
      {hasRack && (
        <div className="absolute top-2.5 left-18 right-12 h-1 border-t-2 border-slate-300 z-20 flex items-center justify-center">
          <div className="w-full h-1 bg-yellow-500 rounded-sm" />
        </div>
      )}
      <svg viewBox="0 0 220 80" className="w-full h-full drop-shadow-xl">
        <defs>
          <linearGradient id="pickupBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="40%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
        </defs>

        <ellipse cx="110" cy="74" rx="95" ry="4" fill="rgba(0,0,0,0.6)" />

        {/* Cargo Bed & Cab */}
        <path
          d="M 22 62 L 42 62 A 13 13 0 0 1 68 62 L 148 62 A 13 13 0 0 1 174 62 L 198 62 L 198 42 L 128 42 L 128 28 L 76 28 L 44 46 L 20 50 Q 16 58 22 62 Z"
          fill="url(#pickupBody)"
          stroke="#334155"
          strokeWidth="1.2"
        />

        {/* Bed Rail / Santo Antonio */}
        <path d="M 128 32 L 140 42" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />

        {/* Cabin Glass */}
        <path d="M 74 31 L 124 31 L 124 44 L 48 44 Z" fill="#0284c7" fillOpacity="0.8" stroke="#0f172a" strokeWidth="1" />

        {/* Headlight & Taillight */}
        <polygon points="18,50 25,51 22,56" fill="#38bdf8" />
        <rect x="195" y="44" width="3.5" height="12" rx="1" fill="#ef4444" />

        {/* Wheels */}
        <circle cx="55" cy="62" r="12.5" fill="#0f172a" stroke="#334155" strokeWidth="3" />
        <circle cx="55" cy="62" r="7.5" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
        <circle cx="161" cy="62" r="12.5" fill="#0f172a" stroke="#334155" strokeWidth="3" />
        <circle cx="161" cy="62" r="7.5" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function StudioVan({ hasGiroflex }: { hasGiroflex?: boolean }) {
  return (
    <div className="relative w-52 h-20 flex items-center justify-center">
      {hasGiroflex && (
        <div className="absolute top-1 left-20 w-3.5 h-2 rounded-t-sm bg-amber-400 shadow-[0_0_10px_#f59e0b] z-20" />
      )}
      <svg viewBox="0 0 220 80" className="w-full h-full drop-shadow-xl">
        <defs>
          <linearGradient id="vanBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
        </defs>

        <ellipse cx="110" cy="74" rx="98" ry="4" fill="rgba(0,0,0,0.6)" />

        {/* High Roof Commercial Van */}
        <path
          d="M 22 62 L 44 62 A 13 13 0 0 1 70 62 L 156 62 A 13 13 0 0 1 182 62 L 202 62 Q 206 62 206 50 L 206 20 Q 206 16 198 16 L 76 16 L 40 40 L 20 50 Q 18 58 22 62 Z"
          fill="url(#vanBody)"
          stroke="#334155"
          strokeWidth="1.2"
        />

        {/* Windows & Sliding Door Seams */}
        <path d="M 72 20 L 44 40 L 72 40 Z" fill="#0284c7" fillOpacity="0.8" stroke="#0f172a" strokeWidth="1" />
        <rect x="78" y="20" width="46" height="20" rx="1" fill="#0284c7" fillOpacity="0.8" stroke="#0f172a" strokeWidth="1" />
        <line x1="130" y1="18" x2="130" y2="60" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="180" y1="18" x2="180" y2="60" stroke="#94a3b8" strokeWidth="1.5" />

        {/* Lights */}
        <polygon points="18,50 25,51 22,56" fill="#38bdf8" />
        <rect x="203" y="22" width="3.5" height="16" rx="1.5" fill="#ef4444" />

        {/* Heavy Duty Wheels */}
        <circle cx="57" cy="62" r="13" fill="#0f172a" stroke="#334155" strokeWidth="3" />
        <circle cx="57" cy="62" r="8" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
        <circle cx="169" cy="62" r="13" fill="#0f172a" stroke="#334155" strokeWidth="3" />
        <circle cx="169" cy="62" r="8" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function StudioCaminhao({ hasBasket }: { hasBasket?: boolean }) {
  return (
    <div className="relative w-52 h-20 flex items-center justify-center">
      {hasBasket && (
        <div className="absolute top-0 left-26 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-black text-emerald-300 shadow-sm z-20">
          CESTO HIDRÁULICO
        </div>
      )}
      <svg viewBox="0 0 220 80" className="w-full h-full drop-shadow-xl">
        <defs>
          <linearGradient id="truckCab" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>

        <ellipse cx="110" cy="74" rx="98" ry="4" fill="rgba(0,0,0,0.6)" />

        {/* Heavy Cab */}
        <path d="M 18 62 L 38 62 A 13 13 0 0 1 64 62 L 80 62 L 80 24 L 52 24 L 28 44 L 18 50 Z" fill="url(#truckCab)" stroke="#334155" strokeWidth="1.2" />
        <path d="M 50 27 L 31 44 L 75 44 L 75 27 Z" fill="#0284c7" fillOpacity="0.8" stroke="#0f172a" strokeWidth="1" />

        {/* Utility Cargo Bed / Aerial Platform */}
        <rect x="84" y="28" width="124" height="34" rx="3" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
        <line x1="84" y1="42" x2="208" y2="42" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="6,4" />

        {/* Double Rear Wheels */}
        <circle cx="51" cy="62" r="13" fill="#0f172a" stroke="#334155" strokeWidth="3" />
        <circle cx="51" cy="62" r="8" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
        <circle cx="150" cy="62" r="13" fill="#0f172a" stroke="#334155" strokeWidth="3" />
        <circle cx="150" cy="62" r="8" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
        <circle cx="180" cy="62" r="13" fill="#0f172a" stroke="#334155" strokeWidth="3" />
        <circle cx="180" cy="62" r="8" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function StudioKwid({ hasRack }: { hasRack?: boolean }) {
  return (
    <div className="relative w-52 h-20 flex items-center justify-center">
      {hasRack && (
        <div className="absolute top-2 left-18 right-16 h-1 border-t-2 border-slate-300 z-20" />
      )}
      <svg viewBox="0 0 220 80" className="w-full h-full drop-shadow-xl">
        <ellipse cx="110" cy="74" rx="90" ry="4" fill="rgba(0,0,0,0.6)" />

        {/* Compact SUV / High Stance Body */}
        <path
          d="M 26 62 L 44 62 A 13 13 0 0 1 70 62 L 144 62 A 13 13 0 0 1 170 62 L 192 62 Q 198 62 196 50 L 178 38 L 138 24 L 76 24 L 46 40 L 22 46 Q 18 56 26 62 Z"
          fill="#f8fafc"
          stroke="#334155"
          strokeWidth="1.2"
        />

        {/* Windows */}
        <path d="M 74 27 L 134 27 L 168 39 L 50 39 Z" fill="#0284c7" fillOpacity="0.8" stroke="#0f172a" strokeWidth="1" />
        <line x1="108" y1="27" x2="108" y2="39" stroke="#334155" strokeWidth="1.5" />

        {/* Wheels */}
        <circle cx="57" cy="62" r="12" fill="#0f172a" stroke="#334155" strokeWidth="3" />
        <circle cx="57" cy="62" r="7" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
        <circle cx="157" cy="62" r="12" fill="#0f172a" stroke="#334155" strokeWidth="3" />
        <circle cx="157" cy="62" r="7" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function StudioMoto() {
  return (
    <div className="relative w-44 h-20 flex items-center justify-center">
      <svg viewBox="0 0 180 80" className="w-full h-full drop-shadow-xl">
        <ellipse cx="90" cy="74" rx="75" ry="4" fill="rgba(0,0,0,0.6)" />

        {/* Motorcycle Wheels with Spoke Rims */}
        <circle cx="42" cy="60" r="14" fill="none" stroke="#0f172a" strokeWidth="4" />
        <circle cx="42" cy="60" r="4" fill="#38bdf8" />
        <circle cx="138" cy="60" r="14" fill="none" stroke="#0f172a" strokeWidth="4" />
        <circle cx="138" cy="60" r="4" fill="#38bdf8" />

        {/* Frame & Engine */}
        <path d="M 42 60 L 76 42 L 110 42 L 138 60 L 105 60 L 82 48 L 60 60 Z" fill="#334155" stroke="#64748b" strokeWidth="2" />
        {/* Handlebars */}
        <path d="M 76 42 L 85 26 L 72 26" fill="none" stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" />
        {/* Rear Trunk Box */}
        <rect x="112" y="30" width="22" height="16" rx="3" fill="#0284c7" stroke="#0f172a" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
