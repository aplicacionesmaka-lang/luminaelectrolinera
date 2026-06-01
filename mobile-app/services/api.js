import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.0.11:4000/api';

const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });

api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r.data,
  err => Promise.reject(err.response?.data || err),
);

export const auth = {
  login:    (email, password) => api.post('/users/login', { email, password }),
  register: (data)            => api.post('/users/register', data),
  me:       ()                => api.get('/users/me'),
  balance:  ()                => api.get('/users/balance'),
};

export const stations = {
  list:    ()   => api.get('/stations'),
  getById: (id) => api.get(`/stations/${id}`),
};

export const chargers = {
  list:          ()           => api.get('/chargers'),
  getById:       (id)         => api.get(`/chargers/${id}`),
  activeSession: (id)         => api.get(`/chargers/${id}/session`),
  start:         (id, connId) => api.post(`/chargers/${id}/start`, { connectorId: connId }),
  stop:          (id, txId)   => api.post(`/chargers/${id}/stop`, { transactionId: txId }),
};

export const sessions = {
  myHistory: () => api.get('/sessions/my'),
  getById:   (id) => api.get(`/sessions/${id}`),
};

export const payments = {
  topup:   (amount, returnUrl) => api.post('/payments/topup', { amount, returnUrl }),
  history: ()                  => api.get('/payments/history'),
};

export default api;
