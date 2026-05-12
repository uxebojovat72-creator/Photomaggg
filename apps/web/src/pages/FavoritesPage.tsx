import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Store, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { favoritesApi, type FavoriteItem } from "@/api/favorites.api";
import { formatPrice } from "@priceradar/shared";

function fmtPrice(price: string | number, currency = "RUB") {
  return formatPrice(Number(price), currency, "ru-RU");
}

export default function FavoritesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    favoritesApi.list()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const remove = async (productId: string) => {
    setRemoving(productId);
    try {
      await favoritesApi.remove(productId);
      setItems((prev) => prev.filter((i) => i.productId !== productId));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Heart className="h-5 w-5 text-red-500 fill-red-500" />
        <h1 className="text-lg font-bold">Избранное</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground space-y-3">
          <Heart className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="font-medium">Избранных товаров пока нет</p>
          <p className="text-sm">Нажмите ♡ на карточке товара, чтобы добавить</p>
          <Button onClick={() => navigate("/search")}>Найти товары</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const latest = item.product.prices[0];
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-4 rounded-xl border bg-card cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => navigate(`/product/${item.productId}`)}
              >
                {item.product.imageUrl ? (
                  <img
                    src={item.product.imageUrl}
                    alt={item.product.name}
                    className="h-14 w-14 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-2xl">
                    📦
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.product.name}</p>
                  {item.product.brand && (
                    <p className="text-xs text-muted-foreground">{item.product.brand}</p>
                  )}
                  {latest && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Store className="h-3 w-3" />
                      <span>{latest.store.name}</span>
                      <MapPin className="h-3 w-3 ml-1" />
                      <span>{latest.store.city.name}</span>
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                  {latest ? (
                    <p className="font-bold text-sm">{fmtPrice(latest.price, latest.currencyCode)}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Нет цен</p>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); remove(item.productId); }}
                    disabled={removing === item.productId}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500 transition-colors" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
