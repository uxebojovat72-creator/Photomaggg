import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Camera, Upload, X, Loader2, CheckCircle, Search, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCamera } from "@/hooks/useCamera";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuthStore } from "@/store/auth.store";
import { pricesApi } from "@/api/prices.api";
import { productsApi } from "@/api/products.api";
import { storesApi, type StoreResult } from "@/api/stores.api";
import { toast } from "@/hooks/useToast";
import type { AiRecognitionResult, Product } from "@priceradar/shared";

type Step = "photo" | "ai" | "product" | "store" | "price" | "done";

const CURRENCIES = ["USD", "EUR", "RUB", "GBP", "TRY", "CNY", "JPY", "KZT", "AED", "BRL"];

export default function AddPricePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const { videoRef, state: cam, startCamera, capture, reset: resetCam, fromFile } = useCamera();

  const prefill = location.state as { productId?: string; productName?: string } | null;

  const [step, setStep] = useState<Step>(prefill?.productId ? "store" : "photo");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiRecognitionResult | null>(null);

  // Product selection
  const [productQuery, setProductQuery] = useState(prefill?.productName ?? "");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const debouncedPQ = useDebounce(productQuery, 300);

  // Store selection
  const [storeQuery, setStoreQuery] = useState("");
  const [storeResults, setStoreResults] = useState<StoreResult[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreResult | null>(null);
  const debouncedSQ = useDebounce(storeQuery, 300);

  // Price
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [publishing, setPublishing] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      toast({ title: "Sign in required", description: "Please login to add prices", variant: "destructive" });
      navigate("/login", { state: { from: "/add-price" } });
    }
  }, [isAuthenticated, navigate]);

  // Product search
  useEffect(() => {
    if (debouncedPQ.length < 2) { setProductResults([]); return; }
    productsApi.search({ q: debouncedPQ, limit: 8 })
      .then((r) => setProductResults(r.data))
      .catch(() => {});
  }, [debouncedPQ]);

  // Store search
  useEffect(() => {
    if (debouncedSQ.length < 2) { setStoreResults([]); return; }
    storesApi.search({ q: debouncedSQ })
      .then(setStoreResults)
      .catch(() => {});
  }, [debouncedSQ]);

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
    setAiLoading(true);
    try {
      const result = await pricesApi.recognize(file);
      setAiResult(result);
      if (result.name) setProductQuery(result.name);
    } catch {
      // AI failed — go to manual product selection
    } finally {
      setAiLoading(false);
      setStep("product");
    }
  };

  const selectProduct = (p: Product) => {
    setSelectedProduct(p);
    setStep("store");
  };

  const selectStore = (s: StoreResult) => {
    setSelectedStore(s);
    setStep("price");
  };

  const handlePublish = async () => {
    if (!selectedProduct || !selectedStore || !price) return;
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast({ title: "Invalid price", description: "Please enter a valid price", variant: "destructive" });
      return;
    }

    setPublishing(true);
    try {
      const fd = new FormData();
      fd.append("productId", selectedProduct.id);
      fd.append("storeId", selectedStore.id);
      fd.append("price", String(priceNum));
      fd.append("currencyCode", currency);
      if (aiResult?.name) fd.append("aiRecognizedName", aiResult.name);
      if (cam.capturedFile) fd.append("photo", cam.capturedFile);

      await pricesApi.create(fd);

      // Haptic feedback
      navigator.vibrate?.(50);

      setStep("done");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to publish";
      toast({ title: "Error", description: msg, variant: "destructive" });
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
          <h1 className="font-bold">Add Price</h1>
          <p className="text-xs text-muted-foreground">Step 1 of 4 — Photo</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {cam.isActive ? (
          <div className="relative">
            <video ref={videoRef} className="w-full aspect-[4/3] object-cover bg-black" playsInline muted />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
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
            <p className="text-sm">Take a photo of the price tag</p>
          </div>
        )}
      </div>

      {cam.error && (
        <p className="text-sm text-destructive text-center">{cam.error}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button className="gap-2" onClick={startCamera} disabled={cam.isActive}>
          <Camera className="h-4 w-4" /> Open Camera
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4" /> Upload Photo
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </div>

      <Button variant="ghost" className="w-full text-sm" onClick={() => setStep("product")}>
        Skip photo → enter manually
      </Button>
    </div>
  );

  // ─── STEP: AI LOADING ────────────────────────────────────────────────────

  if (step === "ai") return (
    <div className="max-w-lg mx-auto px-4 py-20 flex flex-col items-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="font-medium">AI is recognizing the product...</p>
      <p className="text-sm text-muted-foreground">Usually takes less than 2 seconds</p>
      {cam.capturedUrl && (
        <img src={cam.capturedUrl} alt="" className="h-32 w-32 rounded-xl object-cover border mt-2" />
      )}
    </div>
  );

  // ─── STEP: PRODUCT ────────────────────────────────────────────────────────

  if (step === "product") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setStep("photo")}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="font-bold">Select Product</h1>
          <p className="text-xs text-muted-foreground">Step 2 of 4</p>
        </div>
      </div>

      {aiResult?.name && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs text-primary font-medium mb-1">AI detected:</p>
          <p className="font-medium">{aiResult.name}</p>
          {aiResult.brand && <p className="text-sm text-muted-foreground">{aiResult.brand}</p>}
          <Badge variant="outline" className="mt-1 text-[10px]">
            {Math.round(aiResult.confidence * 100)}% confidence · {aiResult.provider}
          </Badge>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search product name..."
          value={productQuery}
          onChange={(e) => setProductQuery(e.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>

      <div className="space-y-1 max-h-72 overflow-y-auto">
        {productResults.map((p) => (
          <button
            key={p.id}
            className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors text-left"
            onClick={() => selectProduct(p)}
          >
            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-lg flex-shrink-0">
              📦
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.name}</p>
              {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </button>
        ))}
      </div>

      {productQuery.length >= 2 && productResults.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No products found — it will be created automatically</p>
      )}

      {productQuery.length >= 2 && (
        <Button
          className="w-full"
          onClick={() => {
            setSelectedProduct({ id: "__new__", name: productQuery, brand: aiResult?.brand ?? null, barcode: null, categoryId: null, imageUrl: null, aiGenerated: true, aiConfirmed: false, aliases: [], createdBy: "", createdAt: new Date().toISOString() });
            setStep("store");
          }}
        >
          Use "{productQuery}" as product name
        </Button>
      )}
    </div>
  );

  // ─── STEP: STORE ──────────────────────────────────────────────────────────

  if (step === "store") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setStep("product")}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="font-bold">Select Store</h1>
          <p className="text-xs text-muted-foreground">Step 3 of 4 — {selectedProduct?.name}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Store name, city..."
          value={storeQuery}
          onChange={(e) => setStoreQuery(e.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>

      <div className="space-y-1 max-h-72 overflow-y-auto">
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
        <p className="text-sm text-muted-foreground text-center py-4">Store not found. It will be added as new.</p>
      )}
    </div>
  );

  // ─── STEP: PRICE ──────────────────────────────────────────────────────────

  if (step === "price") return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setStep("store")}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="font-bold">Enter Price</h1>
          <p className="text-xs text-muted-foreground">Step 4 of 4</p>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg border bg-card p-3 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Product</span>
          <span className="font-medium truncate ml-4 max-w-[60%] text-right">{selectedProduct?.name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Store</span>
          <span className="font-medium">{selectedStore?.name}, {selectedStore?.city.name} {selectedStore?.city.country.flagEmoji}</span>
        </div>
        {cam.capturedUrl && (
          <img src={cam.capturedUrl} alt="" className="h-20 w-full rounded object-cover mt-2" />
        )}
      </div>

      {/* Price input */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Price</label>
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

      <Button
        className="w-full h-12 text-base"
        onClick={handlePublish}
        disabled={publishing || !price}
      >
        {publishing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Publish Price"}
      </Button>
    </div>
  );

  // ─── STEP: DONE ───────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 py-20 flex flex-col items-center gap-4 text-center">
      <CheckCircle className="h-16 w-16 text-emerald-400" />
      <h2 className="text-xl font-bold">Price Published!</h2>
      <p className="text-muted-foreground text-sm">
        Thank you for contributing. Your price is being reviewed.
      </p>
      <div className="flex gap-3 mt-4">
        <Button variant="outline" onClick={() => navigate("/")}>Go Home</Button>
        <Button onClick={() => { resetCam(); setStep("photo"); setSelectedProduct(null); setSelectedStore(null); setPrice(""); setAiResult(null); }}>
          Add Another
        </Button>
      </div>
    </div>
  );
}
