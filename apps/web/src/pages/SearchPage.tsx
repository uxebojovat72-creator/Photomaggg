import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { productsApi } from "@/api/products.api";
import { pricesApi } from "@/api/prices.api";
import { useDebounce } from "@/hooks/useDebounce";
import { formatPrice } from "@priceradar/shared";
import type { Product } from "@priceradar/shared";
import { CityChip, CityPickerSheet, loadCityFilter, saveCityFilter, getEffectiveCities } from "@/components/CityPicker";
import type { CityFilter } from "@/components/CityPicker";

// Best local price for a product in the selected cities
function useLocalPrice(productId: string, cities: string[]) {
  const [price, setPrice] = useState<{ value: number; currency: string; store: string } | null>(null);
  useEffect(() => {
    if (!productId) return;
    const params = cities.length > 0 ? { cities, limit: 1 } : { limit: 1 };
    pricesApi.getFeed({ ...params, limit: 5 })
      .then((res) => {
        const items = (res?.data ?? []).filter((i) => i.productId === productId && i.status === "approved");
        if (items.length > 0) {
          const best = items.reduce((a, b) => Number(a.price) < Number(b.price) ? a : b);
          setPrice({ value: Number(best.price), currency: best.currencyCode, store: best.store?.name ?? "" });
        }
      })
      .catch(() => {});
  }, [productId, cities.join(",")]);
  return price;
}

function ProductRow({ product, cities, onClick }: { product: Product; cities: string[]; onClick: () => void }) {
  const localPrice = useLocalPrice(product.id, cities);
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 cursor-pointer transition-colors"
      onClick={onClick}
    >
      {product.imageUrl ? (
        <img src={product.imageUrl} alt={product.name} className="h-12 w-12 rounded object-cover flex-shrink-0" />
      ) : (
        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center flex-shrink-0 text-xl">📦</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{product.name}</p>
        {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
        {product.category && (
          <Badge variant="secondary" className="text-[10px] mt-0.5">{product.category.name}</Badge>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        {localPrice ? (
          <div>
            <p className="font-bold text-sm text-primary">
              {formatPrice(localPrice.value, localPrice.currency, "ru-RU")}
            </p>
            <p className="text-[10px] text-muted-foreground truncate max-w-[80px]">{localPrice.store}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">нет цен</p>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQ);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const [cityFilter, setCityFilter] = useState<CityFilter>(loadCityFilter);
  const [showCityPicker, setShowCityPicker] = useState(false);

  const debouncedQuery = useDebounce(query, 300);
  const effectiveCities = getEffectiveCities(cityFilter);

  // Suggestions
  useEffect(() => {
    if (debouncedQuery.length < 3) { setSuggestions([]); return; }
    productsApi.suggestions(debouncedQuery).then(setSuggestions).catch(() => {});
  }, [debouncedQuery]);

  // Search
  useEffect(() => {
    if (!debouncedQuery.trim()) { setResults([]); setTotal(0); return; }
    setLoading(true);
    setPage(1);
    productsApi.search({ q: debouncedQuery, page: 1, limit: 20 })
      .then((res) => { setResults(Array.isArray(res?.data) ? res.data : []); setTotal(res?.meta?.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
    setSearchParams({ q: debouncedQuery }, { replace: true });
  }, [debouncedQuery]);

  const loadMore = async () => {
    const nextPage = page + 1;
    setLoading(true);
    try {
      const res = await productsApi.search({ q: debouncedQuery, page: nextPage, limit: 20 });
      setResults((prev) => [...prev, ...res.data]);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  };

  const handleCityChange = (f: CityFilter) => { setCityFilter(f); saveCityFilter(f); };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
      {/* Search input + city chip */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Поиск товаров, брендов…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="pl-9 pr-9"
            autoFocus
          />
          {query && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-card border rounded-lg shadow-lg overflow-hidden">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent flex items-center gap-2"
                  onMouseDown={() => { setQuery(s); setShowSuggestions(false); }}
                >
                  <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <CityChip filter={cityFilter} onClick={() => setShowCityPicker(true)} />
      </div>

      {/* City context hint */}
      {debouncedQuery && results.length > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          {cityFilter.cities.length > 0
            ? <>Цены в <strong>{cityFilter.label}</strong>{cityFilter.expanded ? " и области" : ""}. <button className="underline" onClick={() => setShowCityPicker(true)}>Изменить</button></>
            : <>Цены по всей России. <button className="underline" onClick={() => setShowCityPicker(true)}>Выбрать город</button></>
          }
        </p>
      )}

      {/* Results header */}
      {debouncedQuery && !loading && (
        <p className="text-sm text-muted-foreground px-1">
          {total > 0
            ? `Найдено ${total} товар${total === 1 ? "" : total < 5 ? "а" : "ов"}`
            : "Ничего не найдено"}
        </p>
      )}

      {/* Results */}
      <div className="space-y-2">
        {loading && results.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg border">
                <Skeleton className="h-12 w-12 rounded flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))
          : results.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                cities={effectiveCities}
                onClick={() => navigate(`/products/${p.id}`)}
              />
            ))
        }
      </div>

      {/* Empty / initial */}
      {!loading && debouncedQuery && results.length === 0 && (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🔍</p>
          <p className="font-medium">Ничего не найдено</p>
          <p className="text-sm text-muted-foreground mt-1">Попробуйте другой запрос</p>
        </div>
      )}
      {!debouncedQuery && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-medium">Найдите любой товар</p>
          <p className="text-sm mt-1">
            Цены показываем для{" "}
            <button className="underline text-primary" onClick={() => setShowCityPicker(true)}>
              {cityFilter.label}
            </button>
          </p>
        </div>
      )}

      {results.length < total && !loading && (
        <Button variant="outline" className="w-full" onClick={loadMore}>
          Загрузить ещё ({total - results.length} осталось)
        </Button>
      )}

      {showCityPicker && (
        <CityPickerSheet
          current={cityFilter}
          onChange={handleCityChange}
          onClose={() => setShowCityPicker(false)}
        />
      )}
    </div>
  );
}
