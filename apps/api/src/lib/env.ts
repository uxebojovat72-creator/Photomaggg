function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: parseInt(process.env.PORT ?? "4000", 10),
  HOST: process.env.HOST ?? "0.0.0.0",

  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: required("REDIS_URL"),

  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",

  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:5173",
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(","),

  RATE_LIMIT_GUEST: parseInt(process.env.RATE_LIMIT_GUEST ?? "100", 10),
  RATE_LIMIT_AUTH: parseInt(process.env.RATE_LIMIT_AUTH ?? "300", 10),

  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY ?? "",
  HUGGINGFACE_MODEL: process.env.HUGGINGFACE_MODEL ?? "Salesforce/blip-image-captioning-large",
  GOOGLE_CLOUD_VISION_API_KEY: process.env.GOOGLE_CLOUD_VISION_API_KEY ?? "",

  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ?? "",
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET ?? "photos",

  EXCHANGE_RATE_API_URL: process.env.EXCHANGE_RATE_API_URL ?? "https://api.exchangerate.host/latest",

  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? "",
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? "",
  VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? "mailto:admin@priceradar.app",
} as const;
