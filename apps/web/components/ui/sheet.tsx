"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange, open]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        className={`absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={() => onOpenChange(false)}
        aria-label="Close panel"
      />
      <aside
        className={`absolute right-0 top-0 h-full w-[92vw] max-w-[380px] overflow-hidden rounded-l-3xl border-l border-border bg-surface shadow-2xl transition-transform duration-200 sm:w-full sm:max-w-md sm:rounded-none ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-text-2 transition-colors hover:bg-black/5 hover:text-text-1"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="h-full overflow-y-auto p-5 pt-14 sm:p-6 sm:pt-16">
          {children}
        </div>
      </aside>
    </div>
  );
}
