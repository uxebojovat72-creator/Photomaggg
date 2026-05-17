import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircle, TrendingDown, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { pricesApi } from "@/api/prices.api";
import { formatPrice, formatRelativeDate } from "@priceradar/shared";
import type { FeedItem } from "@priceradar/shared";
import { CityChip, CityPickerSheet, loadCityFilter, saveCityFilter, getEffectiveCities } from "@/components/CityPicker";
import type { CityFilter } from "@/components/CityPicker";

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

export default function HomePage() {
  const navigate = useNavigate();
  const [cityFilter, setCityFilter] = useState<CityFilter>(loadCityFilter);
  const [showPicker, setShowPicker] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFeed = useCallback((filter: CityFilter) => {
    setLoading(true);
    const cities = getEffectiveCities(filter);
    const params = cities.length > 0 ? { cities, limit: 30 } : { limit: 30 };
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
          <CityChip filter={cityFilter} onClick={() => setShowPicker(true)} />
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
                    <button className="underline text-primary" onClick={() => handleCityChange({ label: "Все города", cities: [] })}>
                      все города
                    </button>{" "}или включите расширенный режим
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
        <CityPickerSheet
          current={cityFilter}
          onChange={handleCityChange}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
