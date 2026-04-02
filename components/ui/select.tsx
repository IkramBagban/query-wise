"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  menuSide?: "top" | "bottom";
  menuAlign?: "left" | "right" | "mobile-right-desktop-left";
  menuMinWidthClassName?: string;
}

export function Select({
  value,
  onChange,
  options,
  className,
  menuSide = "bottom",
  menuAlign = "left",
  menuMinWidthClassName,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className={cn("relative inline-flex min-w-0 sm:min-w-40", className)}>
      <button
        type="button"
        className={cn(
          "h-9 w-full cursor-pointer rounded-md border border-border bg-surface px-3 text-left text-xs text-text-1",
          "inline-flex items-center justify-between gap-2 transition-colors",
          open ? "border-border-2" : "hover:border-border-2",
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate">{selected?.label ?? "Select"}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-text-3 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          className={cn(
            "absolute z-50 w-full overflow-hidden rounded-md border border-border-2 bg-surface-2 p-1 shadow-2xl",
            menuAlign === "left" ? "left-0" : "",
            menuAlign === "right" ? "right-0" : "",
            menuAlign === "mobile-right-desktop-left" ? "right-0 sm:left-0 sm:right-auto" : "",
            menuSide === "top" ? "bottom-10" : "top-10",
            menuMinWidthClassName,
          )}
        >
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full cursor-pointer items-start justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                  isActive ? "bg-accent/20 text-text-1" : "text-text-2 hover:bg-surface-3 hover:text-text-1",
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 whitespace-normal break-words">{option.label}</span>
                {isActive ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
