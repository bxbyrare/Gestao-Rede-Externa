import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, CheckCircle2, Loader2, X, Smartphone, ShieldAlert } from 'lucide-react';
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
  const [requiresCoordinator, setRequiresCoordinator] = useState(false);

  if (!isOpen) return null;

  function resetState() {
    setStep('request');
    setIdentifier('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setInfoMessage(null);
    setRequiresCoordinator(false);
    setIsLoading(false);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleRequestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setRequiresCoordinator(false);
    const cleanId = identifier.trim().toLowerCase();
    if (!cleanId) {
      setError('Informe seu usuário ou e-mail cadastrado.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post<{
        success: boolean;
        totp_required?: boolean;
        username?: string;
        message?: string;
      }>('/api/auth/forgot-password', {
        identifier: cleanId,
      });

      setInfoMessage(
        res.message ||
          'Autenticador detectado. Digite o código de 6 dígitos gerado no app autenticador do seu celular.'
      );
      setStep('verify');
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.status === 400 && err.message?.toLowerCase().includes('coordenador')) {
          setRequiresCoordinator(true);
        }
      } else {
        setError('Falha ao verificar usuário.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim().replace(/\D/g, '');
    if (!cleanCode || cleanCode.length !== 6) {
      setError('Informe o código de 6 dígitos do seu aplicativo autenticador.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('A confirmação de senha não confere.');
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
      setError(
        err instanceof ApiError
          ? err.message
          : 'Código do autenticador incorreto ou expirado. Verifique e tente novamente.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-md p-[1px] bg-gradient-to-b from-white/[0.14] via-white/[0.04] to-white/[0.02] border border-white/[0.08] shadow-[0_24px_60px_rgba(0,0,0,0.85)] backdrop-blur-3xl rounded-[28px]">
        <div className="p-6 sm:p-7 rounded-[27px] bg-[#090C13]/95 border border-white/[0.05]">
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-5 top-5 p-2 text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-white/5 cursor-pointer z-10"
          >
            <X className="w-4 h-4" />
          </button>

          {step === 'success' ? (
            <div className="py-4 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-bold text-white">Senha Redefinida!</h2>
              <p className="text-xs text-neutral-400">
                Sua senha foi atualizada com sucesso através do aplicativo autenticador. Você já pode fazer login.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="w-full h-12 mt-2 rounded-xl bg-white hover:bg-neutral-100 text-black font-semibold text-xs tracking-wider uppercase transition-all cursor-pointer shadow-[0_4px_20px_rgba(255,255,255,0.12)]"
              >
                Voltar ao Login
              </button>
            </div>
          ) : step === 'request' ? (
            <div>
              <div className="mb-5 pb-4 border-b border-white/10 pr-8">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                    Recuperação Segura
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Redefinir Senha
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  A redefinição é realizada instantaneamente via seu aplicativo autenticador (Google/Microsoft Authenticator).
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-red-800/40 bg-red-950/40 px-3.5 py-2.5 text-xs text-red-300 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {requiresCoordinator && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Atenção:</strong> Solicite a algum coordenador o reset da sua credencial de acesso no painel de Usuários.
                  </div>
                </div>
              )}

              <form onSubmit={handleRequestCode} className="space-y-4">
                <div>
                  <label
                    htmlFor="recovery-identifier"
                    className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5"
                  >
                    Usuário ou Identificador
                  </label>
                  <input
                    id="recovery-identifier"
                    type="text"
                    required
                    autoFocus
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Seu usuário ou login TOA"
                    className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-white/20 transition-all outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !identifier.trim()}
                  className={`w-full h-12 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    error
                      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white border border-red-500/50 shadow-[0_4px_24px_rgba(220,38,38,0.35)]'
                      : 'bg-white hover:bg-neutral-100 text-black shadow-[0_4px_20px_rgba(255,255,255,0.12)]'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Verificando...
                    </>
                  ) : (
                    <span>Avançar com Autenticador</span>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div className="mb-5 pb-4 border-b border-white/10 pr-8">
                <div className="flex items-center gap-2 mb-1">
                  <Smartphone className="w-4 h-4 text-red-400" />
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Autenticador Conectado
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Validar Código e Nova Senha
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  Abra o Google Authenticator ou Microsoft Authenticator e digite o código de 6 dígitos.
                </p>
              </div>

              {infoMessage && (
                <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
                  {infoMessage}
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-xl border border-red-800/40 bg-red-950/40 px-3.5 py-2.5 text-xs text-red-300 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="recovery-code"
                    className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5"
                  >
                    Código de 6 Dígitos do Aplicativo
                  </label>
                  <input
                    id="recovery-code"
                    type="text"
                    inputMode="numeric"
                    required
                    autoFocus
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full h-12 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-center text-xl font-mono font-bold tracking-[8px] text-white placeholder:text-neutral-600 focus:border-white/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-white/20 transition-all outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-pw"
                    className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5"
                  >
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
                      className="w-full h-11 pl-4 pr-10 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-white/20 transition-all outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirm-pw"
                    className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5"
                  >
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
                    className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-white/20 transition-all outline-none font-mono"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('request');
                      setError(null);
                    }}
                    className="text-xs text-neutral-400 hover:text-white transition-colors"
                  >
                    &larr; Trocar usu&aacute;rio
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || code.length !== 6}
                  className={`w-full h-12 mt-1 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    error
                      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white border border-red-500/50 shadow-[0_4px_24px_rgba(220,38,38,0.35)]'
                      : 'bg-white hover:bg-neutral-100 text-black shadow-[0_4px_20px_rgba(255,255,255,0.12)]'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Salvando Nova Senha...
                    </>
                  ) : (
                    <span>Redefinir Senha</span>
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
