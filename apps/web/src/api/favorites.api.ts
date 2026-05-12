import { api } from "./client";

export interface FavoriteItem {
  id: string;
  productId: string;
  priceAlertThreshold: number | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    brand: string | null;
    imageUrl: string | null;
    category: { name: string } | null;
    prices: Array<{
      price: string;
      currencyCode: string;
      store: { name: string; city: { name: string; country: { flagEmoji: string } } };
    }>;
  };
}

export const favoritesApi = {
  list: () => api.get<FavoriteItem[]>("/favorites").then((r) => r.data),

  add: (productId: string, priceAlertThreshold?: number) =>
    api.post("/favorites", { productId, priceAlertThreshold }).then((r) => r.data),

  remove: (productId: string) => api.delete(`/favorites/${productId}`),

  check: (productId: string) =>
    api.get<{ isFavorite: boolean }>(`/favorites/check/${productId}`).then((r) => r.data),
};
