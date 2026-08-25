import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Star, Briefcase, Users, Truck, Search, MapPinned, Wallet, CalendarDays,
  ClipboardCheck, Boxes, FolderKanban, FileText, Route as RouteIcon, BarChart3,
  Settings, Menu, X, LogOut, BellRing,
} from 'lucide-react';
import { useAuth, isCoordenador, isCoordenadorClaro } from '../state/AuthContext';

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

// Keeps the address bar showing just the bare domain — routing still works
// internally via react-router's own location state, this only overwrites
// what the browser displays. Trade-off accepted: breaks back/forward and
// refresh-to-same-page, since the real URL never actually changes.
function UrlMasker() {
  const location = useLocation();
  useEffect(() => {
    if (window.location.pathname !== '/') {
      window.history.replaceState(null, '', '/');
    }
  }, [location]);
  return null;
}

const NAV_ITEMS = [
  { to: '/', label: 'Favoritos', icon: Star, end: true },
  { to: '/pessoas', label: 'Pessoas', icon: Users },
  { to: '/veiculos', label: 'Veículos', icon: Truck },
  { to: '/buscador', label: 'Buscador', icon: Search },
  { to: '/mapa-eventos', label: 'Mapa de Eventos', icon: MapPinned },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/escala', label: 'Escala', icon: CalendarDays },
  { to: '/avaliacao', label: 'Avaliação', icon: ClipboardCheck },
  { to: '/inventario', label: 'Inventário', icon: Boxes },
  { to: '/projetos', label: 'Projetos', icon: FolderKanban },
  { to: '/formularios', label: 'Formulários', icon: FileText },
  { to: '/rotas', label: 'Rotas', icon: RouteIcon },
  { to: '/indicadores', label: 'Indicadores', icon: BarChart3 },
  { to: '/gerenciamento', label: 'Gerenciamento', icon: Settings },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  let items = user && isCoordenador(user)
    ? [{ to: '/area-de-trabalho', label: 'Área de Trabalho', icon: Briefcase }, ...NAV_ITEMS]
    : NAV_ITEMS;
  if (user && isCoordenadorClaro(user)) {
    items = [...items, { to: '/notificacoes', label: 'Notificações', icon: BellRing }];
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell-bg min-h-screen flex">
      <UrlMasker />
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
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--color-primary-dim)] text-[var(--color-primary)]'
                      : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text)]'
                  }`
                }
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
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
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{user?.username}</div>
              <div className="text-[11px] text-[var(--color-text-faint)] uppercase tracking-wide">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] transition-colors"
          >
            <LogOut className="w-[18px] h-[18px]" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
