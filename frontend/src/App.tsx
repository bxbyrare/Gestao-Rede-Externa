import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './state/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import LoginPage from './pages/LoginPage';
import FavoritesPage from './pages/FavoritesPage';
import PessoasPage from './pages/PessoasPage';
import MapaEventosPage from './pages/MapaEventosPage';
import VehiclesPage from './pages/VehiclesPage';
import InventoryPage from './pages/InventoryPage';
import UsersPage from './pages/UsersPage';
import EvaluationsPage from './pages/EvaluationsPage';
import PlaceholderPage from './pages/PlaceholderPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<FavoritesPage />} />
          <Route path="area-de-trabalho" element={<PlaceholderPage title="Área de Trabalho" />} />
          <Route path="pessoas" element={<PessoasPage />} />
          <Route path="veiculos" element={<VehiclesPage />} />
          <Route path="buscador" element={<PlaceholderPage title="Buscador" />} />
          <Route path="mapa-eventos" element={<MapaEventosPage />} />
          <Route path="financeiro" element={<PlaceholderPage title="Financeiro" />} />
          <Route path="escala" element={<PlaceholderPage title="Escala" />} />
          <Route path="avaliacao" element={<EvaluationsPage />} />
          <Route path="inventario" element={<InventoryPage />} />
          <Route path="projetos" element={<PlaceholderPage title="Projetos" />} />
          <Route path="formularios" element={<PlaceholderPage title="Formulários" />} />
          <Route path="rotas" element={<PlaceholderPage title="Rotas" />} />
          <Route path="indicadores" element={<PlaceholderPage title="Indicadores" />} />
          <Route path="gerenciamento" element={<UsersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
