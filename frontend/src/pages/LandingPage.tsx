import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
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

const UNIFIED_PILLARS = [
  {
    title: 'Atendimentos em tempo real',
    desc: 'Acompanhe chamados e prioridades de cada região com avisos rápidos para cumprir todos os prazos.',
    tag: 'ES · Interior · Capital',
  },
  {
    title: 'Equipes, frota e documentos',
    desc: 'Escalas, rotas, veículos e alertas automáticos de vencimento de cursos e exames organizados em um só lugar.',
    tag: 'Campo e Coordenação',
  },
  {
    title: 'Segurança na nuvem',
    desc: 'Dados sempre disponíveis, protegidos por senha e código no celular, com histórico completo das ações.',
    tag: 'Proteção Contínua',
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);

  const rootRef = useRef<HTMLDivElement>(null);
  const showcaseRef = useRef<HTMLDivElement>(null);

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
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
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

  return (
    <div ref={rootRef} className="min-h-screen bg-[#030305] text-white selection:bg-[#EE2C24]/30 overflow-x-clip flex flex-col relative">
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

          <Link
            to={isAuthenticated ? '/grafana' : '/login'}
            onMouseMove={handleMagneticMove}
            onMouseLeave={handleMagneticLeave}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold bg-white text-black hover:bg-neutral-200 transition shadow-lg shadow-white/5"
          >
            <span>{isAuthenticated ? 'Acessar painel' : 'Entrar no sistema'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* SECTION 1: HERO MONOLITO (Transparent over GSAP Canvas) */}
      <section className="relative z-10 bg-transparent pt-14 pb-20 sm:pt-20 sm:pb-24 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto text-center space-y-6">
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

          {/* Center Unified Showcase Panel (Double-Bezel + Specular Spotlight + 3D Tilt) */}
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
                <div className="px-6 py-3.5 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2 w-2">
                      <span className="studio-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                    </span>
                    <span className="text-xs font-medium text-white/80">
                      Portal Gestão Rede Externa
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-white/40">
                    Claro Brasil
                  </span>
                </div>

                {/* Unified Human-Friendly Content */}
                <div className="p-6 sm:p-8 space-y-6">
                  <div className="space-y-2 max-w-2xl">
                    <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      Tudo o que a equipe de campo e a gestão precisam, em um só lugar
                    </h2>
                    <p className="text-xs sm:text-sm text-[#a1a1a6] leading-relaxed">
                      Acompanhe os atendimentos do dia, organize escalas, rotas e veículos e mantenha documentos e informações da Claro sempre seguros na nuvem.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                    {UNIFIED_PILLARS.map((item) => (
                      <div
                        key={item.title}
                        className="rounded-xl bg-white/[0.025] border border-white/[0.08] p-4 space-y-2 flex flex-col justify-between"
                      >
                        <div className="space-y-1.5">
                          <h3 className="text-sm font-bold text-white">{item.title}</h3>
                          <p className="text-xs text-[#a1a1a6] leading-relaxed">
                            {item.desc}
                          </p>
                        </div>
                        <span className="block text-[11px] text-white/50 pt-2 border-t border-white/[0.06]">
                          {item.tag}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Hero Monolito Footer Lead */}
          <div className="hero-reveal pt-4 max-w-2xl mx-auto space-y-6">
            <p className="text-sm sm:text-base text-[#a1a1a6] leading-relaxed">
              Plataforma corporativa da Claro que integra equipes de campo e coordenação na nuvem — garantindo rastreabilidade, cumprimento de prazos e proteção de ponta a ponta.
            </p>
            <div className="flex flex-wrap items-center justify-center">
              <button
                type="button"
                onClick={() => scrollToSection('resultados')}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full text-sm font-medium text-[#a1a1a6] hover:text-white border border-white/[0.1] hover:border-white/25 transition cursor-pointer"
              >
                <span>Conhecer mais</span>
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
            <div className="lg:col-span-7">
              <h2 className="text-2xl sm:text-4xl font-bold tracking-[-0.03em] text-white leading-tight">
                Conectividade nacional sustentada por gestão de campo de alta precisão.
              </h2>
            </div>
            <p className="lg:col-span-5 text-sm text-[#a1a1a6] leading-relaxed">
              Da prevenção de falhas na rede à conferência de documentos de técnicos e veículos, tudo permanece atualizado na nuvem para decisões rápidas.
            </p>
          </div>

          {/* Rolling Number Counters */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { target: 16, decimals: 0, prefix: '', suffix: '', label: 'Áreas atendidas (ES & RJ)' },
              { target: 6, decimals: 0, prefix: '', suffix: 'h / 4h', label: 'Prazos de atendimento acompanhados' },
              { target: 99.98, decimals: 2, prefix: '', suffix: '%', label: 'Disponibilidade na nuvem' },
              { target: 2, decimals: 0, prefix: '', suffix: ' etapas', label: 'Verificação segura no acesso' },
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
          <div className="scroll-reveal max-w-2xl">
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
            <div className="max-w-xl">
              <h2 className="text-2xl sm:text-4xl font-bold tracking-[-0.03em] text-white">
                Informações protegidas na nuvem
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
                title: 'Acesso em duas etapas',
                desc: 'Confirmação por código no celular para garantir que só pessoas autorizadas entrem.',
              },
              {
                icon: Cloud,
                title: 'Dados salvos na nuvem',
                desc: 'Todas as informações ficam guardadas com segurança e conexão criptografada.',
              },
              {
                icon: Lock,
                title: 'Cada perfil vê o que precisa',
                desc: 'Permissões organizadas por função e proteção ativa contra acessos indevidos.',
              },
              {
                icon: Activity,
                title: 'Histórico e privacidade',
                desc: 'Registro completo de alterações e transparência no cuidado com os dados.',
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
