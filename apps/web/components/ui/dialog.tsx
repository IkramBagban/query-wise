"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  panelClassName?: string;
}

export function Dialog({ open, onOpenChange, children, panelClassName }: DialogProps) {
  const mounted = typeof window !== "undefined";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange, open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-label="Close"
      />
      <div
        className={cn(
          "relative w-full animate-slide-up rounded-xl border border-border bg-surface shadow-2xl",
          "max-w-[92vw] sm:max-w-2xl p-4 sm:p-6",
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
