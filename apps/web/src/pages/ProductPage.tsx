import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { ArrowLeft, Star, TrendingDown, TrendingUp, MapPin, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { productsApi } from "@/api/products.api";
import { formatPrice, formatRelativeDate } from "@priceradar/shared";
import type { Price } from "@priceradar/shared";

type Days = 7 | 30 | 90;

interface ProductWithPrices {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category?: { name: string };
  prices: (Price & {
    store: { name: string; city: { name: string; country: { flagEmoji: string; code: string } } };
    user: { id: string; displayName: string; avatarUrl: string | null; trustScore: number };
  })[];
}

interface PricePoint {
  date: string;
  priceUsd: number;
  storeName: string;
}

const PERIOD_LABELS: Record<Days, string> = { 7: "7d", 30: "30d", 90: "90d" };

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductWithPrices | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [days, setDays] = useState<Days>(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      productsApi.getWithPrices(id),
      productsApi.getPriceHistory(id, { days }),
    ])
      .then(([prod, hist]) => {
        setProduct(prod as unknown as ProductWithPrices);
        setHistory(hist.points as PricePoint[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, days]);

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );

  if (!product) return (
    <div className="text-center py-20">
      <p className="text-4xl mb-3">📦</p>
      <p className="font-medium">Product not found</p>
      <Button className="mt-4" onClick={() => navigate(-1)}>Go Back</Button>
    </div>
  );

  const approvedPrices = product.prices?.filter((p) => p.status === "approved") ?? [];
  const usdPrices = approvedPrices.map((p) => Number(p.priceUsd ?? p.price)).filter(Boolean);
  const minUsd = usdPrices.length ? Math.min(...usdPrices) : null;
  const maxUsd = usdPrices.length ? Math.max(...usdPrices) : null;

  const chartData = history.map((p) => ({
    date: new Date(p.date).toLocaleDateString("en", { month: "short", day: "numeric" }),
    price: p.priceUsd,
  }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{product.name}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {product.brand && <span className="text-sm text-muted-foreground">{product.brand}</span>}
            {product.category && <Badge variant="secondary" className="text-xs">{product.category.name}</Badge>}
          </div>
        </div>
        {product.imageUrl && (
          <img src={product.imageUrl} alt={product.name} className="h-16 w-16 rounded-lg object-cover flex-shrink-0" />
        )}
      </div>

      {/* Price stats */}
      {usdPrices.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Min price</p>
            <p className="font-bold text-emerald-400">{formatPrice(minUsd!, "USD")}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Avg price</p>
            <p className="font-bold">
              {formatPrice(usdPrices.reduce((a, b) => a + b, 0) / usdPrices.length, "USD")}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Max price</p>
            <p className="font-bold text-red-400">{formatPrice(maxUsd!, "USD")}</p>
          </div>
        </div>
      )}

      {/* Price history chart */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Price History</h2>
          <div className="flex gap-1">
            {([7, 30, 90] as Days[]).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {PERIOD_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(v: number) => [formatPrice(v, "USD"), "Price"]}
              />
              <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
            No price history for this period
          </div>
        )}
      </div>

      {/* Prices by store */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Prices by Store</h2>
          <Badge variant="outline">{approvedPrices.length} records</Badge>
        </div>

        {approvedPrices.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
            <p className="text-3xl mb-2">🏪</p>
            <p className="text-sm">No prices yet</p>
            <Button size="sm" className="mt-3" onClick={() => navigate("/add-price", { state: { productId: product.id, productName: product.name } })}>
              Add First Price
            </Button>
          </div>
        ) : (
          [...approvedPrices]
            .sort((a, b) => Number(a.priceUsd ?? a.price) - Number(b.priceUsd ?? b.price))
            .map((price, idx) => (
              <div key={price.id} className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${idx === 0 ? "border-emerald-500/50" : ""}`}>
                {idx === 0 && <TrendingDown className="h-4 w-4 text-emerald-400 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{(price as unknown as { store: { name: string } }).store?.name}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {(price as unknown as { store: { city: { name: string; country: { flagEmoji: string } } } }).store?.city?.name}
                      {" "}{(price as unknown as { store: { city: { country: { flagEmoji: string } } } }).store?.city?.country?.flagEmoji}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">{formatRelativeDate(price.createdAt)}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`font-bold ${idx === 0 ? "text-emerald-400" : ""}`}>
                    {formatPrice(Number(price.price), price.currencyCode)}
                  </p>
                  {price.priceUsd && price.currencyCode !== "USD" && (
                    <p className="text-xs text-muted-foreground">≈ {formatPrice(Number(price.priceUsd), "USD")}</p>
                  )}
                </div>
              </div>
            ))
        )}
      </div>

      {/* Add price CTA */}
      <Button
        className="w-full"
        onClick={() => navigate("/add-price", { state: { productId: product.id, productName: product.name } })}
      >
        + Add Your Price
      </Button>
    </div>
  );
}
