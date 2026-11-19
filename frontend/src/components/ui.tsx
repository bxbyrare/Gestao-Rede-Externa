import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import gsap from 'gsap';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-[0.1em] mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

const inputClass =
  'w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-white/15 transition-all duration-200 outline-none';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className || ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className || ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} h-auto py-3 resize-none ${props.className || ''}`} />;
}

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'outline';

export function Button({
  variant = 'primary',
  className = '',
  onMouseMove,
  onMouseLeave,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const variants: Record<ButtonVariant, string> = {
    primary:
      'btn-solid bg-[#e20613] hover:bg-[#c20511] text-white font-bold shadow-[0_10px_28px_-6px_rgba(226,6,19,0.45)] border border-white/10',
    outline:
      'bg-white/[0.03] border border-white/10 text-white hover:bg-white/[0.08] hover:border-white/20 shadow-sm',
    ghost: 'bg-transparent text-neutral-400 hover:text-white hover:bg-white/[0.05]',
    danger: 'bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25',
  };

  function handleMouseMove(e: ReactMouseEvent<HTMLButtonElement>) {
    onMouseMove?.(e);
    if (disabled || !btnRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.innerWidth < 1024) return;
    const rect = btnRef.current.getBoundingClientRect();
    const relX = e.clientX - (rect.left + rect.width / 2);
    const relY = e.clientY - (rect.top + rect.height / 2);
    gsap.to(btnRef.current, {
      x: relX * 0.14,
      y: relY * 0.18,
      duration: 0.3,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  }

  function handleMouseLeave(e: ReactMouseEvent<HTMLButtonElement>) {
    onMouseLeave?.(e);
    if (!btnRef.current) return;
    gsap.to(btnRef.current, {
      x: 0,
      y: 0,
      duration: 0.65,
      ease: 'elastic.out(1, 0.4)',
      overwrite: 'auto',
    });
  }

  return (
    <button
      ref={btnRef}
      disabled={disabled}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...props}
      className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold transition-colors duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${variants[variant]} ${className}`}
    />
  );
}

export function Card({
  children,
  className = '',
  style,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  function handleMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`ds-card rounded-2xl p-5 bg-[#09090d]/90 border border-white/[0.08] hover:border-white/[0.15] backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.6)] ${className}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const words = el.querySelectorAll('.ds-word');
    const sub = el.querySelector('.ds-header-sub');
    const act = el.querySelector('.ds-header-actions');

    const ctx = gsap.context(() => {
      if (words.length > 0) {
        gsap.fromTo(
          words,
          { yPercent: 105, opacity: 0 },
          {
            yPercent: 0,
            opacity: 1,
            duration: 0.62,
            stagger: 0.04,
            ease: 'power4.out',
          },
        );
      }
      if (sub) {
        gsap.fromTo(
          sub,
          { y: 8, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, delay: 0.12, ease: 'power3.out' },
        );
      }
      if (act) {
        gsap.fromTo(
          act,
          { y: 8, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, delay: 0.16, ease: 'power3.out' },
        );
      }
    }, el);

    return () => ctx.revert();
  }, [title]);

  const titleWords = title.split(' ');

  return (
    <div
      ref={rootRef}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.06]"
    >
      <div>
        <h1 className="ds-title text-2xl sm:text-[26px] font-extrabold tracking-[-0.035em] text-white flex flex-wrap gap-x-[0.28em]">
          {titleWords.map((word, idx) => (
            <span key={`${word}-${idx}`} className="ds-word-mask">
              <span className="ds-word">{word}</span>
            </span>
          ))}
        </h1>
        {subtitle && (
          <p className="ds-header-sub ds-subtitle text-sm text-[#a1a1a6] mt-1">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="ds-header-actions flex items-center gap-2 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
