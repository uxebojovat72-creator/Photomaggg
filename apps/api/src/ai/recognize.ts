import { env } from "../lib/env.js";

export interface AiResult {
  name: string;
  brand: string | null;
  category: string | null;
  confidence: number;
  provider: "huggingface" | "google_vision" | "manual";
}

// ─── Hugging Face ─────────────────────────────────────────────────────────────

async function recognizeWithHuggingFace(imageBase64: string): Promise<AiResult | null> {
  if (!env.HUGGINGFACE_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${env.HUGGINGFACE_MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: imageBase64,
          parameters: {
            max_new_tokens: 100,
          },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) return null;

    const data = (await res.json()) as Array<{ generated_text?: string }> | { generated_text?: string };
    const text = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
    if (!text) return null;

    return parseAiText(text, "huggingface");
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Google Cloud Vision ──────────────────────────────────────────────────────

async function recognizeWithGoogleVision(imageBase64: string): Promise<AiResult | null> {
  if (!env.GOOGLE_CLOUD_VISION_API_KEY) return null;

  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${env.GOOGLE_CLOUD_VISION_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [
                { type: "LABEL_DETECTION", maxResults: 5 },
                { type: "WEB_DETECTION", maxResults: 3 },
                { type: "LOGO_DETECTION", maxResults: 1 },
                { type: "TEXT_DETECTION", maxResults: 1 },
              ],
            },
          ],
        }),
      }
    );

    if (!res.ok) return null;

    type VisionResponse = {
      responses?: Array<{
        webDetection?: { bestGuessLabels?: Array<{ label: string }> };
        labelAnnotations?: Array<{ description: string; score: number }>;
        logoAnnotations?: Array<{ description: string }>;
      }>;
    };

    const data = (await res.json()) as VisionResponse;
    const response = data.responses?.[0];
    if (!response) return null;

    const webLabel = response.webDetection?.bestGuessLabels?.[0]?.label;
    const topLabel = response.labelAnnotations?.[0]?.description;
    const logo = response.logoAnnotations?.[0]?.description;

    const name = webLabel ?? topLabel ?? "Unknown product";
    const brand = logo ?? null;

    return {
      name,
      brand,
      category: null,
      confidence: 0.7,
      provider: "google_vision",
    };
  } catch {
    return null;
  }
}

// ─── Text parser ──────────────────────────────────────────────────────────────

function parseAiText(text: string, provider: "huggingface" | "google_vision"): AiResult {
  // Try to extract brand from "Brand ProductName" pattern
  const words = text.trim().split(/\s+/);
  const brand = words.length > 1 ? words[0] : null;
  const name = text.trim();

  return {
    name,
    brand,
    category: null,
    confidence: 0.8,
    provider,
  };
}

// ─── Main recognizer with fallback chain ─────────────────────────────────────

export async function recognizeProduct(imageBuffer: Buffer): Promise<AiResult> {
  const imageBase64 = imageBuffer.toString("base64");

  const hfResult = await recognizeWithHuggingFace(imageBase64);
  if (hfResult) return hfResult;

  const gvResult = await recognizeWithGoogleVision(imageBase64);
  if (gvResult) return gvResult;

  return {
    name: "",
    brand: null,
    category: null,
    confidence: 0,
    provider: "manual",
  };
}
