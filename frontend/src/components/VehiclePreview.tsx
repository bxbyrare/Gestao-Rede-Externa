import React from 'react';
import { Truck, Car, Bike, Shield, Zap, Sparkles, Navigation, Flame } from 'lucide-react';

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
  plate = '',
  className = '',
}: VehiclePreviewProps) {
  const modelUpper = (model || '').toUpperCase();
  const typeUpper = (type || '').toUpperCase();

  // Detect vehicle body profile
  const isMoto = typeUpper.includes('MOTO') || modelUpper.includes('MOTO') || modelUpper.includes('CG');
  const isVan = typeUpper.includes('VAN') || modelUpper.includes('DUCATO') || modelUpper.includes('MASTER') || modelUpper.includes('SPRINTER');
  const isCaminhao = typeUpper.includes('CAMINH') || modelUpper.includes('HR') || modelUpper.includes('DAILY');
  const isFiorino = modelUpper.includes('FIORINO') || modelUpper.includes('FURGAO') || modelUpper.includes('KANGOO') || modelUpper.includes('PARTNER');
  const isCarro = !isMoto && !isVan && !isCaminhao && !isFiorino;

  // Theme colors
  const accentColor = isFiorino
    ? '#06b6d4' // Cyan
    : isVan || isCaminhao
    ? '#f59e0b' // Amber
    : isMoto
    ? '#a855f7' // Purple
    : '#10b981'; // Emerald

  return (
    <div
      className={`relative w-full h-36 rounded-2xl overflow-hidden bg-gradient-to-b from-black/60 via-black/40 to-black/80 border border-white/10 p-3 flex flex-col justify-between group/preview select-none ${className}`}
    >
      {/* Background Cyber Grid & Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(6,182,212,0.15),transparent_70%)] pointer-events-none" />
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }}
      />

      {/* Top Badges & Equipment Indicators */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: accentColor }} />
          {model || type}
        </span>

        {/* Equipment Badges (Giroflex, Rack, Cesto) */}
        <div className="flex items-center gap-1">
          {hasGiroflex && (
            <span
              className="w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400"
              title="Equipado com Giroflex"
            >
              <Flame className="w-3 h-3 animate-bounce" />
            </span>
          )}
          {hasInverter && (
            <span
              className="w-6 h-6 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400"
              title="Equipado com Inversor 220V"
            >
              <Zap className="w-3 h-3" />
            </span>
          )}
          {hasRack && (
            <span
              className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-[9px] font-semibold text-white/80"
              title="Possui Rack de Escada"
            >
              RACK
            </span>
          )}
          {hasBasket && (
            <span
              className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-semibold text-emerald-400"
              title="Possui Cesto Aéreo"
            >
              CESTO
            </span>
          )}
        </div>
      </div>

      {/* Animated Vehicle Silhouette & Road Canvas */}
      <div className="relative z-10 w-full flex-1 flex items-center justify-center">
        {/* Dynamic Road Perspective Light */}
        <div className="absolute bottom-1 w-3/4 h-1 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent blur-[1px] group-hover/preview:via-[var(--color-primary)]/40 transition-colors" />

        {/* Vector Vehicle Art */}
        <div className="relative transform transition-all duration-500 ease-out group-hover/preview:scale-105 group-hover/preview:-translate-y-1">
          {isFiorino && <FiorinoVector hasRack={hasRack} hasGiroflex={hasGiroflex} accentColor={accentColor} />}
          {isVan && <VanVector hasRack={hasRack} hasGiroflex={hasGiroflex} accentColor={accentColor} />}
          {isCaminhao && <CaminhaoVector hasBasket={hasBasket} accentColor={accentColor} />}
          {isMoto && <MotoVector accentColor={accentColor} />}
          {isCarro && <CarroVector hasRack={hasRack} accentColor={accentColor} />}
        </div>
      </div>

      {/* Bottom Status / Plate bar */}
      <div className="relative z-10 flex items-center justify-between text-[10px] text-white/60 pt-1 border-t border-white/5">
        <span className="flex items-center gap-1">
          <Navigation className="w-2.5 h-2.5 text-white/40" />
          <span className="font-mono text-white/90 font-bold">{plate || 'FROTA EXTERNA'}</span>
        </span>
        <span className="text-[9px] font-medium text-emerald-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          Pronto p/ Operação
        </span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// VECTOR SILHOUETTE COMPONENTS (High Tech Clean Glass Vectors)
// -----------------------------------------------------------------------------

function FiorinoVector({ hasRack, hasGiroflex, accentColor }: { hasRack?: boolean; hasGiroflex?: boolean; accentColor: string }) {
  return (
    <div className="relative w-44 h-20 flex items-center justify-center">
      {hasGiroflex && (
        <div className="absolute top-1 left-24 -translate-x-1/2 w-3 h-2 rounded-t-sm bg-amber-400 animate-pulse shadow-[0_0_8px_#f59e0b]" />
      )}
      {hasRack && (
        <div className="absolute top-2 left-16 right-10 h-1.5 border-t-2 border-dashed border-white/50 flex items-center justify-center">
          <div className="w-full h-0.5 bg-yellow-400/80 rounded" title="Escada acoplada" />
        </div>
      )}
      <svg viewBox="0 0 220 90" className="w-full h-full drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)]">
        {/* Wheels */}
        <circle cx="55" cy="72" r="14" fill="#0f172a" stroke="#334155" strokeWidth="4" />
        <circle cx="55" cy="72" r="6" fill="#64748b" />
        <circle cx="165" cy="72" r="14" fill="#0f172a" stroke="#334155" strokeWidth="4" />
        <circle cx="165" cy="72" r="6" fill="#64748b" />

        {/* Vehicle Body (Fiorino Box + Cabin) */}
        <path
          d="M 30 70 L 40 70 A 15 15 0 0 1 70 70 L 150 70 A 15 15 0 0 1 180 70 L 200 70 Q 205 70 205 60 L 205 35 Q 205 30 195 25 L 120 25 L 120 40 L 80 40 L 50 55 L 30 60 Z"
          fill="url(#fiorinoGradient)"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1.5"
        />

        {/* Windows */}
        <path d="M 115 42 L 82 42 L 58 54 L 115 54 Z" fill="#0284c7" fillOpacity="0.4" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />

        {/* Headlight beam */}
        <polygon points="30,62 10,65 10,58" fill="#38bdf8" fillOpacity="0.6" />
        <line x1="120" y1="25" x2="120" y2="68" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />

        {/* Gradients */}
        <defs>
          <linearGradient id="fiorinoGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="60%" stopColor="#334155" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function VanVector({ hasRack, hasGiroflex, accentColor }: { hasRack?: boolean; hasGiroflex?: boolean; accentColor: string }) {
  return (
    <div className="relative w-48 h-20 flex items-center justify-center">
      {hasGiroflex && (
        <div className="absolute top-0 left-20 w-3.5 h-2 rounded-t-sm bg-amber-400 animate-pulse shadow-[0_0_10px_#f59e0b]" />
      )}
      <svg viewBox="0 0 230 90" className="w-full h-full drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)]">
        <circle cx="58" cy="72" r="14" fill="#0f172a" stroke="#334155" strokeWidth="4" />
        <circle cx="58" cy="72" r="6" fill="#64748b" />
        <circle cx="175" cy="72" r="14" fill="#0f172a" stroke="#334155" strokeWidth="4" />
        <circle cx="175" cy="72" r="6" fill="#64748b" />

        <path
          d="M 25 70 L 43 70 A 15 15 0 0 1 73 70 L 160 70 A 15 15 0 0 1 190 70 L 210 70 Q 215 70 215 55 L 215 22 Q 215 18 205 18 L 75 18 L 40 45 L 25 58 Z"
          fill="#1e293b"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1.5"
        />
        <path d="M 72 24 L 46 45 L 72 45 Z" fill="#0284c7" fillOpacity="0.4" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        <path d="M 78 24 L 125 24 L 125 45 L 78 45 Z" fill="#0284c7" fillOpacity="0.3" />
      </svg>
    </div>
  );
}

function CarroVector({ hasRack, accentColor }: { hasRack?: boolean; accentColor: string }) {
  return (
    <div className="relative w-44 h-20 flex items-center justify-center">
      {hasRack && (
        <div className="absolute top-2 left-14 right-14 h-1 border-t-2 border-white/40 flex items-center justify-center" />
      )}
      <svg viewBox="0 0 220 90" className="w-full h-full drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)]">
        <circle cx="55" cy="70" r="13" fill="#0f172a" stroke="#334155" strokeWidth="4" />
        <circle cx="55" cy="70" r="5" fill="#64748b" />
        <circle cx="165" cy="70" r="13" fill="#0f172a" stroke="#334155" strokeWidth="4" />
        <circle cx="165" cy="70" r="5" fill="#64748b" />

        <path
          d="M 25 68 L 41 68 A 14 14 0 0 1 69 68 L 151 68 A 14 14 0 0 1 179 68 L 200 68 Q 205 68 200 55 L 175 45 L 145 28 L 75 28 L 45 48 L 20 54 Q 15 68 25 68 Z"
          fill="#1e293b"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1.5"
        />
        <path d="M 78 32 L 140 32 L 165 46 L 52 46 Z" fill="#10b981" fillOpacity="0.3" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      </svg>
    </div>
  );
}

function CaminhaoVector({ hasBasket, accentColor }: { hasBasket?: boolean; accentColor: string }) {
  return (
    <div className="relative w-48 h-20 flex items-center justify-center">
      {hasBasket && (
        <div className="absolute top-1 left-28 w-8 h-4 rounded-sm border border-emerald-400 bg-emerald-500/20 flex items-center justify-center text-[8px] font-bold text-emerald-300">
          CESTO
        </div>
      )}
      <svg viewBox="0 0 230 90" className="w-full h-full drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)]">
        <circle cx="52" cy="72" r="13" fill="#0f172a" stroke="#334155" strokeWidth="4" />
        <circle cx="155" cy="72" r="13" fill="#0f172a" stroke="#334155" strokeWidth="4" />
        <circle cx="185" cy="72" r="13" fill="#0f172a" stroke="#334155" strokeWidth="4" />

        {/* Cabine */}
        <path d="M 20 70 L 38 70 A 14 14 0 0 1 66 70 L 85 70 L 85 25 L 55 25 L 30 48 L 20 58 Z" fill="#1e293b" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        {/* Baú / Carroceria */}
        <rect x="90" y="15" width="125" height="55" rx="3" fill="#334155" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function MotoVector({ accentColor }: { accentColor: string }) {
  return (
    <div className="relative w-36 h-20 flex items-center justify-center">
      <svg viewBox="0 0 180 90" className="w-full h-full drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)]">
        <circle cx="40" cy="68" r="16" fill="none" stroke="#64748b" strokeWidth="4" />
        <circle cx="40" cy="68" r="4" fill="#a855f7" />
        <circle cx="140" cy="68" r="16" fill="none" stroke="#64748b" strokeWidth="4" />
        <circle cx="140" cy="68" r="4" fill="#a855f7" />

        <path d="M 40 68 L 75 45 L 110 45 L 140 68 L 105 68 L 85 55 L 60 68 Z" fill="#1e293b" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
        <path d="M 75 45 L 85 28 L 70 28" fill="none" stroke="#a855f7" strokeWidth="3" strokeLinecap="round" />
        <rect x="110" y="32" width="22" height="18" rx="2" fill="#334155" stroke="#fff" strokeWidth="1" />
      </svg>
    </div>
  );
}