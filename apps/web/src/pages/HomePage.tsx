import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircle, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { pricesApi } from "@/api/prices.api";
import { formatPrice, formatRelativeDate } from "@priceradar/shared";
import type { FeedItem } from "@priceradar/shared";

function PriceCard({ item }: { item: FeedItem }) {
  const navigate = useNavigate();
  return (
    <div
      className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 cursor-pointer transition-colors"
      onClick={() => navigate(`/products/${item.productId}`)}
    >
      {item.photoUrl && (
        <img
          src={item.photoUrl}
          alt={item.product?.name}
          className="h-16 w-16 rounded-md object-cover flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.product?.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {item.store?.name} · {item.store?.city?.name}
          {item.store?.city?.country && `, ${item.store.city.country.flagEmoji}`}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-bold text-primary">
            {formatPrice(Number(item.price), item.currencyCode)}
          </span>
          {item.priceUsd && item.currencyCode !== "USD" && (
            <span className="text-xs text-muted-foreground">
              ≈ {formatPrice(Number(item.priceUsd), "USD")}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <Badge variant={item.status === "approved" ? "success" : "warning"}>
          {item.status}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatRelativeDate(item.createdAt)}
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
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pricesApi.getFeed({ limit: 20 })
      .then((res) => setFeed(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      {/* Hero */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Latest Prices
          </h1>
          <p className="text-xs text-muted-foreground">Updated in real-time worldwide</p>
        </div>
        <Button size="sm" onClick={() => navigate("/add-price")}>
          <PlusCircle className="h-4 w-4" />
          Add Price
        </Button>
      </div>

      {/* Feed */}
      <div className="space-y-2">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <PriceCardSkeleton key={i} />)
          : feed.length === 0
          ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-4xl mb-3">📭</p>
              <p className="font-medium">No prices yet</p>
              <p className="text-sm">Be the first to add a price!</p>
              <Button className="mt-4" onClick={() => navigate("/add-price")}>
                Add First Price
              </Button>
            </div>
          )
          : feed.map((item) => <PriceCard key={item.id} item={item} />)
        }
      </div>
    </div>
  );
}
