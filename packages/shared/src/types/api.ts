import type {
  User,
  Price,
  Product,
  Store,
  Category,
  Country,
  City,
  Favorite,
  Notification,
  AiRecognitionResult,
  PaginatedResponse,
  FeedItem,
  ModerationItem,
  ModerationDecision,
  PricePoint,
  PriceStats,
  CurrencyRate,
} from "./index.js";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  countryCode?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface RefreshResponse {
  accessToken: string;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface ProductSearchParams {
  q?: string;
  category?: string;
  limit?: number;
  page?: number;
}

export interface ProductSearchResponse extends PaginatedResponse<Product> {
  suggestions?: string[];
}

export interface CreateProductRequest {
  name: string;
  brand?: string;
  barcode?: string;
  categoryId?: string;
  aliases?: string[];
}

// ─── Prices ───────────────────────────────────────────────────────────────────

export interface CreatePriceRequest {
  productId: string;
  storeId: string;
  price: number;
  currencyCode: string;
  photo?: File;
}

export interface PriceFeedParams {
  country?: string;
  city?: string;
  category?: string;
  page?: number;
  limit?: number;
}

export interface PriceHistoryParams {
  productId: string;
  storeId?: string;
  days?: 7 | 30 | 90;
}

export interface PriceHistoryResponse {
  productId: string;
  points: PricePoint[];
  stats: PriceStats;
}

export interface UpdatePriceRequest {
  price?: number;
  currencyCode?: string;
  storeId?: string;
}

// ─── Stores ───────────────────────────────────────────────────────────────────

export interface StoreSearchParams {
  q?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  radius?: number;
}

export interface CreateStoreRequest {
  name: string;
  chainName?: string;
  cityId: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

// ─── AI ───────────────────────────────────────────────────────────────────────

export interface AiRecognizeRequest {
  photo: File;
}

export type AiRecognizeResponse = AiRecognitionResult;

// ─── Moderation ───────────────────────────────────────────────────────────────

export interface ModerationQueueParams {
  page?: number;
  limit?: number;
}

export interface ModerationQueueResponse extends PaginatedResponse<ModerationItem> {}

export interface ModerationDecisionRequest extends ModerationDecision {}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface CompareProductsParams {
  ids: string[];
}

export interface MapPricesParams {
  productId: string;
  countryCode?: string;
}

export interface MapPricePoint {
  storeId: string;
  storeName: string;
  lat: number;
  lng: number;
  price: number;
  priceUsd: number;
  currencyCode: string;
  cityName: string;
  countryCode: string;
}

// ─── Favorites ────────────────────────────────────────────────────────────────

export interface CreateFavoriteRequest {
  productId: string;
  priceAlertThreshold?: number;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface NotificationsListParams {
  read?: boolean;
  page?: number;
  limit?: number;
}

// ─── Geo ──────────────────────────────────────────────────────────────────────

export interface GeoSearchParams {
  q: string;
  limit?: number;
}

// ─── Generic API Response ─────────────────────────────────────────────────────

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

export interface ApiSuccess<T = void> {
  success: true;
  data: T;
}
