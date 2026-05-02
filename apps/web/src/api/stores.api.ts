import { api } from "./client";

export interface StoreResult {
  id: string;
  name: string;
  chainName: string | null;
  address: string | null;
  city: { id: string; name: string; country: { id: string; name: string; code: string; flagEmoji: string } };
}

export const storesApi = {
  search: (params: { q?: string; city?: string; country?: string }) =>
    api.get<StoreResult[]>("/stores/search", { params }).then((r) => r.data),

  create: (data: { name: string; chainName?: string; cityId: string; address?: string }) =>
    api.post<StoreResult>("/stores", data).then((r) => r.data),
};
