export interface StoreChain {
  name: string;
  category: "nearby" | "discount" | "hyper" | "regional";
}

export const STORE_CHAINS: StoreChain[] = [
  // Федеральные (у дома / супермаркеты)
  { name: "Пятёрочка", category: "nearby" },
  { name: "Магнит", category: "nearby" },
  { name: "Перекрёсток", category: "nearby" },
  { name: "Дикси", category: "nearby" },
  { name: "ВкусВилл", category: "nearby" },
  { name: "Spar", category: "nearby" },
  { name: "Eurospar", category: "nearby" },
  { name: "Азбука Вкуса", category: "nearby" },
  // Дискаунтеры
  { name: "Чижик", category: "discount" },
  { name: "Светофор", category: "discount" },
  { name: "Маяк", category: "discount" },
  { name: "Да!", category: "discount" },
  { name: "Моя цена", category: "discount" },
  { name: "Победа", category: "discount" },
  { name: "Доброцен", category: "discount" },
  // Гипермаркеты
  { name: "Лента", category: "hyper" },
  { name: "О'КЕЙ", category: "hyper" },
  { name: "METRO", category: "hyper" },
  { name: "Ашан", category: "hyper" },
  { name: "Глобус", category: "hyper" },
  // Региональные
  { name: "Мария-Ра", category: "regional" },
  { name: "Монетка", category: "regional" },
  { name: "Самбери", category: "regional" },
  { name: "Кировский", category: "regional" },
  { name: "Бегемаг", category: "regional" },
  { name: "Гулливер", category: "regional" },
  { name: "Байрам", category: "regional" },
];

export const CATEGORY_LABELS: Record<StoreChain["category"], string> = {
  nearby: "Супермаркеты",
  discount: "Дискаунтеры",
  hyper: "Гипермаркеты",
  regional: "Региональные",
};

export const ALL_STORE_NAMES = STORE_CHAINS.map((s) => s.name);
