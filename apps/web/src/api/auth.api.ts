import { api } from "./client";
import type { AuthResponse, RegisterRequest, LoginRequest } from "@priceradar/shared";

export const authApi = {
  register: (data: RegisterRequest) =>
    api.post<AuthResponse>("/auth/register", data).then((r) => r.data),

  login: (data: LoginRequest) =>
    api.post<AuthResponse>("/auth/login", data).then((r) => r.data),

  refresh: () =>
    api.post<{ accessToken: string }>("/auth/refresh").then((r) => r.data),

  logout: () => api.post("/auth/logout"),

  me: () => api.get<AuthResponse["user"]>("/auth/me").then((r) => r.data),
};
