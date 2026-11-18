import { useState, useRef, useEffect, type FormEvent, type MouseEvent } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
  X,
  ShieldAlert,
  Clipboard,
  Check,
  ArrowRight,
  Lock,
  User as UserIcon,
} from 'lucide-react';
import gsap from 'gsap';
import { api, ApiError } from '../api/client';
import GsapSecurityBackground from './GsapSecurityBackground';

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
  const [requiresCoordinator, setRequiresCoordinator] = useState(false);
  const [copiedPaste, setCopiedPaste] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [spotlight, setSpotlight] = useState<{ x: number; y: number; opacity: number }>({
    x: 0,
    y: 0,
    opacity: 0,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const digits = code.split('');

  useEffect(() => {
    if (!isOpen) return;
    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 18, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power3.out' }
      );
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    gsap.fromTo(
      contentRef.current,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.32, ease: 'power3.out' }
    );
  }, [step, isOpen]);

  if (!isOpen) return null;

  function handleCardMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setSpotlight({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      opacity: 1,
    });
  }

  function handleCardMouseLeave() {
    setSpotlight((prev) => ({ ...prev, opacity: 0 }));
  }

  function triggerErrorShake() {
    if (cardRef.current) {
      gsap
        .timeline()
        .to(cardRef.current, { x: -8, duration: 0.05 })
        .to(cardRef.current, { x: 8, duration: 0.05 })
        .to(cardRef.current, { x: -5, duration: 0.05 })
        .to(cardRef.current, { x: 5, duration: 0.05 })
        .to(cardRef.current, { x: 0, duration: 0.05 });
    }
  }

  function resetState() {
    setStep('request');
    setIdentifier('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
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
      setError('Informe seu usuário cadastrado.');
      triggerErrorShake();
      return;
    }

    setIsLoading(true);
    try {
      await api.post<{
        success: boolean;
        totp_required?: boolean;
        username?: string;
        message?: string;
      }>('/api/auth/forgot-password', {
        identifier: cleanId,
      });

      setStep('verify');
    } catch (err: any) {
      triggerErrorShake();
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
      setError('Informe o código de 6 dígitos do aplicativo autenticador.');
      triggerErrorShake();
      inputRef.current?.focus();
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      triggerErrorShake();
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('A confirmação de senha não confere.');
      triggerErrorShake();
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
      triggerErrorShake();
      setError(
        err instanceof ApiError
          ? err.message
          : 'Código do autenticador incorreto ou expirado. Verifique e tente novamente.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  const passwordsMatch = newPassword.length >= 6 && confirmPassword.length >= 6 && newPassword === confirmPassword;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-20 sm:p-6 overflow-y-auto select-none bg-[#030305] text-white">
      {/* Precision Lagos Digital Blueprint Background */}
      <GsapSecurityBackground />

      {/* Atmospheric Ambient Lighting Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(650px,95vw)] h-[min(650px,95vw)] rounded-full bg-red-600/[0.07] blur-[150px] pointer-events-none" />

      {/* Top-Left Back Button matching LoginPage */}
      <button
        type="button"
        onClick={() => {
          if (step === 'verify') {
            setStep('request');
            setError(null);
          } else {
            handleClose();
          }
        }}
        className="fixed sm:absolute top-4 left-4 sm:top-7 sm:left-8 z-20 inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold bg-[#090C13]/90 hover:bg-white/[0.08] border border-white/[0.12] hover:border-white/25 text-neutral-200 hover:text-white backdrop-blur-xl transition-all shadow-lg cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>{step === 'verify' ? 'Trocar usuário' : 'Voltar ao login'}</span>
      </button>

      {/* Double-Bezel Studio Black Card */}
      <div
        ref={cardRef}
        onMouseMove={handleCardMouseMove}
        onMouseLeave={handleCardMouseLeave}
        className="relative z-10 w-full max-w-[430px] p-[1px] bg-gradient-to-b from-white/[0.16] via-white/[0.05] to-white/[0.02] border border-white/[0.08] shadow-[0_28px_70px_rgba(0,0,0,0.9)] backdrop-blur-3xl rounded-[28px] my-auto overflow-hidden"
      >
        {/* Specular Spotlight Tracking */}
        <div
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
          style={{
            opacity: spotlight.opacity,
            background: `radial-gradient(380px circle at ${spotlight.x}px ${spotlight.y}px, rgba(255,255,255,0.08), transparent 70%)`,
          }}
        />

        <div className="relative z-10 p-7 sm:p-9 rounded-[27px] bg-[#090C13]/95 border border-white/[0.05]">
          {/* Top Card Specular Hairline Highlight */}
          <div className="absolute top-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

          {/* Close Button */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-5 top-5 p-2 text-neutral-400 hover:text-white transition-colors rounded-xl hover:bg-white/[0.06] cursor-pointer z-10"
            aria-label="Fechar redefinição de senha"
          >
            <X className="w-4 h-4" />
          </button>

          <div ref={contentRef}>
            {step === 'success' ? (
              <div className="py-4 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(16,185,129,0.12)]">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-xl font-extrabold text-white tracking-tight">Senha atualizada</h2>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Sua nova senha foi salva com sucesso. Você já pode acessar o sistema normalmente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full h-12 mt-2 rounded-xl bg-white hover:bg-neutral-100 text-black font-semibold text-xs tracking-wider uppercase transition-all active:scale-[0.98] flex items-center justify-between px-5 cursor-pointer shadow-[0_4px_20px_rgba(255,255,255,0.14)]"
                >
                  <span>Entrar agora</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-black/10 text-black">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              </div>
            ) : step === 'request' ? (
              <div>
                {/* Sculptural Header matching LoginPage */}
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="relative mb-4 flex items-center justify-center">
                    <div className="absolute w-16 h-16 rounded-full bg-[#EE2C24]/20 blur-xl pointer-events-none" />
                    <img
                      src="/claro-icon.png"
                      alt="Claro"
                      className="relative z-10 w-16 h-16 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.7)] select-none"
                    />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                    Redefinir Senha
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1.5 max-w-[300px] leading-relaxed">
                    Informe seu usuário para criar uma nova senha usando o código do aplicativo autenticador.
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="mb-4 rounded-xl border border-red-800/40 bg-red-950/40 px-3.5 py-3 text-xs text-red-300 flex items-center gap-2.5"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                )}

                {requiresCoordinator && (
                  <div
                    role="alert"
                    className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-start gap-2.5 leading-relaxed"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      Solicite a um coordenador a liberação do seu autenticador no painel de gerenciamento.
                    </div>
                  </div>
                )}

                <form onSubmit={handleRequestCode} className="space-y-4">
                  <div>
                    <label
                      htmlFor="recovery-identifier"
                      className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2"
                    >
                      Usuário de Acesso
                    </label>
                    <div className="relative group">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-white transition-colors" />
                      <input
                        id="recovery-identifier"
                        name="username"
                        type="text"
                        required
                        autoFocus
                        autoComplete="username"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        enterKeyHint="next"
                        aria-invalid={Boolean(error)}
                        value={identifier}
                        onChange={(e) => {
                          setIdentifier(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Seu usuário corporativo..."
                        className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/[0.03] border border-white/10 text-base sm:text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-white/20 transition-all outline-none font-medium"
                      />
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-12 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all active:scale-[0.98] flex items-center justify-between px-5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-white hover:bg-neutral-100 text-black shadow-[0_4px_20px_rgba(255,255,255,0.14)] hover:shadow-[0_4px_28px_rgba(255,255,255,0.22)]"
                    >
                      <span>{isLoading ? 'Verificando...' : 'Continuar'}</span>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors bg-black/10 text-black">
                        {isLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div>
                {/* Step 2 Header: Clean & Direct */}
                <div className="mb-5 pr-7">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                    Nova Senha
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Digite o código de 6 dígitos do aplicativo autenticador e escolha sua nova senha.
                  </p>

                  {/* Account Identifier Pill with Quick Switch */}
                  <div className="mt-3.5 flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserIcon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span className="text-xs font-mono text-neutral-200 truncate">
                        {identifier.trim().toLowerCase()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('request');
                        setError(null);
                      }}
                      className="text-[11px] font-semibold text-neutral-400 hover:text-white transition-colors shrink-0 cursor-pointer"
                    >
                      Trocar
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="mb-4 rounded-xl border border-red-800/40 bg-red-950/40 px-3.5 py-3 text-xs text-red-300 flex items-center gap-2.5"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleResetPassword} className="space-y-4">
                  {/* 6-digit OTP Block */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        htmlFor="totp-reset-code"
                        className="text-xs font-semibold uppercase tracking-wider text-neutral-300"
                      >
                        Código de 6 Dígitos
                      </label>
                      <button
                        type="button"
                        onClick={handleClipboardPaste}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-neutral-300 hover:text-white text-[11px] font-medium transition-colors border border-white/10 cursor-pointer"
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
                            <span>Colar código</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div
                      onClick={() => inputRef.current?.focus()}
                      onPaste={(e) => {
                        e.preventDefault();
                        handlePasteText(e.clipboardData.getData('text'));
                      }}
                      className="relative grid grid-cols-6 gap-2 cursor-text py-1"
                    >
                      <input
                        ref={inputRef}
                        id="totp-reset-code"
                        name="totp-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
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
                          if (error) setError(null);
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
                            className={`h-13 sm:h-14 rounded-2xl flex items-center justify-center font-mono text-xl sm:text-2xl font-bold transition-all relative shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
                              error && code.length < 6
                                ? 'bg-red-950/20 border border-red-500/60 text-red-200'
                                : isCurrentSlot
                                ? 'bg-white/[0.08] border border-white/50 ring-1 ring-white/20 scale-[1.02]'
                                : isFilled
                                ? 'bg-white/[0.06] border border-white/25 text-white'
                                : 'bg-white/[0.03] border border-white/10 text-neutral-500'
                            }`}
                          >
                            {digit ? (
                              <span className="text-white">{digit}</span>
                            ) : (
                              <span className="text-neutral-600 text-base">&bull;</span>
                            )}
                            {isCurrentSlot && (
                              <span className="absolute inset-x-3 bottom-2 h-[2px] bg-white rounded-full animate-pulse" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* New Password Input */}
                  <div>
                    <label
                      htmlFor="new-pw"
                      className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2"
                    >
                      Nova Senha
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-white transition-colors" />
                      <input
                        id="new-pw"
                        name="new-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        enterKeyHint="next"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full h-12 pl-11 pr-11 rounded-xl bg-white/[0.03] border border-white/10 text-base sm:text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-white/20 transition-all outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-pressed={showPassword}
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password Input */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        htmlFor="confirm-pw"
                        className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider"
                      >
                        Confirmar Nova Senha
                      </label>
                      {passwordsMatch && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                          <Check className="w-3 h-3" />
                          Senhas conferem
                        </span>
                      )}
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-white transition-colors" />
                      <input
                        id="confirm-pw"
                        name="confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        enterKeyHint="done"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Repita a nova senha"
                        className="w-full h-12 pl-11 pr-11 rounded-xl bg-white/[0.03] border border-white/10 text-base sm:text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-white/20 transition-all outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-pressed={showPassword}
                        aria-label={showPassword ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-12 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all active:scale-[0.98] flex items-center justify-between px-5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-white hover:bg-neutral-100 text-black shadow-[0_4px_20px_rgba(255,255,255,0.14)] hover:shadow-[0_4px_28px_rgba(255,255,255,0.22)]"
                    >
                      <span>{isLoading ? 'Salvando...' : 'Salvar Nova Senha'}</span>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors bg-black/10 text-black">
                        {isLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </button>
                  </div>

                  <p className="text-[11px] text-center text-neutral-500 pt-1">
                    Perdeu acesso ao autenticador? Contate algum coordenador.
                  </p>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Corporate Copyright Footer matching LoginPage */}
      <div className="fixed sm:absolute bottom-5 text-center text-[10px] text-neutral-500 font-mono tracking-wider pointer-events-none">
        &copy; 2026 Claro Brasil. Todos os direitos reservados.
      </div>
    </div>
  );
}
