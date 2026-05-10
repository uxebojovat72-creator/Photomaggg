import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

export interface BarcodeState {
  scanning: boolean;
  result: string | null;
  error: string | null;
}

export function useBarcode(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<BarcodeState>({ scanning: false, result: null, error: null });
  const controlsRef = useRef<IScannerControls | null>(null);

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setState({ scanning: false, result: null, error: null });
  }, []);

  const start = useCallback(async () => {
    if (controlsRef.current) return;
    setState({ scanning: true, result: null, error: null });

    try {
      const reader = new BrowserMultiFormatReader();

      // Use facingMode — most reliable way to get back camera on mobile
      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current ?? undefined,
        (result, err) => {
          if (result) {
            controls.stop();
            controlsRef.current = null;
            setState({ scanning: false, result: result.getText(), error: null });
          } else if (err) {
            // NotFoundException fires every frame — ignore it
            const msg = err.message ?? "";
            if (!msg.includes("No MultiFormat") && !msg.includes("NotFoundException")) {
              console.warn("[Barcode]", msg);
            }
          }
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Barcode] start error:", msg);
      const friendly =
        msg.includes("Permission") || msg.includes("NotAllowed")
          ? "Разрешите доступ к камере"
          : msg.includes("NotFound") || msg.includes("DevicesNotFound")
            ? "Камера не найдена"
            : "Ошибка камеры";
      setState({ scanning: false, result: null, error: friendly });
    }
  }, [videoRef]);

  useEffect(() => () => { controlsRef.current?.stop(); }, []);

  return { state, start, stop };
}
