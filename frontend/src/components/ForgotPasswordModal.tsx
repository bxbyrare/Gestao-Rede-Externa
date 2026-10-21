import { useState, type FormEvent } from 'react';
import { Mail, KeyRound, Eye, EyeOff, CheckCircle2, ArrowRight, Loader2, X, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../api/client';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (usernameOrEmail: string) => void;
}

export default function ForgotPasswordModal({ isOpen, onClose, onSuccess }: ForgotPasswordModalProps) {
  const [step, setStep] = useState<'request' | 'verify' | 'success'>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  function resetState() {
    setStep('request');
    setIdentifier('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setInfoMessage(null);
    setIsLoading(false);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleRequestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanId = identifier.trim().toLowerCase();
    if (!cleanId) {
      setError('Por favor, informe seu usuário ou e-mail cadastrado.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>('/api/auth/forgot-password', {
        identifier: cleanId,
      });
      setInfoMessage(res.message || 'Código de 6 dígitos enviado para seu e-mail.');
      setStep('verify');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao solicitar código. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim().replace(/\s+/g, '');
    if (!cleanCode || cleanCode.length < 6) {
      setError('Por favor, digite o código de 6 dígitos recebido por e-mail.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('A confirmação de senha não coincide com a nova senha.');
      return;
    }

    setIsLoading(true);
    try {
      await api.post<{ success: boolean; message: string }>('/api/auth/reset-password', {
        identifier: identifier.trim().toLowerCase(),
        code: cleanCode,
        new_password: newPassword,
      });
      setStep('success');
      if (onSuccess) {
        onSuccess(identifier.trim());
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Código incorreto ou expirado. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#18181c] border border-[#2c2c35] rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Subtle Top Red Line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-500" />

        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-7 sm:p-8">
          {step === 'success' ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(16,185,129,0.25)]">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h2 className="text-xl font-bold text-white">Senha Redefinida!</h2>
              <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                Suas novas credenciais foram salvas e um e-mail executivo de confirmação foi disparado via <strong className="text-rose-400">Resend</strong>.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="w-full h-11 mt-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-sm shadow-lg shadow-red-600/30 transition-all cursor-pointer"
              >
                Voltar ao Login
              </button>
            </div>
          ) : step === 'request' ? (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 text-rose-400 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Recuperar Senha</h2>
                  <p className="text-xs text-slate-400">Receba um código de acesso no seu e-mail cadastrado.</p>
                </div>
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleRequestCode} className="space-y-4">
                <div>
                  <label htmlFor="recovery-id" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Usuário ou E-mail
                  </label>
                  <input
                    id="recovery-id"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Ex: joao.silva ou joao@claro.com.br"
                    className="w-full h-12 px-4 rounded-xl bg-[#121214] border border-[#2c2c35] text-sm text-slate-100 placeholder:text-slate-500 focus:border-red-500 focus:bg-[#151518] focus:ring-2 focus:ring-red-500/20 transition-all outline-none font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 mt-2 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-rose-600 hover:from-red-500 hover:to-red-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all disabled:opacity-60 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Enviando código via Resend...
                    </>
                  ) : (
                    <>
                      Enviar Código de Recuperação <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Verificação de Segurança</h2>
                  <p className="text-xs text-slate-400">Insira o código enviado para seu e-mail e defina a nova senha.</p>
                </div>
              </div>

              {infoMessage && (
                <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-400">
                  {infoMessage}
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-3.5">
                <div>
                  <label htmlFor="recovery-code" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Código de 6 Dígitos
                  </label>
                  <input
                    id="recovery-code"
                    type="text"
                    required
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full h-12 px-4 rounded-xl bg-[#121214] border border-[#2c2c35] text-center text-lg font-mono font-bold tracking-[6px] text-white placeholder:text-slate-600 focus:border-red-500 focus:bg-[#151518] focus:ring-2 focus:ring-red-500/20 transition-all outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="new-pw" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Nova Senha
                  </label>
                  <div className="relative">
                    <input
                      id="new-pw"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full h-11 pl-4 pr-10 rounded-xl bg-[#121214] border border-[#2c2c35] text-sm text-slate-100 placeholder:text-slate-600 focus:border-red-500 focus:bg-[#151518] focus:ring-2 focus:ring-red-500/20 transition-all outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-200 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-pw" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Confirmar Nova Senha
                  </label>
                  <input
                    id="confirm-pw"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full h-11 px-4 rounded-xl bg-[#121214] border border-[#2c2c35] text-sm text-slate-100 placeholder:text-slate-600 focus:border-red-500 focus:bg-[#151518] focus:ring-2 focus:ring-red-500/20 transition-all outline-none font-mono"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('request');
                      setError(null);
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Reenviar código
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 mt-2 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-rose-600 hover:from-red-500 hover:to-red-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all disabled:opacity-60 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Redefinindo senha...
                    </>
                  ) : (
                    <>
                      Redefinir Senha <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
