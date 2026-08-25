import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-[var(--color-text-faint)] mt-1">{hint}</p>}
    </div>
  );
}

const inputClass =
  'w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent)]/50 focus:bg-[var(--color-accent)]/5 transition-colors outline-none';

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
    primary: 'bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/25 hover:border-[var(--color-primary)]/60',
    outline: 'bg-white/[0.03] border border-white/10 text-[var(--color-text)] hover:bg-white/[0.07]',
    ghost: 'bg-transparent text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text)]',
    danger: 'bg-[var(--color-danger-dim)] border border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = '', style, onClick }: { children: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void }) {
  return <div className={`glass rounded-2xl ${className}`} style={style} onClick={onClick}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[var(--color-text-muted)] mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
