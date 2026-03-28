"use client";

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
}

export function Select({ value, onChange, options, className }: SelectProps) {
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);

  return (
    <label className={`relative inline-flex h-9 min-w-40 items-center rounded-md border border-border bg-surface px-3 text-xs text-text-1 ${className ?? ""}`}>
      <select
        className="absolute inset-0 cursor-pointer opacity-0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="truncate pr-5">{selected?.label ?? "Select"}</span>
      <ChevronDown className="absolute right-2 h-3.5 w-3.5 text-text-3" />
    </label>
  );
}
