import { useEffect, useRef, useState } from 'react';

interface FullScreenCinematicIntroProps {
  onComplete?: () => void;
  durationMs?: number;
}

export default function FullScreenCinematicIntro({
  onComplete,
  durationMs = 4000,
}: FullScreenCinematicIntroProps) {
  const [phase, setPhase] = useState<'playing' | 'dissolve' | 'hidden'>('playing');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('CALIBRANDO MATRIZ DE TELECOMUNICAÇÕES...');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const completedRef = useRef(false);

  function finishIntro() {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase('dissolve');
    setTimeout(() => {
      setPhase('hidden');
      if (onComplete) onComplete();
    }, 700);
  }

  useEffect(() => {
    // Attempt autoplay immediately
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // If autoplay fails (e.g. policy), allow graceful fallback or user click
      });
    }

    const start = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - start;
      const currentProgress = Math.min(100, Math.round((elapsed / (durationMs * 0.92)) * 100));
      setProgress(currentProgress);

      if (currentProgress < 25) {
        setStatusText('SINCRONIZANDO MATRIZ DE INFRAESTRUTURA CLARO...');
      } else if (currentProgress < 55) {
        setStatusText('ESTABELECENDO ENLACE ÓPTICO DWDM & POPs...');
      } else if (currentProgress < 85) {
        setStatusText('CONECTANDO AO BACKBONE DE REDE EXTERNA...');
      } else {
        setStatusText('ACESSO OPERACIONAL HOMOLOGADO');
      }

      if (elapsed >= durationMs) {
        clearInterval(interval);
        finishIntro();
      }
    }, 30);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        finishIntro();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [durationMs]);

  if (phase === 'hidden') return null;

  return (
    <div
      onClick={finishIntro}
      role="button"
      tabIndex={0}
      aria-label="Pular animação de introdução"
      className={`fixed inset-0 z-[100] bg-[#05070D] flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden cursor-pointer transition-all duration-700 ${
        phase === 'dissolve'
          ? 'opacity-0 scale-[1.05] filter blur-sm pointer-events-none'
          : 'opacity-100 scale-100 filter-none pointer-events-auto'
      }`}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Background Video Element (Google Flow 1080p Orb Animation) */}
      <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#05070D]">
        <video
          ref={videoRef}
          src="/claro-intro.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={finishIntro}
          className="w-full h-full object-cover sm:object-contain object-center pointer-events-none"
        />

        {/* Cinematic Vignette Overlay */}
        <div className="absolute inset-0 bg-radial from-transparent via-[#05070D]/40 to-[#05070D] pointer-events-none" />
      </div>

      {/* Top Telemetry Header */}
      <div className="relative z-10 w-full flex items-center justify-between text-[11px] font-mono tracking-widest text-slate-400 uppercase pointer-events-none">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-white font-bold tracking-wider">CLARO BRASIL</span>
          <span className="text-slate-600">/</span>
          <span className="hidden sm:inline text-slate-400 font-medium">INFRAESTRUTURA DE REDE</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            finishIntro();
          }}
          className="pointer-events-auto text-[10px] font-semibold text-slate-300 hover:text-white transition-all border border-white/15 hover:border-red-500/50 bg-black/50 hover:bg-red-500/20 backdrop-blur-md px-3.5 py-1.5 rounded-full flex items-center gap-1.5 group shadow-lg"
        >
          <span>PULAR INTRO</span>
          <span className="text-red-400 group-hover:translate-x-0.5 transition-transform">&rsaquo;</span>
        </button>
      </div>

      {/* Lateral Technical Markers */}
      <div className="relative z-10 hidden sm:flex w-full items-end justify-between text-[10px] font-mono text-slate-500 tracking-wider pointer-events-none">
        <div className="space-y-1">
          <div className="text-slate-400">TELEMETRIA // NÓ D-OPERACIONAL</div>
          <div>OPTICAL: 1550nm DWDM ACTIVE</div>
          <div>STATUS: LINK ESTÁVEL</div>
        </div>
        <div className="text-right space-y-1">
          <div className="text-slate-400">COORDENADORIA OPERACIONAL</div>
          <div>REDE EXTERNA BRASIL</div>
          <div>TERMINAL ID: #CL-0914</div>
        </div>
      </div>

      {/* Bottom Progress Bar & Real-Time Status */}
      <div className="relative z-10 w-full max-w-xl mx-auto flex flex-col items-center pointer-events-none pb-2 sm:pb-4">
        <div className="w-full flex items-center justify-between text-[11px] font-mono tracking-wider mb-2">
          <span className="text-slate-300 font-medium truncate pr-4">{statusText}</span>
          <span className="text-red-400 font-bold shrink-0">{progress}%</span>
        </div>

        {/* Progress Track */}
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
          <div
            className="h-full bg-gradient-to-r from-red-600 via-red-500 to-rose-400 rounded-full transition-all duration-100 ease-out shadow-[0_0_12px_rgba(238,44,36,0.8)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-2 text-[9px] font-mono text-slate-500 tracking-widest uppercase">
          Clique em qualquer lugar ou pressione ESC para avançar
        </div>
      </div>
    </div>
  );
}
