// ─── Currency ─────────────────────────────────────────────────────────────────

export function formatPrice(
  price: number,
  currencyCode: string,
  locale = "en-US"
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currencyCode} ${price.toFixed(2)}`;
  }
}

export function convertPrice(
  price: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number | null {
  if (from === to) return price;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return null;
  return (price / fromRate) * toRate;
}

// ─── Trust Score ──────────────────────────────────────────────────────────────

export const TRUST_SCORE_AUTO_APPROVE = 80;

export function isTrusted(trustScore: number): boolean {
  return trustScore >= TRUST_SCORE_AUTO_APPROVE;
}

export function trustScoreLabel(score: number): string {
  if (score >= 90) return "Expert";
  if (score >= 80) return "Trusted";
  if (score >= 50) return "Regular";
  if (score >= 20) return "New";
  return "Unverified";
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

export function isValidBarcode(barcode: string): boolean {
  return /^\d{8,14}$/.test(barcode);
}

export function isValidPrice(price: number): boolean {
  return price > 0 && price < 1_000_000 && Number.isFinite(price);
}

// ─── Image ────────────────────────────────────────────────────────────────────

export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const TARGET_PHOTO_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function isValidImageType(mimeType: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(mimeType);
}

// ─── Date ─────────────────────────────────────────────────────────────────────

export function formatRelativeDate(dateStr: string, locale = "en"): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(locale);
}

// ─── Strings ──────────────────────────────────────────────────────────────────

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

// ─── Geo ──────────────────────────────────────────────────────────────────────

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
