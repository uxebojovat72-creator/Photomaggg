// ─── Enums ───────────────────────────────────────────────────────────────────

export type UserRole = "guest" | "user" | "trusted" | "moderator" | "admin";

export type PriceStatus = "pending" | "approved" | "rejected";

export type NotificationType = "price_drop" | "new_price" | "moderation" | "system";

// ─── Core Entities ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  trustScore: number;
  countryId: string | null;
  cityId: string | null;
  createdAt: string;
}

export interface Country {
  id: string;
  name: string;
  code: string;
  currencyCode: string;
  flagEmoji: string;
}

export interface City {
  id: string;
  name: string;
  countryId: string;
  country?: Country;
  latitude: number | null;
  longitude: number | null;
}

export interface Store {
  id: string;
  name: string;
  chainName: string | null;
  cityId: string;
  city?: City;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  createdBy: string;
  verified: boolean;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  iconUrl: string | null;
  children?: Category[];
}

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  categoryId: string | null;
  category?: Category;
  imageUrl: string | null;
  aiGenerated: boolean;
  aiConfirmed: boolean;
  aliases: string[];
  createdBy: string;
  createdAt: string;
}

export interface Price {
  id: string;
  productId: string;
  product?: Product;
  storeId: string;
  store?: Store;
  userId: string;
  user?: Pick<User, "id" | "displayName" | "avatarUrl" | "trustScore">;
  price: number;
  currencyCode: string;
  priceUsd: number | null;
  photoUrl: string | null;
  aiRecognizedName: string | null;
  status: PriceStatus;
  rejectReason: string | null;
  moderatedBy: string | null;
  moderatedAt: string | null;
  createdAt: string;
}

export interface PriceReport {
  id: string;
  priceId: string;
  reporterId: string;
  reason: string;
  createdAt: string;
}

export interface Favorite {
  id: string;
  userId: string;
  productId: string;
  product?: Product;
  priceAlertThreshold: number | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface PricePoint {
  date: string;
  priceUsd: number;
  price: number;
  currencyCode: string;
  storeId: string;
  storeName: string;
}

export interface PriceStats {
  productId: string;
  minPriceUsd: number;
  maxPriceUsd: number;
  avgPriceUsd: number;
  priceCount: number;
  cheapestStore: Store & { price: number; currencyCode: string };
}

export interface ProductComparison {
  products: Array<{
    product: Product;
    stats: PriceStats;
    latestPrices: Price[];
  }>;
}

export interface CurrencyRate {
  base: string;
  date: string;
  rates: Record<string, number>;
}

// ─── AI Recognition ──────────────────────────────────────────────────────────

export interface AiRecognitionResult {
  name: string;
  brand: string | null;
  category: string | null;
  confidence: number;
  provider: "huggingface" | "google_vision" | "manual";
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export interface FeedItem extends Price {
  product: Product;
  store: Store & { city: City & { country: Country } };
  user: Pick<User, "id" | "displayName" | "avatarUrl" | "trustScore">;
}

// ─── Moderation ───────────────────────────────────────────────────────────────

export interface ModerationItem extends Price {
  product: Product;
  store: Store & { city: City & { country: Country } };
  user: Pick<User, "id" | "displayName" | "trustScore">;
}

export type ModerationAction = "approve" | "reject" | "edit";

export interface ModerationDecision {
  action: ModerationAction;
  rejectReason?: string;
  editedProductName?: string;
}
