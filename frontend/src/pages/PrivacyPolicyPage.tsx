import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Cloud, Cookie, Database, Lock, Mail, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { openPrivacyPreferencesModal } from '../components/PrivacyCookieBanner';

export default function PrivacyPolicyPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const target = document.querySelector(hash);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [hash]);

  return (
    <div className="min-h-screen bg-[#070A10] text-slate-200 selection:bg-[#e20613]/30">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070A10]/85 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 text-white font-bold tracking-tight">
            <img src="/claro-icon.png" alt="Claro" className="w-7 h-7 rounded-lg object-contain" />
            <span>Claro · Gestão Rede Externa</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao início
            </Link>
            <Link
              to="/login"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#e20613] hover:bg-[#c80510] text-white transition"
            >
              Entrar no sistema
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-10">
        <div className="space-y-3 border-b border-white/10 pb-8">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#e20613]/15 border border-[#e20613]/35 text-red-300">
            <ShieldCheck className="w-3.5 h-3.5" />
            Transparência & LGPD
          </span>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Política de Privacidade e Uso de Dados
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
            Esta política explica como o portal <strong className="text-slate-200">Claro · Gestão Rede Externa</strong> coleta, utiliza, armazena na nuvem e protege os dados operacionais e cadastrais de equipes de campo, supervisores e coordenadores.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-[#e20613]" />
            1. Dados Tratados no Portal
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-1.5">
              <h3 className="text-sm font-bold text-white">Acesso, Segurança e Auditoria</h3>
              <p>
                Credenciais de login, perfil de permissão (RBAC), autenticação em dois fatores (TOTP), endereço IP de acesso, registro de alterações e alertas de segurança.
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-1.5">
              <h3 className="text-sm font-bold text-white">Cadastro Operacional e Campo</h3>
              <p>
                Nome, CPF, RG, telefone, e-mail corporativo/pessoal, matrícula Claro/TOA, empresa parceira, validades de NRs/ASO, EPIs, veículos, escalas, rotas e chamados (RAL/REC/QUA).
              </p>
            </div>
          </div>
        </section>

        <section id="tecnologias" className="scroll-mt-24 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Cookie className="w-5 h-5 text-[#e20613]" />
              2. Tecnologias, Cookies e Armazenamento Local
            </h2>
            <button
              type="button"
              onClick={openPrivacyPreferencesModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 transition cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Gerenciar preferências
            </button>
          </div>

          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white">Cookies e Armazenamento Essenciais</h3>
                <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Sempre ativos
                </span>
              </div>
              <p>
                Utilizados para garantir o funcionamento técnico adequado da plataforma, manutenção segura da sessão autenticada, validação 2FA, proteção contra acessos automatizados e preferências operacionais locais (como filtros de áreas no painel Grafana). Não podem ser desativados pois são indispensáveis para a operação.
              </p>
            </div>

            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white">Métricas Próprias e Desempenho</h3>
                <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  Opcional · Consentimento
                </span>
              </div>
              <p>
                Ficam desativadas por padrão até que você clique em <strong>Aceitar métricas</strong>. Quando autorizadas, auxiliam a entender o uso das páginas e otimizar a velocidade do sistema. Caso recuse ou desative posteriormente, o acesso ao portal continua integralmente liberado.
              </p>
              <p className="text-slate-400">
                Sua escolha no painel de privacidade permanece válida por <strong>180 dias</strong> neste navegador e pode ser alterada a qualquer momento pelo botão acima ou pelo rodapé.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-[#e20613]" />
            3. Armazenamento em Nuvem e Segurança
          </h2>
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 text-xs text-slate-300 leading-relaxed space-y-2">
            <p className="flex items-center gap-2 text-white font-semibold">
              <Lock className="w-4 h-4 text-emerald-400" />
              Proteção ponta a ponta para operação de campo e gestão
            </p>
            <p>
              Todas as informações operacionais são armazenadas em banco de dados PostgreSQL em nuvem com conexões criptografadas (SSL/TLS), controle de acesso por perfil, proteção contra tentativas abusivas de login, verificação em duas etapas (TOTP) e trilha de auditoria.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-[#e20613]" />
            4. Comunicações e Atualização Cadastral
          </h2>
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 text-xs text-slate-300 leading-relaxed">
            O portal envia notificações por e-mail sobre segurança de conta, atualização cadastral, pendências de documentos/NRs e alertas operacionais. Caso um endereço apresente falha de entrega, o sistema solicita validação por código de 6 dígitos para garantir que avisos críticos cheguem corretamente.
          </div>
        </section>
      </main>
    </div>
  );
}
