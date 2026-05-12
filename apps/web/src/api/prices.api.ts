import { api } from "./client";
import type { FeedItem, PaginatedResponse, AiRecognitionResult } from "@priceradar/shared";

export const pricesApi = {
  getFeed: (params?: { country?: string; city?: string; category?: string; page?: number; limit?: number }) =>
    api.get<PaginatedResponse<FeedItem>>("/prices/feed", { params }).then((r) => r.data),

  create: (formData: FormData) =>
    api.post("/prices", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data),

  delete: (id: string) => api.delete(`/prices/${id}`),

  report: (id: string, reason: string) =>
    api.post(`/prices/${id}/report`, { reason }),

  recognize: (photo: File) => {
    const fd = new FormData();
    fd.append("photo", photo);
    return api.post<AiRecognitionResult>("/ai/recognize", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },

  recognizePrice: (photo: File) => {
    const fd = new FormData();
    fd.append("photo", photo);
    return api.post<{ price: number | null; currency: string }>("/ai/recognize-price", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },

  lookupStorePrice: (params: { storeName: string; barcode?: string | null; productName?: string }) =>
    api.get<{
      found: boolean;
      price?: number;
      pricePromo?: number;
      currency: string;
      productName?: string;
      storeDisplayName?: string;
      productUrl?: string;
      searchUrl: string;
    }>("/prices/store-lookup", { params }).then((r) => r.data),

  scanReceipt: (photo: File) => {
    const fd = new FormData();
    fd.append("photo", photo);
    return api.post<{ items: Array<{ name: string; brand: string | null; price: number }>; storeName: string | null }>(
      "/ai/scan-receipt", fd, { headers: { "Content-Type": "multipart/form-data" } }
    ).then((r) => r.data);
  },

  batchCreate: (data: {
    storeId?: string;
    storeName?: string;
    cityName?: string;
    currencyCode?: string;
    items: Array<{ name: string; brand?: string | null; price: number }>;
  }) => api.post<{ created: number; failed: number }>("/prices/batch", data).then((r) => r.data),
};
