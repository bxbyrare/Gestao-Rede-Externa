import { useEffect, useState } from 'react';

interface ClaroLogoAnimationProps {
  onAnimationComplete?: () => void;
  className?: string;
  size?: number;
}

export default function ClaroLogoAnimation({
  onAnimationComplete,
  className = '',
  size = 110,
}: ClaroLogoAnimationProps) {
  // Phase 0: Ring drawing & photon convergence (0s - 1.2s)
  // Phase 1: Core sphere manifestation & burst (1.2s - 2.2s)
  // Phase 2: Shimmer flare & live status lock (2.2s - 3.2s)
  // Phase 3: Complete & fully settled
  const [phase, setPhase] = useState<number>(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1000);
    const t2 = setTimeout(() => setPhase(2), 2000);
    const t3 = setTimeout(() => {
      setPhase(3);
      if (onAnimationComplete) onAnimationComplete();
    }, 3000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onAnimationComplete]);

  const radius = 48;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Dynamic Ambient Energy Halo */}
      <div
        className={`absolute inset-0 rounded-full bg-red-600/30 blur-2xl transition-all duration-1000 pointer-events-none ${
          phase >= 1 ? 'scale-125 opacity-70' : 'scale-75 opacity-20'
        }`}
      />

      {/* Expanding Wavefront Ring at Manifestation (Phase 1) */}
      {phase >= 1 && (
        <div className="absolute inset-0 rounded-full border border-red-500/40 animate-ping pointer-events-none opacity-40 duration-1000" />
      )}

      {/* SVG Light Paths & Forming Ring */}
      <svg
        viewBox="0 0 120 120"
        className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none"
      >
        <defs>
          <linearGradient id="claroRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ee2c24" />
            <stop offset="50%" stopColor="#ff5e57" />
            <stop offset="100%" stopColor="#ffb142" />
          </linearGradient>
          <linearGradient id="claroGlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ee2c24" stopOpacity="0" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.8" />
          </linearGradient>
          <filter id="laserGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Track circle (subtle background orbit) */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth="2"
        />

        {/* Counter-rotating particle dashes */}
        <circle
          cx="60"
          cy="60"
          r={radius + 6}
          fill="none"
          stroke="rgba(238, 44, 36, 0.25)"
          strokeWidth="1.5"
          strokeDasharray="4 16"
          className="animate-[spin_6s_linear_infinite]"
        />

        {/* Primary Forming Energy Arc with stroke-dashoffset animation */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="url(#claroRingGrad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          filter="url(#laserGlow)"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: phase === 0 ? circumference * 0.4 : 0,
            transition: 'stroke-dashoffset 1.6s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />

        {/* Orbiting Photon Spark */}
        {phase < 2 && (
          <circle
            cx="60"
            cy="12"
            r="3"
            fill="#ffffff"
            className="animate-[spin_1.5s_cubic-bezier(0.4,0,0.2,1)_infinite]"
            style={{ transformOrigin: '60px 60px' }}
          />
        )}
      </svg>

      {/* Central Solid Logo Sphere Materializing */}
      <div
        className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-700 ease-out ${
          phase === 0
            ? 'scale-0 opacity-0 rotate-[-45deg] blur-sm'
            : phase === 1
            ? 'scale-110 opacity-100 rotate-0 blur-none'
            : 'scale-100 opacity-100 rotate-0 blur-none'
        }`}
      >
        <img
          src="/claro-icon.png"
          alt="Claro"
          className="w-full h-full rounded-full object-cover shadow-[0_0_25px_rgba(238,44,36,0.5)] border border-white/20"
        />

        {/* Lens Flare Shimmer Sweep (Phase 2) */}
        {phase >= 2 && (
          <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full animate-[shimmer_1.8s_ease-out_1] pointer-events-none" />
          </div>
        )}

        {/* Green Online Signal Pin */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0B0E17] transition-all duration-500 shadow-[0_0_8px_#10b981] ${
            phase >= 2 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
          }`}
        >
          <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
        </span>
      </div>
    </div>
  );
}
