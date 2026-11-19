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

    const mouse = {
      x: width * 0.5,
      y: height * 0.5,
      targetX: width * 0.5,
      targetY: height * 0.5,
      prevX: width * 0.5,
      prevY: height * 0.5,
      velocity: 0,
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

    const centerRadii = [130, 240, 370, 520, 690, 880, 1100, 1360, 1680];
    const offsetRadii = [420, 640, 900, 1200, 1550];

    let rotAngle = 0;

    const render = () => {
      rotAngle += 0.00035;

      mouse.x += (mouse.targetX - mouse.x) * 0.04;
      mouse.y += (mouse.targetY - mouse.y) * 0.04;

      const dx = mouse.x - mouse.prevX;
      const dy = mouse.y - mouse.prevY;
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
      const instVel = Math.min(Math.hypot(dx, dy), 45);
      mouse.velocity += (instVel - mouse.velocity) * 0.08;
      const breathScale = 1 + mouse.velocity * 0.0008;

      const parallaxX = (mouse.x - width * 0.5) * 0.032;
      const parallaxY = (mouse.y - height * 0.5) * 0.032;

      const cx = width * 0.5 + parallaxX;
      const cy = height * 0.5 + parallaxY;

      const theme = document.documentElement.dataset.theme || 'dark';
      const isLight = theme === 'light';
      const isDim = theme === 'dim';

      // 1. Base Canvas Surface (Obsidian #030305, Grafite #131519, or Pearl Slate #e3e6eb)
      const baseColor = isLight ? '#e3e6eb' : isDim ? '#131519' : '#030305';
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, width, height);

      // 2. Soft Ambient Studio Radial Vignette
      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.75);
      if (isLight) {
        centerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        centerGlow.addColorStop(0.4, 'rgba(236, 238, 242, 0.45)');
        centerGlow.addColorStop(0.8, 'rgba(227, 230, 235, 0.92)');
        centerGlow.addColorStop(1, '#e3e6eb');
      } else if (isDim) {
        centerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
        centerGlow.addColorStop(0.4, 'rgba(27, 30, 36, 0.45)');
        centerGlow.addColorStop(0.75, 'rgba(19, 21, 25, 0.92)');
        centerGlow.addColorStop(1, '#131519');
      } else {
        centerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.036)');
        centerGlow.addColorStop(0.35, 'rgba(12, 14, 20, 0.5)');
        centerGlow.addColorStop(0.7, 'rgba(6, 7, 10, 0.9)');
        centerGlow.addColorStop(1, '#030305');
      }
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, width, height);

      const lineRgb = isLight ? '26, 31, 41' : '255, 255, 255';
      const alphaMult = isLight ? 1.35 : 1;

      // 3. Precision Cardinal Axes Crosshair
      ctx.save();
      ctx.strokeStyle = `rgba(${lineRgb}, ${(0.035 * alphaMult).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 12]);

      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, height);
      ctx.stroke();
      ctx.restore();

      // 4. Concentric Architecture Circles with Velocity Breathing
      ctx.save();
      centerRadii.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r * breathScale, 0, Math.PI * 2);

        if (idx === 1 || idx === 4) {
          ctx.strokeStyle = `rgba(${lineRgb}, ${(0.062 * alphaMult).toFixed(3)})`;
          ctx.setLineDash([6, 14]);
        } else if (idx === 3 || idx === 6) {
          ctx.strokeStyle = `rgba(${lineRgb}, ${(0.044 * alphaMult).toFixed(3)})`;
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = `rgba(${lineRgb}, ${(0.028 * alphaMult).toFixed(3)})`;
          ctx.setLineDash([]);
        }

        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.restore();

      // 5. Secondary Offset Orbital Arcs
      ctx.save();
      const offsetCy = cy - height * 0.22 - parallaxY * 0.5;
      offsetRadii.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(cx, offsetCy, r * breathScale, 0, Math.PI * 2);
        const a = (idx % 2 === 0 ? 0.038 : 0.024) * alphaMult;
        ctx.strokeStyle = `rgba(${lineRgb}, ${a.toFixed(3)})`;
        ctx.setLineDash(idx === 2 ? [3, 10] : []);
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.restore();

      // 6. Rotating Telemetry Compass Ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotAngle);
      ctx.beginPath();
      ctx.arc(0, 0, 480 * breathScale, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${lineRgb}, ${(0.028 * alphaMult).toFixed(3)})`;
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
