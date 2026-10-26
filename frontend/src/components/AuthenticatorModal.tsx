import { useState, useEffect, useRef, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import gsap from 'gsap';
import {
  Lock,
  CheckCircle2,
  Loader2,
  Copy,
  Check,
  LogOut,
  Smartphone,
  Monitor,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  Clipboard,
} from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { api, ApiError } from '../api/client';
import GsapSecurityBackground from './GsapSecurityBackground';

export default function AuthenticatorModal() {
  const { user, updateUserState, logout } = useAuth();
  const [setupData, setSetupData] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSetup, setIsFetchingSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-detect mobile device or small screen
  const isMobileInitial =
    typeof window !== 'undefined' &&
    (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768);
  const [accessMode, setAccessMode] = useState<'mobile' | 'desktop'>(isMobileInitial ? 'mobile' : 'desktop');

  const isSetupMode = Boolean(user && !user.totp_enabled);
  const isVerifyMode = Boolean(user && user.totp_enabled && !user.totp_verified);

  // Fetch setup secret & QR if user needs TOTP setup
  useEffect(() => {
    if (isSetupMode && !setupData) {
      let isMounted = true;
      setIsFetchingSetup(true);
      setError(null);

      api
        .get<{ success: boolean; secret: string; otpauth_url: string }>('/api/auth/totp/setup')
        .then((data) => {
          if (isMounted) setSetupData(data);
        })
        .catch((err) => {
          if (isMounted) {
            setError(err instanceof ApiError ? err.message : 'Falha ao carregar configuração do autenticador.');
          }
        })
        .finally(() => {
          if (isMounted) setIsFetchingSetup(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isSetupMode, setupData]);

  // GSAP Entrance Choreography
  useEffect(() => {
    if (cardRef.current && (isSetupMode || isVerifyMode)) {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 24, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.65, ease: 'power3.out' }
      );
    }
  }, [isSetupMode, isVerifyMode]);

  // Auto-focus the OTP input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSetupMode, isVerifyMode]);

  if (!user || user.totp_verified || (!isSetupMode && !isVerifyMode)) {
    return null;
  }

  function handleCopySecret() {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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
    } catch {
      // Fallback: user can paste directly into the cells
    }
  }

  // Trigger gentle card shake on error
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError('O código precisa ter exatamente 6 dígitos numéricos.');
      triggerErrorShake();
      return;
    }

    setIsLoading(true);
    try {
      if (isSetupMode) {
        const res = await api.post<{ success: boolean; message: string; totp_expires_at?: number }>(
          '/api/auth/totp/enable',
          { code: cleanCode }
        );
        setIsSuccess(true);
        setTimeout(() => {
          updateUserState({
            totp_enabled: true,
            totp_verified: true,
            requires_totp_setup: false,
            requires_totp_verify: false,
            totp_expires_at: res.totp_expires_at,
          });
        }, 800);
      } else {
        const res = await api.post<{ success: boolean; message: string; totp_expires_at?: number }>(
          '/api/auth/totp/verify',
          { code: cleanCode }
        );
        setIsSuccess(true);
        setTimeout(() => {
          updateUserState({
            totp_verified: true,
            requires_totp_verify: false,
            totp_expires_at: res.totp_expires_at,
          });
        }, 800);
      }
    } catch (err) {
      triggerErrorShake();
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Código de autenticação incorreto. Verifique o relógio do seu celular e tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  const digits = code.split('');

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto select-none bg-[#030305]">
      {/* GSAP Lagos Digital Blueprint Architecture Background */}
      <GsapSecurityBackground />

      {/* LAGOS DIGITAL DOUBLE-BEZEL PRECISION CARD */}
      <div
        ref={cardRef}
        className={`relative z-10 w-full max-w-[480px] rounded-[32px] p-2 bg-gradient-to-b from-white/[0.14] via-white/[0.04] to-white/[0.02] border transition-all duration-300 my-auto ${
          error
            ? 'border-red-500/50 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.9),0_0_30px_rgba(239,68,68,0.2)]'
            : 'border-white/[0.1] shadow-[0_32px_80px_-20px_rgba(0,0,0,0.9),0_0_1px_1px_rgba(255,255,255,0.06)]'
        } backdrop-blur-3xl`}
      >
        {/* Top Edge Specular Hairline */}
        <div className="absolute top-0 inset-x-12 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

        {/* Inner Core */}
        <div className="relative rounded-[26px] p-6 sm:p-8 bg-[#090C13]/95 border border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] overflow-hidden">
          {/* Subtle Ambient Radial Highlight */}
          <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-white/[0.02] blur-3xl pointer-events-none" />

          {isSuccess ? (
            <div className="py-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/10 text-emerald-400 flex items-center justify-center mx-auto shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Acesso Confirmado</h2>
                <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                  {isSetupMode
                    ? 'Autenticador vinculado com sucesso. Sua sessão está autorizada por 12 horas.'
                    : 'Código validado com sucesso. Sessão renovada pelas próximas 12 horas.'}
                </p>
              </div>
            </div>
          ) : isSetupMode ? (
            /* ========================================================= */
            /* MODE 1: OBLIGATORY INITIAL SETUP                          */
            /* ========================================================= */
            <div>
              {/* Header */}
              <div className="flex items-start gap-3.5 pb-4 mb-4 border-b border-white/[0.06]">
                <div className="w-11 h-11 rounded-2xl bg-white/[0.04] border border-white/10 text-white flex items-center justify-center shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                  <Smartphone className="w-5 h-5 text-neutral-200" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-300">
                    <span>Segurança Obrigatória</span>
                  </div>
                  <h2 className="text-lg font-bold tracking-tight text-white mt-1">
                    Vincular Autenticador (2FA)
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Para acessar o portal, vincule seu Google ou Microsoft Authenticator uma única vez.
                  </p>
                </div>
              </div>

              {/* Mode Toggle Pills (Mobile vs Desktop) */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4">
                <button
                  type="button"
                  onClick={() => setAccessMode('mobile')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    accessMode === 'mobile'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-white/[0.03]'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Estou no Celular</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAccessMode('desktop')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    accessMode === 'desktop'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-white/[0.03]'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Ler QR no PC</span>
                </button>
              </div>

              {isFetchingSetup ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
                  <p className="text-xs text-neutral-400">Gerando chave de segurança criptográfica...</p>
                </div>
              ) : setupData ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {accessMode === 'mobile' ? (
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">
                          Vínculo Direto:
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono">1-Clique</span>
                      </div>
                      <a
                        href={setupData.otpauth_url}
                        className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-neutral-100 text-black font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98]"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Abrir no App Autenticador</span>
                      </a>
                      <div className="pt-2 border-t border-white/[0.06]">
                        <p className="text-[11px] text-neutral-400 mb-1.5">Ou cole esta chave no app:</p>
                        <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-black/40 border border-white/10 font-mono text-xs text-neutral-200">
                          <span className="truncate tracking-wider">{setupData.secret}</span>
                          <button
                            type="button"
                            onClick={handleCopySecret}
                            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
                            title="Copiar Chave"
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex flex-col items-center text-center">
                      <div className="p-3 bg-white rounded-2xl shadow-xl mb-3">
                        <QRCodeSVG value={setupData.otpauth_url} size={150} level="M" />
                      </div>
                      <p className="text-xs text-neutral-300 font-medium">Escaneie o código acima no app</p>
                    </div>
                  )}

                  {error && (
                    <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2 px-1">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                          Código de 6 Dígitos:
                        </label>
                        <button
                          type="button"
                          onClick={handleClipboardPaste}
                          className="px-2 py-0.5 rounded-md bg-white/[0.05] hover:bg-white/[0.12] border border-white/15 text-[11px] font-medium text-neutral-300 hover:text-white flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm"
                          title="Colar código (Ctrl+V)"
                        >
                          <Clipboard className="w-3 h-3 text-neutral-400" />
                          <span>Colar</span>
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
                            className={`w-11 h-14 sm:w-13 sm:h-16 rounded-2xl flex items-center justify-center font-mono text-2xl font-bold transition-all relative ${
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

                  <div className="pt-2 space-y-3">
                    <button
                      type="submit"
                      disabled={isLoading || code.length !== 6}
                      className="w-full h-12 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all active:scale-[0.98] flex items-center justify-between px-5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed bg-white hover:bg-neutral-100 text-black shadow-[0_4px_20px_rgba(255,255,255,0.14)] hover:shadow-[0_4px_28px_rgba(255,255,255,0.22)]"
                    >
                      <span>{isLoading ? 'Validando...' : 'Confirmar e Ativar Autenticador'}</span>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors bg-black/10 text-black">
                        {isLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => logout()}
                      className="w-full text-xs text-neutral-400 hover:text-white flex items-center justify-center gap-1.5 py-1.5 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sair da conta</span>
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : (
            /* ========================================================= */
            /* MODE 2: 12-HOUR SESSION RENEWAL (USER'S SCREENSHOT)       */
            /* ========================================================= */
            <div>
              {/* Header */}
              <div className="flex items-start gap-4 pb-5 mb-5 border-b border-white/[0.08]">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 text-white flex items-center justify-center shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                  <Lock className="w-5 h-5 text-neutral-200" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                    <span>Sessão de 12h Expirada</span>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-white mt-1.5">
                    Validação do Autenticador
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Olá, <strong className="text-white font-medium">{user.name || user.username}</strong>. Seu período
                    de 12 horas encerrou. Digite o código do seu aplicativo autenticador para renovar seu acesso.
                  </p>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3.5 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-center gap-2.5 animate-in fade-in">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                        Código de 6 Dígitos:
                      </label>
                      <button
                        type="button"
                        onClick={handleClipboardPaste}
                        className="px-2.5 py-0.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] border border-white/15 text-[11px] font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                        title="Colar código (Ctrl+V)"
                      >
                        <Clipboard className="w-3 h-3 text-neutral-400" />
                        <span>Colar</span>
                      </button>
                    </div>
                    <span className="text-[11px] text-neutral-400 font-mono">Google / Microsoft App</span>
                  </div>

                  {/* 6 LAGOS DIGITAL PRECISION OTP CELLS */}
                  <div
                    onClick={() => inputRef.current?.focus()}
                    onPaste={(e) => {
                      e.preventDefault();
                      handlePasteText(e.clipboardData.getData('text'));
                    }}
                    className="relative flex items-center justify-center gap-2 sm:gap-2.5 cursor-text py-2"
                  >
                    {/* Hidden Native Input with full paste support */}
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

                    {/* Discrete Visual OTP Cells */}
                    {[0, 1, 2, 3, 4, 5].map((index) => {
                      const digit = digits[index];
                      const isCurrentSlot = isFocused && index === digits.length;
                      const isFilled = digit !== undefined;

                      return (
                        <div
                          key={index}
                          className={`w-11 h-14 sm:w-13 sm:h-16 rounded-2xl flex items-center justify-center font-mono text-2xl font-bold transition-all relative ${
                            error
                              ? 'bg-red-950/20 border border-red-500/60 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                              : isCurrentSlot
                              ? 'bg-white/[0.08] border border-white/50 ring-1 ring-white/20 shadow-[0_0_20px_rgba(255,255,255,0.08)] scale-[1.02]'
                              : isFilled
                              ? 'bg-white/[0.06] border border-white/25 text-white'
                              : 'bg-white/[0.03] border border-white/10 text-neutral-500'
                          }`}
                        >
                          {digit ? (
                            <span className={error ? 'text-red-200 animate-fade-in' : 'text-white animate-fade-in'}>
                              {digit}
                            </span>
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

                  <p className="text-[11px] text-neutral-400 text-center mt-3">
                    Abra o aplicativo autenticador no seu aparelho celular.
                  </p>
                </div>

                {/* Submit Button: Lagos Digital White by default; Red only if refused */}
                <div className="space-y-4 pt-1">
                  <button
                    type="submit"
                    disabled={isLoading || code.length !== 6}
                    className="w-full h-12 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all active:scale-[0.98] flex items-center justify-between px-5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed bg-white hover:bg-neutral-100 text-black shadow-[0_4px_20px_rgba(255,255,255,0.14)] hover:shadow-[0_4px_28px_rgba(255,255,255,0.22)]"
                  >
                    <span>{isLoading ? 'Validando Código...' : 'Renovar Acesso por 12 Horas'}</span>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors bg-black/10 text-black">
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </button>

                  {/* Footer with updated description requested in Image 3 */}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-white/[0.08]">
                    <span className="text-neutral-400 text-[11px]">
                      Perdeu acesso ao autenticador? Contate algum coordenador.
                    </span>
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="text-neutral-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer text-[11px] py-1 px-2 rounded-lg hover:bg-white/[0.04]"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sair</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
