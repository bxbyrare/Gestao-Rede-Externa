import { useState, type FormEvent } from 'react';
import { Mail, ShieldAlert, Phone, User as UserIcon, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';

export default function MandatoryEmailModal() {
  const { user, updateUserState } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [name, setName] = useState(user?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Only display if user is logged in and needs email
  if (!user || !user.needs_email) {
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Por favor, informe um endereço de e-mail válido (exemplo: usuario@claro.com.br).');
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
      }, 1200);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Ocorreu um erro ao salvar suas informações. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#0E131F]/95 border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Top Glow Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-500" />

        <div className="p-6 sm:p-8">
          {isSuccess ? (
            <div className="py-8 text-center space-y-4 animate-scale-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h2 className="text-xl font-extrabold text-white">E-mail Cadastrado com Sucesso!</h2>
              <p className="text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
                Um e-mail executivo de confirmação foi disparado via <span className="font-semibold text-rose-400">Resend</span> para <span className="font-semibold text-white">{email}</span>.
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400 pt-2">
                <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                <span>Liberando acesso ao sistema...</span>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 uppercase tracking-wider mb-1.5">
                    Etapa Obrigatória de Segurança
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    Vincule seu E-mail de Acesso
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Para garantir a conformidade operacional, segurança dos dados e permitir a recuperação de acesso, todos os usuários devem ter um e-mail válido.
                  </p>
                </div>
              </div>

              {error && (
                <div className="mb-5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <span className="font-bold">•</span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    E-mail Corporativo ou Pessoal <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="exemplo: seu.nome@claro.com.br"
                      className="w-full bg-[#141A28] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/40 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Usado para notificações de escala, avisos operacionais e reset de senha.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Nome Completo
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Seu nome"
                        className="w-full bg-[#141A28] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Telefone / WhatsApp
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(21) 99999-9999"
                        className="w-full bg-[#141A28] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-red-600 via-rose-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(225,29,72,0.35)] flex items-center justify-center gap-2 transition-all"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Validando e enviando confirmação...</span>
                      </>
                    ) : (
                      <>
                        <span>Salvar E-mail e Liberar Acesso</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-center text-slate-400 mt-2.5">
                    Um e-mail de boas-vindas com modelo oficial Claro será enviado instantaneamente.
                  </p>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
