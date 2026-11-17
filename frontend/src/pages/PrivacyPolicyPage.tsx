import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { readPrivacyConsent, savePrivacyConsent } from '../components/PrivacyCookieBanner';
import GsapSecurityBackground from '../components/GsapSecurityBackground';

const SECTIONS = [
  { id: 'dados', num: '01', label: 'Dados tratados' },
  { id: 'tecnologias', num: '02', label: 'Tecnologias e cookies' },
  { id: 'nuvem', num: '03', label: 'Armazenamento em nuvem' },
  { id: 'comunicacoes', num: '04', label: 'Comunicações por e-mail' },
  { id: 'preferencias', num: '05', label: 'Suas preferências' },
];

export default function PrivacyPolicyPage() {
  const { hash } = useLocation();
  const [metricsActive, setMetricsActive] = useState<boolean>(() => Boolean(readPrivacyConsent()?.metrics));

  useEffect(() => {
    const syncState = () => setMetricsActive(Boolean(readPrivacyConsent()?.metrics));
    window.addEventListener('privacy-consent-changed', syncState);
    return () => window.removeEventListener('privacy-consent-changed', syncState);
  }, []);

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

  function handleSetMetrics(enabled: boolean) {
    savePrivacyConsent(enabled);
    setMetricsActive(enabled);
  }

  return (
    <div className="min-h-screen bg-[#030305] text-[#a1a1a6] selection:bg-[#EE2C24]/30 flex flex-col relative overflow-x-hidden">
      <GsapSecurityBackground />
      {/* Minimalist Full-Width Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#030305]/80 backdrop-blur-xl">
        <div className="w-full px-5 sm:px-8 lg:px-12 h-[76px] flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 text-white shrink-0">
            <img src="/claro-icon.png" alt="Claro" className="w-8 h-8 object-contain" />
            <div className="leading-tight">
              <span className="block text-sm font-bold tracking-tight text-white">Claro</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] bg-gradient-to-r from-[#FF382E] via-[#EE2C24] to-[#C72322] bg-clip-text text-transparent">
                Gestão Rede Externa
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#a1a1a6] hover:text-white transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar</span>
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold bg-white text-black hover:bg-neutral-200 transition"
            >
              <span>Entrar no sistema</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Editorial Document Layout */}
      <main className="relative z-10 max-w-5xl mx-auto w-full px-5 sm:px-8 py-14 sm:py-20 flex-1">
        <div className="border-b border-white/[0.08] pb-10 mb-12 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#e20613]">
            Documentação Institucional · LGPD
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Política de Privacidade
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            Como o portal <span className="text-slate-200 font-medium">Claro · Gestão Rede Externa</span> coleta, armazena na nuvem e protege informações operacionais, cadastrais e métricas de desempenho.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Sticky Table of Contents */}
          <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-1 border-l border-white/[0.08] pl-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-3">
              Índice
            </p>
            {SECTIONS.map((sec) => (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                className="flex items-center gap-2.5 py-1.5 text-xs text-slate-400 hover:text-white transition"
              >
                <span className="font-mono text-[11px] text-slate-600">{sec.num}</span>
                <span>{sec.label}</span>
              </a>
            ))}
          </aside>

          {/* Clean Prose Content */}
          <div className="lg:col-span-8 space-y-14 text-sm leading-relaxed">
            <section id="dados" className="scroll-mt-24 space-y-4">
              <h2 className="text-lg font-bold text-white tracking-tight">
                01. Dados tratados no portal
              </h2>
              <p className="text-slate-400">
                O Gestão Rede Externa é um ambiente corporativo voltado à coordenação de equipes de campo, frota e indicadores da Claro. Os dados tratados limitam-se ao estritamente necessário para a operação:
              </p>
              <dl className="divide-y divide-white/[0.07] border-y border-white/[0.07] text-xs">
                <div className="py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <dt className="font-semibold text-white">Acesso e segurança</dt>
                  <dd className="sm:col-span-2 text-slate-400">
                    Nome de usuário, cargo/permissões (RBAC), autenticação 2FA (TOTP), IP de acesso e registros de auditoria.
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <dt className="font-semibold text-white">Cadastro operacional</dt>
                  <dd className="sm:col-span-2 text-slate-400">
                    Nome completo, CPF, RG, telefone, e-mail, matrícula Claro/TOA, empresa parceira, uniformes, EPIs e validades de NRs/ASO.
                  </dd>
                </div>
                <div className="py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <dt className="font-semibold text-white">Operação de campo</dt>
                  <dd className="sm:col-span-2 text-slate-400">
                    Escalas, rotas, veículos, formulários digitais, auditorias fotográficas e tratativas de chamados (RAL, REC e Qualidade).
                  </dd>
                </div>
              </dl>
            </section>

            <section id="tecnologias" className="scroll-mt-24 space-y-4">
              <h2 className="text-lg font-bold text-white tracking-tight">
                02. Tecnologias, cookies e armazenamento local
              </h2>
              <p className="text-slate-400">
                Dividimos o uso de armazenamento no navegador em duas categorias transparentes:
              </p>
              <dl className="divide-y divide-white/[0.07] border-y border-white/[0.07] text-xs">
                <div className="py-4 space-y-1.5">
                  <dt className="font-semibold text-white flex items-center justify-between">
                    <span>Armazenamento essencial</span>
                    <span className="text-[11px] font-mono text-emerald-400">Sempre ativo</span>
                  </dt>
                  <dd className="text-slate-400">
                    Cookie de sessão Flask para manter a autenticação, validação de 2FA, proteção contra acessos automatizados e preferências operacionais locais (como filtros de áreas no Grafana). Sem ele, o portal não funciona corretamente.
                  </dd>
                </div>
                <div className="py-4 space-y-1.5">
                  <dt className="font-semibold text-white flex items-center justify-between">
                    <span>Métricas de desempenho e navegação</span>
                    <span className="text-[11px] font-mono text-slate-400">Opcional · 180 dias</span>
                  </dt>
                  <dd className="text-slate-400">
                    Ativadas apenas mediante seu consentimento. Quando autorizadas, registram tempo de carregamento das páginas, TTFB e rota acessada diretamente nos logs do servidor para identificar gargalos e manter o portal estável. Recusar não impede nenhum recurso do sistema.
                  </dd>
                </div>
              </dl>
            </section>

            <section id="nuvem" className="scroll-mt-24 space-y-3">
              <h2 className="text-lg font-bold text-white tracking-tight">
                03. Armazenamento em nuvem e segurança
              </h2>
              <p className="text-slate-400">
                Todas as informações são persistidas em banco de dados PostgreSQL em nuvem com conexões criptografadas (SSL/TLS), controle de acesso baseado em função (RBAC), autenticação em dois fatores (TOTP) e trilha de auditoria para alterações críticas.
              </p>
            </section>

            <section id="comunicacoes" className="scroll-mt-24 space-y-3">
              <h2 className="text-lg font-bold text-white tracking-tight">
                04. Comunicações e validação de e-mail
              </h2>
              <p className="text-slate-400">
                O portal envia alertas operacionais, avisos de vencimento de documentação e notificações de segurança por e-mail. Caso ocorra falha de entrega em um endereço cadastrado, o sistema solicita a confirmação por código de 6 dígitos para garantir o recebimento dos comunicados.
              </p>
            </section>

            <section id="preferencias" className="scroll-mt-24 space-y-4 pt-2 border-t border-white/[0.08]">
              <h2 className="text-lg font-bold text-white tracking-tight">
                05. Gerenciar preferências neste navegador
              </h2>
              <p className="text-xs text-slate-400">
                Status atual das métricas de desempenho:{' '}
                <strong className={metricsActive ? 'text-emerald-400' : 'text-slate-200'}>
                  {metricsActive ? 'Ativadas' : 'Recusadas / Desativadas'}
                </strong>
                . Sua escolha é válida por 180 dias.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSetMetrics(false)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    !metricsActive
                      ? 'bg-white/15 border-white/30 text-white'
                      : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {!metricsActive && <Check className="w-3.5 h-3.5" />}
                  Recusar métricas
                </button>
                <button
                  type="button"
                  onClick={() => handleSetMetrics(true)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    metricsActive
                      ? 'bg-[#e20613] border-[#e20613] text-white'
                      : 'bg-white/[0.03] border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  {metricsActive && <Check className="w-3.5 h-3.5" />}
                  Aceitar métricas
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
