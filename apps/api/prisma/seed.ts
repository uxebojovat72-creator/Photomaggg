import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Countries
  const countries = await Promise.all([
    prisma.country.upsert({
      where: { code: "RU" },
      update: {},
      create: { name: "Russia", code: "RU", currencyCode: "RUB", flagEmoji: "🇷🇺" },
    }),
    prisma.country.upsert({
      where: { code: "US" },
      update: {},
      create: { name: "United States", code: "US", currencyCode: "USD", flagEmoji: "🇺🇸" },
    }),
    prisma.country.upsert({
      where: { code: "DE" },
      update: {},
      create: { name: "Germany", code: "DE", currencyCode: "EUR", flagEmoji: "🇩🇪" },
    }),
    prisma.country.upsert({
      where: { code: "GB" },
      update: {},
      create: { name: "United Kingdom", code: "GB", currencyCode: "GBP", flagEmoji: "🇬🇧" },
    }),
    prisma.country.upsert({
      where: { code: "TR" },
      update: {},
      create: { name: "Turkey", code: "TR", currencyCode: "TRY", flagEmoji: "🇹🇷" },
    }),
  ]);

  const russia = countries[0];

  // Cities
  const moscow = await prisma.city.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Moscow",
      countryId: russia.id,
      latitude: 55.7558,
      longitude: 37.6173,
    },
  });

  // Categories
  const foodCat = await prisma.category.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    update: {},
    create: { id: "00000000-0000-0000-0000-000000000010", name: "Food & Drinks", iconUrl: null },
  });

  await Promise.all([
    prisma.category.upsert({
      where: { id: "00000000-0000-0000-0000-000000000011" },
      update: {},
      create: { id: "00000000-0000-0000-0000-000000000011", name: "Dairy", parentId: foodCat.id },
    }),
    prisma.category.upsert({
      where: { id: "00000000-0000-0000-0000-000000000012" },
      update: {},
      create: { id: "00000000-0000-0000-0000-000000000012", name: "Bread & Bakery", parentId: foodCat.id },
    }),
    prisma.category.upsert({
      where: { id: "00000000-0000-0000-0000-000000000020" },
      update: {},
      create: { id: "00000000-0000-0000-0000-000000000020", name: "Electronics" },
    }),
    prisma.category.upsert({
      where: { id: "00000000-0000-0000-0000-000000000030" },
      update: {},
      create: { id: "00000000-0000-0000-0000-000000000030", name: "Household Goods" },
    }),
  ]);

  // Admin user
  const passwordHash = await bcrypt.hash("Admin1234!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@priceradar.app" },
    update: {},
    create: {
      email: "admin@priceradar.app",
      passwordHash,
      displayName: "Admin",
      role: "admin",
      trustScore: 100,
      countryId: russia.id,
      cityId: moscow.id,
    },
  });

  // Demo store
  await prisma.store.upsert({
    where: { id: "00000000-0000-0000-0000-000000000100" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000100",
      name: "Pyaterochka",
      chainName: "Пятёрочка",
      cityId: moscow.id,
      countryId: russia.id,
      address: "Tverskaya St, 1",
      latitude: 55.7597,
      longitude: 37.6165,
      createdBy: admin.id,
      verified: true,
    },
  });

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
