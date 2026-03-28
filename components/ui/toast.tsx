"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { getToastEventName, type ToastMessage, type ToastVariant } from "@/hooks/useToast";

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

interface PushToast {
  title: string;
  description?: string;
  variant: ToastVariant;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  const push = useMemo(
    () => (toast: PushToast) => {
      const id = randomId();
      setToasts((prev) => [...prev, { ...toast, id }]);
      window.setTimeout(() => dismiss(id), 4000);
    },
    [],
  );

  useEffect(() => {
    const eventName = getToastEventName();
    const handler = (event: Event) => {
      const custom = event as CustomEvent<PushToast>;
      push(custom.detail);
    };
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [push]);

  return (
    <>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[320px] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto animate-slide-up rounded-md border border-border bg-surface-2 p-3 shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-1">{toast.title}</p>
                {toast.description ? (
                  <p className="text-xs text-text-2">{toast.description}</p>
                ) : null}
              </div>
              <button onClick={() => dismiss(toast.id)} aria-label="Dismiss toast">
                <X className="h-3.5 w-3.5 text-text-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
