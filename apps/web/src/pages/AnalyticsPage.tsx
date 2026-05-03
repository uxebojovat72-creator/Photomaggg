import { useState, useEffect } from "react";
import { BarChart2, RefreshCw, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/api/client";
import type { CurrencyRate } from "@priceradar/shared";

const POPULAR = ["USD", "EUR", "RUB", "CNY", "TRY", "GBP", "JPY", "KZT", "AED", "BRL"];

const FLAG: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", RUB: "🇷🇺", CNY: "🇨🇳", TRY: "🇹🇷",
  GBP: "🇬🇧", JPY: "🇯🇵", KZT: "🇰🇿", AED: "🇦🇪", BRL: "🇧🇷",
};

export default function AnalyticsPage() {
  const [rates, setRates] = useState<CurrencyRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState("USD");
  const [error, setError] = useState(false);

  const fetchRates = () => {
    setLoading(true);
    setError(false);
    api.get<CurrencyRate>("/currencies/rates")
      .then((r) => setRates(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRates(); }, []);

  const convert = (to: string): string => {
    if (!rates || !amount || isNaN(Number(amount))) return "—";
    const amountNum = Number(amount);
    const fromRate = rates.rates[from] ?? 1;
    const toRate = rates.rates[to] ?? 1;
    const result = (amountNum / fromRate) * toRate;
    return result < 10
      ? result.toFixed(4)
      : result.toFixed(2);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-primary" />
            Аналитика
          </h1>
          <p className="text-xs text-muted-foreground">Курсы валют в реальном времени</p>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchRates} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Currency Converter */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Конвертер валют</h2>
        </div>

        <div className="flex gap-2">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="text-lg font-bold w-32 flex-shrink-0"
            min="0"
            step="any"
          />
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded-md px-3 bg-background text-sm font-medium flex-1"
          >
            {POPULAR.map((c) => (
              <option key={c} value={c}>{FLAG[c] ?? ""} {c}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-6">
            <p className="text-3xl mb-2">📡</p>
            <p className="text-sm text-muted-foreground">Не удалось загрузить курсы</p>
            <p className="text-xs text-muted-foreground">API не подключён</p>
          </div>
        ) : (
          <div className="space-y-1">
            {POPULAR.filter((c) => c !== from).map((to) => (
              <div
                key={to}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/30 transition-colors"
              >
                <span className="text-sm font-medium">
                  {FLAG[to] ?? ""} {to}
                </span>
                <span className="font-bold text-primary tabular-nums">
                  {convert(to)}
                </span>
              </div>
            ))}
          </div>
        )}

        {rates && (
          <p className="text-[10px] text-muted-foreground text-right">
            Обновлено: {new Date(rates.date).toLocaleDateString("ru")}
          </p>
        )}
      </div>

      {/* Placeholder for future charts */}
      <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <p className="text-4xl mb-3">📊</p>
        <p className="font-medium text-sm">Сравнение товаров</p>
        <p className="text-xs mt-1">Скоро: сравнение цен на один товар в разных странах</p>
      </div>

      <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
        <p className="text-4xl mb-3">🗺️</p>
        <p className="font-medium text-sm">Карта цен</p>
        <p className="text-xs mt-1">Скоро: тепловая карта цен по регионам</p>
      </div>
    </div>
  );
}
