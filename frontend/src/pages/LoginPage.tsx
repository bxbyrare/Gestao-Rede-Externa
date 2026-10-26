import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User as UserIcon, ArrowRight, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { ApiError } from '../api/client';
import GsapSecurityBackground from '../components/GsapSecurityBackground';
import ForgotPasswordModal from '../components/ForgotPasswordModal';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-[#030305] text-white">
      {/* Precision Lagos Digital Blueprint Background */}
      <GsapSecurityBackground />

      {/* Atmospheric Ambient Lighting Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] rounded-full bg-red-600/[0.07] blur-[150px] pointer-events-none" />

      {/* Double Bezel Precision Card Container */}
      <div className="relative w-full max-w-[420px] z-10 transition-all duration-500 ease-out">
        <div className="rounded-[28px] p-[1px] bg-gradient-to-b from-white/[0.14] via-white/[0.04] to-white/[0.02] border border-white/[0.08] shadow-[0_24px_60px_rgba(0,0,0,0.85)] backdrop-blur-3xl overflow-hidden">
          <div className="rounded-[27px] p-8 sm:p-9 bg-[#090C13]/95 border border-white/[0.05] relative">
            {/* Top Card Hairline Highlight */}
            <div className="absolute top-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            {/* Corporate Header */}
            <div className="flex flex-col items-center text-center mb-6">
              {/* Preserved Claro 3D Icon */}
              <div className="relative w-20 h-20 rounded-full p-1 bg-gradient-to-br from-[#EE2C24] via-[#D11A12] to-[#800A05] border border-red-500/40 shadow-[0_0_35px_rgba(238,44,36,0.35)] mb-3.5 flex items-center justify-center">
                <img
                  src="/claro-icon.png"
                  alt="Claro"
                  className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                />
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-300 mb-2">
                <span>Acesso Corporativo Seguro</span>
              </div>

              <h1 className="text-xl font-black tracking-tight text-white flex items-center justify-center gap-1.5">
                Gestão <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-rose-500 to-red-400">REDE EXTERNA</span>
              </h1>
              <p className="text-xs text-neutral-400 mt-1">
                Operações de Campo &amp; Infraestrutura
              </p>
            </div>

            {/* Error Alert matching Authenticator Modal */}
            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-center gap-2.5 animate-in fade-in">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="username"
                  className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2"
                >
                  Usuário de Acesso
                </label>
                <div className="relative group">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-white transition-colors" />
                  <input
                    id="username"
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Seu usuário corporativo..."
                    className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-white/20 transition-all outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider"
                  >
                    Senha de Acesso
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsForgotOpen(true)}
                    className="text-[11px] font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-white transition-colors" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="••••••••••••"
                    className="w-full h-12 pl-11 pr-11 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-white/20 transition-all outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Action Button: White Lagos Digital by default; Red only if error/refused */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full h-12 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all active:scale-[0.98] flex items-center justify-between px-5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    error
                      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white border border-red-500/50 shadow-[0_4px_24px_rgba(220,38,38,0.35)]'
                      : 'bg-white hover:bg-neutral-100 text-black shadow-[0_4px_20px_rgba(255,255,255,0.14)] hover:shadow-[0_4px_28px_rgba(255,255,255,0.22)]'
                  }`}
                >
                  <span>{isSubmitting ? 'Autenticando...' : 'Entrar no Sistema'}</span>
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      error ? 'bg-black/20 text-white' : 'bg-black/10 text-black'
                    }`}
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5" />
                    )}
                  </div>
                </button>
              </div>
            </form>

            {/* Clean Corporate Footer */}
            <div className="mt-6 pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-neutral-400 font-mono uppercase tracking-[0.15em]">
              <span>Claro Brasil</span>
              <span className="text-neutral-500">Operações Claro</span>
            </div>
          </div>
        </div>
      </div>

      {/* Corporate Copyright Footer */}
      <div className="absolute bottom-5 text-center text-[10px] text-neutral-500 font-mono tracking-wider">
        &copy; 2026 Claro Brasil. Todos os direitos reservados.
      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={isForgotOpen}
        onClose={() => setIsForgotOpen(false)}
        onSuccess={(id) => {
          setUsername(id);
          setIsForgotOpen(false);
        }}
      />
    </div>
  );
}
