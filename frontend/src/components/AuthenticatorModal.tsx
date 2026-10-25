import { useState, useEffect, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Lock, CheckCircle2, Loader2, Copy, Check, LogOut, Smartphone, Monitor, ExternalLink } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { api, ApiError } from '../api/client';
import { Button, Input } from './ui';

export default function AuthenticatorModal() {
  const { user, updateUserState, logout } = useAuth();
  const [setupData, setSetupData] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSetup, setIsFetchingSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-detect mobile device or small screen to prioritize direct phone linking
  const isMobileInitial = typeof window !== 'undefined' && (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768
  );
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

      api.get<{ success: boolean; secret: string; otpauth_url: string }>('/api/auth/totp/setup')
        .then((data) => {
          if (isMounted) {
            setSetupData(data);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err instanceof ApiError ? err.message : 'Falha ao carregar configuração do autenticador.');
          }
        })
        .finally(() => {
          if (isMounted) setIsFetchingSetup(false);
        });

      return () => { isMounted = false; };
    }
  }, [isSetupMode, setupData]);

  if (!user || user.totp_verified || (!isSetupMode && !isVerifyMode)) {
    return null;
  }

  function handleCopySecret() {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError('O código precisa ter exatamente 6 dígitos numéricos.');
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
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Código de autenticação incorreto. Verifique o relógio do seu celular e tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="glass relative w-full max-w-lg rounded-2xl p-5 sm:p-7 shadow-2xl border border-red-500/25 bg-[#0B0E17]/95 my-auto">
        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white">Acesso Autorizado</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isSetupMode
                ? 'Autenticador vinculado com sucesso! Sessão autorizada pelas próximas 12 horas.'
                : 'Código verificado com sucesso. Sessão renovada por 12 horas.'}
            </p>
          </div>
        ) : isSetupMode ? (
          <div>
            {/* Header Setup Mode */}
            <div className="flex items-start gap-3 pb-3 mb-3 border-b border-white/10">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 tracking-wider">
                    Segurança Obrigatória Claro
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">
                  Vincular Aplicativo Autenticador (2FA)
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-snug">
                  O cadastro de um app autenticador (Google ou Microsoft Authenticator) é obrigatório para acessar o portal.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
                {error}
              </div>
            )}

            {isFetchingSetup ? (
              <div className="py-12 text-center text-xs text-[var(--color-text-muted)] flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                <span>Gerando chave de segurança e link de vinculação...</span>
              </div>
            ) : setupData ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Mobile vs Desktop Tabs */}
                <div className="flex rounded-xl bg-white/5 p-1 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setAccessMode('mobile')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      accessMode === 'mobile'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Estou no Celular</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccessMode('desktop')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      accessMode === 'desktop'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span>Estou no Computador</span>
                  </button>
                </div>

                {/* TAB CONTENT: MOBILE (Técnico acessando pelo próprio celular) */}
                {accessMode === 'mobile' ? (
                  <div className="p-3.5 rounded-xl bg-[#131927] border border-white/10 space-y-3">
                    <div className="text-center">
                      <p className="text-xs font-semibold text-white">
                        Como você está no celular, vincule com 1 toque:
                      </p>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        Não precisa de câmera! Toque no botão abaixo:
                      </p>
                    </div>

                    {/* 1-Tap Deep Link Button */}
                    <a
                      href={setupData.otpauth_url}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all border border-red-500/30 active:scale-[0.98] cursor-pointer"
                    >
                      <Smartphone className="w-4 h-4 shrink-0" />
                      <span>Abrir no Google / Microsoft Authenticator</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-80 shrink-0" />
                    </a>

                    {/* Manual Key Fallback */}
                    <div className="pt-2 border-t border-white/10 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                        <span>Ou copie a chave para colar no app:</span>
                        <span className="text-[10px] text-emerald-400 font-mono">Chave Base32</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 font-mono text-xs text-amber-300 bg-black/40 px-2.5 py-2 rounded-lg border border-white/10 select-all truncate">
                          {setupData.secret}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopySecret}
                          className="px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 hover:text-white border border-red-500/30 font-semibold text-xs flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                        </button>
                      </div>
                      <p className="text-[10.5px] text-white/50 leading-relaxed pt-1">
                        <strong>Passo a passo no app:</strong> Toque no botão <strong>'+'</strong> &rarr; escolha <strong>'Inserir chave de configuração'</strong> &rarr; cole a chave e salve.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* TAB CONTENT: DESKTOP (Acessando pelo computador, lê com a câmera do celular) */
                  <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#131927] border border-white/10">
                    <p className="text-xs font-medium text-white mb-3 text-center">
                      1. Abra o app no celular e escaneie o QR Code:
                    </p>
                    <div className="p-3 bg-[#131927] rounded-xl border-2 border-red-500/30 shadow-lg">
                      <QRCodeSVG
                        value={setupData.otpauth_url}
                        size={170}
                        bgColor="#131927"
                        fgColor="#FFFFFF"
                        level="M"
                        includeMargin={false}
                      />
                    </div>

                    {/* Manual entry fallback */}
                    <div className="mt-3 flex items-center gap-2 max-w-full">
                      <span className="text-[11px] text-[var(--color-text-muted)]">Chave:</span>
                      <code className="text-[11px] font-mono text-white bg-white/5 px-2 py-1 rounded border border-white/10 select-all max-w-[200px] truncate">
                        {setupData.secret}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopySecret}
                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
                        title="Copiar chave manual"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* 6 Digit Verification Input */}
                <div>
                  <label className="block text-xs font-semibold text-white mb-1.5 text-center">
                    2. Digite o código de 6 dígitos gerado no aplicativo:
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    autoFocus
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="text-center font-mono text-2xl tracking-[0.35em] py-2.5 bg-[#131927] border-white/15 focus:border-red-500 text-white"
                  />
                  <p className="text-[11px] text-[var(--color-text-muted)] text-center mt-1">
                    Cada confirmação concede 12 horas ininterruptas de acesso.
                  </p>
                </div>

                <div className="pt-1 flex flex-col gap-2">
                  <Button
                    type="submit"
                    disabled={isLoading || code.length !== 6}
                    className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 rounded-xl py-2.5 font-semibold text-sm shadow-lg shadow-red-600/20 cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span>Validando Código...</span>
                      </>
                    ) : (
                      <span>Ativar Autenticador e Entrar</span>
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => logout()}
                    className="text-xs text-white/50 hover:text-white flex items-center justify-center gap-1.5 py-1.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair da conta</span>
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ) : (
          /* Verify Mode (12-hour session expired) */
          <div>
            <div className="flex items-start gap-3 pb-4 mb-4 border-b border-white/10">
              <div className="w-11 h-11 rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 flex items-center justify-center shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-wider">
                    Sessão de 12h Expirada
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-white mt-1">
                  Validação do Aplicativo Autenticador
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Olá, <strong className="text-white">{user.name || user.username}</strong>. Seu período de 12 horas encerrou. Digite o código do seu autenticador para renovar seu acesso.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white mb-2 text-center">
                  Código de 6 Dígitos do seu Autenticador:
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center font-mono text-3xl tracking-[0.4em] py-3 bg-[#131927] border-white/15 focus:border-red-500 text-white"
                />
                <p className="text-[11px] text-[var(--color-text-muted)] text-center mt-1.5">
                  Abra o Google Authenticator ou Microsoft Authenticator no celular.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <Button
                  type="submit"
                  disabled={isLoading || code.length !== 6}
                  className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 rounded-xl py-2.5 font-semibold text-sm shadow-lg shadow-red-600/20 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      <span>Validando...</span>
                    </>
                  ) : (
                    <span>Renovar Acesso por 12 Horas</span>
                  )}
                </Button>

                <div className="flex items-center justify-between pt-2 text-xs">
                  <span className="text-white/40 text-[11px]">
                    Perdeu o celular? Contate o coordenador master (alexandre.candido).
                  </span>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="text-white/60 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
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
  );
}
