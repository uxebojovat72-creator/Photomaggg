// ─── City filter shared state ─────────────────────────────────────────────────
// Stored in localStorage and shared across HomePage, SearchPage, etc.

export interface CityFilter {
  label: string;    // Display name: "Москва и МО", "Краснодар", "Все города"
  cities: string[]; // Exact city names passed to the API
  expanded?: boolean; // Include region/oblast cities
}

// Only Moscow metro is merged — prices across MO are similar
export const MOSCOW_METRO: CityFilter = {
  label: "Москва и МО",
  cities: ["Москва", "Московская область"],
};
export const ALL_CITIES: CityFilter = { label: "Все города", cities: [] };

// When "expanded" mode is on, these extra cities are added to the filter.
// Keeps each oblast/krai separate — Выкса ≠ Нижний Новгород.
export const REGION_EXPANSION: Record<string, string[]> = {
  "Москва":             ["Москва", "Московская область"],
  "Московская область": ["Москва", "Московская область"],
  "Санкт-Петербург":   ["Санкт-Петербург", "Ленинградская область"],
  "Краснодар":         ["Краснодар", "Краснодарский край", "Сочи", "Новороссийск", "Армавир", "Майкоп"],
  "Казань":            ["Казань", "Татарстан", "Набережные Челны"],
  "Новосибирск":       ["Новосибирск", "Новосибирская область", "Бердск"],
  "Екатеринбург":      ["Екатеринбург", "Свердловская область", "Нижний Тагил", "Каменск-Уральский"],
  "Нижний Новгород":   ["Нижний Новгород", "Нижегородская область", "Дзержинск", "Арзамас"],
  "Красноярск":        ["Красноярск", "Красноярский край"],
  "Ростов-на-Дону":    ["Ростов-на-Дону", "Ростовская область", "Таганрог", "Новочеркасск"],
  "Уфа":               ["Уфа", "Башкортостан", "Стерлитамак"],
  "Пермь":             ["Пермь", "Пермский край"],
  "Омск":              ["Омск", "Омская область"],
  "Челябинск":         ["Челябинск", "Челябинская область", "Магнитогорск", "Миасс"],
  "Воронеж":           ["Воронеж", "Воронежская область"],
  "Самара":            ["Самара", "Самарская область", "Тольятти", "Сызрань"],
  "Тюмень":            ["Тюмень", "Тюменская область"],
  "Кемерово":          ["Кемерово", "Кемеровская область", "Новокузнецк", "Прокопьевск"],
  "Томск":             ["Томск", "Томская область"],
  "Саратов":           ["Саратов", "Саратовская область", "Энгельс"],
  "Ярославль":         ["Ярославль", "Ярославская область"],
  "Иркутск":           ["Иркутск", "Иркутская область", "Братск"],
  "Мурманск":          ["Мурманск", "Мурманская область"],
  "Хабаровск":         ["Хабаровск", "Хабаровский край"],
  "Владивосток":       ["Владивосток", "Приморский край"],
  "Барнаул":           ["Барнаул", "Алтайский край"],
  // Кавказ
  "Махачкала":         ["Махачкала", "Дагестан", "Хасавюрт", "Дербент", "Каспийск"],
  "Грозный":           ["Грозный", "Чеченская Республика"],
  "Нальчик":           ["Нальчик", "Кабардино-Балкария"],
  "Владикавказ":       ["Владикавказ", "Северная Осетия"],
  "Ставрополь":        ["Ставрополь", "Ставропольский край", "Пятигорск", "Кисловодск", "Невинномысск"],
  "Черкесск":          ["Черкесск", "Карачаево-Черкесия"],
  "Майкоп":            ["Майкоп", "Адыгея"],
  "Элиста":            ["Элиста", "Калмыкия"],
  "Нальчик (КБР)":     ["Нальчик", "Кабардино-Балкарская Республика"],
  // Поволжье
  "Волгоград":         ["Волгоград", "Волгоградская область"],
  "Астрахань":         ["Астрахань", "Астраханская область"],
  "Пенза":             ["Пенза", "Пензенская область"],
  "Ульяновск":         ["Ульяновск", "Ульяновская область"],
  "Оренбург":          ["Оренбург", "Оренбургская область"],
  // Урал
  "Ижевск":            ["Ижевск", "Удмуртская Республика"],
  "Киров":             ["Киров", "Кировская область"],
  // Сибирь / ДВ
  "Чита":              ["Чита", "Забайкальский край"],
  "Якутск":            ["Якутск", "Республика Саха"],
  "Благовещенск":      ["Благовещенск", "Амурская область"],
  "Южно-Сахалинск":    ["Южно-Сахалинск", "Сахалинская область"],
  // Выкса и другие малые
  "Выкса":             ["Выкса"], // deliberately NOT merged with Нижний Новгород
};

/** Returns the cities to pass to the API, respecting expanded mode */
export function getEffectiveCities(filter: CityFilter): string[] {
  if (filter.cities.length === 0) return []; // All cities — no filter
  if (!filter.expanded) return filter.cities;

  // Expanded mode: union of expansion sets for each city
  const set = new Set<string>();
  for (const c of filter.cities) {
    const exp = REGION_EXPANSION[c];
    if (exp) exp.forEach((x) => set.add(x));
    else set.add(c);
  }
  return Array.from(set);
}

// ─── Popular cities list ──────────────────────────────────────────────────────

export interface PopularCity {
  label: string;
  cities: string[];
  region: string;
}

export const POPULAR_CITIES: PopularCity[] = [
  // Москва
  { label: "Москва и МО",         cities: ["Москва", "Московская область"], region: "Центр" },
  { label: "Санкт-Петербург",      cities: ["Санкт-Петербург"],              region: "Центр" },
  { label: "Ярославль",            cities: ["Ярославль"],                    region: "Центр" },
  { label: "Воронеж",              cities: ["Воронеж"],                      region: "Центр" },
  // Поволжье
  { label: "Казань",               cities: ["Казань"],                       region: "Поволжье" },
  { label: "Нижний Новгород",      cities: ["Нижний Новгород"],              region: "Поволжье" },
  { label: "Самара",               cities: ["Самара"],                       region: "Поволжье" },
  { label: "Волгоград",            cities: ["Волгоград"],                    region: "Поволжье" },
  { label: "Саратов",              cities: ["Саратов"],                      region: "Поволжье" },
  { label: "Астрахань",            cities: ["Астрахань"],                    region: "Поволжье" },
  { label: "Ульяновск",            cities: ["Ульяновск"],                    region: "Поволжье" },
  { label: "Пенза",                cities: ["Пенза"],                        region: "Поволжье" },
  { label: "Оренбург",             cities: ["Оренбург"],                     region: "Поволжье" },
  // Юг / Краснодар
  { label: "Краснодар",            cities: ["Краснодар"],                    region: "Юг" },
  { label: "Ростов-на-Дону",       cities: ["Ростов-на-Дону"],               region: "Юг" },
  { label: "Ставрополь",           cities: ["Ставрополь"],                   region: "Юг" },
  { label: "Сочи",                 cities: ["Сочи"],                         region: "Юг" },
  // Кавказ
  { label: "Махачкала (Дагестан)", cities: ["Махачкала"],                    region: "Кавказ" },
  { label: "Грозный",              cities: ["Грозный"],                      region: "Кавказ" },
  { label: "Нальчик",              cities: ["Нальчик"],                      region: "Кавказ" },
  { label: "Владикавказ",          cities: ["Владикавказ"],                  region: "Кавказ" },
  { label: "Черкесск",             cities: ["Черкесск"],                     region: "Кавказ" },
  { label: "Майкоп",               cities: ["Майкоп"],                       region: "Кавказ" },
  // Урал
  { label: "Екатеринбург",         cities: ["Екатеринбург"],                 region: "Урал" },
  { label: "Челябинск",            cities: ["Челябинск"],                    region: "Урал" },
  { label: "Пермь",                cities: ["Пермь"],                        region: "Урал" },
  { label: "Уфа",                  cities: ["Уфа"],                          region: "Урал" },
  { label: "Ижевск",               cities: ["Ижевск"],                       region: "Урал" },
  { label: "Тюмень",               cities: ["Тюмень"],                       region: "Урал" },
  { label: "Оренбург",             cities: ["Оренбург"],                     region: "Урал" },
  // Сибирь
  { label: "Новосибирск",          cities: ["Новосибирск"],                  region: "Сибирь" },
  { label: "Омск",                 cities: ["Омск"],                         region: "Сибирь" },
  { label: "Красноярск",           cities: ["Красноярск"],                   region: "Сибирь" },
  { label: "Кемерово",             cities: ["Кемерово"],                     region: "Сибирь" },
  { label: "Томск",                cities: ["Томск"],                        region: "Сибирь" },
  { label: "Иркутск",              cities: ["Иркутск"],                      region: "Сибирь" },
  { label: "Барнаул",              cities: ["Барнаул"],                      region: "Сибирь" },
  { label: "Чита",                 cities: ["Чита"],                         region: "Сибирь" },
  // Дальний Восток
  { label: "Хабаровск",            cities: ["Хабаровск"],                    region: "Дальний Восток" },
  { label: "Владивосток",          cities: ["Владивосток"],                  region: "Дальний Восток" },
  { label: "Якутск",               cities: ["Якутск"],                       region: "Дальний Восток" },
  { label: "Мурманск",             cities: ["Мурманск"],                     region: "Север" },
  // Отдельные
  { label: "Выкса",                cities: ["Выкса"],                        region: "Поволжье" },
  { label: "Киров",                cities: ["Киров"],                        region: "Поволжье" },
];

// Unique regions for grouping
export const POPULAR_REGIONS = [...new Set(POPULAR_CITIES.map((c) => c.region))];

// ─── localStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "priceradar-city-v2";

export function loadCityFilter(): CityFilter {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CityFilter;
  } catch { /* ignore */ }
  return MOSCOW_METRO;
}

export function saveCityFilter(f: CityFilter) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
}
