import { useState, useEffect, useRef } from "react";
import { MapPin, Navigation, Globe, X, ChevronDown, ChevronUp, Search } from "lucide-react";
import { geoApi } from "@/api/geo.api";
import { useDebounce } from "@/hooks/useDebounce";
import {
  CityFilter, MOSCOW_METRO, ALL_CITIES,
  POPULAR_CITIES, POPULAR_REGIONS,
  REGION_EXPANSION, loadCityFilter, saveCityFilter, getEffectiveCities,
} from "@/lib/city-filter";

export { getEffectiveCities };

export { loadCityFilter, saveCityFilter };
export type { CityFilter };

// ─── Bottom-sheet city picker ─────────────────────────────────────────────────

interface CityPickerSheetProps {
  current: CityFilter;
  onChange: (f: CityFilter) => void;
  onClose: () => void;
}

export function CityPickerSheet({ current, onChange, onClose }: CityPickerSheetProps) {
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [expandedRegions, setExpandedRegions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQ = useDebounce(searchQ, 350);

  useEffect(() => {
    if (debouncedQ.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    geoApi.cities({ q: debouncedQ })
      .then((cities) => setSearchResults(cities.map((c) => c.name)))
      .catch(() => {})
      .finally(() => setSearching(false));
  }, [debouncedQ]);

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
      if (state.includes("Московская") || cityName === "Москва") {
        select({ ...MOSCOW_METRO, expanded: current.expanded });
        return;
      }
      select({ label: cityName, cities: [cityName], expanded: current.expanded });
    } catch {
      setGpsError("Нет доступа к геолокации");
    } finally {
      setGpsLoading(false);
    }
  };

  const toggleRegion = (r: string) =>
    setExpandedRegions((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);

  const isSelected = (label: string) => current.label === label;
  const hasExpansion = (label: string) => label in REGION_EXPANSION && REGION_EXPANSION[label]?.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div
        className="bg-background rounded-t-2xl border-t shadow-2xl flex flex-col"
        style={{ maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="px-4 pb-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base">Ваш город</h2>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Найти любой город…"
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoComplete="off"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 border-2 border-primary/50 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="rounded-lg border bg-card overflow-hidden mb-3 max-h-36 overflow-y-auto">
              {searchResults.map((name) => (
                <button
                  key={name}
                  onClick={() => { select({ label: name, cities: [name], expanded: current.expanded }); setSearchQ(""); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-accent border-b last:border-0"
                >
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* GPS */}
          <button
            onClick={detectGps}
            disabled={gpsLoading}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left mb-1"
          >
            <Navigation className={`h-4 w-4 text-primary flex-shrink-0 ${gpsLoading ? "animate-pulse" : ""}`} />
            <div className="flex-1">
              <p className="text-sm font-medium">{gpsLoading ? "Определяем…" : "Определить по GPS"}</p>
              <p className="text-xs text-muted-foreground">Автоматически найдёт ваш город</p>
            </div>
          </button>
          {gpsError && <p className="text-xs text-red-400 mb-2">{gpsError}</p>}

          {/* All cities */}
          <button
            onClick={() => select(ALL_CITIES)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left mb-2 ${
              isSelected(ALL_CITIES.label) ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
            }`}
          >
            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Все города</p>
              <p className="text-xs text-muted-foreground">Без фильтра — вся Россия</p>
            </div>
            {isSelected(ALL_CITIES.label) && <div className="h-2 w-2 rounded-full bg-primary" />}
          </button>

          {/* Expanded mode toggle */}
          {current.cities.length > 0 && (
            <button
              onClick={() => onChange({ ...current, expanded: !current.expanded })}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm text-left transition-colors ${
                current.expanded ? "border-primary/50 bg-primary/10 text-primary" : "border-border hover:bg-accent text-muted-foreground"
              }`}
            >
              <span className="flex-1">
                {current.expanded ? "✓ Расширенный режим" : "Расширить на область/район"}
              </span>
              <span className="text-xs">
                {current.expanded
                  ? `${(REGION_EXPANSION[current.label] ?? [current.label]).length} городов`
                  : hasExpansion(current.label) ? "включить" : "нет данных"}
              </span>
            </button>
          )}
        </div>

        {/* Separator */}
        <div className="border-t mx-4 my-1 flex-shrink-0" />

        {/* Scrollable region list */}
        <div className="overflow-y-auto flex-1 px-4 pb-6">
          <p className="text-xs text-muted-foreground font-medium py-2">Популярные города по регионам</p>
          {POPULAR_REGIONS.map((region) => {
            const cities = POPULAR_CITIES.filter((c) => c.region === region);
            const open = expandedRegions.includes(region);
            return (
              <div key={region} className="mb-2">
                <button
                  onClick={() => toggleRegion(region)}
                  className="w-full flex items-center justify-between py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <span>{region}</span>
                  {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {open && (
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {cities.map((city) => (
                      <button
                        key={city.label}
                        onClick={() => select({ label: city.label, cities: city.cities, expanded: current.expanded })}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                          isSelected(city.label)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-accent"
                        }`}
                      >
                        {city.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── City chip button (reusable trigger) ──────────────────────────────────────

export function CityChip({
  filter,
  onClick,
}: {
  filter: CityFilter;
  onClick: () => void;
}) {
  const isAll = filter.cities.length === 0;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-card hover:bg-accent transition-colors text-sm flex-shrink-0"
    >
      {isAll
        ? <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        : <MapPin className="h-3.5 w-3.5 text-primary" />
      }
      <span className={isAll ? "text-muted-foreground" : "font-medium"}>
        {filter.label}
        {filter.expanded && !isAll ? " +" : ""}
      </span>
      <ChevronDown className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}
