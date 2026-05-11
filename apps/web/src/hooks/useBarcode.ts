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
  const startingRef = useRef(false);

  const stop = useCallback(() => {
    startingRef.current = false;
    controlsRef.current?.stop();
    controlsRef.current = null;
    setState((prev) => ({ scanning: false, result: prev.result, error: null }));
  }, []);

  const start = useCallback(async () => {
    if (controlsRef.current || startingRef.current) return;
    startingRef.current = true;
    setState({ scanning: true, result: null, error: null });

    try {
      const reader = new BrowserMultiFormatReader();

      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
        },
        videoRef.current ?? undefined,
        (result, err) => {
          if (result) {
            // Use ref — never close over `controls` directly to avoid race with await
            controlsRef.current?.stop();
            controlsRef.current = null;
            startingRef.current = false;
            setState({ scanning: false, result: result.getText(), error: null });
          } else if (err) {
            const msg = err?.message ?? "";
            if (
              !msg.includes("NotFoundException") &&
              !msg.includes("No MultiFormat") &&
              !msg.includes("undefined")
            ) {
              console.warn("[Barcode]", msg);
            }
          }
        }
      );

      // If stop() was called while we were awaiting, clean up immediately
      if (!startingRef.current) {
        controls.stop();
        return;
      }

      controlsRef.current = controls;
      startingRef.current = false;
    } catch (err) {
      startingRef.current = false;
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
