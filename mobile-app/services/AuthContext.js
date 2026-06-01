import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const me = await auth.me();
          setUser(me);
        }
      } catch {
        await AsyncStorage.removeItem('token');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email, password) {
    const res = await auth.login(email, password);
    await AsyncStorage.setItem('token', res.token);
    setUser({ id: res.uid, name: res.name, email, balance: res.balance, idTag: res.idTag, role: res.role });
    return res;
  }

  async function logout() {
    await AsyncStorage.removeItem('token');
    setUser(null);
  }

  async function refreshBalance() {
    const res = await auth.balance();
    setUser(prev => ({ ...prev, balance: res.balance }));
    return res.balance;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshBalance }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
