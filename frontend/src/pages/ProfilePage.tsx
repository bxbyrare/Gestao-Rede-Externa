import { useState, useEffect, type FormEvent } from 'react';
import {
  User as UserIcon, Mail, Phone, Lock, Building2,
  CheckCircle2, AlertTriangle, Save, Loader2, Sparkles, Send,
  Shield, KeyRound
} from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';

export default function ProfilePage() {
  const { user, updateUserState, refreshUser } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  // Calculate completeness score
  const missing = user?.missing_fields || [];
  const totalFields = 4; // Name, Email, Phone, Company
  const filledFields = totalFields - missing.length;
  const completenessPercent = Math.max(25, Math.round((filledFields / totalFields) * 100));

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && (!cleanEmail.includes('@') || !cleanEmail.includes('.'))) {
      setFeedback({ type: 'error', message: 'Por favor, informe um endereço de e-mail válido.' });
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        setFeedback({ type: 'error', message: 'A nova senha deve possuir no mínimo 6 caracteres.' });
        return;
      }
      if (newPassword !== confirmPassword) {
        setFeedback({ type: 'error', message: 'A confirmação de senha não confere com a nova senha digitada.' });
        return;
      }
      if (!currentPassword) {
        setFeedback({ type: 'error', message: 'Informe sua senha atual para autorizar a troca de senha.' });
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
        message: 'Informações do perfil atualizadas com sucesso! As alterações foram sincronizadas.',
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setFeedback({ type: 'error', message: err.message });
      } else {
        setFeedback({ type: 'error', message: 'Erro ao salvar alterações do perfil.' });
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSendTestEmail() {
    if (!email || !email.includes('@')) {
      setFeedback({ type: 'error', message: 'Cadastre e salve um e-mail válido antes de enviar o teste.' });
      return;
    }
    setIsSendingTest(true);
    setFeedback(null);
    try {
      // Re-trigger email update/welcome notification
      await api.put('/api/users/me/profile', {
        name: name.trim() || user?.name,
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
      });
      setFeedback({
        type: 'success',
        message: `E-mail de verificação executivo enviado via Resend para ${email}. Verifique sua caixa de entrada e spam.`,
      });
    } catch {
      setFeedback({ type: 'error', message: 'Não foi possível disparar o e-mail de teste no momento.' });
    } finally {
      setIsSendingTest(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-fade-in">
      {/* Page Title & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-400 mb-1">
            <Shield className="w-3.5 h-3.5" />
            <span>Segurança & Identidade</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Meu Perfil Operacional
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gerencie suas informações de contato, credenciais e e-mail de notificações.
          </p>
        </div>

        {/* Resend Test Action */}
        {email && (
          <button
            type="button"
            onClick={handleSendTestEmail}
            disabled={isSendingTest}
            className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/10 transition-all shadow-sm disabled:opacity-50"
            title="Dispara um e-mail executivo de teste via Resend"
          >
            {isSendingTest ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
            ) : (
              <Send className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>Testar Envio via Resend</span>
          </button>
        )}
      </div>

      {/* Profile Completeness Alert / Progress Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#121826] via-[#0E131F] to-[#0A0D15] border border-white/10 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500/20 to-red-600/30 border border-rose-500/30 flex items-center justify-center text-rose-400 text-2xl font-black shadow-[0_0_30px_rgba(244,63,94,0.25)]">
                {(user?.name || user?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#0E131F] flex items-center justify-center text-white" title="Conta Ativa">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  {user?.name || user?.username}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.08] text-slate-300 border border-white/10 uppercase tracking-wider">
                  {user?.role || 'Colaborador'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Usuário: <span className="text-slate-300 font-mono font-medium">@{user?.username}</span> • Empresa: <span className="text-white font-semibold">{user?.company || 'Claro Brasil'}</span>
              </p>
            </div>
          </div>

          {/* Completeness Bar */}
          <div className="md:w-72 bg-black/40 border border-white/5 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-400 font-medium">Preenchimento Cadastral</span>
              <span className={`font-bold ${completenessPercent === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {completenessPercent}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  completenessPercent === 100
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-r from-amber-500 to-rose-500'
                }`}
                style={{ width: `${completenessPercent}%` }}
              />
            </div>
            {missing.length > 0 ? (
              <p className="text-[11px] text-amber-300/90 mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>Pendências: {missing.join(', ')}</span>
              </p>
            ) : (
              <p className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Perfil 100% completo e validado.</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-3 animate-fade-in border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
          )}
          <span className="flex-1">{feedback.message}</span>
        </div>
      )}

      {/* Profile Form */}
      <form onSubmit={handleSaveProfile} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card 1: Dados Pessoais & Contato */}
          <div className="lg:col-span-2 rounded-2xl bg-[#0E131F]/90 border border-white/10 p-6 space-y-5 shadow-lg">
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/5">
              <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/25 flex items-center justify-center">
                <UserIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Dados Pessoais & Contato</h3>
                <p className="text-[11px] text-slate-400">Informações sincronizadas com o banco operacional</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nome Completo
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full bg-[#141A28] border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nome de Usuário (Login)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    disabled
                    value={user?.username || ''}
                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-400 cursor-not-allowed select-none font-mono"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">Gerenciado pela Coordenação</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  E-mail Oficial (Notificações & Alertas) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-rose-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@claro.com.br"
                    className="w-full bg-[#141A28] border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Transações e avisos oficiais são enviados via <span className="text-rose-400 font-medium">Resend</span>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Telefone / WhatsApp
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(21) 98765-4321"
                    className="w-full bg-[#141A28] border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Contato operacional para confirmações rápidas.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Empresa Vinculada
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    disabled
                    value={user?.company || 'Claro Brasil'}
                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-400 cursor-not-allowed select-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Cargo / Nível de Acesso
                </label>
                <div className="relative">
                  <Shield className="w-4 h-4 text-slate-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    disabled
                    value={user?.role || 'Técnico'}
                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-400 cursor-not-allowed select-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Alteração de Senha */}
          <div className="rounded-2xl bg-[#0E131F]/90 border border-white/10 p-6 space-y-4 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 pb-4 border-b border-white/5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Segurança de Senha</h3>
                  <p className="text-[11px] text-slate-400">Opcional - deixe em branco caso não vá alterar</p>
                </div>
              </div>

              <div className="space-y-3.5 pt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Senha Atual
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#141A28] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nova Senha
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-[#141A28] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Confirmar Nova Senha
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full bg-[#141A28] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Utilize combinações seguras para proteção da sua conta.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-red-600 via-rose-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-50 shadow-[0_0_25px_rgba(225,29,72,0.35)] transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando Alterações...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Informações do Perfil</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
