import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera, Upload, X, Loader2, CheckCircle, Search,
  ArrowLeft, Plus, Barcode, MapPin, Tag, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCamera } from "@/hooks/useCamera";
import { useBarcode } from "@/hooks/useBarcode";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuthStore } from "@/store/auth.store";
import { pricesApi } from "@/api/prices.api";
import { productsApi } from "@/api/products.api";
import { storesApi, type StoreResult } from "@/api/stores.api";
import { geoApi, type City } from "@/api/geo.api";
import { toast } from "@/hooks/useToast";
import { STORE_CHAINS, CATEGORY_LABELS, type StoreChain } from "@/lib/stores-list";
import type { Product } from "@priceradar/shared";

type Step = "barcode" | "product_photo" | "pick_product" | "price_photo" | "store" | "confirm" | "done";

const NEW_PRODUCT_ID = "__new__";
const CURRENCIES = ["RUB", "USD", "EUR", "GBP", "KZT", "TRY"];
const STORE_BY_CATEGORY = (Object.keys(CATEGORY_LABELS) as StoreChain["category"][]).map((cat) => ({
  label: CATEGORY_LABELS[cat],
  stores: STORE_CHAINS.filter((s) => s.category === cat).map((s) => s.name),
}));

const SOURCE_LABELS: Record<string, string> = {
  local: "база данных", "5ka": "Пятёрочка", perekrestok: "Перекрёсток",
  magnit: "Магнит", vkusvill: "ВкусВилл", barcodelist: "barcode-list.ru",
  openbeautyfacts: "Open Beauty Facts", openpetfoodfacts: "Open Pet Food Facts",
  upcitemdb: "UPC Item DB", ai: "Google AI",
};

const STEP_PROGRESS: Record<Step, number> = {
  barcode: 15, product_photo: 35, pick_product: 50, price_photo: 60, store: 80, confirm: 95, done: 100,
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-primary rounded-full transition-all duration-500"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export default function AddPricePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { videoRef, state: cam, startCamera, capture, reset: resetCam } = useCamera();

  const barcodeVideoRef = useRef<HTMLVideoElement>(null);
  const { state: barcode, start: startBarcode, stop: stopBarcode } = useBarcode(barcodeVideoRef);

  const [step, setStep] = useState<Step>("barcode");

  // Product
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productExtra, setProductExtra] = useState<{
    quantity?: string | null;
    categoryHint?: string | null;
    source?: string | null;
  } | null>(null);
  const [productName, setProductName] = useState("");
  const [productBrand, setProductBrand] = useState<string | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productPhotoUrl, setProductPhotoUrl] = useState<string | null>(null);
  const [productPhotoFile, setProductPhotoFile] = useState<File | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  // Price
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("RUB");
  const [priceLoading, setPriceLoading] = useState(false);
  const [pricePhotoUrl, setPricePhotoUrl] = useState<string | null>(null);

  // Store
  const [storeQuery, setStoreQuery] = useState("");
  const [storeResults, setStoreResults] = useState<StoreResult[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreResult | null>(null);
  const [newStoreMode, setNewStoreMode] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreCityQ, setNewStoreCityQ] = useState("");
  const [newStoreCityResults, setNewStoreCityResults] = useState<City[]>([]);
  const [newStoreCity, setNewStoreCity] = useState<City | null>(null);
  const [gpsCity, setGpsCity] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [dupCandidates, setDupCandidates] = useState<Array<{ id: string; name: string; brand: string | null; imageUrl: string | null; similarity: number }>>([]);
  const [dupChecking, setDupChecking] = useState(false);

  const debouncedSQ = useDebounce(storeQuery, 300);
  const debouncedCityQ = useDebounce(newStoreCityQ, 300);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const priceFileInputRef = useRef<HTMLInputElement>(null);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      toast({ title: "Требуется вход", description: "Войдите, чтобы добавить цены", variant: "destructive" });
      navigate("/login", { state: { from: "/add-price" } });
    }
  }, [isAuthenticated, navigate]);

  // Barcode scanner — auto-start on barcode step
  useEffect(() => {
    if (step === "barcode") {
      startBarcode();
    } else {
      stopBarcode();
    }
  }, [step]);

  // Camera — auto-start for product photo step
  useEffect(() => {
    if (step === "product_photo" && !productPhotoUrl) {
      startCamera();
    }
  }, [step, productPhotoUrl]);

  // Camera — auto-start for price photo step
  useEffect(() => {
    if (step === "price_photo" && !pricePhotoUrl) {
      startCamera();
    }
  }, [step, pricePhotoUrl]);

  // Stop camera when leaving camera steps
  useEffect(() => {
    if (step !== "product_photo" && step !== "price_photo") {
      resetCam();
    }
  }, [step]);

  // Barcode scan result
  useEffect(() => {
    if (!barcode.result) return;
    setBarcodeLoading(true);
    setBarcodeError(null);
    productsApi.lookupBarcode(barcode.result)
      .then((data) => {
        const p = data.product;
        const sourceLabel = SOURCE_LABELS[data.source] ?? data.source;
        setSelectedProduct({
          id: data.source === "local" && p.id ? p.id : NEW_PRODUCT_ID,
          name: p.name,
          brand: p.brand ?? null,
          barcode: barcode.result!,
          categoryId: null,
          imageUrl: p.imageUrl ?? null,
          aiGenerated: data.source !== "local",
          aiConfirmed: data.source === "local",
          aliases: [],
          createdBy: "",
          createdAt: new Date().toISOString(),
        });
        setProductName(p.name);
        setProductBrand(p.brand ?? null);
        setProductExtra({ quantity: p.quantity, categoryHint: p.categoryHint, source: sourceLabel });
        toast({ title: "Товар найден!", description: p.name });
        setPricePhotoUrl(null);
        setStep("price_photo");
      })
      .catch(() => {
        setScannedBarcode(barcode.result!);
        setBarcodeError("Не найден в базе — сфотографируйте этикетку");
      })
      .finally(() => setBarcodeLoading(false));
  }, [barcode.result]);

  // Store search
  useEffect(() => {
    if (debouncedSQ.length < 2) { setStoreResults([]); return; }
    storesApi.search({ q: debouncedSQ }).then(setStoreResults).catch(() => {});
  }, [debouncedSQ]);

  // City search
  useEffect(() => {
    if (debouncedCityQ.length < 2) { setNewStoreCityResults([]); return; }
    geoApi.cities({ q: debouncedCityQ }).then(setNewStoreCityResults).catch(() => {});
  }, [debouncedCityQ]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleProductCapture = () => {
    const file = capture();
    if (!file) return;
    setProductPhotoFile(file);
    setProductPhotoUrl(URL.createObjectURL(file));
    resetCam();
    runProductAI(file);
  };

  const handleProductFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProductPhotoFile(file);
    setProductPhotoUrl(URL.createObjectURL(file));
    resetCam();
    runProductAI(file);
    e.target.value = "";
  };

  const runProductAI = async (file: File) => {
    setProductLoading(true);
    try {
      const result = await pricesApi.recognize(file);
      if (result.name && result.provider !== "manual" && result.confidence >= 0.7) {
        setProductName(result.name);
        setProductBrand(result.brand ?? null);
        // Level 3: check for duplicates after AI recognition
        checkDuplicates(result.name, scannedBarcode ?? undefined);
      }
    } catch { /* silent */ } finally {
      setProductLoading(false);
    }
  };

  const checkDuplicates = async (name: string, barcode?: string) => {
    setDupChecking(true);
    setDupCandidates([]);
    try {
      const res = await productsApi.checkDuplicate({ name, barcode });
      if (res.exact) {
        // Perfect match — auto-select silently
        setSelectedProduct({
          id: res.exact.id, name: res.exact.name, brand: res.exact.brand,
          barcode: res.exact.barcode, categoryId: null, imageUrl: res.exact.imageUrl,
          aiGenerated: false, aiConfirmed: true, aliases: [], createdBy: "", createdAt: "",
        });
      } else if (res.similar.length > 0) {
        setDupCandidates(res.similar);
      }
    } catch { /* silent */ } finally {
      setDupChecking(false);
    }
  };

  const handlePriceCapture = () => {
    const file = capture();
    if (!file) return;
    setPricePhotoUrl(URL.createObjectURL(file));
    resetCam();
    runPriceAI(file);
  };

  const handlePriceFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPricePhotoUrl(URL.createObjectURL(file));
    resetCam();
    runPriceAI(file);
    e.target.value = "";
  };

  const runPriceAI = async (file: File) => {
    setPriceLoading(true);
    try {
      const result = await pricesApi.recognizePrice(file);
      if (result.price != null) {
        setPrice(String(result.price));
        setCurrency(result.currency ?? "RUB");
        toast({ title: `Цена определена: ${result.price} ₽` });
      } else {
        toast({ title: "Введите цену вручную" });
      }
    } catch { /* silent */ } finally {
      setPriceLoading(false);
    }
  };

  const confirmProduct = () => {
    // If already auto-resolved (exact match), skip pick_product
    if (selectedProduct && selectedProduct.id !== NEW_PRODUCT_ID) {
      resetCam();
      setPricePhotoUrl(null);
      setStep("price_photo");
      return;
    }
    // If fuzzy candidates found — show pick_product step
    if (dupCandidates.length > 0 && !dupChecking) {
      resetCam();
      setStep("pick_product");
      return;
    }
    // No candidates — create new
    setSelectedProduct({
      id: NEW_PRODUCT_ID,
      name: productName.trim(),
      brand: productBrand,
      barcode: scannedBarcode,
      categoryId: null,
      imageUrl: null,
      aiGenerated: true,
      aiConfirmed: false,
      aliases: [],
      createdBy: "",
      createdAt: new Date().toISOString(),
    });
    resetCam();
    setPricePhotoUrl(null);
    setStep("price_photo");
  };

  const pickExistingProduct = (p: { id: string; name: string; brand: string | null; imageUrl: string | null }) => {
    setSelectedProduct({
      id: p.id, name: p.name, brand: p.brand, barcode: scannedBarcode,
      categoryId: null, imageUrl: p.imageUrl, aiGenerated: false, aiConfirmed: true,
      aliases: [], createdBy: "", createdAt: "",
    });
    setDupCandidates([]);
    setPricePhotoUrl(null);
    setStep("price_photo");
  };

  const createNewProduct = () => {
    setSelectedProduct({
      id: NEW_PRODUCT_ID, name: productName.trim(), brand: productBrand,
      barcode: scannedBarcode, categoryId: null, imageUrl: null,
      aiGenerated: true, aiConfirmed: false, aliases: [], createdBy: "", createdAt: "",
    });
    setDupCandidates([]);
    setPricePhotoUrl(null);
    setStep("price_photo");
  };

  const detectGpsCity = async () => {
    setGpsLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=ru`,
        { headers: { "User-Agent": "PriceRadar/1.0" } }
      );
      if (!res.ok) throw new Error();
      type N = { address?: { city?: string; town?: string; village?: string } };
      const d = (await res.json()) as N;
      const city = d.address?.city ?? d.address?.town ?? d.address?.village ?? null;
      setGpsCity(city);
      if (city) {
        setNewStoreCityQ(city);
        toast({ title: `Город: ${city}` });
      }
    } catch {
      toast({ title: "Не удалось определить местоположение", variant: "destructive" });
    } finally {
      setGpsLoading(false);
    }
  };

  const selectQuickChain = (chainName: string) => {
    if (gpsCity) {
      setSelectedStore({
        id: "__new__",
        name: chainName,
        chainName: chainName,
        address: null,
        city: { id: "__new__", name: gpsCity, country: { id: "__new__", name: "Россия", code: "RU", flagEmoji: "🇷🇺" } },
      });
      setStep("confirm");
    } else {
      setNewStoreName(chainName);
      setNewStoreMode(true);
    }
  };

  const selectStore = (s: StoreResult) => {
    setSelectedStore(s);
    setStep("confirm");
  };

  const confirmNewStore = () => {
    const cityName = newStoreCity?.name ?? newStoreCityQ.trim();
    if (!newStoreName.trim() || !cityName) {
      toast({ title: "Введите название магазина и город", variant: "destructive" });
      return;
    }
    setSelectedStore({
      id: "__new__",
      name: newStoreName.trim(),
      chainName: null,
      address: null,
      city: {
        id: newStoreCity?.id ?? "__new__",
        name: cityName,
        country: newStoreCity
          ? { ...newStoreCity.country, flagEmoji: newStoreCity.country.flagEmoji ?? "" }
          : { id: "__new__", name: "Россия", code: "RU", flagEmoji: "🇷🇺" },
      },
    });
    setNewStoreMode(false);
    setStep("confirm");
  };

  const handlePublish = async () => {
    if (!selectedProduct || !selectedStore) return;
    const priceNum = price ? parseFloat(price) : NaN;
    if (isNaN(priceNum) || priceNum <= 0) {
      toast({ title: "Введите корректную цену", variant: "destructive" });
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
      if (productPhotoFile) fd.append("photo", productPhotoFile);
      await pricesApi.create(fd);
      navigator.vibrate?.(50);
      setStep("done");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Ошибка публикации";
      toast({ title: "Ошибка", description: msg, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const resetAll = () => {
    resetCam();
    setStep("barcode");
    setSelectedProduct(null); setProductExtra(null);
    setProductName(""); setProductBrand(null);
    setProductLoading(false); setProductPhotoUrl(null); setProductPhotoFile(null);
    setBarcodeError(null); setBarcodeLoading(false);
    setPrice(""); setCurrency("RUB");
    setPriceLoading(false); setPricePhotoUrl(null);
    setSelectedStore(null); setStoreQuery(""); setStoreResults([]);
    setNewStoreMode(false); setNewStoreName(""); setNewStoreCityQ(""); setNewStoreCity(null);
    setGpsCity(null);
  };

  const progress = STEP_PROGRESS[step];

  // ─── STEP: BARCODE ────────────────────────────────────────────────────────

  if (step === "barcode") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="font-bold">Добавить цену</h1>
          <p className="text-xs text-muted-foreground">Шаг 1 — сканируем штрихкод</p>
        </div>
      </div>
      <ProgressBar value={progress} />

      <div className="rounded-xl border bg-card overflow-hidden relative">
        <video
          ref={barcodeVideoRef}
          className="w-full aspect-[4/3] object-cover bg-black"
          playsInline muted autoPlay
        />
        {/* Viewfinder overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-64 h-40">
            <div className="absolute top-0 left-0 w-8 h-8 border-white" style={{ borderWidth: "3px 0 0 3px", borderRadius: "4px 0 0 0" }} />
            <div className="absolute top-0 right-0 w-8 h-8 border-white" style={{ borderWidth: "3px 3px 0 0", borderRadius: "0 4px 0 0" }} />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-white" style={{ borderWidth: "0 0 3px 3px", borderRadius: "0 0 0 4px" }} />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-white" style={{ borderWidth: "0 3px 3px 0", borderRadius: "0 0 4px 0" }} />
            {(barcode.scanning || barcodeLoading) && (
              <div
                className="absolute left-0 right-0 h-0.5 animate-scan-line"
                style={{ background: "linear-gradient(90deg, transparent, #ef4444 20%, #ef4444 80%, transparent)", boxShadow: "0 0 6px 2px rgba(239,68,68,0.6)" }}
              />
            )}
          </div>
        </div>
        {barcodeLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <p className="text-white text-sm">Поиск в базах данных...</p>
          </div>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {barcode.scanning ? "Наведите камеру на штрихкод товара" : barcode.error ?? "Запуск камеры..."}
      </p>

      {barcodeError && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 dark:bg-orange-950/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Barcode className="h-4 w-4 text-orange-500 flex-shrink-0" />
            <p className="text-sm font-medium text-orange-700 dark:text-orange-300">{barcodeError}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => { setBarcodeError(null); startBarcode(); }}>
              Повторить
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setStep("product_photo")}>
              Фото товара →
            </Button>
          </div>
        </div>
      )}

      <Button
        variant="ghost"
        className="w-full text-sm text-muted-foreground"
        onClick={() => setStep("product_photo")}
      >
        Нет штрихкода — сфотографировать товар
      </Button>
    </div>
  );

  // ─── STEP: PRODUCT PHOTO ──────────────────────────────────────────────────

  if (step === "product_photo") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => { resetCam(); setStep("barcode"); }}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-bold">Фото товара</h1>
          <p className="text-xs text-muted-foreground">Шаг 2 — AI определит название</p>
        </div>
      </div>
      <ProgressBar value={progress} />

      <div className="rounded-xl border bg-card overflow-hidden relative">
        {productPhotoUrl ? (
          <>
            <img src={productPhotoUrl} alt="товар" className="w-full aspect-[4/3] object-cover" />
            {productLoading ? (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
                <p className="text-white text-sm font-medium">AI определяет название...</p>
              </div>
            ) : (
              <Button
                variant="ghost" size="icon"
                className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70"
                onClick={() => { setProductPhotoUrl(null); setProductPhotoFile(null); setProductName(""); startCamera(); }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : cam.isActive ? (
          <>
            <video ref={videoRef} className="w-full aspect-[4/3] object-cover bg-black" playsInline muted autoPlay />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <button
                onClick={handleProductCapture}
                className="h-14 w-14 rounded-full bg-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
              >
                <div className="h-12 w-12 rounded-full border-4 border-gray-300 flex items-center justify-center">
                  <Camera className="h-5 w-5 text-gray-700" />
                </div>
              </button>
            </div>
          </>
        ) : (
          <div className="aspect-[4/3] flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
            <Camera className="h-10 w-10 opacity-30" />
            <p className="text-sm text-center">Сфотографируйте товар<br />или загрузите фото из галереи</p>
            {cam.error && <p className="text-xs text-destructive">{cam.error}</p>}
          </div>
        )}
      </div>

      {!productPhotoUrl && (
        <div className="grid grid-cols-2 gap-3">
          <Button className="gap-2" onClick={startCamera} disabled={cam.isActive}>
            <Camera className="h-4 w-4" /> Камера
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Галерея
          </Button>
        </div>
      )}

      {!productLoading && (
        <div className="space-y-3">
          <Input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder={productPhotoUrl ? "Проверьте или исправьте название" : "Или введите название вручную"}
          />
          <Button
            className="w-full gap-2 h-12"
            onClick={confirmProduct}
            disabled={!productName.trim()}
          >
            Дальше — ценник <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleProductFileUpload} />
    </div>
  );

  // ─── STEP: PICK PRODUCT (duplicate check UI) ─────────────────────────────

  if (step === "pick_product") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <ProgressBar value={progress} />
      <div className="space-y-1">
        <h2 className="font-bold text-base">Это тот же товар?</h2>
        <p className="text-sm text-muted-foreground">
          ИИ распознал: <strong>«{productName}»</strong>
          <br />Мы нашли похожие товары в базе:
        </p>
      </div>

      <div className="space-y-2">
        {dupCandidates.map((c) => (
          <button
            key={c.id}
            className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left"
            onClick={() => pickExistingProduct(c)}
          >
            {c.imageUrl
              ? <img src={c.imageUrl} alt={c.name} className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
              : <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center text-xl flex-shrink-0">📦</div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">{c.name}</p>
              {c.brand && <p className="text-xs text-muted-foreground">{c.brand}</p>}
              <p className="text-xs text-primary mt-0.5">Совпадение {c.similarity}%</p>
            </div>
            <CheckCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          </button>
        ))}
      </div>

      <Button variant="outline" className="w-full" onClick={createNewProduct}>
        Нет, это другой товар — создать новый
      </Button>
    </div>
  );

  // ─── STEP: PRICE PHOTO ────────────────────────────────────────────────────

  if (step === "price_photo") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost" size="icon"
          onClick={() => { resetCam(); setStep(selectedProduct?.barcode ? "barcode" : "product_photo"); }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-bold">Фото ценника</h1>
          <p className="text-xs text-muted-foreground">Шаг 3 — AI считает цену</p>
        </div>
      </div>
      <ProgressBar value={progress} />

      {/* Product chip */}
      {selectedProduct && (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{selectedProduct.name}</p>
            {selectedProduct.barcode && (
              <p className="text-xs font-mono text-muted-foreground">{selectedProduct.barcode}</p>
            )}
          </div>
          {productExtra?.source && (
            <span className="text-xs text-primary px-2 py-0.5 rounded-full bg-primary/15 flex-shrink-0">
              {productExtra.source}
            </span>
          )}
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden relative">
        {pricePhotoUrl ? (
          <>
            <img src={pricePhotoUrl} alt="ценник" className="w-full aspect-[4/3] object-cover" />
            {priceLoading ? (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
                <p className="text-white text-sm font-medium">AI читает цену...</p>
              </div>
            ) : (
              <Button
                variant="ghost" size="icon"
                className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70"
                onClick={() => { setPricePhotoUrl(null); setPrice(""); startCamera(); }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : cam.isActive ? (
          <>
            <video ref={videoRef} className="w-full aspect-[4/3] object-cover bg-black" playsInline muted autoPlay />
            {/* Price tag target frame */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-white/70 rounded-xl w-3/4 h-2/5 flex items-center justify-center">
                <Tag className="h-5 w-5 text-white/50" />
              </div>
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <button
                onClick={handlePriceCapture}
                className="h-14 w-14 rounded-full bg-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
              >
                <div className="h-12 w-12 rounded-full border-4 border-gray-300 flex items-center justify-center">
                  <Camera className="h-5 w-5 text-gray-700" />
                </div>
              </button>
            </div>
          </>
        ) : (
          <div className="aspect-[4/3] flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
            <Tag className="h-10 w-10 opacity-30" />
            <p className="text-sm text-center">Наведите камеру на ценник<br />или введите цену вручную</p>
            {cam.error && <p className="text-xs text-destructive">{cam.error}</p>}
          </div>
        )}
      </div>

      {!pricePhotoUrl && (
        <div className="grid grid-cols-2 gap-3">
          <Button className="gap-2" onClick={startCamera} disabled={cam.isActive}>
            <Camera className="h-4 w-4" /> Камера
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => priceFileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Галерея
          </Button>
        </div>
      )}

      {!priceLoading && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Цена (авто или вручную)"
              className="text-xl font-bold flex-1"
              step="0.01" min="0"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="border rounded-md px-3 bg-background text-sm font-medium"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Button className="w-full gap-2 h-12" onClick={() => setStep("store")} disabled={!price}>
            Дальше — выбрать магазин <ChevronRight className="h-4 w-4" />
          </Button>
          {!price && (
            <Button variant="ghost" className="w-full text-sm text-muted-foreground" onClick={() => setStep("store")}>
              Пропустить — укажу цену позже
            </Button>
          )}
        </div>
      )}

      <input ref={priceFileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePriceFileUpload} />
    </div>
  );

  // ─── STEP: STORE ──────────────────────────────────────────────────────────

  if (step === "store") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => { setNewStoreMode(false); setStep("price_photo"); }}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-bold">{newStoreMode ? "Новый магазин" : "Выбрать магазин"}</h1>
          <p className="text-xs text-muted-foreground">Шаг 4 — где купили?</p>
        </div>
      </div>
      <ProgressBar value={progress} />

      {!newStoreMode && (
        <>
          {/* GPS button */}
          <Button variant="outline" className="w-full gap-2" onClick={detectGpsCity} disabled={gpsLoading}>
            {gpsLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <MapPin className="h-4 w-4 text-primary" />}
            {gpsCity ? `Рядом с ${gpsCity}` : "Определить моё местоположение"}
          </Button>

          {/* Quick chain buttons — grouped by category */}
          {gpsCity && (
            <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Быстрый выбор</p>
              {STORE_BY_CATEGORY.map((group) => (
                <div key={group.label}>
                  <p className="text-xs text-muted-foreground mb-1">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.stores.map((chain) => (
                      <button
                        key={chain}
                        className="px-2.5 py-1 rounded-full border text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                        onClick={() => selectQuickChain(chain)}
                      >
                        {chain}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex-1 border-t" />
            <span className="text-xs text-muted-foreground">или поиск по базе</span>
            <div className="flex-1 border-t" />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Пятёрочка, Магнит, ВкусВилл..."
              value={storeQuery}
              onChange={(e) => setStoreQuery(e.target.value)}
              className="pl-9"
              autoFocus={!gpsCity}
            />
          </div>

          <div className="space-y-1 max-h-56 overflow-y-auto">
            {storeResults.map((s) => (
              <button
                key={s.id}
                className="w-full flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-accent/30 transition-colors text-left"
                onClick={() => selectStore(s)}
              >
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-base flex-shrink-0">🏪</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.city.name} {s.city.country.flagEmoji}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>

          {storeQuery.length >= 2 && storeResults.length === 0 && (
            <div className="text-center py-3 space-y-2">
              <p className="text-sm text-muted-foreground">Магазин не найден в базе</p>
              <Button className="gap-2" onClick={() => { setNewStoreName(storeQuery); setNewStoreMode(true); }}>
                <Plus className="h-4 w-4" /> Добавить «{storeQuery}»
              </Button>
            </div>
          )}
        </>
      )}

      {newStoreMode && (
        <div className="space-y-3">
          <Input
            placeholder="Название магазина"
            value={newStoreName}
            onChange={(e) => setNewStoreName(e.target.value)}
            autoFocus
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Город..."
              value={newStoreCity ? newStoreCity.name : newStoreCityQ}
              onChange={(e) => { setNewStoreCityQ(e.target.value); setNewStoreCity(null); }}
              className="pl-9"
            />
          </div>
          {newStoreCityResults.length > 0 && !newStoreCity && (
            <div className="border rounded-xl overflow-hidden">
              {newStoreCityResults.map((c) => (
                <button
                  key={c.id}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-accent/30 text-left text-sm"
                  onClick={() => { setNewStoreCity(c); setNewStoreCityQ(c.name); setNewStoreCityResults([]); }}
                >
                  <span>{c.country.flagEmoji}</span>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground text-xs">{c.country.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setNewStoreMode(false)}>Назад</Button>
            <Button className="flex-1" onClick={confirmNewStore}>Подтвердить</Button>
          </div>
        </div>
      )}
    </div>
  );

  // ─── STEP: CONFIRM ────────────────────────────────────────────────────────

  if (step === "confirm") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setStep("store")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-bold">Всё верно?</h1>
          <p className="text-xs text-muted-foreground">Шаг 5 — публикуем</p>
        </div>
      </div>
      <ProgressBar value={progress} />

      <div className="rounded-xl border bg-card overflow-hidden">
        {(productPhotoUrl ?? selectedProduct?.imageUrl) && (
          <img
            src={productPhotoUrl ?? selectedProduct?.imageUrl ?? ""}
            alt=""
            className="w-full h-44 object-cover border-b"
          />
        )}
        <div className="p-4 space-y-4">
          {/* Product */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Товар</p>
            <input
              value={selectedProduct?.name ?? ""}
              onChange={(e) => setSelectedProduct((prev) => prev ? { ...prev, name: e.target.value } : prev)}
              className="w-full font-bold text-base bg-transparent border-0 outline-none p-0 leading-snug"
            />
            {selectedProduct?.brand && (
              <p className="text-sm text-muted-foreground mt-0.5">{selectedProduct.brand}</p>
            )}
            {selectedProduct?.barcode && (
              <p className="text-xs font-mono text-muted-foreground mt-0.5">{selectedProduct.barcode}</p>
            )}
          </div>

          <div className="border-t" />

          {/* Price */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Цена</p>
            <div className="flex items-baseline gap-2">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="text-3xl font-bold bg-transparent border-0 outline-none p-0 w-36"
                step="0.01" min="0"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="border rounded-md px-2 py-1 bg-background text-sm font-medium"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t" />

          {/* Store */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Магазин</p>
            <p className="text-sm font-semibold">{selectedStore?.name}</p>
            <p className="text-xs text-muted-foreground">{selectedStore?.city.name} {selectedStore?.city.country.flagEmoji}</p>
          </div>

          {pricePhotoUrl && (
            <>
              <div className="border-t" />
              <div className="flex items-center gap-3">
                <img src={pricePhotoUrl} alt="ценник" className="h-14 w-20 object-cover rounded-lg border" />
                <p className="text-xs text-muted-foreground">Фото ценника прикреплено</p>
              </div>
            </>
          )}
        </div>
      </div>

      <Button
        className="w-full h-14 text-base font-bold gap-2"
        onClick={handlePublish}
        disabled={publishing || !price || !selectedStore || !selectedProduct}
      >
        {publishing
          ? <><Loader2 className="h-5 w-5 animate-spin" /> Публикуем...</>
          : <><CheckCircle className="h-5 w-5" /> Опубликовать цену</>}
      </Button>
    </div>
  );

  // ─── STEP: DONE ───────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 py-16 flex flex-col items-center gap-4 text-center">
      <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
        <CheckCircle className="h-10 w-10 text-emerald-500" />
      </div>
      <h2 className="text-2xl font-bold">Цена опубликована!</h2>
      <p className="text-muted-foreground text-sm">
        {price} {currency} в «{selectedStore?.name}» · {selectedStore?.city.name}
      </p>
      <div className="flex gap-3 mt-4">
        <Button variant="outline" onClick={() => navigate("/")}>На главную</Button>
        <Button onClick={resetAll}>Добавить ещё</Button>
      </div>
    </div>
  );
}
