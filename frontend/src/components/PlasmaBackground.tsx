import { useEffect, useRef } from 'react';

interface PlasmaBackgroundProps {
  color1?: string;
  color2?: string;
  color3?: string;
  speed?: number;
  opacity?: number;
  className?: string;
}

export default function PlasmaBackground({
  color1 = '#ee2c24', // Claro Red
  color2 = '#3b82f6', // Electric Royal Blue
  color3 = '#06b6d4', // Cyan Neon
  speed = 0.0008,
  opacity = 0.28,
  className = '',
}: PlasmaBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    let time = 0;

    const render = () => {
      time += speed * 16;
      ctx.clearRect(0, 0, width, height);

      // Create rich fluid plasma nodes
      const cx1 = width * (0.5 + 0.35 * Math.sin(time * 0.7));
      const cy1 = height * (0.5 + 0.35 * Math.cos(time * 0.9));
      const r1 = Math.min(width, height) * 0.65;

      const cx2 = width * (0.5 + 0.35 * Math.cos(time * 0.6));
      const cy2 = height * (0.5 + 0.35 * Math.sin(time * 0.8));
      const r2 = Math.min(width, height) * 0.7;

      const cx3 = width * (0.5 + 0.3 * Math.sin(time * 1.1 + 2));
      const cy3 = height * (0.5 + 0.3 * Math.cos(time * 0.5 + 1));
      const r3 = Math.min(width, height) * 0.55;

      // Node 1
      const g1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, r1);
      g1.addColorStop(0, color1);
      g1.addColorStop(0.5, 'rgba(238, 44, 36, 0.15)');
      g1.addColorStop(1, 'transparent');

      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(cx1, cy1, r1, 0, Math.PI * 2);
      ctx.fill();

      // Node 2
      const g2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r2);
      g2.addColorStop(0, color2);
      g2.addColorStop(0.5, 'rgba(59, 130, 246, 0.2)');
      g2.addColorStop(1, 'transparent');

      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(cx2, cy2, r2, 0, Math.PI * 2);
      ctx.fill();

      // Node 3
      const g3 = ctx.createRadialGradient(cx3, cy3, 0, cx3, cy3, r3);
      g3.addColorStop(0, color3);
      g3.addColorStop(0.6, 'rgba(6, 182, 212, 0.15)');
      g3.addColorStop(1, 'transparent');

      ctx.fillStyle = g3;
      ctx.beginPath();
      ctx.arc(cx3, cy3, r3, 0, Math.PI * 2);
      ctx.fill();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [color1, color2, color3, speed]);

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-0 overflow-hidden ${className}`}
      style={{ opacity, filter: 'blur(80px)' }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}