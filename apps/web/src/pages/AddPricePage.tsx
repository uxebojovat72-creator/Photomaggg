import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Camera, Upload, X, Loader2, CheckCircle, Search, ChevronRight, ArrowLeft, Plus, Barcode, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCamera } from "@/hooks/useCamera";
import { useBarcode } from "@/hooks/useBarcode";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuthStore } from "@/store/auth.store";
import { pricesApi } from "@/api/prices.api";
import { productsApi } from "@/api/products.api";
import { storesApi, type StoreResult } from "@/api/stores.api";
import { geoApi, type City } from "@/api/geo.api";
import { toast } from "@/hooks/useToast";
import type { AiRecognitionResult, Product } from "@priceradar/shared";

type Step = "photo" | "ai" | "product" | "store" | "price" | "done";
type CaptureMode = "barcode" | "photo";

const CURRENCIES = ["USD", "EUR", "RUB", "GBP", "TRY", "CNY", "JPY", "KZT", "AED", "BRL"];
const NEW_PRODUCT_ID = "__new__";

const SOURCE_LABELS: Record<string, string> = {
  local: "локальная база",
  openfoodfacts: "Open Food Facts",
  openbeautyfacts: "Open Beauty Facts",
  openpetfoodfacts: "Open Pet Food Facts",
  upcitemdb: "UPC Item DB",
};

export default function AddPricePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const { videoRef, state: cam, startCamera, capture, reset: resetCam, fromFile } = useCamera();

  const barcodeVideoRef = useRef<HTMLVideoElement>(null);
  const { state: barcode, start: startBarcode, stop: stopBarcode } = useBarcode(barcodeVideoRef);

  const prefill = location.state as { productId?: string; productName?: string } | null;

  const [step, setStep] = useState<Step>(prefill?.productId ? "store" : "photo");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("barcode");
  const [aiResult, setAiResult] = useState<AiRecognitionResult | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeApiError, setBarcodeApiError] = useState<string | null>(null);
  const [productExtra, setProductExtra] = useState<{
    quantity?: string | null;
    description?: string | null;
    categoryHint?: string | null;
    source?: string | null;
  } | null>(null);

  // Store price lookup
  const [aiPriceLoading, setAiPriceLoading] = useState(false);
  const [aiPriceResult, setAiPriceResult] = useState<{
    found: boolean;
    price?: number;
    pricePromo?: number;
    currency: string;
    productName?: string;
    storeDisplayName?: string;
    productUrl?: string;
    searchUrl: string;
  } | null>(null);

  // Product
  const [productQuery, setProductQuery] = useState(prefill?.productName ?? "");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const debouncedPQ = useDebounce(productQuery, 300);

  // Store — search existing
  const [storeQuery, setStoreQuery] = useState("");
  const [storeResults, setStoreResults] = useState<StoreResult[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreResult | null>(null);
  const debouncedSQ = useDebounce(storeQuery, 300);

  // Store — create new
  const [newStoreMode, setNewStoreMode] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreCityQ, setNewStoreCityQ] = useState("");
  const [newStoreCityResults, setNewStoreCityResults] = useState<City[]>([]);
  const [newStoreCity, setNewStoreCity] = useState<City | null>(null);
  const debouncedCityQ = useDebounce(newStoreCityQ, 300);

  // Price
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("RUB");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      toast({ title: "Требуется вход", description: "Войдите, чтобы добавить цены", variant: "destructive" });
      navigate("/login", { state: { from: "/add-price" } });
    }
  }, [isAuthenticated, navigate]);

  // Auto-start barcode scanner when tab is active on step "photo"
  useEffect(() => {
    if (step === "photo" && captureMode === "barcode") {
      startBarcode();
    } else {
      stopBarcode();
    }
  }, [step, captureMode, startBarcode, stopBarcode]);

  // Handle barcode scan result — queries 4 databases in parallel
  useEffect(() => {
    if (!barcode.result) return;
    setBarcodeLoading(true);
    setBarcodeApiError(null);
    productsApi.lookupBarcode(barcode.result)
      .then((data) => {
        const p = data.product;
        const sourceLabel = SOURCE_LABELS[data.source] ?? data.source;
        if (data.source === "local" && p.id) {
          setSelectedProduct({
            id: p.id,
            name: p.name,
            brand: p.brand ?? null,
            barcode: p.barcode,
            categoryId: null,
            imageUrl: p.imageUrl ?? null,
            aiGenerated: false,
            aiConfirmed: true,
            aliases: [],
            createdBy: "",
            createdAt: new Date().toISOString(),
          });
          setProductExtra({ quantity: p.quantity, description: p.description, categoryHint: p.categoryHint, source: sourceLabel });
          setStep("store");
          toast({ title: "Товар найден!", description: p.name });
        } else {
          setSelectedProduct({
            id: NEW_PRODUCT_ID,
            name: p.name,
            brand: p.brand ?? null,
            barcode: barcode.result,
            categoryId: null,
            imageUrl: p.imageUrl ?? null,
            aiGenerated: true,
            aiConfirmed: false,
            aliases: [],
            createdBy: "",
            createdAt: new Date().toISOString(),
          });
          setProductExtra({ quantity: p.quantity, description: p.description, categoryHint: p.categoryHint, source: sourceLabel });
          setStep("store");
          toast({ title: "Товар найден!", description: `${p.name}${p.brand ? ` · ${p.brand}` : ""} (${sourceLabel})` });
        }
      })
      .catch((err) => {
        const isNetwork = !err?.response;
        const msg = isNetwork
          ? `Сервер недоступен. Проверьте VITE_API_URL (сейчас: ${import.meta.env.VITE_API_URL ?? "/api"})`
          : "Штрихкод не найден ни в одной базе данных";
        setBarcodeApiError(msg);
        startBarcode(); // restart scanner
      })
      .finally(() => setBarcodeLoading(false));
  }, [barcode.result, startBarcode]);

  // Product search
  useEffect(() => {
    if (debouncedPQ.length < 2) { setProductResults([]); return; }
    productsApi.search({ q: debouncedPQ, limit: 8 }).then((r) => setProductResults(r.data)).catch(() => {});
  }, [debouncedPQ]);

  // Store search
  useEffect(() => {
    if (debouncedSQ.length < 2) { setStoreResults([]); return; }
    storesApi.search({ q: debouncedSQ }).then(setStoreResults).catch(() => {});
  }, [debouncedSQ]);

  // City search (for new store)
  useEffect(() => {
    if (debouncedCityQ.length < 2) { setNewStoreCityResults([]); return; }
    geoApi.cities({ q: debouncedCityQ }).then(setNewStoreCityResults).catch(() => {});
  }, [debouncedCityQ]);

  const handleCapture = async () => {
    const file = capture();
    if (!file) return;
    runAI(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    fromFile(file);
    runAI(file);
  };

  const runAI = async (file: File) => {
    setStep("ai");
    try {
      const result = await pricesApi.recognize(file);
      setAiResult(result);
      if (result.name && result.provider !== "manual") {
        setProductQuery(result.name);
      } else {
        toast({
          title: "ИИ не распознал товар",
          description: "Введите название вручную или загрузите более чёткое фото",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Ошибка связи с ИИ",
        description: "Проверьте подключение к интернету или введите товар вручную",
        variant: "destructive",
      });
    } finally {
      setStep("product");
    }
  };

  const selectProduct = (p: Product) => {
    setSelectedProduct(p);
    setStep("store");
  };

  const useProductName = () => {
    setSelectedProduct({
      id: NEW_PRODUCT_ID,
      name: productQuery,
      brand: aiResult?.brand ?? null,
      barcode: null,
      categoryId: null,
      imageUrl: null,
      aiGenerated: true,
      aiConfirmed: false,
      aliases: [],
      createdBy: "",
      createdAt: new Date().toISOString(),
    });
    setStep("store");
  };

  const selectStore = (s: StoreResult) => {
    setSelectedStore(s);
    setNewStoreMode(false);
    setAiPriceResult(null);
    setStep("price");
  };

  const handleAiPriceLookup = async () => {
    if (!selectedStore || !selectedProduct) return;
    setAiPriceLoading(true);
    setAiPriceResult(null);
    try {
      const result = await pricesApi.lookupStorePrice({
        storeName: selectedStore.name,
        barcode: selectedProduct.barcode,
        productName: selectedProduct.name,
      });
      setAiPriceResult(result);
      if (result.found && result.price != null) {
        setPrice(String(result.pricePromo ?? result.price));
        toast({ title: "Цена найдена!", description: `${result.pricePromo ?? result.price} ${result.currency} · ${result.storeDisplayName ?? selectedStore.name}` });
      }
    } catch {
      setAiPriceResult({ found: false, currency: "RUB", searchUrl: `https://yandex.ru/search/?text=${encodeURIComponent(`${selectedProduct.name} ${selectedStore.name} цена`)}` });
    } finally {
      setAiPriceLoading(false);
    }
  };

  const enterNewStoreMode = () => {
    setNewStoreName(storeQuery);
    setNewStoreCity(null);
    setNewStoreCityQ("");
    setNewStoreMode(true);
  };

  const confirmNewStore = () => {
    if (!newStoreName.trim()) {
      toast({ title: "Введите название магазина", variant: "destructive" });
      return;
    }
    const cityName = newStoreCity?.name ?? newStoreCityQ.trim();
    if (!cityName) {
      toast({ title: "Введите название города", variant: "destructive" });
      return;
    }
    const cityForStore = newStoreCity ?? {
      id: "__new__",
      name: cityName,
      country: { id: "__new__", name: "Russia", code: "RU", flagEmoji: "🇷🇺" },
    };
    setSelectedStore({
      id: "__new__",
      name: newStoreName.trim(),
      chainName: null,
      address: null,
      city: {
        ...cityForStore,
        country: { ...cityForStore.country, flagEmoji: cityForStore.country.flagEmoji ?? "" },
      },
    });
    setNewStoreMode(false);
    setStep("price");
  };

  const handlePublish = async () => {
    if (!selectedProduct || !selectedStore || !price) return;
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast({ title: "Неверная цена", description: "Введите корректную цену", variant: "destructive" });
      return;
    }

    setPublishing(true);
    try {
      const fd = new FormData();
      if (selectedProduct.id === NEW_PRODUCT_ID) {
        fd.append("productName", selectedProduct.name);
      } else {
        fd.append("productId", selectedProduct.id);
      }
      if (selectedStore.id === "__new__") {
        fd.append("storeName", selectedStore.name);
        fd.append("cityName", selectedStore.city.name);
        fd.append("countryCode", selectedStore.city.country.code);
      } else {
        fd.append("storeId", selectedStore.id);
      }
      fd.append("price", String(priceNum));
      fd.append("currencyCode", currency);
      if (aiResult?.name) fd.append("aiRecognizedName", aiResult.name);
      if (cam.capturedFile) fd.append("photo", cam.capturedFile);

      await pricesApi.create(fd);
      navigator.vibrate?.(50);
      setStep("done");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Не удалось опубликовать";
      toast({ title: "Ошибка", description: msg, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── STEP: PHOTO ──────────────────────────────────────────────────────────

  if (step === "photo") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="font-bold">Добавить цену</h1>
          <p className="text-xs text-muted-foreground">Шаг 1 из 4</p>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex rounded-xl border overflow-hidden">
        <button
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${captureMode === "barcode" ? "bg-primary text-primary-foreground" : "hover:bg-accent/40"}`}
          onClick={() => { setCaptureMode("barcode"); resetCam(); }}
        >
          <Barcode className="h-4 w-4" /> Штрихкод
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${captureMode === "photo" ? "bg-primary text-primary-foreground" : "hover:bg-accent/40"}`}
          onClick={() => { setCaptureMode("photo"); stopBarcode(); }}
        >
          <Camera className="h-4 w-4" /> Фото ценника
        </button>
      </div>

      {/* Barcode mode */}
      {captureMode === "barcode" && (
        <div className="space-y-3">
          <div className="rounded-xl border bg-card overflow-hidden relative">
            <video
              ref={barcodeVideoRef}
              className="w-full aspect-[4/3] object-cover bg-black"
              playsInline
              muted
              autoPlay
            />
            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-56 h-36">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br" />
                {barcode.scanning && (
                  <div className="absolute left-1 right-1 h-0.5 bg-primary/80 animate-scan-line" style={{ top: "50%" }} />
                )}
              </div>
            </div>
            {barcodeLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
                <span className="text-white ml-2 text-sm">Поиск в 4 базах данных...</span>
              </div>
            )}
          </div>

          <p className="text-center text-sm text-muted-foreground">
            {barcode.scanning ? "Наведите камеру на штрихкод" : barcode.error ?? "Запуск камеры..."}
          </p>

          {barcodeApiError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {barcodeApiError}
            </div>
          )}

          {barcode.error && (
            <Button className="w-full" onClick={startBarcode}>Повторить</Button>
          )}

          <Button variant="ghost" className="w-full text-sm" onClick={() => setStep("product")}>
            Нет штрихкода → ввести вручную
          </Button>
        </div>
      )}

      {/* Photo mode */}
      {captureMode === "photo" && (
        <div className="space-y-3">
          <div className="rounded-xl border bg-card overflow-hidden">
            {cam.isActive ? (
              <div className="relative">
                <video ref={videoRef} className="w-full aspect-[4/3] object-cover bg-black" playsInline muted autoPlay />
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                  <Button size="lg" className="rounded-full h-14 w-14 p-0 shadow-xl" onClick={handleCapture}>
                    <Camera className="h-6 w-6" />
                  </Button>
                </div>
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-black/40 text-white hover:bg-black/60" onClick={resetCam}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : cam.capturedUrl ? (
              <div className="relative">
                <img src={cam.capturedUrl} alt="captured" className="w-full aspect-[4/3] object-cover" />
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-black/40 text-white hover:bg-black/60" onClick={resetCam}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="aspect-[4/3] flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <Camera className="h-12 w-12 opacity-30" />
                <p className="text-sm">Сфотографируйте ценник</p>
              </div>
            )}
          </div>

          {cam.error && <p className="text-sm text-destructive text-center">{cam.error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Button className="gap-2" onClick={startCamera} disabled={cam.isActive}>
              <Camera className="h-4 w-4" /> Открыть камеру
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Загрузить фото
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </div>

          <Button variant="ghost" className="w-full text-sm" onClick={() => setStep("product")}>
            Пропустить фото → ввести вручную
          </Button>
        </div>
      )}
    </div>
  );

  // ─── STEP: AI LOADING ────────────────────────────────────────────────────

  if (step === "ai") return (
    <div className="max-w-lg mx-auto px-4 py-20 flex flex-col items-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="font-medium">ИИ распознаёт товар...</p>
      <p className="text-sm text-muted-foreground">Обычно занимает менее 3 секунд</p>
      {cam.capturedUrl && <img src={cam.capturedUrl} alt="" className="h-32 w-32 rounded-xl object-cover border mt-2" />}
    </div>
  );

  // ─── STEP: PRODUCT ────────────────────────────────────────────────────────

  if (step === "product") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setStep("photo")}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="font-bold">Выбрать товар</h1>
          <p className="text-xs text-muted-foreground">Шаг 2 из 4</p>
        </div>
      </div>

      {aiResult?.name && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs text-primary font-medium mb-1">Определено:</p>
          <p className="font-medium">{aiResult.name}</p>
          {aiResult.brand && <p className="text-sm text-muted-foreground">{aiResult.brand}</p>}
          <Badge variant="outline" className="mt-1 text-[10px]">
            {Math.round(aiResult.confidence * 100)}% уверенность · {aiResult.provider}
          </Badge>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по названию товара..."
          value={productQuery}
          onChange={(e) => setProductQuery(e.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {productResults.map((p) => (
          <button
            key={p.id}
            className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors text-left"
            onClick={() => selectProduct(p)}
          >
            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-lg flex-shrink-0">📦</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.name}</p>
              {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </button>
        ))}
      </div>

      {productQuery.length >= 2 && (
        <Button className="w-full gap-2" onClick={useProductName}>
          <Plus className="h-4 w-4" />
          {productResults.length === 0 ? `Добавить «${productQuery}»` : `Использовать «${productQuery}»`}
        </Button>
      )}
    </div>
  );

  // ─── STEP: STORE ──────────────────────────────────────────────────────────

  if (step === "store") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => { setNewStoreMode(false); setStep("product"); }}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="font-bold">{newStoreMode ? "Новый магазин" : "Выбрать магазин"}</h1>
          <p className="text-xs text-muted-foreground">Шаг 3 из 4 — {selectedProduct?.name}</p>
        </div>
      </div>

      {selectedProduct && (
        <div className="rounded-xl border bg-card overflow-hidden">
          {selectedProduct.imageUrl && (
            <img
              src={selectedProduct.imageUrl}
              alt={selectedProduct.name}
              className="w-full h-48 object-contain bg-white border-b"
            />
          )}
          <div className="p-3 space-y-1">
            <p className="font-bold text-base leading-snug">{selectedProduct.name}</p>
            {selectedProduct.brand && (
              <p className="text-sm text-muted-foreground">{selectedProduct.brand}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-1">
              {productExtra?.quantity && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{productExtra.quantity}</span>
              )}
              {productExtra?.categoryHint && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full capitalize">{productExtra.categoryHint}</span>
              )}
              {selectedProduct.barcode && (
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded-full">{selectedProduct.barcode}</span>
              )}
              {productExtra?.source && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{productExtra.source}</span>
              )}
            </div>
            {productExtra?.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-3 leading-relaxed">
                <span className="font-medium">Состав: </span>{productExtra.description}
              </p>
            )}
          </div>
        </div>
      )}

      {newStoreMode ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Название магазина</label>
            <Input
              placeholder="Например: Пятёрочка, Магнит..."
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Город</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск города..."
                value={newStoreCity ? newStoreCity.name : newStoreCityQ}
                onChange={(e) => { setNewStoreCityQ(e.target.value); setNewStoreCity(null); }}
                className="pl-9"
              />
            </div>

            {newStoreCityResults.length > 0 && !newStoreCity && (
              <div className="mt-1 border rounded-lg overflow-hidden">
                {newStoreCityResults.map((c) => (
                  <button
                    key={c.id}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/30 text-left text-sm"
                    onClick={() => { setNewStoreCity(c); setNewStoreCityQ(c.name); setNewStoreCityResults([]); }}
                  >
                    <span>{c.country.flagEmoji}</span>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground text-xs">{c.country.name}</span>
                  </button>
                ))}
              </div>
            )}

            {newStoreCityQ.length >= 2 && newStoreCityResults.length === 0 && !newStoreCity && (
              <p className="text-xs text-muted-foreground mt-1">Город не найден в базе. Попробуйте по-английски (Moscow, Kazan...)</p>
            )}

            {newStoreCity && (
              <p className="text-xs text-emerald-500 mt-1">
                {newStoreCity.country.flagEmoji} {newStoreCity.name}, {newStoreCity.country.name}
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setNewStoreMode(false)}>Отмена</Button>
            <Button className="flex-1" onClick={confirmNewStore}>Подтвердить</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Пят... → Пятёрочка, Магнит..."
              value={storeQuery}
              onChange={(e) => setStoreQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto">
            {storeResults.map((s) => (
              <button
                key={s.id}
                className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors text-left"
                onClick={() => selectStore(s)}
              >
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-lg flex-shrink-0">🏪</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.city.name} {s.city.country.flagEmoji}
                    {s.address && ` · ${s.address}`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>

          {storeQuery.length >= 2 && storeResults.length === 0 && (
            <div className="text-center py-2 space-y-3">
              <p className="text-sm text-muted-foreground">Магазин «{storeQuery}» не найден</p>
              <Button className="gap-2" onClick={enterNewStoreMode}>
                <Plus className="h-4 w-4" /> Создать новый магазин
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ─── STEP: PRICE ──────────────────────────────────────────────────────────

  if (step === "price") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setStep("store")}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="font-bold">Введите цену</h1>
          <p className="text-xs text-muted-foreground">Шаг 4 из 4</p>
        </div>
      </div>

      {/* Product summary card */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {selectedProduct?.imageUrl && (
          <img src={selectedProduct.imageUrl} alt="" className="w-full h-48 object-contain bg-white border-b" />
        )}
        {cam.capturedUrl && !selectedProduct?.imageUrl && (
          <img src={cam.capturedUrl} alt="" className="w-full h-32 object-cover border-b" />
        )}
        <div className="p-3 space-y-1.5">
          <p className="font-bold text-base">{selectedProduct?.name}</p>
          {selectedProduct?.brand && (
            <p className="text-sm text-muted-foreground">{selectedProduct.brand}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {productExtra?.quantity && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{productExtra.quantity}</span>
            )}
            {productExtra?.categoryHint && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full capitalize">{productExtra.categoryHint}</span>
            )}
            {selectedProduct?.barcode && (
              <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded-full">{selectedProduct.barcode}</span>
            )}
            {productExtra?.source && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{productExtra.source}</span>
            )}
          </div>
          {productExtra?.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              <span className="font-medium">Состав: </span>{productExtra.description}
            </p>
          )}
          <div className="border-t pt-2 mt-1 flex justify-between text-sm">
            <span className="text-muted-foreground">Магазин</span>
            <span className="font-medium">{selectedStore?.name}, {selectedStore?.city.name} {selectedStore?.city.country.flagEmoji}</span>
          </div>
        </div>
      </div>

      {/* Store price lookup */}
      {!aiPriceResult && !aiPriceLoading && (
        <Button variant="outline" className="w-full gap-2" onClick={handleAiPriceLookup}>
          <Sparkles className="h-4 w-4 text-primary" />
          Найти цену на сайте {selectedStore?.name}
        </Button>
      )}

      {aiPriceLoading && (
        <div className="flex items-center gap-3 p-3 rounded-xl border text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
          Ищу цену на сайте {selectedStore?.name}...
        </div>
      )}

      {aiPriceResult && aiPriceResult.found && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">
                {aiPriceResult.pricePromo ?? aiPriceResult.price} ₽
                {aiPriceResult.pricePromo && (
                  <span className="text-sm font-normal line-through text-muted-foreground ml-2">{aiPriceResult.price} ₽</span>
                )}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
                {aiPriceResult.storeDisplayName} · цена с сайта
              </p>
            </div>
            {aiPriceResult.productUrl && (
              <a href={aiPriceResult.productUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="gap-1">
                  <ExternalLink className="h-3 w-3" /> Сайт
                </Button>
              </a>
            )}
          </div>
          {aiPriceResult.productName && (
            <p className="text-xs text-muted-foreground truncate">{aiPriceResult.productName}</p>
          )}
        </div>
      )}

      {aiPriceResult && !aiPriceResult.found && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3 flex items-center justify-between">
          <p className="text-sm text-orange-700 dark:text-orange-400">Цена не найдена автоматически</p>
          <a href={aiPriceResult.searchUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-1">
              <ExternalLink className="h-3 w-3" /> Яндекс
            </Button>
          </a>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Цена</label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="text-xl font-bold"
            step="0.01"
            min="0"
            autoFocus
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="border rounded-md px-3 bg-background text-sm font-medium"
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <Button className="w-full h-12 text-base" onClick={handlePublish} disabled={publishing || !price}>
        {publishing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Опубликовать цену"}
      </Button>
    </div>
  );

  // ─── STEP: DONE ───────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 py-20 flex flex-col items-center gap-4 text-center">
      <CheckCircle className="h-16 w-16 text-emerald-400" />
      <h2 className="text-xl font-bold">Цена опубликована!</h2>
      <p className="text-muted-foreground text-sm">Спасибо за вклад. Ваша цена проходит проверку.</p>
      <div className="flex gap-3 mt-4">
        <Button variant="outline" onClick={() => navigate("/")}>На главную</Button>
        <Button onClick={() => {
          resetCam();
          setStep("photo");
          setSelectedProduct(null);
          setSelectedStore(null);
          setPrice("");
          setAiResult(null);
          setProductExtra(null);
          setAiPriceResult(null);
          setProductQuery("");
          setStoreQuery("");
          setNewStoreMode(false);
        }}>
          Добавить ещё
        </Button>
      </div>
    </div>
  );
}
