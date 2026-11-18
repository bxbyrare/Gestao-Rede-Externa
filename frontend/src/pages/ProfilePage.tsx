import { useState, useEffect, type FormEvent } from 'react';
import { CheckCircle2, AlertTriangle, Save, Loader2, Smartphone, RefreshCw, Moon, Sun } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';
import { formatPersonName } from '../utils/formatName';

export default function ProfilePage() {
  const { user, updateUserState, refreshUser } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [themePref, setThemePref] = useState<'dark' | 'light'>('dark');
  const [isSavingTheme, setIsSavingTheme] = useState(false);

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
      const storedTheme = localStorage.getItem(`claro_theme_user_${user.id}`);
      const resolved = user.theme_preference || (storedTheme === 'light' ? 'light' : 'dark');
      setThemePref(resolved);
    }
  }, [user]);

  const missing = user?.missing_fields || [];

  async function handleSelectTheme(nextTheme: 'dark' | 'light') {
    setThemePref(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    const metaScheme = document.querySelector('meta[name="color-scheme"]');
    if (metaScheme) metaScheme.setAttribute('content', nextTheme);
    if (user?.id) {
      try {
        localStorage.setItem(`claro_theme_user_${user.id}`, nextTheme);
      } catch {
        // ignore storage errors
      }
    }
    updateUserState({ theme_preference: nextTheme });
    setIsSavingTheme(true);
    try {
      await api.put('/api/users/me/profile', { theme_preference: nextTheme });
    } catch {
      // localStorage fallback already set
    } finally {
      setIsSavingTheme(false);
    }
  }

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
        theme_preference: themePref,
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
        subtitle="Dados cadastrais, aparência e credenciais de acesso"
      />

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-white text-lg font-bold shrink-0">
              {(formatPersonName(user?.name || user?.username) || 'U').charAt(0).toUpperCase()}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-white">
                  {formatPersonName(user?.name || user?.username) || 'Usuário'}
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

      {/* Card Aparência do Sistema (Tema por Usuário) */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-white/5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Aparência do Sistema (Por Usuário)
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Escolha o tema visual da sua conta. O padrão predefinido do sistema é o tema Escuro (Preto).
            </p>
          </div>
          {isSavingTheme && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Salvando preferência...
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => handleSelectTheme('dark')}
            aria-pressed={themePref === 'dark'}
            className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-4 cursor-pointer ${
              themePref === 'dark'
                ? 'bg-white/[0.06] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/40 shadow-lg'
                : 'bg-white/[0.02] border-white/10 hover:border-white/25'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-[#030305] border border-white/15 flex items-center justify-center text-white shrink-0 shadow-inner">
                <Moon className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">Escuro (Preto)</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                    Padrão
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Visual Studio Black com fundo escuro de alto contraste.
                </p>
              </div>
            </div>
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                themePref === 'dark'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                  : 'border-white/25'
              }`}
            >
              {themePref === 'dark' && <CheckCircle2 className="w-3.5 h-3.5" />}
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTheme('light')}
            aria-pressed={themePref === 'light'}
            className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-4 cursor-pointer ${
              themePref === 'light'
                ? 'bg-white/[0.06] border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/40 shadow-lg'
                : 'bg-white/[0.02] border-white/10 hover:border-white/25'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-amber-500 shrink-0 shadow-inner">
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">Claro (Branco)</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Fundo claro para leitura sob luz intensa ou preferência pessoal.
                </p>
              </div>
            </div>
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                themePref === 'light'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                  : 'border-white/25'
              }`}
            >
              {themePref === 'light' && <CheckCircle2 className="w-3.5 h-3.5" />}
            </div>
          </button>
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

      {/* Card 2FA - Aplicativo Autenticador */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Aplicativo Autenticador (2FA)
                {user?.totp_enabled ? (
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Ativo & Vinculado
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Pendente
                  </span>
                )}
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Proteção por código de 6 dígitos (Google Authenticator / Microsoft Authenticator) com renovação a cada 12 horas.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.02] p-4 rounded-xl border border-white/5">
          <div className="text-xs text-[var(--color-text-muted)] space-y-1">
            <p>
              <strong className="text-white">Status da Sessão:</strong> {user?.totp_verified ? 'Autorizada (12 Horas)' : 'Pendente de validação'}
            </p>
            <p className="text-[11px] text-white/40">
              Se trocou de celular ou perdeu o app, você pode reconfigurar o autenticador a qualquer momento.
            </p>
          </div>

          <Button
            type="button"
            onClick={async () => {
              const pwd = prompt("Para sua segurança, digite sua senha de acesso para confirmar a reconfiguração do autenticador:");
              if (pwd === null) return;
              if (!pwd.trim()) {
                alert("A senha de acesso é obrigatória para redefinir o autenticador.");
                return;
              }
              try {
                await api.post('/api/auth/totp/reconfigure', { password: pwd.trim() });
                updateUserState({ totp_enabled: false, totp_verified: false, requires_totp_setup: true });
              } catch (err) {
                alert("Erro ao redefinir autenticador.");
              }
            }}
            className="bg-white/5 hover:bg-white/10 text-white border border-white/15 text-xs font-semibold py-2 px-4 rounded-xl shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Recadastrar Meu Autenticador
          </Button>
        </div>
      </Card>
    </div>
  );
}
