import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Star, Briefcase, Users, Truck, Search, MapPinned, Wallet, CalendarDays,
  ClipboardCheck, FolderKanban, FileText, Route as RouteIcon, BarChart3,
  Settings, Menu, X, LogOut, BellRing, ShieldCheck, CheckSquare,
  UserCheck, AlertTriangle, ArrowRight, CalendarCheck,
} from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import LiquidEther from './LiquidEther';
import GlassIcon from './GlassIcon';
import MandatoryEmailModal from './MandatoryEmailModal';
import AuthenticatorModal from './AuthenticatorModal';
import AntiPrintGuard from './AntiPrintGuard';

const COMPANY_LOGOS: Record<string, string> = {
  claro: '/claro-icon.png',
  ffa: '/ffa-icon.png',
  procisa: '/procisa-icon.png',
};

// Claro's icon already has a transparent background — a white backing
// behind it just shows up as an ugly ring. FFA/Procisa are flat white-bg
// exports, so they need the white circle to avoid a hard square corner.
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
  { to: '/', label: 'Favoritos', icon: Star, end: true },
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

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dismissBanner, setDismissBanner] = useState(false);

  const items = NAV_ITEMS;

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const hasMissingProfile = !!(user && !user.needs_email && user.profile_complete === false && !dismissBanner);

  // If user is not TOTP verified yet, block full layout and render exclusive security prompt
  if (user && !user.totp_verified) {
    return (
      <div className="app-shell-bg anti-print-protected min-h-screen flex items-center justify-center relative overflow-hidden">
        <AntiPrintGuard />
        <LiquidEther />
        <AuthenticatorModal />
      </div>
    );
  }

  return (
    <div className="app-shell-bg anti-print-protected min-h-screen flex relative">
      <AntiPrintGuard />
      <LiquidEther />

      {/* Mandatory Blocking Modal if user has no email registered */}
      <AuthenticatorModal />
      <MandatoryEmailModal />

      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`glass fixed lg:sticky top-0 left-0 h-screen w-72 shrink-0 z-50 flex flex-col transition-transform duration-300 ease-out ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-5 h-20 border-b border-white/5">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/claro-icon.png" alt="Claro" className="w-10 h-10 rounded-full shrink-0 object-cover" />
            <div className="min-w-0">
              <div className="font-extrabold text-sm truncate">Gestão <span className="text-[var(--color-primary)]">REDE EXTERNA</span></div>
              <div className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider">Claro Brasil</div>
            </div>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-2 -mr-2 text-[var(--color-text-muted)]"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Navegação principal">
          {items.map((item) => {
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
                    return `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-sky-500/20 text-sky-300 shadow-[0_0_20px_rgba(14,165,233,0.3)] border border-sky-400/40'
                        : 'text-sky-400 bg-sky-500/[0.08] hover:bg-sky-500/[0.16] hover:text-sky-200 border border-sky-500/30'
                    }`;
                  }
                  return `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-white/[0.08] text-[var(--color-primary)] shadow-[0_0_20px_rgba(238,44,36,0.15)] border border-white/10'
                      : 'text-[var(--color-text-muted)] hover:bg-white/[0.04] hover:text-white border border-transparent'
                  }`;
                }}
              >
                {({ isActive }) => (
                  <>
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
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/5 space-y-2">
          {/* User profile card link */}
          <NavLink
            to="/perfil"
            onClick={() => setMobileNavOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-all group border border-transparent hover:border-white/5"
            title="Acessar Meu Perfil"
          >
            {companyLogoUrl(user?.company) ? (
              companyLogoNeedsWhiteBg(user?.company) ? (
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center p-1 shrink-0"><img src={companyLogoUrl(user?.company)!} alt={user?.company || ''} className="w-full h-full object-contain" /></div>
              ) : (
                <img src={companyLogoUrl(user?.company)!} alt={user?.company || ''} className="w-9 h-9 rounded-full object-cover shrink-0" />
              )
            ) : (
              <div className="w-9 h-9 rounded-full bg-[var(--color-accent-dim)] flex items-center justify-center text-[var(--color-accent)] font-bold text-sm shrink-0">
                {(user?.username || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate text-white group-hover:text-rose-400 transition-colors">
                {user?.name || user?.username}
              </div>
              <div className="text-[11px] text-[var(--color-text-faint)] uppercase tracking-wide flex items-center gap-1.5">
                <span>{user?.role}</span>
                {user?.profile_complete === false && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Perfil com dados pendentes" />
                )}
              </div>
            </div>
          </NavLink>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-xs font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sair do Sistema
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col relative z-10">
        <header className="lg:hidden sticky top-0 z-30 glass flex items-center justify-between px-4 h-16 border-b border-white/5">
          <button onClick={() => setMobileNavOpen(true)} aria-label="Abrir menu" className="p-2 -ml-2">
            <Menu className="w-6 h-6" />
          </button>
          <div className="font-bold text-sm">Gestão <span className="text-[var(--color-primary)]">REDE EXTERNA</span></div>
          {companyLogoUrl(user?.company) ? (
            companyLogoNeedsWhiteBg(user?.company) ? (
              <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center p-1"><img src={companyLogoUrl(user?.company)!} alt={user?.company || ''} className="w-full h-full object-contain" /></div>
            ) : (
              <img src={companyLogoUrl(user?.company)!} alt={user?.company || ''} className="w-9 h-9 rounded-full object-cover" />
            )
          ) : (
            <div className="w-9 h-9 rounded-full bg-[var(--color-accent-dim)] flex items-center justify-center text-[var(--color-accent)] font-bold text-sm">
              {(user?.username || '?').charAt(0).toUpperCase()}
            </div>
          )}
        </header>

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          {/* Missing Profile Notification Banner */}
          {hasMissingProfile && (
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#1E1710] to-[#141824] border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200 text-xs sm:text-sm animate-fade-in shadow-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white text-sm">Aviso de Cadastro Incompleto</div>
                  <div className="text-amber-300/80 text-xs mt-0.5 truncate">
                    Faltam informações no seu perfil: <span className="font-semibold text-white">{user.missing_fields?.join(', ')}</span>.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <NavLink
                  to="/perfil"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-sm"
                >
                  <span>Completar Perfil</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </NavLink>
                <button
                  type="button"
                  onClick={() => setDismissBanner(true)}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors"
                  title="Fechar aviso temporariamente"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <Outlet />
        </main>
      </div>
    </div>
  );
}
