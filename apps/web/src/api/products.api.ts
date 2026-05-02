import { api } from "./client";
import type {
  Product,
  PaginatedResponse,
  PriceHistoryResponse,
} from "@priceradar/shared";

export const productsApi = {
  search: (params: { q?: string; category?: string; page?: number; limit?: number }) =>
    api.get<PaginatedResponse<Product>>("/products/search", { params }).then((r) => r.data),

  suggestions: (q: string) =>
    api.get<string[]>("/products/suggestions", { params: { q } }).then((r) => r.data),

  getById: (id: string) =>
    api.get<Product>(`/products/${id}`).then((r) => r.data),

  getWithPrices: (id: string) =>
    api.get<Product & { prices: unknown[] }>(`/products/${id}`).then((r) => r.data),

  getPriceHistory: (id: string, params?: { days?: number; storeId?: string }) =>
    api.get<PriceHistoryResponse>(`/products/${id}/prices`, { params }).then((r) => r.data),

  getCategories: () =>
    api.get("/products/categories").then((r) => r.data),
};
