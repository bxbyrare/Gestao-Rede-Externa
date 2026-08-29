import type { LucideIcon } from 'lucide-react';

interface GlassIconProps {
  icon: LucideIcon;
  color?: string;
  size?: number;
  active?: boolean;
  className?: string;
}

export default function GlassIcon({
  icon: Icon,
  color = 'var(--color-primary)',
  size = 20,
  active = false,
  className = '',
}: GlassIconProps) {
  return (
    <div
      className={`relative flex items-center justify-center rounded-xl p-2.5 transition-all duration-300 ${
        active
          ? 'bg-white/[0.12] shadow-[0_0_20px_rgba(238,44,36,0.35)] border border-white/20'
          : 'bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.08)]'
      } ${className}`}
      style={{
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      {/* Glossy top shine */}
      <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-xl bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
      
      {/* Icon with glowing stroke */}
      <Icon
        size={size}
        className="relative z-10 transition-transform duration-300 group-hover:scale-110"
        style={{
          color: active ? color : 'var(--color-text-muted)',
          filter: active ? `drop-shadow(0 0 6px ${color})` : 'none',
        }}
      />
    </div>
  );
}
