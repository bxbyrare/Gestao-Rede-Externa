import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Cloud,
  Cookie,
  Lock,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { openPrivacyPreferencesModal } from '../components/PrivacyCookieBanner';

gsap.registerPlugin(ScrollTrigger);

const FIELD_ITEMS = [
  {
    num: '01',
    title: 'Escalas e Rotas Organizadas',
    desc: 'Consulte plantões, regiões de atendimento e deslocamentos sem depender de planilhas soltas.',
  },
  {
    num: '02',
    title: 'Buscador Operacional Instantâneo',
    desc: 'Localize informações de rede, cadastros e dados de campo em segundos pelo portal.',
  },
  {
    num: '03',
    title: 'Alertas de NRs, ASO e EPIs',
    desc: 'Notificações preventivas de vencimentos e regularização cadastral direto no e-mail.',
  },
  {
    num: '04',
    title: 'Ocorrências e Formulários',
    desc: 'Registro padronizado de pós-evento, aceitação técnica e evidências direto do campo.',
  },
];

const MANAGEMENT_ITEMS = [
  {
    num: '01',
    title: 'Grafana COP REDE em Tempo Real',
    desc: 'Monitoramento contínuo de RAL (6h), REC (4h) e Qualidade por CF, com contingência manual.',
  },
  {
    num: '02',
    title: 'Auditoria e Aceitação Técnica',
    desc: 'Fluxos estruturados de revisão, aprovação e histórico completo de tratativas por responsável.',
  },
  {
    num: '03',
    title: 'Gestão de Pessoas e Frota',
    desc: 'Controle centralizado de colaboradores, parceiras, veículos, avaliações e indicadores.',
  },
  {
    num: '04',
    title: 'Comunicação Automatizada',
    desc: 'Disparos inteligentes via Resend com verificação de entrega e proteção anti-duplicidade.',
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
  const [activeAudience, setActiveAudience] = useState<'campo' | 'gestao'>('campo');

  const rootRef = useRef<HTMLDivElement>(null);
  const cardsGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Hero entrance timeline
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.hero-stagger', {
        y: 26,
        opacity: 0,
        duration: 0.75,
        stagger: 0.09,
      })
        .from(
          '.hero-console',
          {
            y: 30,
            opacity: 0,
            scale: 0.98,
            duration: 0.8,
          },
          '-=0.45',
        )
        .from(
          '.console-bar',
          {
            scaleX: 0,
            transformOrigin: 'left center',
            duration: 0.85,
            stagger: 0.12,
            ease: 'power2.out',
          },
          '-=0.4',
        );

      // Subtle continuous telemetry pulse
      gsap.to('.live-dot', {
        scale: 1.45,
        opacity: 0.35,
        duration: 1.4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      // Scroll-triggered section reveals
      gsap.utils.toArray<HTMLElement>('.reveal-section').forEach((section) => {
        gsap.from(section, {
          y: 32,
          opacity: 0,
          duration: 0.75,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 84%',
            once: true,
          },
        });
      });

      gsap.from('.stat-block', {
        y: 22,
        opacity: 0,
        duration: 0.65,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: '.stats-row',
          start: 'top 85%',
          once: true,
        },
      });

      gsap.from('.sec-cell', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: '.sec-grid',
          start: 'top 85%',
          once: true,
        },
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  // Animate cards when toggling Campo <-> Gestão
  useEffect(() => {
    if (!cardsGridRef.current) return;
    const cards = cardsGridRef.current.querySelectorAll('.audience-card');
    gsap.fromTo(
      cards,
      { y: 14, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.42, stagger: 0.06, ease: 'power2.out' },
    );
  }, [activeAudience]);

  const activeItems = activeAudience === 'campo' ? FIELD_ITEMS : MANAGEMENT_ITEMS;

  return (
    <div ref={rootRef} className="min-h-screen bg-[#06080D] text-slate-200 selection:bg-[#e20613]/30 flex flex-col">
      {/* Minimalist Full-Width Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#06080D]/90 backdrop-blur-md">
        <div className="w-full px-5 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 text-white shrink-0">
            <img src="/claro-icon.png" alt="Claro" className="w-8 h-8 rounded-lg object-contain" />
            <div className="leading-tight">
              <span className="block text-sm font-bold tracking-tight">Claro</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
                Gestão Rede Externa
              </span>
            </div>
          </Link>

          <Link
            to={isAuthenticated ? '/grafana' : '/login'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#e20613] hover:bg-[#c80510] text-white transition"
          >
            <span>{isAuthenticated ? 'Acessar painel' : 'Entrar no sistema'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-white/[0.07]">
        {/* Architectural grid background */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
        <div
          aria-hidden="true"
          className="absolute -top-32 right-0 w-[520px] h-[520px] rounded-full bg-[#e20613]/[0.08] blur-[120px] pointer-events-none"
        />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="hero-stagger flex items-center gap-2.5">
              <span className="w-6 h-[2px] bg-[#e20613]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Claro Brasil · Operação de Campo
              </span>
            </div>

            <h1 className="hero-stagger text-3xl sm:text-5xl lg:text-[54px] font-bold text-white tracking-[-0.03em] leading-[1.06]">
              Controle preciso da rede externa, do campo à gestão.
            </h1>

            <p className="hero-stagger text-sm sm:text-base text-slate-400 leading-relaxed max-w-xl">
              O <span className="text-slate-200 font-medium">Portal Gestão Rede Externa</span> centraliza chamados, escalas, frota, rotas e documentação técnica da Claro em uma plataforma em nuvem segura e auditável.
            </p>

            <div className="hero-stagger flex flex-wrap items-center gap-4 pt-2">
              <Link
                to={isAuthenticated ? '/grafana' : '/login'}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold bg-[#e20613] hover:bg-[#c80510] text-white transition"
              >
                <span>{isAuthenticated ? 'Ir para o painel' : 'Entrar no sistema'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#operacao"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-white transition"
              >
                <span>Como funciona</span>
                <ArrowUpRight className="w-4 h-4 text-slate-500" />
              </a>
            </div>
          </div>

          {/* Animated Operational Console Preview */}
          <div className="lg:col-span-5 hero-console">
            <div className="rounded-xl bg-[#0B0F17] border border-white/[0.1] shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="live-dot absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span className="text-[11px] font-semibold text-slate-300 tracking-wide">
                    COP REDE · MONITORAMENTO ATIVO
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">CLOUD SYNC</span>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-white/[0.025] border border-white/[0.07] p-3">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">SLA RAL</span>
                    <span className="block text-lg font-bold text-white mt-0.5 font-mono">6h</span>
                  </div>
                  <div className="rounded-lg bg-white/[0.025] border border-white/[0.07] p-3">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">SLA REC</span>
                    <span className="block text-lg font-bold text-white mt-0.5 font-mono">4h</span>
                  </div>
                  <div className="rounded-lg bg-white/[0.025] border border-white/[0.07] p-3">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">Regionais</span>
                    <span className="block text-lg font-bold text-white mt-0.5 font-mono">16 CFs</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-slate-300 font-medium">ES · Espírito Santo</span>
                      <span className="text-slate-500 font-mono">Ativo</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="console-bar h-full w-[86%] rounded-full bg-[#e20613]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-slate-300 font-medium">INTERIOR · RJ</span>
                      <span className="text-slate-500 font-mono">Ativo</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="console-bar h-full w-[74%] rounded-full bg-sky-400" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-slate-300 font-medium">CAPITAL · RJ</span>
                      <span className="text-slate-500 font-mono">Ativo</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="console-bar h-full w-[92%] rounded-full bg-emerald-400" />
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    SSL + Autenticação 2FA
                  </span>
                  <span className="font-mono text-slate-500">PostgreSQL Cloud</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sobre a Claro — Editorial Split */}
      <section className="reveal-section max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20 border-b border-white/[0.07]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5 space-y-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e20613]">
              Sobre a Claro
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-snug">
              Infraestrutura de telecomunicações exige resposta rápida e informação confiável.
            </h2>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <p className="text-sm text-slate-400 leading-relaxed">
              A Claro conecta residências e empresas em todo o país com rede de fibra óptica e alta disponibilidade. Nos bastidores dessa operação, o <span className="text-slate-200 font-medium">Portal Gestão Rede Externa</span> padroniza a comunicação entre técnicos, supervisores e coordenadores — substituindo controles manuais dispersos por um fluxo único, rastreável e disponível em tempo real.
            </p>

            <div className="stats-row grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="stat-block border-l-2 border-[#e20613] pl-4">
                <span className="block text-xl font-bold text-white">3 Regionais</span>
                <span className="block text-xs text-slate-400 mt-0.5">ES, Interior e Capital RJ</span>
              </div>
              <div className="stat-block border-l-2 border-white/20 pl-4">
                <span className="block text-xl font-bold text-white">Tempo Real</span>
                <span className="block text-xs text-slate-400 mt-0.5">Filas RAL, REC e Qualidade</span>
              </div>
              <div className="stat-block border-l-2 border-white/20 pl-4">
                <span className="block text-xl font-bold text-white">100% Nuvem</span>
                <span className="block text-xs text-slate-400 mt-0.5">Histórico e auditoria seguros</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Campo & Gestão — Interactive Switcher */}
      <section id="operacao" className="reveal-section max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20 border-b border-white/[0.07] space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e20613]">
              Operação Integrada
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Feito para quem executa em campo e para quem coordena a operação
            </h2>
          </div>

          <div className="inline-flex p-1 rounded-lg bg-white/[0.04] border border-white/[0.08] shrink-0">
            <button
              type="button"
              onClick={() => setActiveAudience('campo')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition cursor-pointer ${
                activeAudience === 'campo'
                  ? 'bg-[#e20613] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              Equipes de Campo
            </button>
            <button
              type="button"
              onClick={() => setActiveAudience('gestao')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition cursor-pointer ${
                activeAudience === 'gestao'
                  ? 'bg-[#e20613] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Gestão &amp; Coordenação
            </button>
          </div>
        </div>

        <div ref={cardsGridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {activeItems.map((item) => (
            <div
              key={`${activeAudience}-${item.num}`}
              className="audience-card rounded-xl bg-[#0B0F17] border border-white/[0.08] hover:border-white/[0.18] p-5 space-y-3 transition"
            >
              <span className="inline-block text-[11px] font-mono font-bold text-[#e20613]">
                {item.num}
              </span>
              <h3 className="text-sm font-bold text-white">{item.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Segurança & Nuvem — Hairline Architectural Grid */}
      <section className="reveal-section max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2 max-w-xl">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Segurança &amp; Nuvem
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Dados operacionais protegidos em cada camada
            </h2>
          </div>
          <Link
            to="/privacidade"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
          >
            <span>Ler Política de Privacidade</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="sec-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-t border-l border-white/[0.08]">
          <div className="sec-cell p-6 border-r border-b border-white/[0.08] space-y-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Autenticação 2FA (TOTP)</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Proteção adicional por código temporário em aplicativo autenticador no login.
            </p>
          </div>
          <div className="sec-cell p-6 border-r border-b border-white/[0.08] space-y-2.5">
            <Lock className="w-5 h-5 text-sky-400" />
            <h3 className="text-sm font-bold text-white">Controle por Perfil (RBAC)</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Permissões granulares garantindo que cada usuário acesse apenas seus módulos.
            </p>
          </div>
          <div className="sec-cell p-6 border-r border-b border-white/[0.08] space-y-2.5">
            <Cloud className="w-5 h-5 text-[#e20613]" />
            <h3 className="text-sm font-bold text-white">Banco em Nuvem SSL/TLS</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Persistência em PostgreSQL gerenciado com conexões criptografadas e alta disponibilidade.
            </p>
          </div>
          <div className="sec-cell p-6 border-r border-b border-white/[0.08] space-y-2.5">
            <Activity className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Auditoria &amp; LGPD</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Registro de alterações críticas, alertas de acesso e gestão transparente de privacidade.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.07] bg-[#05070B]">
        <div className="w-full px-5 sm:px-8 lg:px-12 py-7 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2.5">
            <img src="/claro-icon.png" alt="Claro" className="w-5 h-5 rounded object-contain" />
            <span>© {new Date().getFullYear()} Claro · Gestão Rede Externa</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
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
