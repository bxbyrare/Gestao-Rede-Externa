import { useState, useEffect, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Lock, CheckCircle2, Loader2, Copy, Check, LogOut, Smartphone } from 'lucide-react';
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

  const isSetupMode = Boolean(user && user.requires_totp_setup);
  const isVerifyMode = Boolean(user && !user.requires_totp_setup && user.requires_totp_verify);

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
            setError(err instanceof ApiError ? err.message : 'Falha ao carregar QR Code do autenticador.');
          }
        })
        .finally(() => {
          if (isMounted) setIsFetchingSetup(false);
        });

      return () => { isMounted = false; };
    }
  }, [isSetupMode, setupData]);

  if (!user || (!isSetupMode && !isVerifyMode)) {
    return null;
  }

  function handleCopySecret() {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="glass relative w-full max-w-lg rounded-2xl p-6 sm:p-7 shadow-2xl border border-red-500/20 bg-[#0B0E17]/95">
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
            <div className="flex items-start gap-3 pb-4 mb-4 border-b border-white/10">
              <div className="w-11 h-11 rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 flex items-center justify-center shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 tracking-wider">
                    Segurança Obrigatória
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-white mt-1">
                  Ativar Aplicativo Autenticador (2FA)
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Para utilizar o portal, é obrigatório vincular o Google Authenticator ou Microsoft Authenticator.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
                {error}
              </div>
            )}

            {isFetchingSetup ? (
              <div className="py-12 text-center text-xs text-[var(--color-text-muted)] flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                <span>Gerando chave de segurança e QR Code...</span>
              </div>
            ) : setupData ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* QR Code Block */}
                <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#131927] border border-white/10">
                  <p className="text-xs font-medium text-white mb-3 text-center">
                    1. Escaneie este QR Code com o aplicativo autenticador do seu celular:
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
                    <span className="text-[11px] text-[var(--color-text-muted)]">Chave manual:</span>
                    <code className="text-[11px] font-mono text-white bg-white/5 px-2 py-1 rounded border border-white/10 select-all max-w-[200px] truncate">
                      {setupData.secret}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                      title="Copiar chave manual"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* 6 Digit Verification Input */}
                <div>
                  <label className="block text-xs font-semibold text-white mb-1.5 text-center">
                    2. Digite o código de 6 dígitos exibido no aplicativo:
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
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

                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    type="submit"
                    disabled={isLoading || code.length !== 6}
                    className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 rounded-xl py-2.5 font-semibold text-sm shadow-lg shadow-red-600/20"
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
                    className="text-xs text-white/50 hover:text-white flex items-center justify-center gap-1.5 py-1.5 transition-colors"
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
                  className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 rounded-xl py-2.5 font-semibold text-sm shadow-lg shadow-red-600/20"
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
                    className="text-white/60 hover:text-white flex items-center gap-1 transition-colors"
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
