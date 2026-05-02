import { useState, useCallback } from "react";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

let globalToasts: Toast[] = [];
let listeners: Array<(toasts: Toast[]) => void> = [];

function notify(toasts: Toast[]) {
  globalToasts = toasts;
  listeners.forEach((l) => l(toasts));
}

export function toast(opts: Omit<Toast, "id">) {
  const id = crypto.randomUUID();
  notify([...globalToasts, { ...opts, id }]);
  setTimeout(() => {
    notify(globalToasts.filter((t) => t.id !== id));
  }, 4000);
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>(globalToasts);

  const subscribe = useCallback(() => {
    listeners.push(setToasts);
    return () => {
      listeners = listeners.filter((l) => l !== setToasts);
    };
  }, []);

  return { toasts, subscribe };
}
