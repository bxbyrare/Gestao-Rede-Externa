import { useEffect, useRef } from 'react';

interface AmbientBackgroundProps {
  className?: string;
}

export default function LiquidEther({ className = '' }: AmbientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    let mouseX = window.innerWidth * 0.5;
    let mouseY = window.innerHeight * 0.5;
    let targetMouseX = mouseX;
    let targetMouseY = mouseY;

    const onMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });

    const resize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resize);
    resize();

    const render = () => {
      t += 0.003;
      mouseX += (targetMouseX - mouseX) * 0.03;
      mouseY += (targetMouseY - mouseY) * 0.03;

      const w = canvas.width;
      const h = canvas.height;

      // Base ultra-deep background
      ctx.fillStyle = '#08080a';
      ctx.fillRect(0, 0, w, h);

      // Ambient Soft Mesh Node 1 (Subtle Corporate Crimson / Burgundy)
      const grad1 = ctx.createRadialGradient(
        w * 0.2 + Math.sin(t * 0.8) * 120,
        h * 0.3 + Math.cos(t * 0.7) * 90,
        0,
        w * 0.2,
        h * 0.3,
        w * 0.45
      );
      grad1.addColorStop(0, 'rgba(238, 44, 36, 0.06)');
      grad1.addColorStop(0.6, 'rgba(238, 44, 36, 0.015)');
      grad1.addColorStop(1, 'rgba(8, 8, 10, 0)');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, w, h);

      // Ambient Soft Mesh Node 2 (Deep Slate / Indigo)
      const grad2 = ctx.createRadialGradient(
        w * 0.8 + Math.cos(t * 0.6) * 140,
        h * 0.7 + Math.sin(t * 0.5) * 100,
        0,
        w * 0.8,
        h * 0.7,
        w * 0.5
      );
      grad2.addColorStop(0, 'rgba(59, 130, 246, 0.04)');
      grad2.addColorStop(0.6, 'rgba(99, 102, 241, 0.015)');
      grad2.addColorStop(1, 'rgba(8, 8, 10, 0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, w, h);

      // Interactive Cursor Ambient Spotlight
      const mouseGrad = ctx.createRadialGradient(
        mouseX,
        mouseY,
        0,
        mouseX,
        mouseY,
        450
      );
      mouseGrad.addColorStop(0, 'rgba(255, 255, 255, 0.025)');
      mouseGrad.addColorStop(0.5, 'rgba(238, 44, 36, 0.012)');
      mouseGrad.addColorStop(1, 'rgba(8, 8, 10, 0)');
      ctx.fillStyle = mouseGrad;
      ctx.fillRect(0, 0, w, h);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 w-full h-full pointer-events-none z-0 ${className}`}
    />
  );
}