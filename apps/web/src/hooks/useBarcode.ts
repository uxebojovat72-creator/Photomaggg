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
  const streamRef = useRef<MediaStream | null>(null);
  // Prevent concurrent start() calls while async init is running
  const startingRef = useRef(false);

  const stop = useCallback(() => {
    startingRef.current = false;
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    // Keep result intact — the barcode API effect still needs to read it
    setState((prev) => ({ scanning: false, result: prev.result, error: null }));
  }, [videoRef]);

  const start = useCallback(async () => {
    if (controlsRef.current || streamRef.current || startingRef.current) return;
    startingRef.current = true;
    setState({ scanning: true, result: null, error: null });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        },
      });

      if (!startingRef.current) {
        // stop() was called while we were awaiting
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Try to enable continuous autofocus (not standard, swallow errors)
      stream.getVideoTracks().forEach((track) => {
        track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] } as MediaTrackConstraints).catch(() => {});
      });

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        startingRef.current = false;
        return;
      }

      video.srcObject = stream;
      await video.play().catch(() => {});

      if (!startingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (video) video.srcObject = null;
        return;
      }

      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoElement(video, (result, err) => {
        if (result) {
          // Stop stream + ZXing before setting result
          controls?.stop();
          controlsRef.current = null;
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          startingRef.current = false;
          setState({ scanning: false, result: result.getText(), error: null });
        } else if (err) {
          const msg = err?.message ?? "";
          if (!msg.includes("NotFoundException") && !msg.includes("No MultiFormat") && !msg.includes("undefined")) {
            console.warn("[Barcode]", msg);
          }
        }
      });

      if (!startingRef.current) {
        controls.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }

      controlsRef.current = controls;
      startingRef.current = false;
    } catch (err) {
      startingRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
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

  useEffect(() => () => {
    controlsRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { state, start, stop };
}
