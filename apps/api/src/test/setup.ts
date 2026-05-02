// Ensure required env vars have values before any module imports them.
// In CI the real vars are injected; these are fallbacks for local test runs.
process.env.DATABASE_URL ??= "postgresql://priceradar:priceradar_test@localhost:5432/priceradar_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "test_access_secret_min_32_chars_here";
process.env.JWT_REFRESH_SECRET ??= "test_refresh_secret_min_32_chars_here";
process.env.NODE_ENV ??= "test";
