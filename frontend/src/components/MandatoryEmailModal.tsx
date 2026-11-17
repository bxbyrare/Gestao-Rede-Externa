import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, MailCheck, MailWarning, RefreshCw } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';
import { Button, Field, Input } from './ui';

export default function MandatoryEmailModal() {
  const { user, updateUserState } = useAuth();
  const isBounced = Boolean(user?.email_bounced);

  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [name, setName] = useState(user?.name || '');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sentToEmail, setSentToEmail] = useState('');
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setName(user.name || '');
    setCode('');
    setCodeSent(false);
    setSentToEmail('');
    setInfoMsg(null);
    setError(null);
    setIsSuccess(false);
  }, [user?.id, user?.email_bounced, user?.needs_email]);

  if (!user || (!user.needs_email && !user.email_bounced)) {
    return null;
  }

  async function handleSendCode(e?: FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setInfoMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Informe um endereço de e-mail válido.');
      return;
    }

    setIsLoading(true);
    try {
      await api.post<{ success: boolean; message: string }>('/api/users/me/email-verification/send', {
        email: cleanEmail,
        name: name.trim() || user?.name,
      });
      setCodeSent(true);
      setSentToEmail(cleanEmail);
      setCode('');
      setInfoMsg(`Enviamos um código de 6 dígitos para ${cleanEmail}. Verifique sua caixa de entrada ou spam.`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Erro ao enviar código de validação. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    const cleanEmail = (sentToEmail || email).trim().toLowerCase();
    const cleanCode = code.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setError('Digite o código numérico de 6 dígitos enviado para o e-mail.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post<{ success: boolean; user: User }>('/api/users/me/email-verification/verify', {
        email: cleanEmail,
        code: cleanCode,
        phone: phone.trim(),
        name: name.trim() || user?.name,
      });

      setIsSuccess(true);
      setTimeout(() => {
        if (res.user) {
          updateUserState(res.user);
        } else {
          updateUserState({
            email: cleanEmail,
            phone: phone.trim(),
            needs_email: false,
            email_bounced: false,
            email_bounce_reason: null,
          });
        }
      }, 1100);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Erro ao validar código. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmitDirect(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Informe um endereço de e-mail válido.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.put<{ success: boolean; user: User }>('/api/users/me/profile', {
        email: cleanEmail,
        phone: phone.trim(),
        name: name.trim() || user?.name,
      });

      setIsSuccess(true);
      setTimeout(() => {
        if (res.user) {
          updateUserState(res.user);
        } else {
          updateUserState({
            email: cleanEmail,
            phone: phone.trim(),
            needs_email: false,
            email_bounced: false,
            email_bounce_reason: null,
          });
        }
      }, 1000);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Erro ao salvar informações. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-[28px] p-[1px] bg-gradient-to-b from-white/[0.14] via-white/[0.04] to-white/[0.02] border border-white/[0.08] shadow-[0_24px_60px_rgba(0,0,0,0.9)]">
        <div className="rounded-[27px] bg-[#090C13]/98 border border-white/[0.05] p-6 sm:p-7 relative">
          <div className="absolute top-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        {isSuccess ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white">E-mail Validado e Liberado</h2>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              O endereço <span className="text-white font-medium">{sentToEmail || email}</span> foi confirmado no Gestão Rede Externa e receberá os avisos e alertas importantes do portal.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                {isBounced && (
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center text-amber-300 shrink-0">
                    <MailWarning className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {isBounced ? 'Valide seu E-mail de Contato' : 'Atualização Cadastral'}
                  </h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {isBounced
                      ? 'Não estamos conseguindo entregar e-mails importantes no endereço atual.'
                      : 'Informe um e-mail válido para continuar no sistema.'}
                  </p>
                </div>
              </div>
            </div>

            {isBounced && (
              <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-400/35 text-amber-100 text-xs leading-relaxed flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-200 mb-1">
                    Falha de entrega para: {user.email}
                  </p>
                  <p className="text-amber-100/85">
                    Confirme um e-mail válido (pode ser o mesmo caso já tenha sido regularizado ou um novo). Enviaremos um código de 6 dígitos para validar que o endereço recebe mensagens antes de liberar o acesso.
                  </p>
                </div>
              </div>
            )}

            {infoMsg && (
              <div className="mb-4 p-3 rounded-xl bg-sky-500/10 border border-sky-400/30 text-sky-200 text-xs flex items-start gap-2">
                <MailCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>{infoMsg}</span>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
                {error}
              </div>
            )}

            {isBounced ? (
              codeSent ? (
                <form onSubmit={handleVerifyCode}>
                  <Field label="E-mail em Validação">
                    <Input type="email" value={sentToEmail} disabled className="opacity-75" />
                  </Field>

                  <Field label="Código de 6 Dígitos">
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      autoFocus
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="text-center tracking-[0.4em] font-mono text-base"
                    />
                  </Field>

                  <div className="pt-2 space-y-2.5">
                    <Button
                      type="submit"
                      disabled={isLoading || code.trim().length !== 6}
                      className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 rounded-xl"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Validando...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4" />
                          <span>Validar Código e Liberar</span>
                        </>
                      )}
                    </Button>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleSendCode()}
                        disabled={isLoading}
                        className="inline-flex items-center gap-1.5 text-sky-300 hover:text-sky-200 transition disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reenviar código
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCodeSent(false);
                          setCode('');
                          setError(null);
                          setInfoMsg(null);
                        }}
                        disabled={isLoading}
                        className="text-[var(--color-text-muted)] hover:text-white transition"
                      >
                        Alterar e-mail
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleSendCode}>
                  <Field label="E-mail Válido (mesmo ou novo)">
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="usuario@claro.com.br"
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Nome Completo">
                      <Input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Nome completo"
                      />
                    </Field>

                    <Field label="Telefone">
                      <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(21) 99999-9999"
                      />
                    </Field>
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={isLoading || !email.trim()}
                      className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 rounded-xl"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Enviando código...</span>
                        </>
                      ) : (
                        <span>Enviar Código de Validação</span>
                      )}
                    </Button>
                  </div>
                </form>
              )
            ) : (
              <form onSubmit={handleSubmitDirect}>
                <Field label="E-mail">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@claro.com.br"
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Nome Completo">
                    <Input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nome completo"
                    />
                  </Field>

                  <Field label="Telefone">
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(21) 99999-9999"
                    />
                  </Field>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 rounded-xl"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <span>Salvar e Continuar</span>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
