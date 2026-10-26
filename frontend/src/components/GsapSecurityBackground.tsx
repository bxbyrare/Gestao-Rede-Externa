import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function GsapSecurityBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let mouse = {
      x: width * 0.5,
      y: height * 0.5,
      targetX: width * 0.5,
      targetY: height * 0.5,
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        mouse.targetX = e.touches[0].clientX;
        mouse.targetY = e.touches[0].clientY;
      }
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    // Concentric blueprint radii
    const centerRadii = [130, 240, 370, 520, 690, 880, 1100, 1360, 1680];
    const offsetRadii = [420, 640, 900, 1200, 1550];

    let rotAngle = 0;

    const render = () => {
      rotAngle += 0.00035;

      // Smooth damped mouse parallax for subtle architectural depth
      mouse.x += (mouse.targetX - mouse.x) * 0.035;
      mouse.y += (mouse.targetY - mouse.y) * 0.035;

      const parallaxX = (mouse.x - width * 0.5) * 0.03;
      const parallaxY = (mouse.y - height * 0.5) * 0.03;

      const cx = width * 0.5 + parallaxX;
      const cy = height * 0.5 + parallaxY;

      // 1. Pure Matte Lagos Obsidian Dark Base
      ctx.fillStyle = '#030305';
      ctx.fillRect(0, 0, width, height);

      // 2. Soft Ambient Radial Vignette in the Center
      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.75);
      centerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.035)');
      centerGlow.addColorStop(0.35, 'rgba(12, 14, 20, 0.5)');
      centerGlow.addColorStop(0.7, 'rgba(6, 7, 10, 0.9)');
      centerGlow.addColorStop(1, '#030305');
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, width, height);

      // 3. Precision Cardinal Axes Crosshair (Lagos Digital Blueprint Lines)
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 12]);

      // Horizontal axis
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.stroke();

      // Vertical axis
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, height);
      ctx.stroke();
      ctx.restore();

      // 4. Concentric Architecture Circles (Matching Lagos Digital Image 2)
      ctx.save();
      centerRadii.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);

        // Subtle variation in opacity and dashed styling
        if (idx === 1 || idx === 4) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.065)';
          ctx.setLineDash([6, 14]);
        } else if (idx === 3 || idx === 6) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.setLineDash([]);
        }

        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.restore();

      // 5. Secondary Offset Orbital Arcs (Creates the spherical blueprint geometry in Image 2)
      ctx.save();
      const offsetCy = cy - height * 0.22 - parallaxY * 0.5;
      offsetRadii.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(cx, offsetCy, r, 0, Math.PI * 2);
        ctx.strokeStyle = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.025)';
        ctx.setLineDash(idx === 2 ? [3, 10] : []);
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.restore();

      // 6. Subtle Rotating Telemetry Compass Ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotAngle);
      ctx.beginPath();
      ctx.arc(0, 0, 480, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.setLineDash([2, 18]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    };

    gsap.ticker.add(render);

    return () => {
      gsap.ticker.remove(render);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
