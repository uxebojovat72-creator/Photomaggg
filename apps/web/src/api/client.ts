import axios from "axios";
import { useAuthStore } from "@/store/auth.store";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  withCredentials: true,
  timeout: 10000,
});

// Attach access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
let refreshing = false;
let waiters: Array<(token: string | null) => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (refreshing) {
      return new Promise((resolve, reject) => {
        waiters.push((token) => {
          if (!token) return reject(error);
          original.headers.Authorization = `Bearer ${token}`;
          resolve(api(original));
        });
      });
    }

    original._retry = true;
    refreshing = true;

    try {
      const res = await axios.post<{ accessToken: string }>(
        `${import.meta.env.VITE_API_URL ?? "/api"}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      const newToken = res.data.accessToken;
      useAuthStore.getState().setToken(newToken);
      waiters.forEach((w) => w(newToken));
      waiters = [];
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch {
      useAuthStore.getState().logout();
      waiters.forEach((w) => w(null));
      waiters = [];
      return Promise.reject(error);
    } finally {
      refreshing = false;
    }
  }
);
