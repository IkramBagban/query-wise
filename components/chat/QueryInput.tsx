"use client";

import { ArrowUp, Lightbulb, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const EXAMPLE_QUERIES = [
  "What were the top 5 products by revenue last month?",
  "Show me daily order count for the past 30 days",
  "Which customers placed more than 5 orders but never left a review?",
  "Compare revenue by category this quarter vs last quarter",
  "What is the average order value by customer segment?",
  "Show me orders by status breakdown",
  "Who are the top 10 customers by total spend?",
  "What's the revenue trend over the last 12 months?",
];

interface QueryInputProps {
  disabled?: boolean;
  onSubmit: (question: string) => Promise<void>;
}

export function QueryInput({ disabled = false, onSubmit }: QueryInputProps) {
  const [value, setValue] = useState("");
  const [offset, setOffset] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setOffset((prev) => (prev + 1) % EXAMPLE_QUERIES.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  const chips = useMemo(() => {
    return [0, 1, 2].map((index) => EXAMPLE_QUERIES[(offset + index) % EXAMPLE_QUERIES.length]);
  }, [offset]);

  const autosize = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  };

  const send = async () => {
    const question = value.trim();
    if (!question || disabled) return;
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "44px";
    await onSubmit(question);
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl border border-[#174128]/20 bg-white p-1.5 shadow-[0_14px_32px_rgba(14,41,24,0.1)] transition-all duration-300 focus-within:border-accent/40 focus-within:ring-4 focus-within:ring-accent/10">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder="Ask a question about your database..."
          className="max-h-32 min-h-[46px] w-full resize-none bg-transparent px-4 py-3 text-sm text-text-1 outline-none placeholder:text-text-3"
          onChange={(event) => {
            setValue(event.target.value);
            autosize();
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" && !event.shiftKey) || (event.key === "Enter" && event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5">
          <div className="flex items-center gap-1.5 px-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-black">AI Analyst Online</span>
          </div>
          <Tooltip content="Send question (Enter)">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void send()}
              disabled={disabled || !value.trim()}
              className="h-9 rounded-xl bg-[#2ed52e] px-4 text-white shadow-lg shadow-[#2ed52e]/30 transition-transform hover:brightness-105 active:scale-95"
            >
              <ArrowUp className="mr-1.5 h-3.5 w-3.5" /> <span className="text-xs font-bold uppercase tracking-wider">Search</span>
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="inline-flex items-center gap-1 rounded-full border border-[#174128]/20 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#335242]">
          <Lightbulb className="h-3 w-3" />
          Examples
        </span>
        {chips.map((chip) => (
          <Tooltip key={chip} content="Click to fill input">
            <button
              className={cn(
                "group relative max-w-full truncate rounded-full border border-[#174128]/14 bg-white px-3 py-1.5 text-[10px] font-medium text-text-2 backdrop-blur-md transition-all",
                "hover:border-accent/30 hover:bg-[#edf9e8] hover:text-accent focus:ring-2 focus:ring-accent/20",
              )}
              onClick={() => setValue(chip)}
              title={chip}
            >
              {chip}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
