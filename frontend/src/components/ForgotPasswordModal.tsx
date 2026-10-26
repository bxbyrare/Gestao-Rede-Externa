import { useState, useRef, type FormEvent } from 'react';
import {
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
  X,
  ShieldAlert,
  ShieldCheck,
  Clipboard,
  Check,
  ArrowRight,
} from 'lucide-react';
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
  const [copiedPaste, setCopiedPaste] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const digits = code.split('');

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
    setCopiedPaste(false);
    setIsFocused(false);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handlePasteText(pasted: string) {
    const clean = pasted.trim().replace(/\D/g, '').slice(0, 6);
    if (clean) {
      setCode(clean);
      setError(null);
    }
  }

  async function handleClipboardPaste() {
    try {
      const text = await navigator.clipboard.readText();
      handlePasteText(text);
      setCopiedPaste(true);
      setTimeout(() => setCopiedPaste(false), 2000);
    } catch {
      inputRef.current?.focus();
    }
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
          'Se a conta informada estiver cadastrada, digite o código de 6 dígitos do seu aplicativo autenticador para prosseguir.'
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
              <h2 className="text-xl font-bold text-white tracking-tight">Senha Redefinida!</h2>
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
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 font-semibold px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10">
                    Recuperação Segura
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
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
                    className="block text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-medium mb-1.5"
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
                  className={`w-full h-12 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all active:scale-[0.98] flex items-center justify-between px-5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    error
                      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white border border-red-500/50 shadow-[0_4px_24px_rgba(220,38,38,0.35)]'
                      : 'bg-white hover:bg-neutral-100 text-black shadow-[0_4px_20px_rgba(255,255,255,0.12)]'
                  }`}
                >
                  <span>{isLoading ? 'Verificando...' : 'Avançar com Autenticador'}</span>
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      error ? 'bg-white/20 text-white' : 'bg-black/5 text-black'
                    }`}
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  </div>
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div className="mb-5 pb-4 border-b border-white/10 pr-8">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    Autenticador Conectado
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Validar Código e Nova Senha
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  Abra o Google Authenticator ou Microsoft Authenticator e digite o código de 6 dígitos.
                </p>
              </div>

              {infoMessage && (
                <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-xs text-neutral-300 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span>{infoMessage}</span>
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-xl border border-red-800/40 bg-red-950/40 px-3.5 py-2.5 text-xs text-red-300 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-4">
                {/* 6-digit pin block matching AuthenticatorModal */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-medium">
                        Código de 6 Dígitos
                      </label>
                      <button
                        type="button"
                        onClick={handleClipboardPaste}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white text-[11px] font-medium transition-colors border border-white/10 cursor-pointer"
                        title="Colar código da área de transferência"
                      >
                        {copiedPaste ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-300">Colado</span>
                          </>
                        ) : (
                          <>
                            <Clipboard className="w-3 h-3 text-neutral-400" />
                            <span>Colar</span>
                          </>
                        )}
                      </button>
                    </div>
                    <span className="text-[11px] text-neutral-400 font-mono">Gerado no App</span>
                  </div>

                  <div
                    onClick={() => inputRef.current?.focus()}
                    onPaste={(e) => {
                      e.preventDefault();
                      handlePasteText(e.clipboardData.getData('text'));
                    }}
                    className="relative flex items-center justify-center gap-2 sm:gap-2.5 cursor-text py-2"
                  >
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      autoFocus
                      value={code}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      onPaste={(e) => {
                        e.preventDefault();
                        handlePasteText(e.clipboardData.getData('text'));
                      }}
                      onChange={(e) => {
                        setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setError(null);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 pointer-events-auto cursor-text z-20"
                    />

                    {[0, 1, 2, 3, 4, 5].map((index) => {
                      const digit = digits[index];
                      const isCurrentSlot = isFocused && index === digits.length;
                      const isFilled = digit !== undefined;

                      return (
                        <div
                          key={index}
                          className={`w-11 h-14 sm:w-12 sm:h-14 rounded-2xl flex items-center justify-center font-mono text-2xl font-bold transition-all relative ${
                            error
                              ? 'bg-red-950/20 border border-red-500/60 text-red-200'
                              : isCurrentSlot
                              ? 'bg-white/[0.08] border border-white/50 ring-1 ring-white/20 scale-[1.02]'
                              : isFilled
                              ? 'bg-white/[0.06] border border-white/25 text-white'
                              : 'bg-white/[0.03] border border-white/10 text-neutral-500'
                          }`}
                        >
                          {digit ? (
                            <span className={error ? 'text-red-200' : 'text-white'}>{digit}</span>
                          ) : (
                            <span className="text-neutral-600 text-lg">&bull;</span>
                          )}
                          {isCurrentSlot && !error && (
                            <span className="absolute inset-x-3 bottom-2.5 h-[2px] bg-white rounded-full animate-pulse" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="new-pw"
                    className="block text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-medium mb-1.5"
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
                    className="block text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-medium mb-1.5"
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

                <div className="flex items-center justify-between pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('request');
                      setError(null);
                    }}
                    className="text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    &larr; Trocar usuário
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || code.length !== 6 || !newPassword || !confirmPassword}
                  className={`w-full h-12 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all active:scale-[0.98] flex items-center justify-between px-5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    error
                      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white border border-red-500/50 shadow-[0_4px_24px_rgba(220,38,38,0.35)]'
                      : 'bg-white hover:bg-neutral-100 text-black shadow-[0_4px_20px_rgba(255,255,255,0.12)]'
                  }`}
                >
                  <span>{isLoading ? 'Salvando Nova Senha...' : 'Redefinir Senha'}</span>
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      error ? 'bg-white/20 text-white' : 'bg-black/5 text-black'
                    }`}
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  </div>
                </button>

                <p className="text-[11px] text-center text-neutral-500 pt-1">
                  Perdeu acesso ao autenticador? Contate algum coordenador.
                </p>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
