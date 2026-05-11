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
      // Prefer back/rear camera
      const device = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[devices.length - 1];

      // Request high-res stream for better barcode readability
      if (videoRef.current && videoRef.current.srcObject === null) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: device.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          });
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        } catch {
          // Fallback to default — zxing will open its own stream
        }
      }

      const controls = await reader.decodeFromVideoDevice(
        device.deviceId,
        videoRef.current ?? undefined,
        (result, err) => {
          if (result) {
            controls.stop();
            controlsRef.current = null;
            setState({ scanning: false, result: result.getText(), error: null });
          } else if (err) {
            const msg = err.message ?? "";
            if (!msg.includes("No MultiFormat") && !msg.includes("NotFoundException")) {
              console.warn("[Barcode]", msg);
            }
          }
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      console.error("[Barcode] start error:", err);
      setState({ scanning: false, result: null, error: "Ошибка доступа к камере. Разрешите доступ и нажмите «Повторить»" });
    }
  }, [videoRef]);

  useEffect(() => () => { controlsRef.current?.stop(); }, []);

  return { state, start, stop };
}
