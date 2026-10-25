import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, CheckCircle2, Loader2, X, RefreshCw } from 'lucide-react';
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
      setError('Informe seu usuário ou e-mail cadastrado.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post<{ success: boolean; message: string; code?: string }>('/api/auth/forgot-password', {
        identifier: cleanId,
      });
      if (res.code) {
        setCode(res.code);
        setInfoMessage(`Código de verificação: ${res.code} (preenchido automaticamente ou verifique seu e-mail).`);
      } else {
        setInfoMessage(res.message || 'Código enviado para o e-mail cadastrado.');
      }
      setStep('verify');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao solicitar código.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim().replace(/\s+/g, '');
    if (!cleanCode || cleanCode.length < 6) {
      setError('Informe o código de 6 dígitos recebido por e-mail.');
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
      setError(err instanceof ApiError ? err.message : 'Código incorreto ou expirado.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="glass relative w-full max-w-md rounded-2xl p-6 sm:p-7 shadow-2xl">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 p-2 text-[var(--color-text-muted)] hover:text-white transition-colors rounded-lg hover:bg-white/5"
        >
          <X className="w-4 h-4" />
        </button>

        {step === 'success' ? (
          <div className="py-4 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white">Senha Redefinida</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Sua senha foi atualizada com sucesso.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="w-full h-11 mt-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              Voltar ao Login
            </button>
          </div>
        ) : step === 'request' ? (
          <div>
            <div className="mb-5 pb-4 border-b border-white/5 pr-8">
              <h2 className="text-lg font-bold text-white tracking-tight">Recuperar Senha</h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Informe seu usuário ou e-mail para receber o código de verificação.
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleRequestCode} className="space-y-4">
              <div>
                <label htmlFor="recovery-id" className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                  Usuário ou E-mail
                </label>
                <input
                  id="recovery-id"
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Usuário ou e-mail"
                  className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-[var(--color-text-faint)] focus:border-white/25 transition-colors outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
                  </>
                ) : (
                  <span>Enviar Código</span>
                )}
              </button>
            </form>
          </div>
        ) : (
          <div>
            <div className="mb-4 pb-4 border-b border-white/5 pr-8">
              <h2 className="text-lg font-bold text-white tracking-tight">Nova Senha</h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Digite o código recebido por e-mail e defina a nova senha.
              </p>
            </div>

            {infoMessage && (
              <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
                {infoMessage}
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <div>
                <label htmlFor="recovery-code" className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                  Código de 6 Dígitos
                </label>
                <input
                  id="recovery-code"
                  type="text"
                  required
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-center text-base mono font-bold tracking-[6px] text-white placeholder:text-[var(--color-text-faint)] focus:border-white/25 transition-colors outline-none"
                />
              </div>

              <div>
                <label htmlFor="new-pw" className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
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
                    className="w-full h-11 pl-4 pr-10 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-[var(--color-text-faint)] focus:border-white/25 transition-colors outline-none mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[var(--color-text-muted)] hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm-pw" className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
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
                  className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-[var(--color-text-faint)] focus:border-white/25 transition-colors outline-none mono"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep('request');
                    setError(null);
                  }}
                  className="text-xs text-[var(--color-text-muted)] hover:text-white flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3 h-3" /> Solicitar novo código
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 mt-1 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
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
  );
}
