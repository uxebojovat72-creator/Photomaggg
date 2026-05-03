import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { productsApi } from "@/api/products.api";
import { useDebounce } from "@/hooks/useDebounce";
import { formatPrice } from "@priceradar/shared";
import type { Product } from "@priceradar/shared";

function ProductRow({ product, onClick }: { product: Product; onClick: () => void }) {
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
      {product.barcode && (
        <span className="text-[10px] text-muted-foreground hidden sm:block">{product.barcode}</span>
      )}
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

  const debouncedQuery = useDebounce(query, 300);

  // Suggestions (3+ chars)
  useEffect(() => {
    if (debouncedQuery.length < 3) { setSuggestions([]); return; }
    productsApi.suggestions(debouncedQuery).then(setSuggestions).catch(() => {});
  }, [debouncedQuery]);

  // Search results
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

  const selectSuggestion = (s: string) => {
    setQuery(s);
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Поиск товаров, брендов, штрихкодов..."
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

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-card border rounded-lg shadow-lg overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent flex items-center gap-2"
                onMouseDown={() => selectSuggestion(s)}
              >
                <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results header */}
      {debouncedQuery && !loading && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `Найдено ${total} товар${total === 1 ? "" : total < 5 ? "а" : "ов"}` : "Ничего не найдено"}
          </p>
        </div>
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
              <ProductRow key={p.id} product={p} onClick={() => navigate(`/products/${p.id}`)} />
            ))
        }
      </div>

      {/* Empty state */}
      {!loading && debouncedQuery && results.length === 0 && (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🔍</p>
          <p className="font-medium">Ничего не найдено</p>
          <p className="text-sm text-muted-foreground mt-1">Попробуйте другой запрос</p>
        </div>
      )}

      {/* Initial state */}
      {!debouncedQuery && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-medium">Найдите любой товар</p>
          <p className="text-sm mt-1">Введите минимум 3 символа для подсказок</p>
        </div>
      )}

      {/* Load more */}
      {results.length < total && !loading && (
        <Button variant="outline" className="w-full" onClick={loadMore}>
          Загрузить ещё ({total - results.length} осталось)
        </Button>
      )}
    </div>
  );
}
