import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User as UserIcon, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { ApiError } from '../api/client';
import LiquidEther from '../components/LiquidEther';
import FullScreenCinematicIntro from '../components/FullScreenCinematicIntro';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [introFinished, setIntroFinished] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Usuário ou senha incorretos.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="app-shell-bg min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-[#070A11]">
      <LiquidEther />

      {/* Full Screen High-End Cinematic Intro (Google Flow Telecom Orb) */}
      <FullScreenCinematicIntro onComplete={() => setIntroFinished(true)} durationMs={4000} />

      {/* Atmospheric Ambient Lighting Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-red-600/15 blur-[140px] pointer-events-none animate-[glow-pulse_5s_ease-in-out_infinite]" />
      <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-rose-600/10 blur-[120px] pointer-events-none" />

      {/* Main Login Card Container */}
      <div
        className={`relative w-full max-w-[420px] z-10 transition-all duration-700 ease-out transform ${
          introFinished ? 'opacity-100 translate-y-0 scale-100' : 'opacity-85 translate-y-3 scale-[0.98]'
        }`}
      >
        <div className="relative rounded-3xl p-8 sm:p-9 bg-[#0E1424]/90 backdrop-blur-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.85)] overflow-hidden">
          {/* Subtle Top Card Border Highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />

          {/* Corporate Header */}
          <div className="flex flex-col items-center text-center mb-7">
            <div className="relative w-20 h-20 rounded-full p-1 bg-gradient-to-br from-[#EE2C24] via-[#D11A12] to-[#800A05] border border-red-500/40 shadow-[0_0_35px_rgba(238,44,36,0.45)] mb-4 flex items-center justify-center">
              <img
                src="/claro-icon.png"
                alt="Claro"
                className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
              />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Acesso Operacional
            </div>

            <h1 className="text-xl font-black tracking-tight text-white flex items-center justify-center gap-1.5">
              Gestão <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-400 to-rose-500">REDE EXTERNA</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Operações de Campo &amp; Infraestrutura
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400 flex items-center gap-2 animate-in">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2"
              >
                Usuário de Acesso
              </label>
              <div className="relative group">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-red-400 transition-colors" />
                <input
                  id="username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Seu usuário corporativo..."
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-[#090D17] border border-white/10 text-sm text-slate-100 placeholder:text-slate-600 focus:border-red-500/60 focus:bg-[#0c1220] focus:ring-2 focus:ring-red-500/20 transition-all outline-none font-medium"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2"
              >
                Senha de Acesso
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-red-400 transition-colors" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-12 pl-11 pr-11 rounded-xl bg-[#090D17] border border-white/10 text-sm text-slate-100 placeholder:text-slate-600 focus:border-red-500/60 focus:bg-[#0c1220] focus:ring-2 focus:ring-red-500/20 transition-all outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 mt-3 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-rose-600 hover:from-red-500 hover:to-red-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 hover:shadow-red-600/50 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer group"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Autenticando...
                </>
              ) : (
                <>
                  Entrar no Sistema{' '}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Clean Real Corporate Footer */}
          <div className="mt-7 pt-4 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Sistema Operacional Ativo
            </span>
            <span className="text-slate-400 font-semibold tracking-wider text-[10px] uppercase">
              Claro Brasil
            </span>
          </div>
        </div>
      </div>

      {/* Corporate Copyright Footer */}
      <div className="absolute bottom-5 text-center text-[11px] text-slate-500 font-medium">
        &copy; 2026 Claro Brasil. Todos os direitos reservados.
      </div>
    </div>
  );
}
