import { useState, useRef, useCallback, useEffect } from "react";

export interface CameraState {
  stream: MediaStream | null;
  error: string | null;
  isActive: boolean;
  capturedFile: File | null;
  capturedUrl: string | null;
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingStreamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({
    stream: null,
    error: null,
    isActive: false,
    capturedFile: null,
    capturedUrl: null,
  });

  // Attach stream to video element after it mounts (isActive causes conditional render)
  useEffect(() => {
    if (state.isActive && videoRef.current && pendingStreamRef.current) {
      videoRef.current.srcObject = pendingStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [state.isActive]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      pendingStreamRef.current = stream;
      setState((s) => ({ ...s, stream, isActive: true, error: null }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Camera access denied";
      setState((s) => ({ ...s, error: msg, isActive: false }));
    }
  }, []);

  const stopCamera = useCallback(() => {
    state.stream?.getTracks().forEach((t) => t.stop());
    pendingStreamRef.current = null;
    setState((s) => ({ ...s, stream: null, isActive: false }));
  }, [state.stream]);

  const capture = useCallback((): File | null => {
    const video = videoRef.current;
    if (!video) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    const arr = dataUrl.split(",");
    const bstr = atob(arr[1]);
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    const file = new File([u8], "capture.jpg", { type: "image/jpeg" });

    setState((s) => ({ ...s, capturedFile: file, capturedUrl: dataUrl }));
    stopCamera();
    return file;
  }, [stopCamera]);

  const reset = useCallback(() => {
    stopCamera();
    setState({ stream: null, error: null, isActive: false, capturedFile: null, capturedUrl: null });
  }, [stopCamera]);

  const fromFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setState((s) => ({ ...s, capturedFile: file, capturedUrl: url, isActive: false }));
  }, []);

  return { videoRef, state, startCamera, stopCamera, capture, reset, fromFile };
}
