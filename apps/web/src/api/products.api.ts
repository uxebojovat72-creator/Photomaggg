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

  lookupBarcode: (code: string, storeName?: string) =>
    api.get<{
      source:
        | "local"
        | "5ka"
        | "perekrestok"
        | "magnit"
        | "vkusvill"
        | "barcodelist"
        | "openbeautyfacts"
        | "openpetfoodfacts"
        | "upcitemdb"
        | "ai";
      product: {
        name: string;
        brand: string | null;
        barcode: string;
        imageUrl: string | null;
        quantity?: string | null;
        description?: string | null;
        categoryHint?: string | null;
        price?: number | null;
        pricePromo?: number | null;
        storeSource?: string | null;
        id?: string;
      };
      storePrice?: {
        found: boolean;
        price?: number;
        pricePromo?: number;
        currency: string;
        productName?: string;
        storeDisplayName?: string;
        productUrl?: string;
        searchUrl: string;
      };
    }>(`/products/barcode/${code}`, { params: storeName ? { storeName } : undefined }).then((r) => r.data),
};
