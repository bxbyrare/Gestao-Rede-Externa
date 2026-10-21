import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';
import { Button, Field, Input } from './ui';

export default function MandatoryEmailModal() {
  const { user, updateUserState } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [name, setName] = useState(user?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!user || !user.needs_email) {
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
          });
        }
      }, 900);
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
            <h2 className="text-lg font-bold text-white">E-mail Cadastrado</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              E-mail <span className="text-white font-medium">{email}</span> vinculado ao seu perfil.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 pb-4 border-b border-white/5">
              <h2 className="text-lg font-bold text-white tracking-tight">
                Atualização Cadastral
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Informe um e-mail válido para continuar no sistema.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
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
          </>
        )}
      </div>
    </div>
  );
}
