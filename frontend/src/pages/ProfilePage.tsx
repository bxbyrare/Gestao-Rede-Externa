import { useState, useEffect, type FormEvent } from 'react';
import { CheckCircle2, AlertTriangle, Save, Loader2 } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';

export default function ProfilePage() {
  const { user, updateUserState, refreshUser } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  const missing = user?.missing_fields || [];

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && (!cleanEmail.includes('@') || !cleanEmail.includes('.'))) {
      setFeedback({ type: 'error', message: 'Informe um endereço de e-mail válido.' });
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        setFeedback({ type: 'error', message: 'A nova senha deve possuir no mínimo 6 caracteres.' });
        return;
      }
      if (newPassword !== confirmPassword) {
        setFeedback({ type: 'error', message: 'A confirmação de senha não confere.' });
        return;
      }
      if (!currentPassword) {
        setFeedback({ type: 'error', message: 'Informe sua senha atual para alterar a senha.' });
        return;
      }
    }

    setIsLoading(true);
    try {
      const res = await api.put<{ success: boolean; user: User }>('/api/users/me/profile', {
        name: name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        current_password: currentPassword || undefined,
        new_password: newPassword || undefined,
      });

      if (res.user) {
        updateUserState(res.user);
      } else {
        await refreshUser();
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setFeedback({
        type: 'success',
        message: 'Dados atualizados com sucesso.',
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setFeedback({ type: 'error', message: err.message });
      } else {
        setFeedback({ type: 'error', message: 'Erro ao salvar alterações.' });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <PageHeader
        title="Meu Perfil"
        subtitle="Dados cadastrais e credenciais de acesso"
      />

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-white text-lg font-bold shrink-0">
              {(user?.name || user?.username || 'U').charAt(0).toUpperCase()}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-white">
                  {user?.name || user?.username}
                </h2>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[var(--color-text-muted)]">
                  {user?.role || 'Colaborador'}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                <span className="mono">@{user?.username}</span>
                {user?.company ? ` • ${user.company}` : ''}
              </p>
            </div>
          </div>

          {missing.length > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Campos pendentes: {missing.join(', ')}</span>
            </div>
          )}
        </div>
      </Card>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-3 border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
              : 'bg-red-500/10 border-red-500/25 text-red-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          )}
          <span className="flex-1">{feedback.message}</span>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] pb-4 mb-5 border-b border-white/5">
              Dados Pessoais e Contato
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              <Field label="Nome Completo">
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome completo"
                />
              </Field>

              <Field label="Usuário">
                <Input
                  type="text"
                  disabled
                  value={user?.username || ''}
                  className="opacity-60 cursor-not-allowed mono"
                />
              </Field>

              <Field label="E-mail">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@claro.com.br"
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

              <Field label="Empresa">
                <Input
                  type="text"
                  disabled
                  value={user?.company || 'Claro'}
                  className="opacity-60 cursor-not-allowed"
                />
              </Field>

              <Field label="Cargo">
                <Input
                  type="text"
                  disabled
                  value={user?.role || 'Técnico'}
                  className="opacity-60 cursor-not-allowed"
                />
              </Field>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] pb-4 mb-5 border-b border-white/5">
              Alterar Senha
            </h3>

            <div>
              <Field label="Senha Atual">
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>

              <Field label="Nova Senha">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </Field>

              <Field label="Confirmar Nova Senha">
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="flex items-center justify-end">
          <Button
            type="submit"
            disabled={isLoading}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 rounded-xl px-6"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
