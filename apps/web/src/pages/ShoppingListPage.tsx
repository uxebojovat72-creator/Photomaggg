import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Search, Plus, Trash2, Store, TrendingDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { productsApi } from "@/api/products.api";
import { formatPrice } from "@priceradar/shared";

interface SearchResult {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
}

interface ListItem {
  productId: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  qty: number;
}

interface StoreTotals {
  storeId: string;
  storeName: string;
  cityName: string;
  total: number;
  covered: number;
}

interface PriceEntry {
  price: number;
  currencyCode: string;
  store: { id: string; name: string; city: { name: string } };
}

function fmtPrice(price: number) {
  return formatPrice(price, "RUB", "ru-RU");
}

export default function ShoppingListPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [list, setList] = useState<ListItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("shopping_list") ?? "[]"); } catch { return []; }
  });
  const [pricesMap, setPricesMap] = useState<Record<string, PriceEntry[]>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [storeTotals, setStoreTotals] = useState<StoreTotals[]>([]);

  // Persist list
  useEffect(() => {
    localStorage.setItem("shopping_list", JSON.stringify(list));
  }, [list]);

  // Search products
  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await productsApi.search({ q: query, limit: 6 });
        setSuggestions((res as unknown as { data: SearchResult[] }).data ?? (res as unknown as SearchResult[]));
      } catch { setSuggestions([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const addItem = (p: SearchResult) => {
    if (list.find((i) => i.productId === p.id)) return;
    setList((prev) => [...prev, { productId: p.id, name: p.name, brand: p.brand, imageUrl: p.imageUrl, qty: 1 }]);
    setQuery("");
    setSuggestions([]);
  };

  const removeItem = (productId: string) => {
    setList((prev) => prev.filter((i) => i.productId !== productId));
    setPricesMap((prev) => { const n = { ...prev }; delete n[productId]; return n; });
  };

  const changeQty = (productId: string, delta: number) =>
    setList((prev) => prev.map((i) => i.productId === productId ? { ...i, qty: Math.max(1, i.qty + delta) } : i));

  // Calculate store totals
  const calcTotals = useCallback(() => {
    if (list.length === 0 || Object.keys(pricesMap).length === 0) { setStoreTotals([]); return; }

    const storeMap: Record<string, StoreTotals> = {};

    for (const item of list) {
      const prices = pricesMap[item.productId];
      if (!prices || prices.length === 0) continue;
      for (const p of prices) {
        const key = p.store.id;
        if (!storeMap[key]) {
          storeMap[key] = { storeId: p.store.id, storeName: p.store.name, cityName: p.store.city.name, total: 0, covered: 0 };
        }
      }
    }

    for (const item of list) {
      const prices = pricesMap[item.productId];
      if (!prices || prices.length === 0) continue;
      for (const storeId of Object.keys(storeMap)) {
        const match = prices.find((p) => p.store.id === storeId);
        if (match) {
          storeMap[storeId].total += Number(match.price) * item.qty;
          storeMap[storeId].covered += 1;
        }
      }
    }

    const totals = Object.values(storeMap)
      .filter((s) => s.covered > 0)
      .sort((a, b) => {
        if (b.covered !== a.covered) return b.covered - a.covered;
        return a.total - b.total;
      });

    setStoreTotals(totals);
  }, [list, pricesMap]);

  // Load prices for all items
  const loadPrices = useCallback(async () => {
    if (list.length === 0) return;
    setLoadingPrices(true);
    const newMap: Record<string, PriceEntry[]> = {};
    await Promise.all(list.map(async (item) => {
      if (pricesMap[item.productId]) { newMap[item.productId] = pricesMap[item.productId]; return; }
      try {
        const product = await productsApi.getWithPrices(item.productId) as unknown as { prices: PriceEntry[] };
        newMap[item.productId] = (product.prices ?? []).filter((p: PriceEntry & { status?: string }) => p.status === "approved" || !p.status);
      } catch { newMap[item.productId] = []; }
    }));
    setPricesMap(newMap);
    setLoadingPrices(false);
  }, [list, pricesMap]);

  useEffect(() => { calcTotals(); }, [calcTotals]);

  const cheapestForItem = (productId: string): PriceEntry | null => {
    const prices = pricesMap[productId];
    if (!prices || prices.length === 0) return null;
    return prices.reduce((best, p) => Number(p.price) < Number(best.price) ? p : best, prices[0]);
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShoppingCart className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold">Список покупок</h1>
          <p className="text-sm text-muted-foreground">Где выгоднее купить всё сразу</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Добавить товар…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {suggestions.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden -mt-3">
          {suggestions.map((s) => (
            <button
              key={s.id}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent border-b last:border-0 transition-colors"
              onClick={() => addItem(s)}
            >
              {s.imageUrl
                ? <img src={s.imageUrl} alt={s.name} className="h-8 w-8 rounded object-cover flex-shrink-0" />
                : <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-sm flex-shrink-0">📦</div>
              }
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                {s.brand && <p className="text-xs text-muted-foreground">{s.brand}</p>}
              </div>
              <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-auto" />
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {list.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground space-y-2">
          <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="font-medium">Список пуст</p>
          <p className="text-sm">Найдите товары через поиск выше</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {list.map((item) => {
              const cheapest = cheapestForItem(item.productId);
              return (
                <div key={item.productId} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  <div
                    className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer"
                    onClick={() => navigate(`/products/${item.productId}`)}
                  >
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      : <span className="text-lg">📦</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    {cheapest ? (
                      <p className="text-xs text-muted-foreground">
                        <TrendingDown className="h-3 w-3 inline mr-0.5 text-emerald-400" />
                        от {fmtPrice(Number(cheapest.price))} — {cheapest.store.name}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">нет цен</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      className="w-6 h-6 rounded-md border flex items-center justify-center text-sm hover:bg-accent"
                      onClick={() => changeQty(item.productId, -1)}
                    >−</button>
                    <span className="w-5 text-center text-sm font-medium">{item.qty}</span>
                    <button
                      className="w-6 h-6 rounded-md border flex items-center justify-center text-sm hover:bg-accent"
                      onClick={() => changeQty(item.productId, 1)}
                    >+</button>
                    <button
                      className="ml-1 p-1 text-muted-foreground hover:text-red-400 transition-colors"
                      onClick={() => removeItem(item.productId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Calculate button */}
          <Button className="w-full" onClick={loadPrices} disabled={loadingPrices}>
            {loadingPrices
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Считаем цены…</>
              : <><Store className="h-4 w-4 mr-2" />Где купить выгоднее?</>
            }
          </Button>

          {/* Store totals */}
          {storeTotals.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                Сравнение магазинов
                <Badge variant="outline" className="text-xs">{list.length} товаров</Badge>
              </h3>
              {storeTotals.map((s, idx) => (
                <div
                  key={s.storeId}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${idx === 0 ? "border-emerald-500/50 bg-emerald-500/5" : "bg-card"}`}
                >
                  {idx === 0 && <TrendingDown className="h-4 w-4 text-emerald-400 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.storeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.cityName} · {s.covered} из {list.length} товаров
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold text-sm ${idx === 0 ? "text-emerald-400" : ""}`}>
                      {fmtPrice(s.total)}
                    </p>
                    {idx === 0 && <p className="text-xs text-emerald-400">Выгоднее всего</p>}
                  </div>
                </div>
              ))}
              {storeTotals[0] && storeTotals.length > 1 && (
                <p className="text-xs text-center text-muted-foreground">
                  Экономия в {storeTotals[0].storeName} vs остальных:&nbsp;
                  <strong className="text-emerald-400">
                    {fmtPrice(Math.max(...storeTotals.map((s) => s.total)) - storeTotals[0].total)}
                  </strong>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
