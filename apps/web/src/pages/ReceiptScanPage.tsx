import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, CheckCircle2, Pencil, Trash2, Store, ChevronRight, Loader2, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pricesApi } from "@/api/prices.api";
import { storesApi, type StoreResult } from "@/api/stores.api";
import { formatPrice } from "@priceradar/shared";
import { STORE_CHAINS, CATEGORY_LABELS, type StoreChain } from "@/lib/stores-list";

type Step = "capture" | "scanning" | "review" | "store" | "publishing" | "done";

interface ReceiptItem {
  id: number;
  name: string;
  brand: string | null;
  price: number;
  enabled: boolean;
  editing: boolean;
}

function fmtPrice(price: number) {
  return formatPrice(price, "RUB", "ru-RU");
}

// Group stores by category for the UI
const STORE_BY_CATEGORY = (Object.keys(CATEGORY_LABELS) as StoreChain["category"][]).map((cat) => ({
  label: CATEGORY_LABELS[cat],
  stores: STORE_CHAINS.filter((s) => s.category === cat).map((s) => s.name),
}));

export default function ReceiptScanPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [step, setStep] = useState<Step>("capture");
  const [items, setItems] = useState<ReceiptItem[]>([]);
  // detectedStore removed — user always selects manually
  const [result, setResult] = useState<{ created: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Camera
  const [camActive, setCamActive] = useState(false);

  // Store selection
  const [storeQuery, setStoreQuery] = useState("");
  const [storeSuggestions, setStoreSuggestions] = useState<StoreResult[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreResult | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Connect stream after video element mounts (camActive flip triggers re-render first)
  useEffect(() => {
    if (camActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [camActive]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 2560 } },
      });
      streamRef.current = stream;
      setCamActive(true); // triggers useEffect above to wire srcObject after render
    } catch {
      setError("Камера недоступна. Загрузите фото.");
    }
  };

  const captureFromCamera = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopCamera();
      processPhoto(new File([blob], "receipt.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  };

  const processPhoto = async (file: File) => {
    setStep("scanning");
    setError(null);
    try {
      const data = await pricesApi.scanReceipt(file);
      if (data.items.length === 0) {
        setError("ИИ не смог распознать товары. Попробуйте сделать фото чётче.");
        setStep("capture");
        return;
      }
      setItems(data.items.map((item, i) => ({ ...item, id: i, enabled: true, editing: false })));
      setStep("review");
    } catch {
      setError("Ошибка распознавания. Попробуйте ещё раз.");
      setStep("capture");
    }
  };

  // Store search
  useEffect(() => {
    if (!storeQuery.trim() || storeQuery.length < 2) { setStoreSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setStoreLoading(true);
      try {
        const results = await storesApi.search({ q: storeQuery });
        setStoreSuggestions(results.slice(0, 6));
      } finally {
        setStoreLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [storeQuery]);

  const publish = async () => {
    const enabled = items.filter((i) => i.enabled);
    if (enabled.length === 0) return;
    setStep("publishing");
    try {
      const res = await pricesApi.batchCreate({
        storeId: selectedStore?.id,
        storeName: selectedStore ? undefined : storeQuery.trim() || undefined,
        currencyCode: "RUB",
        items: enabled.map((i) => ({ name: i.name, brand: i.brand, price: i.price })),
      });
      setResult(res);
      setStep("done");
    } catch {
      setError("Ошибка при публикации. Попробуйте ещё раз.");
      setStep("review");
    }
  };

  const toggleItem = (id: number) =>
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, enabled: !i.enabled } : i));

  const updateItem = (id: number, field: "name" | "price", value: string) =>
    setItems((prev) => prev.map((i) =>
      i.id === id ? { ...i, [field]: field === "price" ? parseFloat(value) || i.price : value } : i
    ));

  const removeItem = (id: number) => setItems((prev) => prev.filter((i) => i.id !== id));

  const enabledCount = items.filter((i) => i.enabled).length;

  // ─── Render ───────────────────────────────────────────────────────────────

  if (step === "capture") return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <ReceiptText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-lg font-bold">Сканер чека</h1>
          <p className="text-sm text-muted-foreground">Одно фото = все цены сразу</p>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">{error}</div>}

      {camActive ? (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden bg-black aspect-[3/4]">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-white/40 m-8 rounded-lg" />
            <p className="absolute bottom-3 left-0 right-0 text-center text-white/80 text-xs">
              Совместите чек с рамкой
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={stopCamera}>Отмена</Button>
            <Button className="flex-1" onClick={captureFromCamera}>
              <Camera className="h-4 w-4 mr-2" />Сфотографировать
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            className="w-full rounded-xl border-2 border-primary/40 bg-primary/5 py-16 flex flex-col items-center gap-4 hover:bg-primary/10 active:bg-primary/15 transition-colors"
            onClick={startCamera}
          >
            <Camera className="h-14 w-14 text-primary/70" />
            <div className="text-center">
              <p className="font-semibold text-base">Открыть камеру</p>
              <p className="text-sm text-muted-foreground mt-0.5">Наведите на кассовый чек</p>
            </div>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processPhoto(f); }}
          />
        </div>
      )}

      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
        <p>💡 <strong>Совет:</strong> ИИ распознаёт чеки из любых магазинов</p>
        <p>📸 Сфотографируйте чек целиком при хорошем освещении</p>
        <p>⚡ Один чек = до 50 цен за раз</p>
      </div>
    </div>
  );

  if (step === "scanning") return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
      <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
      <p className="font-medium">ИИ читает чек…</p>
      <p className="text-sm text-muted-foreground">Распознаём все товары и цены</p>
    </div>
  );

  if (step === "review") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold">Найдено товаров: {items.length}</h2>
          <p className="text-sm text-muted-foreground">Выберите магазин на следующем шаге</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setStep("capture"); setError(null); }}
        >
          Пересканировать
        </Button>
      </div>

      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
              item.enabled ? "bg-card" : "bg-muted/30 opacity-60"
            }`}
          >
            <input
              type="checkbox"
              checked={item.enabled}
              onChange={() => toggleItem(item.id)}
              className="h-4 w-4 rounded cursor-pointer accent-primary"
            />
            <div className="flex-1 min-w-0">
              {item.editing ? (
                <Input
                  value={item.name}
                  onChange={(e) => updateItem(item.id, "name", e.target.value)}
                  onBlur={() => setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, editing: false } : i))}
                  autoFocus
                  className="h-7 text-sm"
                />
              ) : (
                <p className="text-sm font-medium truncate">{item.name}</p>
              )}
              {item.brand && <p className="text-xs text-muted-foreground">{item.brand}</p>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Input
                type="number"
                value={item.price}
                onChange={(e) => updateItem(item.id, "price", e.target.value)}
                className="h-7 w-20 text-sm text-right"
                min={0}
              />
              <span className="text-xs text-muted-foreground">₽</span>
              <button onClick={() => setItems((p) => p.map((i) => i.id === item.id ? { ...i, editing: !i.editing } : i))} className="p-1 text-muted-foreground hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => removeItem(item.id)} className="p-1 text-muted-foreground hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-3">
        <span>Выбрано: <strong className="text-foreground">{enabledCount}</strong> из {items.length}</span>
        <button className="text-xs underline" onClick={() => setItems((p) => p.map((i) => ({ ...i, enabled: true })))}>
          Выбрать все
        </button>
      </div>

      <Button className="w-full" disabled={enabledCount === 0} onClick={() => setStep("store")}>
        Выбрать магазин <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );

  if (step === "store") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div>
        <h2 className="font-bold">Укажите магазин</h2>
        <p className="text-sm text-muted-foreground">Куда публикуем {enabledCount} цен?</p>
      </div>

      <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
        {STORE_BY_CATEGORY.map((group) => (
          <div key={group.label}>
            <p className="text-xs text-muted-foreground font-medium mb-1.5">{group.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.stores.map((name) => (
                <button
                  key={name}
                  onClick={() => { setStoreQuery(name); setSelectedStore(null); setStoreSuggestions([]); }}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    storeQuery === name && !selectedStore
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="relative">
        <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Поиск магазина…"
          value={storeQuery}
          onChange={(e) => { setStoreQuery(e.target.value); setSelectedStore(null); }}
        />
        {storeLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {storeSuggestions.length > 0 && !selectedStore && (
        <div className="rounded-lg border bg-card overflow-hidden">
          {storeSuggestions.map((s) => (
            <button
              key={s.id}
              className="w-full flex items-center gap-2 p-3 text-left hover:bg-accent border-b last:border-0 transition-colors"
              onClick={() => { setSelectedStore(s); setStoreQuery(`${s.name}, ${s.city.name}`); setStoreSuggestions([]); }}
            >
              <Store className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.city.name} {s.city.country.flagEmoji}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedStore && (
        <div className="rounded-lg border bg-primary/5 border-primary/30 p-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">{selectedStore.name}</p>
            <p className="text-xs text-muted-foreground">{selectedStore.city.name}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setStep("review")}>Назад</Button>
        <Button
          className="flex-1"
          disabled={!storeQuery.trim()}
          onClick={publish}
        >
          Опубликовать {enabledCount} цен
        </Button>
      </div>
    </div>
  );

  if (step === "publishing") return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
      <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
      <p className="font-medium">Публикуем {enabledCount} цен…</p>
      <p className="text-sm text-muted-foreground">Это может занять несколько секунд</p>
    </div>
  );

  if (step === "done" && result) return (
    <div className="max-w-lg mx-auto px-4 py-10 text-center space-y-5">
      <div className="text-6xl">🎉</div>
      <div>
        <h2 className="text-xl font-bold">Готово!</h2>
        <p className="text-muted-foreground mt-1">
          Опубликовано <strong className="text-foreground">{result.created}</strong> цен
          {result.failed > 0 && `, ${result.failed} не удалось`}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        +{result.created * 2} очков к вашему рейтингу
      </p>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => { setStep("capture"); setItems([]); setResult(null); setSelectedStore(null); setStoreQuery(""); }}>
          Ещё чек
        </Button>
        <Button className="flex-1" onClick={() => navigate("/")}>На главную</Button>
      </div>
    </div>
  );

  return null;
}
