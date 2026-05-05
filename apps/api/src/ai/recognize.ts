import { env } from "../lib/env.js";

export interface AiResult {
  name: string;
  brand: string | null;
  category: string | null;
  confidence: number;
  provider: "cloudflare" | "gemini" | "huggingface" | "google_vision" | "manual";
}

// ─── Cloudflare Workers AI — Llama 3.2 Vision (free, no card) ───────────────

async function recognizeWithCloudflare(imageBase64: string): Promise<AiResult | null> {
  if (!env.CLOUDFLARE_AI_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  // LLaVA expects image as byte array, not base64 string
  const imageBytes = Array.from(Buffer.from(imageBase64, "base64"));

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imageBytes,
          prompt: "USER: <image>\nWhat is the product name and brand shown in this image or price tag? Reply with only: {\"name\":\"...\",\"brand\":\"...\"}. If unknown, reply: {\"name\":\"\",\"brand\":null}\nASSISTANT:",
          max_tokens: 100,
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Cloudflare AI] HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    type CfResponse = { result?: { description?: string; response?: string }; success?: boolean };
    const data = (await res.json()) as CfResponse;
    const text = (data.result?.description ?? data.result?.response ?? "").trim();
    if (!text) return null;

    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      try {
        type ParsedResult = { name?: string; brand?: string | null };
        const parsed = JSON.parse(jsonMatch[0]) as ParsedResult;
        if (parsed.name && typeof parsed.name === "string" && parsed.name.length > 0) {
          return { name: parsed.name, brand: parsed.brand ?? null, category: null, confidence: 0.75, provider: "cloudflare" };
        }
      } catch { /* fallthrough to plain text */ }
    }

    // Fallback: use raw text as name if it looks like a product name (short)
    const clean = text.replace(/[{}"\n]/g, "").trim();
    if (clean.length > 0 && clean.length < 100) {
      return { name: clean, brand: null, category: null, confidence: 0.5, provider: "cloudflare" };
    }
    return null;
  } catch (err) {
    console.error("[Cloudflare AI] error:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Google Gemini Flash (free tier: 1500 req/day) ────────────────────────────

async function recognizeWithGemini(imageBase64: string): Promise<AiResult | null> {
  if (!env.GEMINI_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
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

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Gemini] HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    }

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
  } catch (err) {
    console.error("[Gemini] fetch error:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Hugging Face (VQA — visual question answering) ──────────────────────────

async function recognizeWithHuggingFace(imageBase64: string): Promise<AiResult | null> {
  if (!env.HUGGINGFACE_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  // Use BLIP VQA to ask a specific question about the product
  const vqaModel = "Salesforce/blip-vqa-large";

  try {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${vqaModel}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: {
            question: "What is the name of this product or brand shown on the label or price tag?",
            image: imageBase64,
          },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) return null;

    type VqaResponse = Array<{ answer?: string; score?: number }> | { answer?: string };
    const data = (await res.json()) as VqaResponse;
    const answer = Array.isArray(data) ? data[0]?.answer : data.answer;
    if (!answer || answer.toLowerCase() === "yes" || answer.toLowerCase() === "no") return null;

    return {
      name: answer.trim(),
      brand: null,
      category: null,
      confidence: Array.isArray(data) ? (data[0]?.score ?? 0.5) : 0.5,
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

// ─── Main recognizer: Cloudflare → Gemini → HuggingFace → Google Vision → manual

export async function recognizeProduct(imageBuffer: Buffer): Promise<AiResult> {
  const imageBase64 = imageBuffer.toString("base64");

  const result =
    (await recognizeWithCloudflare(imageBase64)) ??
    (await recognizeWithGemini(imageBase64)) ??
    (await recognizeWithHuggingFace(imageBase64)) ??
    (await recognizeWithGoogleVision(imageBase64));

  return result ?? { name: "", brand: null, category: null, confidence: 0, provider: "manual" };
}
