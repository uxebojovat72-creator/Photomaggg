import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, ArrowLeft, Store, MapPin, User, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { formatPrice, formatRelativeDate } from "@priceradar/shared";

interface ModerationItem {
  id: string;
  price: string;
  priceUsd: string | null;
  currencyCode: string;
  photoUrl: string | null;
  aiRecognizedName: string | null;
  createdAt: string;
  product: { id: string; name: string; brand: string | null };
  store: { name: string; city: { name: string; country: { flagEmoji: string } } };
  user: { id: string; displayName: string; trustScore: number };
}

interface QueueResponse {
  data: ModerationItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export default function ModerationPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<QueueResponse>("/prices/moderation/queue?limit=20");
      setItems(res.data.data);
      setTotal(res.data.meta.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || (user.role !== "moderator" && user.role !== "admin")) {
      navigate("/");
      return;
    }
    load();
  }, [user, navigate, load]);

  const decide = async (id: string, action: "approve" | "reject") => {
    setActing(id);
    try {
      await api.patch(`/prices/moderation/${id}`, { action });
      setItems((prev) => prev.filter((i) => i.id !== id));
      setTotal((t) => t - 1);
    } catch {
      /* ignore */
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-bold text-lg">Очередь модерации</h1>
          <p className="text-xs text-muted-foreground">{total} ожидает проверки</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-3">✅</p>
          <p className="font-medium">Очередь пуста</p>
          <p className="text-sm text-muted-foreground mt-1">Все цены проверены</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border bg-card overflow-hidden">
              {/* Photo */}
              {item.photoUrl && (
                <img
                  src={item.photoUrl}
                  alt={item.product.name}
                  className="w-full h-40 object-cover"
                />
              )}

              <div className="p-4 space-y-3">
                {/* Product info */}
                <div>
                  <p className="font-semibold text-sm">{item.product.name}</p>
                  {item.product.brand && (
                    <p className="text-xs text-muted-foreground">{item.product.brand}</p>
                  )}
                  {item.aiRecognizedName && item.aiRecognizedName !== item.product.name && (
                    <p className="text-xs text-amber-500 mt-0.5">
                      AI распознал: {item.aiRecognizedName}
                    </p>
                  )}
                </div>

                {/* Price */}
                <div className="flex items-center gap-3">
                  <span className="font-bold text-lg">
                    {formatPrice(Number(item.price), item.currencyCode)}
                  </span>
                  {item.priceUsd && item.currencyCode !== "USD" && (
                    <span className="text-sm text-muted-foreground">
                      ≈ {formatPrice(Number(item.priceUsd), "USD")}
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5" />
                    {item.store.name}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {item.store.city.name} {item.store.city.country.flagEmoji}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {item.user.displayName}
                    <Badge variant="outline" className="text-[10px] ml-1">
                      доверие {item.user.trustScore}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {formatRelativeDate(item.createdAt)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Button
                    className="flex-1 gap-2"
                    variant="outline"
                    onClick={() => decide(item.id, "approve")}
                    disabled={acting === item.id}
                  >
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    Одобрить
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    variant="outline"
                    onClick={() => decide(item.id, "reject")}
                    disabled={acting === item.id}
                  >
                    <XCircle className="h-4 w-4 text-red-500" />
                    Отклонить
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
