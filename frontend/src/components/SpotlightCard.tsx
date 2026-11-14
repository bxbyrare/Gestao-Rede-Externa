import { useRef, useState, type MouseEvent, type ReactNode } from 'react';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  onClick?: () => void;
}

export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(238, 44, 36, 0.15)',
  onClick,
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || !overlayRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    overlayRef.current.style.background = `radial-gradient(400px circle at ${x}px ${y}px, ${spotlightColor}, transparent 70%)`;
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#121216]/90 p-5 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:shadow-2xl ${className}`}
      style={{
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Radial Spotlight Overlay (updated directly via DOM ref, zero React re-renders) */}
      <div
        ref={overlayRef}
        className={`pointer-events-none absolute -inset-px transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Top Gloss Reflection */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/[0.04] to-transparent" />

      <div className="relative z-10">{children}</div>
    </div>
  );
}
