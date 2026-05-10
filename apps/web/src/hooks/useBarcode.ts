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
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (!devices.length) {
        setState({ scanning: false, result: null, error: "Камера не найдена" });
        return;
      }
      // Prefer back camera
      const device = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[devices.length - 1];

      const controls = await reader.decodeFromVideoDevice(
        device.deviceId,
        videoRef.current ?? undefined,
        (result, err) => {
          if (result) {
            controls.stop();
            controlsRef.current = null;
            setState({ scanning: false, result: result.getText(), error: null });
          } else if (err) {
            // NotFoundException is thrown continuously while scanning — ignore it
            if (!err.message?.includes("No MultiFormat")) {
              console.warn("[Barcode]", err.message);
            }
          }
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      console.error("[Barcode] start error:", err);
      setState({ scanning: false, result: null, error: "Ошибка доступа к камере" });
    }
  }, [videoRef]);

  useEffect(() => () => { controlsRef.current?.stop(); }, []);

  return { state, start, stop };
}
