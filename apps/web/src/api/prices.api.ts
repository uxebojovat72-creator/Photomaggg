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
};
