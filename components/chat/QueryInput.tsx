"use client";

import { ArrowUp } from "lucide-react";
import { useMemo } from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
  databaseConnected?: boolean;
  onRequestConnectDatabase?: () => void;
  provider: string;
  model: string;
  providerOptions: { label: string; value: string }[];
  modelOptions: { label: string; value: string }[];
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSubmit: (question: string) => Promise<void>;
}

export function QueryInput({
  disabled = false,
  databaseConnected = true,
  onRequestConnectDatabase,
  provider,
  model,
  providerOptions,
  modelOptions,
  onProviderChange,
  onModelChange,
  onSubmit,
}: QueryInputProps) {
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
    if (!question || !databaseConnected) return;
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "44px";
    await onSubmit(question);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        {chips.map((chip) => (
            <button
            key={chip}
              type="button"
              disabled={!databaseConnected}
              className={cn(
                "group relative max-w-full truncate rounded-full border border-[#174128]/16 bg-[#f5fbf1] px-3 py-1.5 text-[10px] font-medium text-text-2 transition-all",
                "hover:border-accent/35 hover:bg-[#ebf8e4] hover:text-accent focus:ring-2 focus:ring-accent/20",
                !databaseConnected && "cursor-not-allowed opacity-55",
              )}
              onClick={() => setValue(chip)}
              title={chip}
            >
              {chip}
            </button>
        ))}
      </div>
      {!databaseConnected ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#174128]/20 bg-[#edf8e9] px-3 py-2 text-xs text-[#1f5a35]">
          <p>Database not connected. Click to connect and start chatting.</p>
          <button
            type="button"
            onClick={onRequestConnectDatabase}
            className="rounded-lg border border-[#174128]/25 bg-white px-2.5 py-1 font-semibold text-[#1f5a35]"
          >
            Connect DB
          </button>
        </div>
      ) : null}
      <div className="relative rounded-2xl border border-[#174128]/22 bg-[#f7fcf3] p-1.5 transition-all duration-300 focus-within:border-accent/45 focus-within:ring-2 focus-within:ring-accent/15">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={!databaseConnected}
          placeholder={databaseConnected ? "Ask a question about your database..." : "Connect database to start querying..."}
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
          <div className="flex items-center gap-2">
            <Select
              value={provider}
              onChange={onProviderChange}
              options={providerOptions}
              className={cn(
                "min-w-32",
                "[&>button]:h-9 [&>button]:rounded-xl [&>button]:border-[#174128]/24 [&>button]:bg-[#f2f9ed] [&>button]:text-[13px] [&>button]:font-medium",
              )}
              menuSide="top"
            />
            <Select
              value={model}
              onChange={onModelChange}
              options={modelOptions}
              className={cn(
                "min-w-40 sm:min-w-52",
                "[&>button]:h-9 [&>button]:rounded-xl [&>button]:border-[#174128]/24 [&>button]:bg-[#f2f9ed] [&>button]:text-[13px] [&>button]:font-medium",
              )}
              menuSide="top"
            />
          </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void send()}
              disabled={!databaseConnected || !value.trim()}
              className="h-9 rounded-xl bg-[#2ed52e] px-4 text-white transition-transform hover:brightness-105 active:scale-95"
            >
              <ArrowUp className="mr-1.5 h-3.5 w-3.5" /> <span className="text-xs font-bold uppercase tracking-wider">Search</span>
            </Button>
        </div>
      </div>
    </div>
  );
}
