import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User as UserIcon, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { ApiError } from '../api/client';
import PlasmaBackground from '../components/PlasmaBackground';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha de conexão com o servidor.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="app-shell-bg min-h-screen flex items-center justify-center p-5 relative overflow-hidden">
      <PlasmaBackground opacity={0.38} speed={0.001} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[var(--color-primary)]/15 blur-[120px] pointer-events-none" />

      <div className="glass animate-in relative w-full max-w-[420px] rounded-3xl p-9 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full bg-[var(--color-primary)] blur-xl opacity-40" />
            <img src="/claro-icon.png" alt="Claro" className="relative w-16 h-16 rounded-full shadow-lg object-cover" />
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--color-success)] border-2 border-[var(--color-surface)] live-dot" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">
            Gestão <span className="text-[var(--color-primary)]">REDE EXTERNA</span>
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5">Plataforma Integrada de Engenharia &amp; Operações</p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              Usuário de Acesso
            </label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
              <input
                id="username"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Digite seu usuário..."
                className="w-full h-12 pl-11 pr-4 rounded-full bg-white/[0.03] border border-white/10 text-sm placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-primary)]/50 focus:bg-[var(--color-primary)]/5 transition-colors outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
              Senha de Segurança
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-12 pl-11 pr-11 rounded-full bg-white/[0.03] border border-white/10 text-sm placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-primary)]/50 focus:bg-[var(--color-primary)]/5 transition-colors outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[var(--color-text-faint)] hover:text-[var(--color-text)] transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 mt-2 rounded-full bg-[var(--color-primary-dim)] border border-[var(--color-primary)]/30 text-[var(--color-primary)] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[var(--color-primary)]/25 hover:border-[var(--color-primary)]/60 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Entrando...
              </>
            ) : (
              <>
                Entrar no Sistema <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      <p className="absolute bottom-6 text-[11px] text-[var(--color-text-faint)]">© 2026 Claro Brasil.</p>
    </div>
  );
}
