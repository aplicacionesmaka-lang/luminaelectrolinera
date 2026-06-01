import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { T } from '../theme';

export default function Layout() {
  const { user, logout } = useAuth();

  const navStyle = ({ isActive }) => ({
    display: 'block', padding: '11px 22px', textDecoration: 'none',
    borderRadius: '0 12px 12px 0', fontWeight: 600, fontSize: 14,
    transition: 'all .15s', marginRight: 12,
    color:      isActive ? '#fff' : '#86efac',
    background: isActive ? T.primary : 'transparent',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
      <aside style={{
        width: 220, background: T.bgSidebar, display: 'flex',
        flexDirection: 'column', padding: '28px 0', position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ padding: '0 22px 28px', borderBottom: '1px solid #163d28' }}>
          <div style={{ color: T.success, fontSize: 26, fontWeight: 800 }}>⚡ Lumina</div>
          <div style={{ color: '#4ade80', fontSize: 11, marginTop: 2 }}>Panel de administración</div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 20 }}>
          <NavLink to="/"         style={navStyle} end>📊 Dashboard</NavLink>
          <NavLink to="/stations" style={navStyle}>🗺 Estaciones</NavLink>
          <NavLink to="/sessions" style={navStyle}>🕐 Sesiones</NavLink>
          <NavLink to="/clientes" style={navStyle}>👥 Clientes</NavLink>
        </nav>
        <div style={{ marginTop: 'auto', padding: '0 22px 8px', color: '#4ade80', fontSize: 11 }}>
          {user?.email}
        </div>
        <button onClick={logout} style={{
          margin: '0 12px', padding: '11px 16px', background: 'transparent',
          border: `1.5px solid #ef4444`, borderRadius: 10,
          color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontSize: 13,
        }}>
          Cerrar sesión
        </button>
      </aside>
      <main style={{ flex: 1, padding: 32, overflowY: 'auto', maxHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}
