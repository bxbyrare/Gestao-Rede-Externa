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

  // Auto-detect mobile device or small screen to prioritize direct phone linking
  const isMobileInitial =
    typeof window !== 'undefined' &&
    (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768);
  const [accessMode, setAccessMode] = useState<'mobile' | 'desktop'>(isMobileInitial ? 'mobile' : 'desktop');

  // If user already has TOTP active in DB, they need 12h verification; otherwise they need initial setup
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
        { opacity: 0, y: 28, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' }
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

  // Trigger gentle haptic card shake on error
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

  // Array of 6 cells for luxury OTP display
  const digits = code.split('');

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto select-none">
      {/* GSAP Living Security Background */}
      <GsapSecurityBackground />

      {/* DOUBLE-BEZEL (DOPPELRAND) HARDWARE CONTAINER */}
      <div
        ref={cardRef}
        className="relative z-10 w-full max-w-[480px] rounded-[32px] p-2 bg-gradient-to-b from-white/[0.12] via-white/[0.04] to-white/[0.02] border border-white/[0.08] shadow-[0_32px_80px_-20px_rgba(0,0,0,0.9),0_0_1px_1px_rgba(255,255,255,0.06)] backdrop-blur-3xl my-auto transition-all"
      >
        {/* Top Edge Specular Hairline */}
        <div className="absolute top-0 inset-x-12 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

        {/* Inner Core */}
        <div className="relative rounded-[26px] p-6 sm:p-8 bg-[#090C13]/92 border border-white/[0.05] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] overflow-hidden">
          {/* Subtle Corner Ambient Mesh (No Neon!) */}
          <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-white/[0.02] blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-red-600/[0.04] blur-3xl pointer-events-none" />

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
            /* MODE 1: OBLIGATORY INITIAL SETUP                           */
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
                  <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                    Para acessar o portal, vincule seu celular via Google ou Microsoft Authenticator.
                  </p>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/30 text-red-300 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {isFetchingSetup ? (
                <div className="py-14 text-center text-xs text-neutral-400 flex flex-col items-center gap-2.5">
                  <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
                  <span>Gerando chave de segurança criptográfica...</span>
                </div>
              ) : setupData ? (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Segmented Device Selector */}
                  <div className="flex rounded-xl bg-white/[0.03] p-1 border border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => setAccessMode('mobile')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        accessMode === 'mobile'
                          ? 'bg-white/[0.1] text-white shadow-sm border border-white/10'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>No Celular</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccessMode('desktop')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        accessMode === 'desktop'
                          ? 'bg-white/[0.1] text-white shadow-sm border border-white/10'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>No Computador</span>
                    </button>
                  </div>

                  {accessMode === 'mobile' ? (
                    /* Mobile 1-Tap Linking & Copy */
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3.5">
                      <div className="text-center">
                        <p className="text-xs font-medium text-white">Vincule diretamente no app do seu celular:</p>
                        <p className="text-[11px] text-neutral-400 mt-0.5">Sem precisar de câmera</p>
                      </div>

                      <a
                        href={setupData.otpauth_url}
                        className="w-full py-3 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all border border-white/15 active:scale-[0.98] cursor-pointer shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]"
                      >
                        <Smartphone className="w-4 h-4 text-neutral-300" />
                        <span>Abrir no Google / Microsoft Authenticator</span>
                        <ExternalLink className="w-3.5 h-3.5 text-neutral-400 ml-1" />
                      </a>

                      <div className="pt-2 border-t border-white/[0.06] space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-neutral-400">
                          <span>Chave manual para colar:</span>
                          <span className="font-mono text-[10px] text-neutral-400">Base32</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 font-mono text-xs text-neutral-200 bg-black/40 px-3 py-2 rounded-xl border border-white/[0.08] select-all truncate">
                            {setupData.secret}
                          </code>
                          <button
                            type="button"
                            onClick={handleCopySecret}
                            className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/10 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copied ? 'Copiado' : 'Copiar'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Desktop QR Code */
                    <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                      <p className="text-xs font-medium text-neutral-300 mb-3 text-center">
                        Escaneie o QR Code com o aplicativo autenticador:
                      </p>
                      <div className="p-3 bg-[#0D111A] rounded-2xl border border-white/10 shadow-2xl">
                        <QRCodeSVG
                          value={setupData.otpauth_url}
                          size={160}
                          bgColor="#0D111A"
                          fgColor="#FFFFFF"
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-[11px] text-neutral-400">
                        <span>Chave:</span>
                        <code className="font-mono text-neutral-200 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08]">
                          {setupData.secret}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopySecret}
                          className="p-1 text-neutral-400 hover:text-white"
                          title="Copiar chave"
                        >
                          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 6-DIGIT DISCRETE OTP CELLS */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2.5 text-center">
                      Digite o código de 6 dígitos gerado:
                    </label>

                    {/* Interactive OTP Container */}
                    <div
                      onClick={() => inputRef.current?.focus()}
                      className="relative flex items-center justify-center gap-2 sm:gap-2.5 cursor-text py-1"
                    >
                      {/* Hidden Accessible Native Input */}
                      <input
                        ref={inputRef}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]*"
                        maxLength={6}
                        required
                        value={code}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="absolute inset-0 w-full h-full opacity-0 pointer-events-auto cursor-text z-20"
                      />

                      {/* 6 Luxury Discrete Cells */}
                      {[0, 1, 2, 3, 4, 5].map((index) => {
                        const digit = digits[index];
                        const isCurrentSlot = isFocused && index === digits.length;
                        const isFilled = digit !== undefined;

                        return (
                          <div
                            key={index}
                            className={`w-11 h-14 sm:w-13 sm:h-16 rounded-2xl flex items-center justify-center font-mono text-2xl font-bold transition-all relative ${
                              isCurrentSlot
                                ? 'bg-white/[0.08] border border-white/40 ring-1 ring-white/20 shadow-[0_0_20px_rgba(255,255,255,0.06)] scale-[1.02]'
                                : isFilled
                                ? 'bg-white/[0.05] border border-white/20 text-white'
                                : 'bg-white/[0.02] border border-white/[0.08] text-neutral-500'
                            }`}
                          >
                            {digit ? (
                              <span className="text-white animate-fade-in">{digit}</span>
                            ) : (
                              <span className="text-neutral-600 text-lg">&bull;</span>
                            )}

                            {/* Minimal Cursor Bar */}
                            {isCurrentSlot && (
                              <span className="absolute inset-x-3 bottom-2.5 h-[2px] bg-white rounded-full animate-pulse" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-1 space-y-2.5">
                    <button
                      type="submit"
                      disabled={isLoading || code.length !== 6}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#991B1B] hover:from-[#EF4444] hover:to-[#B91C1C] text-white font-semibold text-xs tracking-wide uppercase transition-all shadow-[0_4px_24px_rgba(220,38,38,0.3)] active:scale-[0.98] flex items-center justify-between px-5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span>{isLoading ? 'Validando...' : 'Ativar e Liberar Acesso (12h)'}</span>
                      <div className="w-7 h-7 rounded-lg bg-black/20 border border-white/10 flex items-center justify-center">
                        {isLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5 text-white" />
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
              <div className="flex items-start gap-4 pb-5 mb-5 border-b border-white/[0.06]">
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
                <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/30 text-red-300 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Código de 6 Dígitos:
                    </label>
                    <span className="text-[11px] text-neutral-400 font-mono">Google / Microsoft App</span>
                  </div>

                  {/* 6 LUXURY DISCRETE CELLS */}
                  <div
                    onClick={() => inputRef.current?.focus()}
                    className="relative flex items-center justify-center gap-2 sm:gap-2.5 cursor-text py-2"
                  >
                    {/* Hidden Native Input */}
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
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                            isCurrentSlot
                              ? 'bg-white/[0.08] border border-white/40 ring-1 ring-white/20 shadow-[0_0_20px_rgba(255,255,255,0.06)] scale-[1.02]'
                              : isFilled
                              ? 'bg-white/[0.05] border border-white/20 text-white'
                              : 'bg-white/[0.02] border border-white/[0.08] text-neutral-500'
                          }`}
                        >
                          {digit ? (
                            <span className="text-white animate-fade-in">{digit}</span>
                          ) : (
                            <span className="text-neutral-600 text-lg">&bull;</span>
                          )}

                          {/* Minimal Focus Cursor Line */}
                          {isCurrentSlot && (
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

                {/* Submit & Footer Actions */}
                <div className="space-y-4 pt-1">
                  <button
                    type="submit"
                    disabled={isLoading || code.length !== 6}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#991B1B] hover:from-[#EF4444] hover:to-[#B91C1C] text-white font-semibold text-xs tracking-wide uppercase transition-all shadow-[0_4px_24px_rgba(220,38,38,0.3)] active:scale-[0.98] flex items-center justify-between px-5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span>{isLoading ? 'Validando Código...' : 'Renovar Acesso por 12 Horas'}</span>
                    <div className="w-7 h-7 rounded-lg bg-black/20 border border-white/10 flex items-center justify-center">
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                  </button>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.05]">
                    <span className="text-neutral-400 text-[11px]">
                      Perdeu o celular? Contate o coordenador master.
                    </span>
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="text-neutral-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
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
