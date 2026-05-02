import { Queue, Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { recognizeProduct } from "../ai/recognize.js";
import { prisma } from "../lib/prisma.js";

const QUEUE_NAME = "photo-recognition";

export const photoQueue = new Queue(QUEUE_NAME, { connection: redis });

export interface PhotoJobData {
  priceId: string;
  photoUrl: string;
}

export const photoWorker = new Worker<PhotoJobData>(
  QUEUE_NAME,
  async (job) => {
    const { priceId, photoUrl } = job.data;

    const res = await fetch(photoUrl);
    if (!res.ok) throw new Error(`Failed to fetch photo: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const result = await recognizeProduct(buffer);
    if (!result.name) return;

    // Update or create product from AI result
    const price = await prisma.price.findUnique({
      where: { id: priceId },
      include: { product: true },
    });
    if (!price) return;

    if (price.product.aiGenerated && !price.product.aiConfirmed) {
      await prisma.product.update({
        where: { id: price.productId },
        data: {
          name: result.name,
          brand: result.brand ?? price.product.brand,
        },
      });
    }

    await prisma.price.update({
      where: { id: priceId },
      data: { aiRecognizedName: result.name },
    });
  },
  { connection: redis, concurrency: 5 }
);

photoWorker.on("failed", (job, err) => {
  console.error(`[PhotoWorker] job ${job?.id} failed:`, err.message);
});
