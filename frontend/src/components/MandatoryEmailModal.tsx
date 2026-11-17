import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MailWarning } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';
import { Button, Field, Input } from './ui';

export default function MandatoryEmailModal() {
  const { user, updateUserState } = useAuth();
  const isBounced = Boolean(user?.email_bounced);
  const currentEmailClean = (user?.email || '').trim().toLowerCase();

  const [email, setEmail] = useState(isBounced ? '' : (user?.email || ''));
  const [phone, setPhone] = useState(user?.phone || '');
  const [name, setName] = useState(user?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email_bounced ? '' : (user.email || ''));
    setPhone(user.phone || '');
    setName(user.name || '');
    setError(null);
    setIsSuccess(false);
  }, [user?.id, user?.email_bounced, user?.needs_email]);

  if (!user || (!user.needs_email && !user.email_bounced)) {
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Informe um endereço de e-mail válido.');
      return;
    }

    if (isBounced && currentEmailClean && cleanEmail === currentEmailClean) {
      setError('O e-mail anterior falhou na entrega. Informe um novo endereço de e-mail diferente.');
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
      }, 1100);
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
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="glass relative w-full max-w-md rounded-2xl p-6 sm:p-7 shadow-2xl">
        {isSuccess ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white">Novo E-mail Cadastrado</h2>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              O endereço <span className="text-white font-medium">{email}</span> foi cadastrado no Gestão Rede Externa e receberá os avisos e alertas importantes do portal.
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
                    {isBounced ? 'Atualize seu E-mail de Contato' : 'Atualização Cadastral'}
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
                    Não estamos conseguindo enviar e-mails importantes para este endereço. Por favor, cadastre um novo e-mail válido para continuar recebendo avisos e alertas do Gestão Rede Externa.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <Field label={isBounced ? 'Novo E-mail Válido' : 'E-mail'}>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="novo.email@claro.com.br"
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
          </>
        )}
      </div>
    </div>
  );
}
