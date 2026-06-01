import React, { createContext, useContext, useEffect, useState } from 'react';
import api from './api';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.get('/users/me').then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await api.post('/users/login', { email, password });
    localStorage.setItem('token', res.token);
    setUser({ uid: res.uid, name: res.name, email, role: res.role, balance: res.balance, idTag: res.idTag });
    return res;
  }

  function logout() { localStorage.removeItem('token'); setUser(null); }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
