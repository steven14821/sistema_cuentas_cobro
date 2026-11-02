import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/dashboard/Dashboard';
import { TechnicianPortal } from './pages/TechnicianPortal';
import { AdminReviewPage } from './pages/AdminReviewPage';
import { AccountDetailPage } from './pages/admin/AccountDetailPage';
import { UserDetailPage } from './pages/admin/UserDetailPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { useAuth } from './context/AuthContext';

// Guard genérico por rol. `roles` lista los roles permitidos.
const Protected = ({ roles, children }: { roles: string[]; children: React.ReactElement }) => {
  const { isAuthenticated, user, initialized } = useAuth();

  // Espera a que se hidrate la sesión antes de decidir; evita parpadeo a /login.
  if (!initialized) return null;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    // El técnico que intente entrar a una ruta admin vuelve a SU portal, no al panel.
    return <Navigate to={user.role === 'technician' ? '/technician' : '/dashboard'} replace />;
  }
  return children;
};

export const App = () => {
  const { isAuthenticated, user, initialized } = useAuth();

  // Aún hidratando la sesión: no renderizar rutas todavía.
  if (!initialized) return null;

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* El dashboard es la vista administrativa; el técnico no debe verlo */}
        <Route
          path="/dashboard"
          element={
            <Protected roles={['admin']}>
              <Dashboard />
            </Protected>
          }
        />

        {/* Portal del técnico: SOLO técnicos */}
        <Route
          path="/technician"
          element={
            <Protected roles={['technician']}>
              <TechnicianPortal />
            </Protected>
          }
        />

        <Route
          path="/admin/review"
          element={
            <Protected roles={['admin']}>
              <AdminReviewPage />
            </Protected>
          }
        />

        <Route
          path="/admin/cuentas/:id"
          element={
            <Protected roles={['admin']}>
              <AccountDetailPage />
            </Protected>
          }
        />

        <Route
          path="/admin/users/:id"
          element={
            <Protected roles={['admin']}>
              <UserDetailPage />
            </Protected>
          }
        />

        <Route
          path="/reports"
          element={
            <Protected roles={['admin']}>
              <ReportsPage />
            </Protected>
          }
        />

        {/* Redirección por defecto: según rol si hay sesión, si no a login */}
        <Route
          path="/"
          element={
            <Navigate to={isAuthenticated && user ? (user.role === 'admin' ? '/dashboard' : '/technician') : '/login'} replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};
