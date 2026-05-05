import { env } from "../lib/env.js";

export interface AiResult {
  name: string;
  brand: string | null;
  category: string | null;
  confidence: number;
  provider: "gemini" | "huggingface" | "google_vision" | "manual";
}

// ─── Google Gemini Flash (free tier: 1500 req/day) ────────────────────────────

async function recognizeWithGemini(imageBase64: string): Promise<AiResult | null> {
  if (!env.GEMINI_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Look at this image of a product or price tag. Extract the product information and respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{"name":"product name","brand":"brand or null","category":"food/drink/household/electronics/other or null","confidence":0.0}

Rules:
- name: the product name as shown on packaging or price tag (in original language)
- brand: manufacturer brand if visible, otherwise null
- category: one of food, drink, household, electronics, cosmetics, other, or null
- confidence: 0.0 to 1.0 how confident you are

If you cannot identify the product, return: {"name":"","brand":null,"category":null,"confidence":0}`,
                },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 150,
          },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) return null;

    type GeminiResponse = {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;

    // Strip markdown code fences if present
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    type ParsedResult = { name?: string; brand?: string | null; category?: string | null; confidence?: number };
    const parsed = JSON.parse(clean) as ParsedResult;
    if (typeof parsed.name !== "string") return null;

    return {
      name: parsed.name,
      brand: parsed.brand ?? null,
      category: parsed.category ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
      provider: "gemini",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Hugging Face ─────────────────────────────────────────────────────────────

async function recognizeWithHuggingFace(imageBase64: string): Promise<AiResult | null> {
  if (!env.HUGGINGFACE_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${env.HUGGINGFACE_MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: imageBase64, parameters: { max_new_tokens: 100 } }),
        signal: controller.signal,
      }
    );

    if (!res.ok) return null;

    const data = (await res.json()) as Array<{ generated_text?: string }> | { generated_text?: string };
    const text = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
    if (!text) return null;

    const words = text.trim().split(/\s+/);
    return {
      name: text.trim(),
      brand: words.length > 1 ? words[0] : null,
      category: null,
      confidence: 0.6,
      provider: "huggingface",
    };
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
        labelAnnotations?: Array<{ description: string }>;
        logoAnnotations?: Array<{ description: string }>;
      }>;
    };

    const data = (await res.json()) as VisionResponse;
    const response = data.responses?.[0];
    if (!response) return null;

    const name =
      response.webDetection?.bestGuessLabels?.[0]?.label ??
      response.labelAnnotations?.[0]?.description ??
      "Unknown product";
    const brand = response.logoAnnotations?.[0]?.description ?? null;

    return { name, brand, category: null, confidence: 0.7, provider: "google_vision" };
  } catch {
    return null;
  }
}

// ─── Main recognizer: Gemini → HuggingFace → Google Vision → manual ──────────

export async function recognizeProduct(imageBuffer: Buffer): Promise<AiResult> {
  const imageBase64 = imageBuffer.toString("base64");

  const result =
    (await recognizeWithGemini(imageBase64)) ??
    (await recognizeWithHuggingFace(imageBase64)) ??
    (await recognizeWithGoogleVision(imageBase64));

  return result ?? { name: "", brand: null, category: null, confidence: 0, provider: "manual" };
}
