import { useEffect, useState } from 'react';

interface FullScreenCinematicIntroProps {
  onComplete?: () => void;
  durationMs?: number;
}

export default function FullScreenCinematicIntro({
  onComplete,
  durationMs = 2800,
}: FullScreenCinematicIntroProps) {
  const [phase, setPhase] = useState<'laser' | 'core' | 'brand' | 'dissolve' | 'hidden'>('laser');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Progress tick 0 -> 100
    const start = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - start;
      const pct = Math.min(100, Math.round((elapsed / (durationMs * 0.75)) * 100));
      setProgress(pct);
      if (pct >= 100) clearInterval(interval);
    }, 25);

    // Timeline phases
    const tCore = setTimeout(() => setPhase('core'), 700);
    const tBrand = setTimeout(() => setPhase('brand'), 1400);
    const tDissolve = setTimeout(() => setPhase('dissolve'), 2300);
    const tEnd = setTimeout(() => {
      setPhase('hidden');
      if (onComplete) onComplete();
    }, durationMs);

    return () => {
      clearInterval(interval);
      clearTimeout(tCore);
      clearTimeout(tBrand);
      clearTimeout(tDissolve);
      clearTimeout(tEnd);
    };
  }, [durationMs, onComplete]);

  if (phase === 'hidden') return null;

  function handleSkip() {
    setPhase('hidden');
    if (onComplete) onComplete();
  }

  return (
    <div
      onClick={handleSkip}
      className={`fixed inset-0 z-[100] bg-[#05070D] flex flex-col items-center justify-between p-6 sm:p-10 select-none overflow-hidden cursor-pointer transition-all duration-800 ${
        phase === 'dissolve'
          ? 'opacity-0 scale-[1.04] pointer-events-none'
          : 'opacity-100 scale-100 pointer-events-auto'
      }`}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Background Matrix / Grid Accent */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Atmospheric Center Laser Flare */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-red-600/15 blur-[120px] pointer-events-none" />

      {/* Top Bar Telecom Metadata (Synchronized Studio style) */}
      <div className="relative z-10 w-full flex items-center justify-between text-[11px] font-mono tracking-widest text-slate-500 uppercase">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-slate-300 font-semibold tracking-wider">CLARO BRASIL</span>
          <span className="text-slate-600">/</span>
          <span className="hidden sm:inline text-slate-500">INFRAESTRUTURA DE REDE</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleSkip();
          }}
          className="text-[10px] text-slate-400 hover:text-white transition-colors border border-white/10 hover:border-white/20 bg-white/[0.04] px-2.5 py-1 rounded-md"
        >
          PULAR INTRO &rarr;
        </button>
      </div>

      {/* Center Cinematic Stage */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto">
        {/* Optical Alignment Rings */}
        <div className="relative w-48 h-48 sm:w-60 sm:h-60 flex items-center justify-center">
          {/* Outer Orbit Reticle */}
          <div
            className={`absolute inset-0 rounded-full border border-red-500/20 transition-all duration-1000 ${
              phase !== 'laser' ? 'scale-100 opacity-60' : 'scale-50 opacity-0'
            }`}
          />
          <div
            className={`absolute -inset-4 rounded-full border border-dashed border-white/10 animate-[spin_20s_linear_infinite] transition-opacity duration-1000 ${
              phase !== 'laser' ? 'opacity-40' : 'opacity-0'
            }`}
          />

          {/* Shockwave Wavefront Ring */}
          {(phase === 'core' || phase === 'brand') && (
            <div className="absolute inset-0 rounded-full border-2 border-red-500/50 animate-ping opacity-60 duration-1000 pointer-events-none" />
          )}

          {/* Claro Orb / Emblem Manifestation */}
          <div
            className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full transition-all duration-1000 flex items-center justify-center ${
              phase === 'laser'
                ? 'scale-0 opacity-0 rotate-45'
                : 'scale-100 opacity-100 rotate-0'
            }`}
            style={{
              transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Red Energy Radial Backlight */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 blur-md opacity-80" />

            {/* Claro Sphere Image */}
            <div className="relative z-10 w-full h-full rounded-full overflow-hidden shadow-[0_0_50px_rgba(238,44,36,0.5)] border border-red-400/40 p-2 bg-gradient-to-br from-[#EE2C24] via-[#D11A12] to-[#800A05]">
              <img
                src="/claro-icon.png"
                alt="Claro"
                className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
              />
            </div>
          </div>
        </div>

        {/* Kinetic Typography Brand Reveal */}
        <div
          className={`text-center mt-6 transition-all duration-1000 ${
            phase === 'brand' || phase === 'dissolve'
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-4'
          }`}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div className="text-[12px] sm:text-[13px] font-mono tracking-[0.4em] text-red-400 uppercase font-bold mb-1">
            CLARO BRASIL
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-[0.25em] sm:tracking-[0.35em] uppercase">
            REDE EXTERNA
          </h1>
          <div className="h-0.5 w-16 bg-gradient-to-r from-transparent via-red-500 to-transparent mx-auto mt-3" />
        </div>
      </div>

      {/* Bottom Telemetry & Progress Strip */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-2 text-center font-mono text-[10px] text-slate-500 tracking-wider">
        <div className="flex items-center justify-between w-full px-1">
          <span className="text-slate-400">INICIALIZANDO PORTAL</span>
          <span className="text-red-400 font-bold">{progress}%</span>
        </div>
        <div className="w-full h-[2px] bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 transition-all duration-75 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[9px] text-slate-400">
          Clique em qualquer lugar para avançar
        </span>
      </div>
    </div>
  );
}
