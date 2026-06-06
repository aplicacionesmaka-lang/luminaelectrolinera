import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://api.lumina.69.62.64.153.nip.io/api';

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(r => r.data, err => Promise.reject(err.response?.data || err));

export default api;
