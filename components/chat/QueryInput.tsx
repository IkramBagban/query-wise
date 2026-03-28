"use client";

import { ArrowUp } from "lucide-react";
import { useMemo } from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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
    <div className="space-y-4">
      <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 focus-within:border-accent/40 focus-within:ring-4 focus-within:ring-accent/10 transition-all duration-300">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder="Ask a question about your database..."
          className="max-h-32 min-h-[44px] w-full resize-none bg-transparent px-4 py-3 text-sm text-text-1 outline-none placeholder:text-text-3"
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
        <div className="flex items-center justify-between px-2 pb-1.5">
           <div className="flex items-center gap-1.5 px-2">
              <span className="h-1.5 w-1.5 rounded-full bg-success/60" />
              <span className="text-[10px] font-medium text-text-3 uppercase tracking-wider">AI Assistant Active</span>
           </div>
           <Button 
            variant="primary" 
            size="sm" 
            onClick={() => void send()} 
            disabled={disabled || !value.trim()}
            className="rounded-xl h-9 px-4 shadow-lg shadow-accent/20 transition-transform active:scale-95"
           >
            <ArrowUp className="mr-1.5 h-3.5 w-3.5" /> <span className="text-xs font-bold uppercase tracking-wider">Search</span>
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 px-1">
        {chips.map((chip) => (
          <button
            key={chip}
            className={cn(
              "group relative max-w-full truncate rounded-full border border-white/5 bg-white/5 px-3 py-1.5 text-[10px] font-medium text-text-2 backdrop-blur-md transition-all",
              "hover:border-accent/30 hover:bg-accent/5 hover:text-accent focus:ring-2 focus:ring-accent/20",
            )}
            onClick={() => setValue(chip)}
            title={chip}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>

  );
}
