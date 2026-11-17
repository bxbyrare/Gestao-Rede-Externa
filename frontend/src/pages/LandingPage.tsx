import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  Cloud,
  Cookie,
  Lock,
  ShieldCheck,
  Smartphone,
  Truck,
  Users,
} from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import GsapSecurityBackground from '../components/GsapSecurityBackground';
import { openPrivacyPreferencesModal } from '../components/PrivacyCookieBanner';

gsap.registerPlugin(ScrollTrigger);

interface ShowcaseTab {
  id: 'grafana' | 'campo' | 'seguranca';
  index: string;
  label: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics: Array<{ label: string; value: string }>;
  rows: Array<{ name: string; meta: string; status: string }>;
}

const SHOWCASE_TABS: ShowcaseTab[] = [
  {
    id: 'grafana',
    index: '01',
    label: 'COP REDE · Grafana',
    eyebrow: 'MONITORAMENTO EM TEMPO REAL',
    title: 'Controle de RAL, REC e Qualidade por Regional',
    subtitle:
      'Sincronização contínua com separação automática de filas, alertas de SLA e contingência manual protegida.',
    metrics: [
      { label: 'SLA RAL', value: '6h' },
      { label: 'SLA REC', value: '4h' },
      { label: 'CFs Ativos', value: '16' },
    ],
    rows: [
      { name: 'ES · Espírito Santo (MTN, MTS, NOR, SUL)', meta: 'Prefixo VTA', status: 'Ativo' },
      { name: 'INTERIOR · RJ (SUF, SEF, NOF, LGS, BX1, MTP)', meta: 'Prefixo RJO', status: 'Ativo' },
      { name: 'CAPITAL · RJ (NO1, NO2, NO3, OE1, SU2, CZS)', meta: 'Prefixo RJO', status: 'Ativo' },
    ],
  },
  {
    id: 'campo',
    index: '02',
    label: 'Equipes de Campo',
    eyebrow: 'OPERAÇÃO PADRONIZADA',
    title: 'Escalas, rotas, frota e documentação em um só lugar',
    subtitle:
      'Técnicos e supervisores consultam escalas, buscam registros e recebem alertas preventivos de NRs, ASO e EPIs.',
    metrics: [
      { label: 'NRs & ASO', value: 'Auto' },
      { label: 'Formulários', value: 'Nativos' },
      { label: 'Frota & Rotas', value: 'Cloud' },
    ],
    rows: [
      { name: 'Buscador & Cadastros Operacionais', meta: 'Consulta rápida', status: 'Integrado' },
      { name: 'Auditorias, Aceitação & Pós-Evento', meta: 'Evidências em campo', status: 'Integrado' },
      { name: 'Escalas de Plantão & Veículos', meta: 'Controle de frota', status: 'Integrado' },
    ],
  },
  {
    id: 'seguranca',
    index: '03',
    label: 'Nuvem & Segurança',
    eyebrow: 'ARQUITETURA ZERO-TRUST',
    title: 'Dados corporativos protegidos em nuvem PostgreSQL',
    subtitle:
      'Autenticação em dois fatores (TOTP), permissões granulares por perfil, criptografia SSL/TLS e trilha de auditoria.',
    metrics: [
      { label: 'Sessão MFA', value: 'TOTP' },
      { label: 'Transporte', value: 'SSL/TLS' },
      { label: 'Permissões', value: 'RBAC' },
    ],
    rows: [
      { name: 'Autenticação 2FA Anti-Replay (RFC 6238)', meta: 'Bloqueio brute-force', status: 'Protegido' },
      { name: 'PostgreSQL Cloud com Failover & Pool', meta: 'Alta disponibilidade', status: 'Online' },
      { name: 'WAF Anti-Scanner & Auditoria de Acessos', meta: 'Alertas por e-mail', status: 'Ativo' },
    ],
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
  const [activeTab, setActiveTab] = useState<'grafana' | 'campo' | 'seguranca'>('grafana');

  const rootRef = useRef<HTMLDivElement>(null);
  const showcaseRef = useRef<HTMLDivElement>(null);
  const showcaseBodyRef = useRef<HTMLDivElement>(null);

  // Pure URL Policy: clean any hash if present and scroll smoothly without changing URL
  function scrollToSection(sectionId: string) {
    const target = document.getElementById(sectionId);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({ top, behavior: 'smooth' });
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  // Specular Spotlight Tracking + optional 3D Tilt on Double-Bezel cards
  function handleCardMouseMove(e: ReactMouseEvent<HTMLElement>, enableTilt = false) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty('--spot-x', `${x}px`);
    el.style.setProperty('--spot-y', `${y}px`);

    if (enableTilt && window.innerWidth >= 1024) {
      const rx = ((y / rect.height) - 0.5) * -5;
      const ry = ((x / rect.width) - 0.5) * 6;
      gsap.to(el, {
        rotateX: rx,
        rotateY: ry,
        transformPerspective: 1100,
        duration: 0.45,
        ease: 'power2.out',
      });
    }
  }

  function handleCardMouseLeave(e: ReactMouseEvent<HTMLElement>, resetTilt = false) {
    if (resetTilt && window.innerWidth >= 1024) {
      gsap.to(e.currentTarget, {
        rotateX: 0,
        rotateY: 0,
        duration: 0.6,
        ease: 'power3.out',
      });
    }
  }

  // Magnetic button physics
  function handleMagneticMove(e: ReactMouseEvent<HTMLElement>) {
    if (window.innerWidth < 1024) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width / 2)) * 0.22;
    const dy = (e.clientY - (rect.top + rect.height / 2)) * 0.22;
    gsap.to(el, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' });
  }

  function handleMagneticLeave(e: ReactMouseEvent<HTMLElement>) {
    gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.55, ease: 'elastic.out(1, 0.4)' });
  }

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    const ctx = gsap.context(() => {
      // Hero entrance timeline
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.hero-reveal', {
        y: 28,
        opacity: 0,
        duration: 0.8,
        stagger: 0.09,
      })
        .from(
          '.hero-claro-orb',
          {
            scale: 0.72,
            y: 18,
            opacity: 0,
            duration: 0.9,
            ease: 'power3.out',
          },
          '-=0.45',
        )
        .from(
          '.hero-showcase-wrap',
          {
            y: 36,
            opacity: 0,
            scale: 0.97,
            duration: 0.9,
          },
          '-=0.55',
        );

      // Gentle levitation & diffused bloom breathing on Claro Orb
      gsap.to('.hero-claro-orb-img', {
        y: -8,
        duration: 2.6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
      gsap.to('.hero-claro-bloom', {
        scale: 1.22,
        opacity: 0.45,
        duration: 2.6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      // Continuous subtle telemetry pulse
      gsap.to('.studio-pulse', {
        scale: 1.5,
        opacity: 0.25,
        duration: 1.6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      // Rolling Number Counters on ScrollTrigger
      gsap.utils.toArray<HTMLElement>('.rolling-counter').forEach((el) => {
        const endVal = Number(el.dataset.target || '0');
        const decimals = Number(el.dataset.decimals || '0');
        const prefix = el.dataset.prefix || '';
        const suffix = el.dataset.suffix || '';
        const obj = { val: 0 };
        gsap.to(obj, {
          val: endVal,
          duration: 1.4,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            once: true,
          },
          onUpdate: () => {
            el.textContent = `${prefix}${obj.val.toFixed(decimals)}${suffix}`;
          },
        });
      });

      // Scroll-triggered reveal blocks
      gsap.utils.toArray<HTMLElement>('.scroll-reveal').forEach((block) => {
        gsap.from(block, {
          y: 30,
          opacity: 0,
          duration: 0.75,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: block,
            start: 'top 84%',
            once: true,
          },
        });
      });

      // Subtle optical parallax on showcase inside frame
      if (showcaseRef.current && window.innerWidth >= 1024) {
        gsap.to(showcaseRef.current, {
          yPercent: -4,
          ease: 'none',
          scrollTrigger: {
            trigger: showcaseRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        });
      }
    }, rootRef);

    return () => ctx.revert();
  }, []);

  // Animate showcase inner panel on tab switch
  useEffect(() => {
    if (!showcaseBodyRef.current) return;
    gsap.fromTo(
      showcaseBodyRef.current,
      { y: 10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.38, ease: 'power2.out' },
    );
  }, [activeTab]);

  const currentTab = SHOWCASE_TABS.find((t) => t.id === activeTab) || SHOWCASE_TABS[0];

  return (
    <div ref={rootRef} className="min-h-screen bg-[#030305] text-white selection:bg-[#EE2C24]/30 overflow-x-hidden flex flex-col relative">
      {/* Studio Black Reactive GSAP Background */}
      <GsapSecurityBackground />

      {/* Minimalist Full-Width Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#030305]/80 backdrop-blur-xl">
        <div className="w-full px-5 sm:px-8 lg:px-12 h-[76px] flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 shrink-0 group">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 bg-[#EE2C24]/25 blur-lg rounded-full opacity-80 group-hover:opacity-100 transition" />
              <img src="/claro-icon.png" alt="Claro" className="relative w-8 h-8 object-contain" />
            </div>
            <div className="leading-tight">
              <span className="block text-sm font-bold tracking-tight text-white">Claro</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] bg-gradient-to-r from-[#FF382E] via-[#EE2C24] to-[#C72322] bg-clip-text text-transparent">
                Gestão Rede Externa
              </span>
            </div>
          </Link>
        </div>
      </header>

      {/* SECTION 1: HERO MONOLITO (Transparent over GSAP Canvas) */}
      <section className="relative z-10 bg-transparent pt-14 pb-20 sm:pt-20 sm:pb-24 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <p className="hero-reveal text-[11px] font-mono uppercase tracking-[0.26em] text-[#a1a1a6]">
            CLARO BRASIL · ENGENHARIA &amp; OPERAÇÃO DE CAMPO
          </p>

          <h1 className="hero-reveal text-4xl sm:text-6xl lg:text-[64px] font-extrabold tracking-[-0.04em] leading-[1.03] text-white">
            Precisão operacional em tempo real.
          </h1>

          {/* Animated Pristine Claro 3D Orb */}
          <div className="hero-claro-orb py-6 sm:py-9 flex items-center justify-center">
            <div
              onMouseMove={(e) => {
                if (window.innerWidth < 1024) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const rx = ((e.clientY - rect.top) / rect.height - 0.5) * -14;
                const ry = ((e.clientX - rect.left) / rect.width - 0.5) * 14;
                gsap.to(e.currentTarget, { rotateX: rx, rotateY: ry, transformPerspective: 700, duration: 0.35, ease: 'power2.out' });
              }}
              onMouseLeave={(e) => {
                gsap.to(e.currentTarget, { rotateX: 0, rotateY: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
              }}
              className="relative flex items-center justify-center select-none cursor-default"
            >
              <div className="hero-claro-bloom absolute w-44 h-44 sm:w-56 sm:h-56 lg:w-64 lg:h-64 rounded-full bg-[#EE2C24]/25 blur-3xl pointer-events-none" />
              <img
                src="/claro-icon.png"
                alt="Claro"
                className="hero-claro-orb-img relative z-10 w-36 h-36 sm:w-44 sm:h-44 lg:w-48 lg:h-48 object-contain drop-shadow-[0_22px_44px_rgba(0,0,0,0.85)]"
              />
            </div>
          </div>

          {/* Center 3D Showcase Panel (Double-Bezel + Specular Spotlight + 3D Tilt) */}
          <div className="hero-showcase-wrap max-w-4xl mx-auto">
            <div
              ref={showcaseRef}
              onMouseMove={(e) => handleCardMouseMove(e, true)}
              onMouseLeave={(e) => handleCardMouseLeave(e, true)}
              className="group relative rounded-2xl p-[1px] bg-gradient-to-b from-white/[0.16] via-white/[0.06] to-white/[0.02] shadow-[0_30px_90px_rgba(0,0,0,0.85)]"
              style={{
                backgroundImage:
                  'radial-gradient(520px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(255,255,255,0.16), transparent 45%)',
              }}
            >
              <div className="rounded-2xl bg-[#090C13]/95 backdrop-blur-2xl overflow-hidden text-left">
                {/* Top Chrome Bar */}
                <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2 w-2">
                      <span className="studio-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                    </span>
                    <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#a1a1a6]">
                      {currentTab.eyebrow}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-white/40">
                    gestaoredeexterna.com.br
                  </span>
                </div>

                {/* Inner Showcase Content */}
                <div ref={showcaseBodyRef} className="p-6 sm:p-8 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2 max-w-xl">
                      <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                        {currentTab.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-[#a1a1a6] leading-relaxed">
                        {currentTab.subtitle}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 shrink-0">
                      {currentTab.metrics.map((m) => (
                        <div
                          key={m.label}
                          className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-2.5 text-center"
                        >
                          <span className="block text-base sm:text-lg font-bold font-mono text-white">
                            {m.value}
                          </span>
                          <span className="block text-[10px] uppercase tracking-wider text-[#a1a1a6] mt-0.5">
                            {m.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
                    {currentTab.rows.map((r) => (
                      <div
                        key={r.name}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                      >
                        <span className="font-medium text-white">{r.name}</span>
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-[#a1a1a6]">{r.meta}</span>
                          <span className="font-mono text-emerald-400">{r.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Selector Pills Below Showcase */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {SHOWCASE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer border ${
                    activeTab === tab.id
                      ? 'bg-white text-black border-white'
                      : 'bg-white/[0.03] text-[#a1a1a6] border-white/[0.08] hover:text-white hover:border-white/20'
                  }`}
                >
                  <span className="font-mono opacity-60 mr-1.5">{tab.index}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hero Monolito Footer Lead + Magnetic CTA */}
          <div className="hero-reveal pt-4 max-w-2xl mx-auto space-y-6">
            <p className="text-sm sm:text-base text-[#a1a1a6] leading-relaxed">
              Plataforma corporativa da Claro que integra equipes de campo e coordenação na nuvem — garantindo rastreabilidade, cumprimento de SLAs e proteção de ponta a ponta.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                to={isAuthenticated ? '/grafana' : '/login'}
                onMouseMove={handleMagneticMove}
                onMouseLeave={handleMagneticLeave}
                className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full text-sm font-bold bg-white text-black hover:bg-neutral-200 transition"
              >
                <span>{isAuthenticated ? 'Acessar painel' : 'Entrar no sistema'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => scrollToSection('resultados')}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full text-sm font-medium text-[#a1a1a6] hover:text-white border border-white/[0.1] hover:border-white/25 transition cursor-pointer"
              >
                <span>Explorar arquitetura</span>
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: RESULTADOS & CLARO (Transparent over GSAP Canvas) */}
      <section id="resultados" className="relative z-10 bg-transparent py-20 px-5 sm:px-8 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="scroll-reveal grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-7 space-y-3">
              <p className="text-[11px] font-mono uppercase tracking-[0.22em] bg-gradient-to-r from-[#FF382E] via-[#EE2C24] to-[#C72322] bg-clip-text text-transparent font-bold">
                CLARO · INFRAESTRUTURA CRÍTICA
              </p>
              <h2 className="text-2xl sm:text-4xl font-bold tracking-[-0.03em] text-white leading-tight">
                Conectividade nacional sustentada por gestão de campo de alta precisão.
              </h2>
            </div>
            <p className="lg:col-span-5 text-sm text-[#a1a1a6] leading-relaxed">
              Da prevenção de falhas em fibra óptica à auditoria documental de técnicos e frota, cada registro permanece sincronizado em nuvem para decisões imediatas.
            </p>
          </div>

          {/* Rolling Number Counters */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { target: 16, decimals: 0, prefix: '', suffix: '', label: 'CFs Monitorados (ES & RJ)' },
              { target: 6, decimals: 0, prefix: '', suffix: 'h / 4h', label: 'SLAs RAL e REC em Tempo Real' },
              { target: 99.98, decimals: 2, prefix: '', suffix: '%', label: 'Disponibilidade em Nuvem' },
              { target: 2, decimals: 0, prefix: '', suffix: 'FA', label: 'Autenticação TOTP Zero-Trust' },
            ].map((stat) => (
              <div
                key={stat.label}
                onMouseMove={(e) => handleCardMouseMove(e, true)}
                onMouseLeave={(e) => handleCardMouseLeave(e, true)}
                className="rounded-2xl p-[1px] bg-white/[0.08]"
                style={{
                  backgroundImage:
                    'radial-gradient(280px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(255,255,255,0.16), transparent 50%)',
                }}
              >
                <div className="rounded-2xl bg-[#090C13]/90 backdrop-blur-xl p-5 sm:p-6 h-full">
                  <span
                    className="rolling-counter block text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight"
                    data-target={stat.target}
                    data-decimals={stat.decimals}
                    data-prefix={stat.prefix}
                    data-suffix={stat.suffix}
                  >
                    0
                  </span>
                  <span className="block text-xs text-[#a1a1a6] mt-2 leading-snug">
                    {stat.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3: CAMPO & GESTÃO (Transparent over GSAP Canvas) */}
      <section id="operacao" className="relative z-10 bg-transparent py-20 px-5 sm:px-8 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="scroll-reveal space-y-2 max-w-2xl">
            <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#a1a1a6]">
              FLUXO OPERACIONAL UNIFICADO
            </p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-[-0.03em] text-white">
              Como o portal apoia o campo e a gestão
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div
              onMouseMove={(e) => handleCardMouseMove(e, true)}
              onMouseLeave={(e) => handleCardMouseLeave(e, true)}
              className="rounded-2xl p-[1px] bg-white/[0.08]"
              style={{
                backgroundImage:
                  'radial-gradient(380px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(255,255,255,0.16), transparent 50%)',
              }}
            >
              <div className="rounded-2xl bg-[#090C13]/90 backdrop-blur-xl p-6 sm:p-7 h-full space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#a1a1a6]">
                    01 · Equipes de Campo
                  </span>
                  <Truck className="w-5 h-5 text-white/70" />
                </div>
                <h3 className="text-lg font-bold text-white">
                  Agilidade na rua sem depender de planilhas
                </h3>
                <p className="text-xs sm:text-sm text-[#a1a1a6] leading-relaxed">
                  Acesso direto a escalas, rotas, buscador técnico, formulários de inspeção visual com câmera e alertas automáticos de vencimento de NRs (NR-06, NR-10, NR-35) e ASO.
                </p>
              </div>
            </div>

            <div
              onMouseMove={(e) => handleCardMouseMove(e, true)}
              onMouseLeave={(e) => handleCardMouseLeave(e, true)}
              className="rounded-2xl p-[1px] bg-white/[0.08]"
              style={{
                backgroundImage:
                  'radial-gradient(380px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(255,255,255,0.16), transparent 50%)',
              }}
            >
              <div className="rounded-2xl bg-[#090C13]/90 backdrop-blur-xl p-6 sm:p-7 h-full space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#a1a1a6]">
                    02 · Gestão &amp; Coordenação
                  </span>
                  <Users className="w-5 h-5 text-white/70" />
                </div>
                <h3 className="text-lg font-bold text-white">
                  Visibilidade total de SLAs, frota e auditorias
                </h3>
                <p className="text-xs sm:text-sm text-[#a1a1a6] leading-relaxed">
                  Monitoramento ao vivo no Grafana COP REDE (RAL, REC e Qualidade), controle de veículos, avaliações, aceitação técnica e notificações automatizadas com validação de e-mail.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 & FOOTER: SOLID #000000 BASE COVERING REACTIVE CANVAS (z-index >= 5) */}
      <section className="relative z-20 bg-[#000000] border-t border-white/[0.08] pt-20 pb-12 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto space-y-14">
          <div className="scroll-reveal flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-emerald-400">
                ENGENHARIA DE SEGURANÇA &amp; NUVEM
              </p>
              <h2 className="text-2xl sm:text-4xl font-bold tracking-[-0.03em] text-white">
                Informações blindadas em nuvem
              </h2>
            </div>
            <Link
              to={isAuthenticated ? '/grafana' : '/login'}
              onMouseMove={handleMagneticMove}
              onMouseLeave={handleMagneticLeave}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold bg-white text-black hover:bg-neutral-200 transition shrink-0"
            >
              <span>{isAuthenticated ? 'Acessar painel' : 'Entrar no sistema'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: ShieldCheck,
                title: 'Zero-Trust MFA (TOTP)',
                desc: 'Sessão retida até validação por autenticador e proteção anti-replay.',
              },
              {
                icon: Cloud,
                title: 'PostgreSQL Cloud SSL',
                desc: 'Banco gerenciado com criptografia em trânsito, failover e pool dedicado.',
              },
              {
                icon: Lock,
                title: 'RBAC & Anti-Scanner',
                desc: 'Permissões por cargo, proteção CSRF e bloqueio ativo contra sondagens.',
              },
              {
                icon: Activity,
                title: 'Auditoria & LGPD',
                desc: 'Trilha completa de alterações e controle transparente de privacidade.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  onMouseMove={(e) => handleCardMouseMove(e, false)}
                  className="rounded-2xl p-[1px] bg-white/[0.08]"
                  style={{
                    backgroundImage:
                      'radial-gradient(260px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(255,255,255,0.16), transparent 50%)',
                  }}
                >
                  <div className="rounded-2xl bg-[#09090d] p-5 h-full space-y-2.5">
                    <Icon className="w-4 h-4 text-white/80" />
                    <h3 className="text-sm font-bold text-white">{item.title}</h3>
                    <p className="text-xs text-[#a1a1a6] leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Minimalist Solid Black Footer */}
          <footer className="pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#a1a1a6]">
            <div className="flex items-center gap-2.5">
              <img src="/claro-icon.png" alt="Claro" className="w-5 h-5 object-contain" />
              <span>© {new Date().getFullYear()} Claro · Gestão Rede Externa</span>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <Link to="/privacidade" className="hover:text-white transition">
                Política de Privacidade
              </Link>
              <button
                type="button"
                onClick={openPrivacyPreferencesModal}
                className="inline-flex items-center gap-1.5 hover:text-white transition cursor-pointer"
              >
                <Cookie className="w-3.5 h-3.5" />
                Preferências de cookies
              </button>
              <span className="inline-flex items-center gap-1 text-white/40 font-mono">
                <Smartphone className="w-3.5 h-3.5" />
                v2.0
              </span>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
