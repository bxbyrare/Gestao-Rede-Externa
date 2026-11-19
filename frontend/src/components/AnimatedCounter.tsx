import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export default function AnimatedCounter({
  value,
  duration = 900,
  className = '',
  prefix = '',
  suffix = '',
}: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const proxyRef = useRef({ val: 0 });

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(value);
      proxyRef.current.val = value;
      return;
    }

    const tween = gsap.to(proxyRef.current, {
      val: value,
      duration: Math.max(0.35, duration / 1000),
      ease: 'power3.out',
      onUpdate: () => {
        setCount(Math.round(proxyRef.current.val));
      },
    });

    return () => {
      tween.kill();
    };
  }, [value, duration]);

  return (
    <span className={`mono tabular-nums ${className}`}>
      {prefix}
      {count.toLocaleString('pt-BR')}
      {suffix}
    </span>
  );
}
