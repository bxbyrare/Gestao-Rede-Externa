import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Star, Briefcase, Users, Truck, Search, MapPinned, Wallet, CalendarDays,
  ClipboardCheck, FolderKanban, FileText, Route as RouteIcon, BarChart3,
  Settings, Menu, X, LogOut, BellRing, ShieldCheck, CheckSquare,
  UserCheck, AlertTriangle, ArrowRight, CalendarCheck, Activity,
} from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../state/AuthContext';
import GsapSecurityBackground from './GsapSecurityBackground';
import GlassIcon from './GlassIcon';
import MandatoryEmailModal from './MandatoryEmailModal';
import AuthenticatorModal from './AuthenticatorModal';
import AntiPrintGuard from './AntiPrintGuard';
import { formatPersonName } from '../utils/formatName';

const COMPANY_LOGOS: Record<string, string> = {
  claro: '/claro-icon.png',
  ffa: '/ffa-icon.png',
  procisa: '/procisa-icon.png',
};

const COMPANY_LOGO_NEEDS_WHITE_BG: Record<string, boolean> = {
  claro: false,
  ffa: true,
  procisa: true,
};

function companyLogoUrl(company: string | null | undefined): string | null {
  if (!company) return null;
  return COMPANY_LOGOS[company.trim().toLowerCase()] || null;
}

function companyLogoNeedsWhiteBg(company: string | null | undefined): boolean {
  if (!company) return false;
  return COMPANY_LOGO_NEEDS_WHITE_BG[company.trim().toLowerCase()] ?? false;
}

const NAV_ITEMS = [
  { to: '/grafana', label: 'Grafana', icon: Activity, end: true },
  { to: '/favoritos', label: 'Favoritos', icon: Star },
  { to: '/area-de-trabalho', label: 'Área de Trabalho', icon: Briefcase },
  { to: '/pessoas', label: 'Pessoas', icon: Users },
  { to: '/veiculos', label: 'Veículos', icon: Truck },
  { to: '/buscador', label: 'Buscador', icon: Search },
  { to: '/auditoria', label: 'Auditoria', icon: ShieldCheck },
  { to: '/aceitacao', label: 'Aceitação', icon: CheckSquare },
  { to: '/pos-evento', label: 'Pós Evento', icon: CalendarCheck },
  { to: '/mapa-eventos', label: 'Mapa de Eventos', icon: MapPinned },
  { to: '/avaliacao', label: 'Avaliação', icon: ClipboardCheck },
  { to: '/projetos', label: 'Projetos', icon: FolderKanban },
  { to: '/formularios', label: 'Formulários', icon: FileText },
  { to: '/rotas', label: 'Rotas', icon: RouteIcon },
  { to: '/indicadores', label: 'Indicadores', icon: BarChart3 },
  { to: '/escala', label: 'Escala', icon: CalendarDays, inDev: true },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet, inDev: true },
  { to: '/notificacoes', label: 'Notificações', icon: BellRing },
  { to: '/perfil', label: 'Meu Perfil', icon: UserCheck },
  { to: '/gerenciamento', label: 'Gerenciamento', icon: Settings },
];

type ThemePref = 'dark' | 'light';

const THEME_LABELS: Record<ThemePref, string> = {
  dark: 'Obsidian',
  light: 'Claro Suave',
};

export function resolveVisualTheme(pref: ThemePref): 'dark' | 'light' {
  return pref === 'light' ? 'light' : 'dark';
}

export function applyDocumentTheme(pref: ThemePref) {
  const resolved = resolveVisualTheme(pref);
  document.documentElement.dataset.theme = resolved;
  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaScheme) {
    metaScheme.setAttribute('content', resolved === 'light' ? 'light' : 'dark');
  }
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    const color = resolved === 'light' ? '#e3e6eb' : '#030305';
    metaThemeColor.setAttribute('content', color);
  }
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dismissBanner, setDismissBanner] = useState(false);

  const navRef = useRef<HTMLElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const pageStageRef = useRef<HTMLDivElement | null>(null);

  const storedTheme = user?.id ? localStorage.getItem(`claro_theme_user_${user.id}`) : null;
  const rawTheme = user?.theme_preference || storedTheme || 'dark';
  const userTheme: ThemePref = rawTheme === 'light' ? 'light' : 'dark';

  useEffect(() => {
    applyDocumentTheme(userTheme);
    if (user?.id && user?.theme_preference) {
      try {
        localStorage.setItem(`claro_theme_user_${user.id}`, userTheme);
      } catch {
        // ignore storage errors
      }
    }

    return () => {
      document.documentElement.dataset.theme = 'dark';
      const m = document.querySelector('meta[name="color-scheme"]');
      if (m) m.setAttribute('content', 'dark');
    };
  }, [userTheme, user?.id, user?.theme_preference]);

  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  // GSAP Sliding Active Sidebar Indicator
  useEffect(() => {
    const navEl = navRef.current;
    const indEl = indicatorRef.current;
    if (!navEl || !indEl) return;

    const activeLink = navEl.querySelector('a[data-active="true"]') as HTMLElement | null;
    if (!activeLink) {
      gsap.to(indEl, { opacity: 0, duration: 0.2 });
      return;
    }

    const targetY = activeLink.offsetTop;
    const targetH = activeLink.offsetHeight;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(indEl, { y: targetY, height: targetH, opacity: 1 });
    } else {
      gsap.to(indEl, {
        y: targetY,
        height: targetH,
        opacity: 1,
        duration: 0.45,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    }
  }, [location.pathname]);

  // GSAP Route Transition Reveal
  useEffect(() => {
    const stage = pageStageRef.current;
    if (!stage) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        stage,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.42,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
        },
      );
    }, stage);

    return () => ctx.revert();
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const hasMissingProfile = !!(user && !user.needs_email && user.profile_complete === false && !dismissBanner);

  // If user is not TOTP verified yet, block full layout and render exclusive security prompt
  if (user && !user.totp_verified) {
    return (
      <div className="anti-print-protected min-h-dvh flex items-center justify-center relative overflow-x-clip bg-[#030305] text-white">
        <GsapSecurityBackground />
        <AntiPrintGuard />
        <AuthenticatorModal />
      </div>
    );
  }

  return (
    <div className="dashboard-theme-scope anti-print-protected min-h-dvh flex relative bg-[#030305] text-white overflow-x-clip">
      {/* Precision Lagos Digital Architecture Blueprint Background (adapts to dark, dim & light) */}
      <GsapSecurityBackground />
      <AntiPrintGuard />

      {/* Mandatory Blocking Modal if user has no email registered */}
      <MandatoryEmailModal />

      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Primary Sidebar */}
      <aside
        className={`glass fixed lg:sticky top-0 left-0 h-dvh w-[min(18rem,85vw)] lg:w-72 shrink-0 z-50 flex flex-col transition-transform duration-300 ease-out bg-[#090C13]/95 backdrop-blur-2xl border-r border-white/[0.08] ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-5 h-20 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/claro-icon.png"
              alt="Claro"
              className="w-9 h-9 object-contain shrink-0 drop-shadow-[0_2px_12px_rgba(238,44,36,0.45)]"
            />
            <div className="min-w-0">
              <div className="font-extrabold text-sm tracking-[-0.02em] truncate text-white">
                Gestão <span className="ds-brand-gradient font-extrabold">REDE EXTERNA</span>
              </div>
              <div className="text-[10px] text-neutral-500 font-mono tracking-[0.14em] uppercase">
                Claro Brasil
              </div>
            </div>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-2 -mr-2 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav
          ref={navRef}
          className="relative flex-1 overflow-y-auto px-3 py-4 space-y-1"
          aria-label="Navegação principal"
        >
          {/* GSAP Animated Active Sliding Pill */}
          <div ref={indicatorRef} className="ds-nav-indicator mx-3" aria-hidden="true" />

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isInDev = !!item.inDev;
            const isProfileItem = item.to === '/perfil';
            const showProfileAlertDot = isProfileItem && user?.profile_complete === false;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) => {
                  if (isInDev) {
                    return `relative z-10 group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-sky-500/20 text-sky-300 shadow-[0_0_20px_rgba(14,165,233,0.25)] border border-sky-400/40'
                        : 'text-sky-400 bg-sky-500/[0.06] hover:bg-sky-500/[0.14] hover:text-sky-200 border border-sky-500/20'
                    }`;
                  }
                  return `relative z-10 group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200 ${
                    isActive
                      ? 'text-white'
                      : 'text-neutral-400 hover:bg-white/[0.04] hover:text-white border border-transparent'
                  }`;
                }}
              >
                {({ isActive }) => (
                  <div
                    data-active={isActive && !isInDev ? 'true' : 'false'}
                    className="flex items-center gap-3 w-full min-w-0"
                  >
                    <GlassIcon icon={Icon} active={isActive} size={16} />
                    <span className="truncate">{item.label}</span>
                    {isInDev && (
                      <span className="ml-auto text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-md font-bold bg-sky-500/25 text-sky-200 border border-sky-400/40">
                        DEV
                      </span>
                    )}
                    {showProfileAlertDot && (
                      <span className="ml-auto flex h-2 w-2 relative" title="Perfil com pendências">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                    )}
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/[0.06] space-y-2">
          {/* User profile card link */}
          <NavLink
            to="/perfil"
            onClick={() => setMobileNavOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] transition-all group border border-white/[0.06] hover:border-white/15"
            title="Acessar Meu Perfil & Aparência"
          >
            {companyLogoUrl(user?.company) ? (
              companyLogoNeedsWhiteBg(user?.company) ? (
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center p-1 shrink-0">
                  <img src={companyLogoUrl(user?.company)!} alt={user?.company || ''} className="w-full h-full object-contain" />
                </div>
              ) : (
                <img src={companyLogoUrl(user?.company)!} alt={user?.company || ''} className="w-9 h-9 rounded-full object-cover shrink-0" />
              )
            ) : (
              <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {(formatPersonName(user?.name || user?.username) || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate text-white group-hover:text-white transition-colors">
                {formatPersonName(user?.name || user?.username) || 'Usuário'}
              </div>
              <div className="text-[10px] text-neutral-400 font-mono uppercase tracking-wide flex items-center gap-1.5">
                <span className="truncate">{user?.role}</span>
                <span className="text-neutral-600">•</span>
                <span className="text-neutral-400">{THEME_LABELS[userTheme]}</span>
                {user?.profile_complete === false && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Perfil com dados pendentes" />
                )}
              </div>
            </div>
          </NavLink>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Sair do Sistema
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col relative z-10">
        <header className="lg:hidden sticky top-0 z-30 glass flex items-center justify-between px-4 h-16 border-b border-white/[0.06] bg-[#090C13]/90 backdrop-blur-2xl">
          <button onClick={() => setMobileNavOpen(true)} aria-label="Abrir menu" className="p-2 -ml-2 text-white">
            <Menu className="w-6 h-6" />
          </button>
          <div className="font-extrabold text-sm text-white">
            Gestão <span className="ds-brand-gradient font-extrabold">REDE EXTERNA</span>
          </div>
          {companyLogoUrl(user?.company) ? (
            companyLogoNeedsWhiteBg(user?.company) ? (
              <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center p-1">
                <img src={companyLogoUrl(user?.company)!} alt={user?.company || ''} className="w-full h-full object-contain" />
              </div>
            ) : (
              <img src={companyLogoUrl(user?.company)!} alt={user?.company || ''} className="w-9 h-9 rounded-full object-cover" />
            )
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-white font-bold text-sm">
              {(formatPersonName(user?.name || user?.username) || '?').charAt(0).toUpperCase()}
            </div>
          )}
        </header>

        <main className="flex-1 min-w-0 w-full max-w-[1920px] mx-auto p-3 sm:p-5 lg:p-7 xl:p-8">
          {/* Missing Profile Notification Banner */}
          {hasMissingProfile && (
            <div className="mb-6 p-4 rounded-2xl bg-[#090C13]/90 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200 text-xs sm:text-sm animate-in shadow-xl backdrop-blur-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white text-sm">Aviso de Cadastro Incompleto</div>
                  <div className="text-amber-300/80 text-xs mt-0.5 break-words sm:truncate">
                    Faltam informações no seu perfil: <span className="font-semibold text-white">{user.missing_fields?.join(', ')}</span>.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <NavLink
                  to="/perfil"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs bg-white text-black hover:bg-neutral-100 transition-colors shadow-sm"
                >
                  <span>Completar Perfil</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </NavLink>
                <button
                  type="button"
                  onClick={() => setDismissBanner(true)}
                  className="p-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  title="Fechar aviso temporariamente"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div ref={pageStageRef}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
