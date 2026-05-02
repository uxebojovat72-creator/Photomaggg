import { env } from "../lib/env.js";

export interface UploadResult {
  url: string;
  path: string;
}

// ─── Supabase Storage ─────────────────────────────────────────────────────────

async function uploadToSupabase(
  buffer: Buffer,
  path: string,
  mimeType: string
): Promise<UploadResult> {
  const uploadUrl = `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${path}`;

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": mimeType,
      "x-upsert": "true",
    },
    body: buffer as unknown as BodyInit,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upload failed: ${err}`);
  }

  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/${path}`;
  return { url: publicUrl, path };
}

// ─── Simple local fallback (dev only) ────────────────────────────────────────

import fs from "node:fs/promises";
import nodePath from "node:path";

async function uploadToLocal(buffer: Buffer, path: string): Promise<UploadResult> {
  const dir = nodePath.join(process.cwd(), "uploads", nodePath.dirname(path));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(nodePath.join(process.cwd(), "uploads", path), buffer);
  return { url: `/uploads/${path}`, path };
}

// ─── Public API ───────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "";

export async function uploadPhoto(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<UploadResult> {
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `prices/${Date.now()}-${filename}.${ext}`;

  if (SUPABASE_URL && SUPABASE_SERVICE_KEY && STORAGE_BUCKET) {
    return uploadToSupabase(buffer, path, mimeType);
  }

  // Dev fallback
  return uploadToLocal(buffer, path);
}

export async function deletePhoto(path: string): Promise<void> {
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY && STORAGE_BUCKET) {
    await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      }
    );
  } else {
    const fullPath = nodePath.join(process.cwd(), "uploads", path);
    await fs.unlink(fullPath).catch(() => {});
  }
}
