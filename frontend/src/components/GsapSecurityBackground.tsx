import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface NodePoint {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  speed: number;
}

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
      active: false,
    };

    // Responsive node count based on viewport
    const count = Math.min(65, Math.floor((width * height) / 22000));
    const nodes: NodePoint[] = [];

    for (let i = 0; i < count; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      nodes.push({
        x,
        y,
        baseX: x,
        baseY: y,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        radius: Math.random() * 1.5 + 0.8,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.015 + 0.005,
      });
    }

    // Secondary subtle telemetry rings in background
    const rings = [
      { r: Math.min(width, height) * 0.28, rot: 0, speed: 0.0008, dash: [4, 12] },
      { r: Math.min(width, height) * 0.42, rot: 0, speed: -0.0005, dash: [2, 16] },
    ];

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      rings[0].r = Math.min(width, height) * 0.28;
      rings[1].r = Math.min(width, height) * 0.42;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.active = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        mouse.targetX = e.touches[0].clientX;
        mouse.targetY = e.touches[0].clientY;
        mouse.active = true;
      }
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    // GSAP Ticker for buttery 60fps render loop
    let tickTime = 0;
    const render = () => {
      tickTime += 0.016;

      // Inertial mouse interpolation via GSAP-style damping
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      // Dark obsidian background with subtle radial depth
      ctx.fillStyle = '#06080D';
      ctx.fillRect(0, 0, width, height);

      // Deep atmospheric gradient vignette
      const centerGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        0,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.8
      );
      centerGrad.addColorStop(0, 'rgba(18, 23, 36, 0.45)');
      centerGrad.addColorStop(0.45, 'rgba(11, 14, 22, 0.7)');
      centerGrad.addColorStop(1, '#05070A');
      ctx.fillStyle = centerGrad;
      ctx.fillRect(0, 0, width, height);

      // Faint subtle crimson ambient warmth at bottom-center (No harsh neon!)
      const crimsonWarmth = ctx.createRadialGradient(
        width * 0.5,
        height * 0.85,
        0,
        width * 0.5,
        height * 0.85,
        width * 0.55
      );
      crimsonWarmth.addColorStop(0, 'rgba(185, 28, 28, 0.06)');
      crimsonWarmth.addColorStop(0.6, 'rgba(153, 27, 27, 0.02)');
      crimsonWarmth.addColorStop(1, 'transparent');
      ctx.fillStyle = crimsonWarmth;
      ctx.fillRect(0, 0, width, height);

      // Draw faint telemetry rings
      ctx.save();
      ctx.translate(width * 0.5, height * 0.5);
      rings.forEach((ring) => {
        ring.rot += ring.speed;
        ctx.save();
        ctx.rotate(ring.rot);
        ctx.beginPath();
        ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
        ctx.setLineDash(ring.dash);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      });
      ctx.restore();

      // Update and connect nodes
      const maxDist = 135;
      const maxDistSq = maxDist * maxDist;

      for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i];
        p.phase += p.speed;

        // Subtle organic harmonic oscillation
        p.x += p.vx + Math.cos(p.phase) * 0.25;
        p.y += p.vy + Math.sin(p.phase) * 0.25;

        // Wrap boundaries
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Subtle mouse pull
        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180 && dist > 1) {
            p.x += (dx / dist) * 0.4;
            p.y += (dy / dist) * 0.4;
          }
        }

        // Draw connections
        for (let j = i + 1; j < nodes.length; j++) {
          const p2 = nodes[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dSq = dx * dx + dy * dy;

          if (dSq < maxDistSq) {
            const alpha = (1 - Math.sqrt(dSq) / maxDist) * 0.07;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 0.85;
            ctx.stroke();
          }
        }

        // Draw node point
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fill();
      }
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
      {/* Subtle hairline grid overlay for high-end structure */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />
    </div>
  );
}
