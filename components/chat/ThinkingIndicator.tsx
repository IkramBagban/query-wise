"use client";

import { useMemo } from "react";

interface ThinkingIndicatorProps {
  stage?: string | null;
  content?: string;
}

export function ThinkingIndicator({ stage, content }: ThinkingIndicatorProps) {
  const stageLabel = stage?.trim() || "Working";
  const text = content ?? "";

  const dots = useMemo(() => Array.from({ length: 3 }), []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-text-2">
        <div className="flex gap-1">
          {dots.map((_, index) => (
            <span
              key={index}
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
              style={{ animationDelay: `${index * 120}ms` }}
            />
          ))}
        </div>
        <span>{stageLabel}...</span>
      </div>
      {text.trim() ? (
        <p className="text-sm leading-relaxed text-text-1 whitespace-pre-wrap">{text}</p>
      ) : null}
    </div>
  );
}
