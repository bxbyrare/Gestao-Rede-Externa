import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

const inputClass =
  'w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-white/20 transition-all outline-none';

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
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-white hover:bg-neutral-100 text-black font-semibold shadow-[0_4px_16px_rgba(255,255,255,0.12)] border border-transparent',
    outline: 'bg-white/[0.03] border border-white/10 text-white hover:bg-white/[0.08] hover:border-white/20',
    ghost: 'bg-transparent text-neutral-400 hover:text-white hover:bg-white/[0.04]',
    danger: 'bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = '', style, onClick }: { children: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void }) {
  return (
    <div
      className={`rounded-2xl p-5 bg-[#090C13]/85 border border-white/[0.08] hover:border-white/15 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all ${className}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-400 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
