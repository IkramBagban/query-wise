"use client";

import { useEffect, useMemo, useState } from "react";

const STAGES = ["Analyzing schema...", "Generating SQL...", "Executing..."];

export function ThinkingIndicator() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep((prev) => (prev + 1) % STAGES.length);
    }, 1200);
    return () => window.clearInterval(timer);
  }, []);

  const dots = useMemo(() => Array.from({ length: 3 }), []);

  return (
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
      <span>{STAGES[step]}</span>
    </div>
  );
}
