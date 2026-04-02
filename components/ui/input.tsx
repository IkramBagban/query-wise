"use client";

import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  monospace?: boolean;
}

export function Input({ label, error, className, monospace = false, ...props }: InputProps) {
  return (
    <label className="flex w-full flex-col gap-1.5 text-xs text-text-2">
      {label ? <span>{label}</span> : null}
      <input
        className={cn(
          "h-10 cursor-text rounded-md border border-border bg-surface px-3 text-sm text-text-1 outline-none transition-all duration-150 placeholder:text-text-3 focus:border-accent focus:ring-2 focus:ring-accent/30",
          monospace && "font-mono text-xs",
          error && "border-danger focus:ring-danger/30",
          className,
        )}
        {...props}
      />
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}
