"use client";

import { useState } from "react";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [open, setOpen] = useState(false);

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
          className={`pointer-events-none absolute left-1/2 z-[100] -translate-x-1/2 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text-2 shadow-lg ${
            side === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
          }`}
        >
          {content}
          <span
            className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-border bg-surface-2 ${
              side === "bottom"
                ? "-top-1 border-l border-t"
                : "-bottom-1 border-r border-b"
            }`}
          />
        </span>
      ) : null}
    </span>
  );
}
