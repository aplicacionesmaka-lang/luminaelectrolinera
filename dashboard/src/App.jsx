import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage       from './pages/LoginPage';
import DashboardPage   from './pages/DashboardPage';
import StationsPage    from './pages/StationsPage';
import SessionsPage    from './pages/SessionsPage';
import ClientesPage    from './pages/ClientesPage';
import AliadosPage     from './pages/AliadosPage';
import LiquidacionPage from './pages/LiquidacionPage';
import Layout          from './components/Layout';

function Guard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ color: '#888', padding: 40 }}>Cargando...</div>;
  return user?.role === 'admin' ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Guard><Layout /></Guard>}>
            <Route index element={<DashboardPage />} />
            <Route path="stations" element={<StationsPage />} />
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="clientes"    element={<ClientesPage />} />
            <Route path="aliados"     element={<AliadosPage />} />
            <Route path="liquidacion" element={<LiquidacionPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
