import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './state/AuthContext';
import { NotificationProvider } from './state/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import FullScreenCinematicIntro from './components/FullScreenCinematicIntro';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'));
const PessoasPage = lazy(() => import('./pages/PessoasPage'));
const MapaEventosPage = lazy(() => import('./pages/MapaEventosPage'));
const VehiclesPage = lazy(() => import('./pages/VehiclesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const EvaluationsPage = lazy(() => import('./pages/EvaluationsPage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const IndicatorsPage = lazy(() => import('./pages/IndicatorsPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const BuscadorPage = lazy(() => import('./pages/BuscadorPage'));
const AuditoriaPage = lazy(() => import('./pages/AuditoriaPage'));
const AceitacaoPage = lazy(() => import('./pages/AceitacaoPage'));
const PosEventoPage = lazy(() => import('./pages/PosEventoPage'));
const FormulariosPage = lazy(() => import('./pages/FormulariosPage'));
const EscalaPage = lazy(() => import('./pages/EscalaPage'));
const RotasPage = lazy(() => import('./pages/RotasPage'));
const NotificacoesPage = lazy(() => import('./pages/NotificacoesPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const FormResponderPage = lazy(() => import('./pages/FormResponderPage'));
const GrafanaPage = lazy(() => import('./pages/GrafanaPage'));

function RouteLoader() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="w-7 h-7 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const [introRunId, setIntroRunId] = useState(1);
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    if (prevPathRef.current !== location.pathname && location.pathname === '/login') {
      setIntroRunId((n) => n + 1);
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname]);

  return (
    <AuthProvider>
      <NotificationProvider>
        {location.pathname === '/login' && <FullScreenCinematicIntro key={introRunId} durationMs={3600} />}
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/f/:slug" element={<FormResponderPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/grafana" replace />} />
              <Route path="grafana" element={<GrafanaPage />} />
              <Route path="favoritos" element={<FavoritesPage />} />
              <Route path="area-de-trabalho" element={<WorkspacePage />} />
              <Route path="pessoas" element={<PessoasPage />} />
              <Route path="veiculos" element={<VehiclesPage />} />
              <Route path="buscador" element={<BuscadorPage />} />
              <Route path="auditoria" element={<AuditoriaPage />} />
              <Route path="aceitacao" element={<AceitacaoPage />} />
              <Route path="pos-evento" element={<PosEventoPage />} />
              <Route path="ral-qualidade" element={<Navigate to="/grafana" replace />} />
              <Route path="mapa-eventos" element={<MapaEventosPage />} />
              <Route path="financeiro" element={<FinancePage />} />
              <Route path="escala" element={<EscalaPage />} />
              <Route path="avaliacao" element={<EvaluationsPage />} />
              <Route path="projetos" element={<ProjectsPage />} />
              <Route path="formularios" element={<FormulariosPage />} />
              <Route path="rotas" element={<RotasPage />} />
              <Route path="indicadores" element={<IndicatorsPage />} />
              <Route path="gerenciamento" element={<UsersPage />} />
              <Route path="notificacoes" element={<NotificacoesPage />} />
              <Route path="perfil" element={<ProfilePage />} />
              <Route path="*" element={<Navigate to="/grafana" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </NotificationProvider>
    </AuthProvider>
  );
}
