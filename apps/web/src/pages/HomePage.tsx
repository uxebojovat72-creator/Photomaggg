import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircle, TrendingDown, ReceiptText, MapPin, Navigation, ChevronDown, X, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { pricesApi } from "@/api/prices.api";
import { formatPrice, formatRelativeDate } from "@priceradar/shared";
import type { FeedItem } from "@priceradar/shared";

// ─── City / region filter ─────────────────────────────────────────────────────

interface CityFilter {
  label: string;   // shown in UI, e.g. "Москва и МО"
  cities: string[]; // passed to API, e.g. ["Москва", "Московская область"]
}

// Only Moscow metro is merged — all other regions stay separate
const MOSCOW_METRO: CityFilter = { label: "Москва и МО", cities: ["Москва", "Московская область"] };
const ALL_CITIES: CityFilter = { label: "Все города", cities: [] };

const POPULAR: CityFilter[] = [
  MOSCOW_METRO,
  { label: "Санкт-Петербург", cities: ["Санкт-Петербург"] },
  { label: "Краснодар",        cities: ["Краснодар"] },
  { label: "Казань",           cities: ["Казань"] },
  { label: "Новосибирск",      cities: ["Новосибирск"] },
  { label: "Екатеринбург",     cities: ["Екатеринбург"] },
  { label: "Нижний Новгород",  cities: ["Нижний Новгород"] },
  { label: "Красноярск",       cities: ["Красноярск"] },
  { label: "Ростов-на-Дону",   cities: ["Ростов-на-Дону"] },
  { label: "Уфа",              cities: ["Уфа"] },
  { label: "Пермь",            cities: ["Пермь"] },
  { label: "Омск",             cities: ["Омск"] },
  { label: "Челябинск",        cities: ["Челябинск"] },
  { label: "Воронеж",          cities: ["Воронеж"] },
  { label: "Самара",           cities: ["Самара"] },
  { label: "Тюмень",           cities: ["Тюмень"] },
  { label: "Кемерово",         cities: ["Кемерово"] },
  { label: "Томск",            cities: ["Томск"] },
  { label: "Саратов",          cities: ["Саратов"] },
  { label: "Ярославль",        cities: ["Ярославль"] },
  { label: "Иркутск",          cities: ["Иркутск"] },
  { label: "Мурманск",         cities: ["Мурманск"] },
  { label: "Хабаровск",        cities: ["Хабаровск"] },
  { label: "Владивосток",      cities: ["Владивосток"] },
  { label: "Барнаул",          cities: ["Барнаул"] },
  { label: "Выкса",            cities: ["Выкса"] },
];

const STORAGE_KEY = "priceradar-city-v2";

function loadCityFilter(): CityFilter {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CityFilter;
  } catch { /* ignore */ }
  return MOSCOW_METRO;
}

function saveCityFilter(f: CityFilter) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
}

// ─── Components ───────────────────────────────────────────────────────────────

function PriceCard({ item }: { item: FeedItem }) {
  const navigate = useNavigate();
  return (
    <div
      className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 cursor-pointer transition-colors"
      onClick={() => navigate(`/products/${item.productId}`)}
    >
      {item.photoUrl && (
        <img src={item.photoUrl} alt={item.product?.name} className="h-16 w-16 rounded-md object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.product?.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {item.store?.name} · {item.store?.city?.name}
          {item.store?.city?.country && `, ${item.store.city.country.flagEmoji}`}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-bold text-primary">
            {formatPrice(Number(item.price), item.currencyCode, "ru-RU")}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <Badge variant={item.status === "approved" ? "success" : "warning"}>
          {item.status === "approved" ? "✓" : "ожидает"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatRelativeDate(item.createdAt, "ru")}
        </span>
      </div>
    </div>
  );
}

function PriceCardSkeleton() {
  return (
    <div className="flex gap-3 p-3 rounded-lg border">
      <Skeleton className="h-16 w-16 rounded-md flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    </div>
  );
}

// ─── City Picker ──────────────────────────────────────────────────────────────

function CityPicker({
  current,
  onChange,
  onClose,
}: {
  current: CityFilter;
  onChange: (f: CityFilter) => void;
  onClose: () => void;
}) {
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const select = (f: CityFilter) => { onChange(f); onClose(); };

  const detectGps = async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=ru`,
        { headers: { "User-Agent": "PriceRadar/1.0" } }
      );
      if (!res.ok) throw new Error();
      type N = { address?: { city?: string; town?: string; village?: string; state?: string } };
      const d = (await res.json()) as N;
      const cityName = d.address?.city ?? d.address?.town ?? d.address?.village ?? null;
      const state = d.address?.state ?? "";

      if (!cityName) { setGpsError("Не удалось определить город"); return; }

      // Московская область → merge with Москва
      if (state.includes("Московская") || cityName === "Москва") {
        select(MOSCOW_METRO);
        return;
      }
      select({ label: cityName, cities: [cityName] });
    } catch {
      setGpsError("Нет доступа к геолокации");
    } finally {
      setGpsLoading(false);
    }
  };

  const isSelected = (f: CityFilter) => f.label === current.label;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="bg-background rounded-t-2xl border-t shadow-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="px-4 pb-4 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base">Ваш город</h2>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Показываем цены из вашего города. Москва и Московская область объединены — цены в них схожи.
          </p>

          {/* GPS */}
          <button
            onClick={detectGps}
            disabled={gpsLoading}
            className="flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
          >
            <Navigation className={`h-5 w-5 text-primary flex-shrink-0 ${gpsLoading ? "animate-pulse" : ""}`} />
            <div>
              <p className="text-sm font-medium">{gpsLoading ? "Определяем местоположение…" : "Определить автоматически"}</p>
              <p className="text-xs text-muted-foreground">По GPS</p>
            </div>
          </button>
          {gpsError && <p className="text-xs text-red-400 -mt-1">{gpsError}</p>}

          {/* All cities */}
          <button
            onClick={() => select(ALL_CITIES)}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
              isSelected(ALL_CITIES) ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
            }`}
          >
            <Globe className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Все города</p>
              <p className="text-xs text-muted-foreground">Без фильтра по городу</p>
            </div>
            {isSelected(ALL_CITIES) && <div className="ml-auto h-2 w-2 rounded-full bg-primary" />}
          </button>

          {/* Popular cities */}
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-2">Популярные города</p>
            <div className="overflow-y-auto max-h-52 -mx-1 px-1 space-y-1">
              {POPULAR.map((city) => (
                <button
                  key={city.label}
                  onClick={() => select(city)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                    isSelected(city) ? "bg-primary/15 text-primary font-medium" : "hover:bg-accent"
                  }`}
                >
                  <MapPin className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="text-sm">{city.label}</span>
                  {isSelected(city) && <div className="ml-auto h-2 w-2 rounded-full bg-primary" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate();
  const [cityFilter, setCityFilter] = useState<CityFilter>(loadCityFilter);
  const [showPicker, setShowPicker] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFeed = useCallback((filter: CityFilter) => {
    setLoading(true);
    const params = filter.cities.length > 0 ? { cities: filter.cities, limit: 30 } : { limit: 30 };
    pricesApi.getFeed(params)
      .then((res) => setFeed(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadFeed(cityFilter); }, [cityFilter, loadFeed]);

  const handleCityChange = (f: CityFilter) => {
    setCityFilter(f);
    saveCityFilter(f);
  };

  const isAllCities = cityFilter.cities.length === 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      {/* Hero */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              Последние цены
            </h1>
            <p className="text-xs text-muted-foreground">Обновляется в реальном времени</p>
          </div>
          {/* City chip */}
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-card hover:bg-accent transition-colors text-sm flex-shrink-0"
          >
            {isAllCities
              ? <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              : <MapPin className="h-3.5 w-3.5 text-primary" />
            }
            <span className={isAllCities ? "text-muted-foreground" : "font-medium"}>
              {cityFilter.label}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => navigate("/receipt-scan")} className="w-full">
            <ReceiptText className="h-4 w-4" />
            Сканировать чек
          </Button>
          <Button onClick={() => navigate("/add-price")} className="w-full">
            <PlusCircle className="h-4 w-4" />
            Добавить цену
          </Button>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-2">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <PriceCardSkeleton key={i} />)
          : feed.length === 0
          ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-4xl mb-3">📭</p>
              <p className="font-medium">Нет цен в этом городе</p>
              <p className="text-sm mt-1">
                {isAllCities ? "Будьте первым, кто добавит цену!" : (
                  <>Попробуйте{" "}
                    <button className="underline text-primary" onClick={() => handleCityChange(ALL_CITIES)}>
                      все города
                    </button>
                  </>
                )}
              </p>
              <Button className="mt-4" onClick={() => navigate("/add-price")}>
                Добавить первую цену
              </Button>
            </div>
          )
          : feed.map((item) => <PriceCard key={item.id} item={item} />)
        }
      </div>

      {showPicker && (
        <CityPicker
          current={cityFilter}
          onChange={handleCityChange}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
