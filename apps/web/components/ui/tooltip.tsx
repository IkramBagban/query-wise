"use client";

import { useState } from "react";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "right";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [open, setOpen] = useState(false);

  const positionClasses =
    side === "bottom"
      ? "top-full left-1/2 -translate-x-1/2 mt-2"
      : side === "right"
        ? "left-full top-1/2 -translate-y-1/2 ml-2"
        : "bottom-full left-1/2 -translate-x-1/2 mb-2";

  const arrowClasses =
    side === "bottom"
      ? "-top-1 left-1/2 -translate-x-1/2 border-l border-t"
      : side === "right"
        ? "-left-1 top-1/2 -translate-y-1/2 border-l border-b"
        : "-bottom-1 left-1/2 -translate-x-1/2 border-r border-b";

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open ? (
        <span
          className={`pointer-events-none absolute z-[100] whitespace-nowrap rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text-2 shadow-lg ${positionClasses}`}
        >
          {content}
          <span
            className={`absolute h-2 w-2 rotate-45 border-border bg-surface-2 ${arrowClasses}`}
          />
        </span>
      ) : null}
    </span>
  );
}
