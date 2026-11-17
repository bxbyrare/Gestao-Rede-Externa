import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Cloud,
  Compass,
  Cookie,
  FileCheck2,
  Lock,
  Radio,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { openPrivacyPreferencesModal } from '../components/PrivacyCookieBanner';

export default function LandingPage() {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);

  return (
    <div className="min-h-screen bg-[#070A10] text-slate-200 selection:bg-[#e20613]/30 flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070A10]/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 text-white font-bold tracking-tight shrink-0">
            <img src="/claro-icon.png" alt="Claro" className="w-8 h-8 rounded-lg object-contain" />
            <div className="leading-tight">
              <span className="block text-sm font-extrabold">Claro</span>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Gestão Rede Externa
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
            <a href="#empresa" className="hover:text-white transition">
              Sobre a Claro
            </a>
            <a href="#solucoes" className="hover:text-white transition">
              Campo &amp; Gestão
            </a>
            <a href="#seguranca" className="hover:text-white transition">
              Segurança na Nuvem
            </a>
            <Link to="/privacidade" className="hover:text-white transition">
              Política de Privacidade
            </Link>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              to={isAuthenticated ? '/grafana' : '/login'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#e20613] hover:bg-[#c80510] text-white transition shadow-lg shadow-[#e20613]/25"
            >
              <span>{isAuthenticated ? 'Acessar Painel' : 'Entrar no sistema'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(226,6,19,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(56,189,248,0.12),_transparent_55%)]"
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
              <Radio className="w-3.5 h-3.5 text-[#e20613]" />
              Portal Operacional · Rede Externa Claro
            </span>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.1]">
              Menos improviso.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-red-400">
                Mais controle da rede externa.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
              O <strong className="text-white">Portal Gestão Rede Externa</strong> conecta as equipes de campo e a coordenação da Claro em um único ambiente seguro na nuvem — reunindo monitoramento de chamados (RAL, REC e Qualidade), escalas, frota, rotas, documentação e auditorias com agilidade.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                to={isAuthenticated ? '/grafana' : '/login'}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-[#e20613] hover:bg-[#c80510] text-white transition shadow-xl shadow-[#e20613]/25"
              >
                <span>{isAuthenticated ? 'Ir para o Painel Grafana' : 'Entrar no sistema'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#solucoes"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 transition"
              >
                Conhecer módulos
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 text-xs text-slate-300 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Acesso certo para cada perfil
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Alertas e SLAs em tempo real
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Dados protegidos na nuvem
              </span>
            </div>
          </div>

          {/* Right Operational Summary Card */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl bg-[#0D1320]/90 border border-white/15 p-6 shadow-2xl space-y-5 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#e20613]">
                    Ecossistema Integrado
                  </p>
                  <h2 className="text-base font-bold text-white mt-0.5">
                    Operação de Ponta a Ponta
                  </h2>
                </div>
                <Cloud className="w-6 h-6 text-sky-400" />
              </div>

              <div className="space-y-3 text-xs">
                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3.5 flex items-start gap-3">
                  <Activity className="w-4 h-4 text-[#e20613] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-white">Painel Grafana · COP REDE</p>
                    <p className="text-slate-400 mt-0.5">
                      Acompanhamento de filas RAL, REC e Qualidade por CF/Regional com alertas automáticos de SLA e contingência manual.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3.5 flex items-start gap-3">
                  <Wrench className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-white">Equipes de Campo &amp; Frota</p>
                    <p className="text-slate-400 mt-0.5">
                      Escalas, rotas, controle de veículos, validade de NRs/ASO, EPIs e busca rápida centralizada.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3.5 flex items-start gap-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-white">Segurança &amp; Nuvem</p>
                    <p className="text-slate-400 mt-0.5">
                      Autenticação em 2 fatores (TOTP), permissões granulares, criptografia SSL e histórico completo de auditoria.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sobre a Claro */}
      <section id="empresa" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-8">
        <div className="max-w-3xl space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#e20613]">
            Sobre a Claro
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Conectividade de alta disponibilidade sustentada por uma rede externa eficiente
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            A Claro atua como referência nacional em telecomunicações, conectando milhões de clientes residenciais e corporativos por meio de infraestrutura de fibra óptica e rede externa de alta capacidade. Para manter a qualidade e o tempo de resposta em campo no Espírito Santo, Interior e Capital do Rio de Janeiro, o <strong className="text-white">Gestão Rede Externa</strong> centraliza processos, padroniza informações e acelera a tomada de decisão entre campo e coordenação.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-2">
            <Compass className="w-5 h-5 text-[#e20613]" />
            <h3 className="text-sm font-bold text-white">Cobertura Regional Estruturada</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Visão segmentada por Regionais e CFs (ES, Interior e Capital), permitindo atuação direcionada onde a demanda é mais crítica.
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-2">
            <BarChart3 className="w-5 h-5 text-sky-400" />
            <h3 className="text-sm font-bold text-white">Foco em SLA e Qualidade</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Monitoramento contínuo de prazos (RAL 6h e REC 4h), tratativas registradas e histórico de chamados sanados para melhoria contínua.
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-2">
            <FileCheck2 className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Conformidade e Padronização</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Controle preventivo de certificações (NR-06, NR-10, NR-35, ASO), auditorias em campo e aceitação técnica documentada.
            </p>
          </div>
        </div>
      </section>

      {/* Como o Portal Auxilia Campo e Gestão */}
      <section id="solucoes" className="border-y border-white/10 bg-white/[0.015]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-8">
          <div className="max-w-2xl space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#e20613]">
              Soluções do Portal
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Como o Gestão Rede Externa auxilia no dia a dia
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Equipes de Campo */}
            <div className="rounded-2xl bg-[#0D1320]/80 border border-white/10 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Para Equipes de Campo</h3>
                  <p className="text-xs text-slate-400">Mais clareza e menos ruído na execução</p>
                </div>
              </div>
              <ul className="space-y-2.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>Consulta rápida de escalas, rotas e contatos operacionais em um só lugar.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>Buscador ágil para localizar informações de infraestrutura e registros de campo.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>Avisos automáticos sobre vencimento de NRs, ASO e pendências cadastrais.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>Formulários digitais e registro organizado de ocorrências e pós-evento.</span>
                </li>
              </ul>
            </div>

            {/* Gestão e Coordenação */}
            <div className="rounded-2xl bg-[#0D1320]/80 border border-white/10 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e20613]/15 border border-[#e20613]/35 flex items-center justify-center text-[#e20613]">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Para Gestão &amp; Coordenação</h3>
                  <p className="text-xs text-slate-400">Visibilidade completa e controle operacional</p>
                </div>
              </div>
              <ul className="space-y-2.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#e20613] shrink-0 mt-0.5" />
                  <span>Painel Grafana ao vivo com filas RAL, REC e Qualidade, filtros por CF e histórico de sanadas.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#e20613] shrink-0 mt-0.5" />
                  <span>Gestão centralizada de colaboradores, parceiras, frota de veículos e avaliações.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#e20613] shrink-0 mt-0.5" />
                  <span>Fluxos de auditoria, aceitação técnica, projetos e indicadores gerenciais.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#e20613] shrink-0 mt-0.5" />
                  <span>Notificações e alertas automatizados por e-mail com validação de entregabilidade.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Segurança na Nuvem */}
      <section id="seguranca" className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-3xl bg-gradient-to-br from-[#0E1628] to-[#0A0E18] border border-white/15 p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-300">
              <Lock className="w-3.5 h-3.5" />
              Segurança &amp; Infraestrutura em Nuvem
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Informações seguras na nuvem com controle granular de acesso
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Todos os registros operacionais e cadastrais permanecem armazenados em banco de dados PostgreSQL em nuvem com criptografia em trânsito (SSL/TLS), evitando planilhas dispersas e perda de histórico.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs text-slate-200">
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5">
                <strong className="block text-white mb-0.5">Autenticação 2FA (TOTP)</strong>
                <span className="text-slate-400">Verificação em duas etapas por aplicativo autenticador para proteger contas.</span>
              </div>
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5">
                <strong className="block text-white mb-0.5">Permissões por Perfil (RBAC)</strong>
                <span className="text-slate-400">Cada usuário visualiza e edita apenas os módulos autorizados ao seu cargo.</span>
              </div>
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5">
                <strong className="block text-white mb-0.5">Trilha de Auditoria &amp; Alertas</strong>
                <span className="text-slate-400">Registro de ações críticas e alertas automáticos de novos acessos.</span>
              </div>
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5">
                <strong className="block text-white mb-0.5">Conformidade LGPD</strong>
                <span className="text-slate-400">Transparência no uso de dados e controle de preferências de privacidade.</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col items-start lg:items-end justify-center gap-4">
            <div className="w-full rounded-2xl bg-black/35 border border-white/10 p-6 space-y-3">
              <p className="text-xs font-semibold text-slate-300">
                Pronto para acessar o ambiente operacional?
              </p>
              <Link
                to={isAuthenticated ? '/grafana' : '/login'}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-[#e20613] hover:bg-[#c80510] text-white transition shadow-lg shadow-[#e20613]/25"
              >
                <span>{isAuthenticated ? 'Abrir Painel' : 'Entrar no sistema'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/privacidade"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition"
              >
                Ler Política de Privacidade
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/10 bg-[#05080D]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <img src="/claro-icon.png" alt="Claro" className="w-5 h-5 rounded object-contain" />
            <span>© {new Date().getFullYear()} Claro · Portal Gestão Rede Externa</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Link to="/privacidade" className="hover:text-white transition">
              Política de Privacidade
            </Link>
            <Link to="/privacidade#tecnologias" className="hover:text-white transition">
              Cookies &amp; Tecnologias
            </Link>
            <button
              type="button"
              onClick={openPrivacyPreferencesModal}
              className="inline-flex items-center gap-1.5 hover:text-white transition cursor-pointer"
            >
              <Cookie className="w-3.5 h-3.5" />
              Preferências de cookies
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
