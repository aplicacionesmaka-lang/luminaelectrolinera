import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { T } from '../theme';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await login(email, password);
      if (res.role !== 'admin') { setError('Acceso solo para administradores'); return; }
      navigate('/');
    } catch (err) {
      setError(err.error || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a2218 0%, #16a34a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: 48, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: T.primary }}>⚡ Lumina</div>
          <div style={{ color: T.textMuted, marginTop: 4 }}>Panel de administración</div>
        </div>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Correo electrónico" required value={email} onChange={e => setEmail(e.target.value)} style={inp} />
          <input type="password" placeholder="Contraseña" required value={password} onChange={e => setPassword(e.target.value)} style={inp} />
          {error && <div style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <button type="submit" disabled={loading} style={btn}>{loading ? 'Ingresando...' : 'Ingresar'}</button>
        </form>
      </div>
    </div>
  );
}

const inp = { display: 'block', width: '100%', background: '#f8fafc', color: '#0f172a', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '13px 16px', marginBottom: 14, fontSize: 15, outline: 'none', boxSizing: 'border-box' };
const btn = { display: 'block', width: '100%', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 16, border: 'none', borderRadius: 12, padding: '15px', cursor: 'pointer' };
