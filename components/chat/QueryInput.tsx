"use client";

import { ArrowUp } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { LlmProvider } from "@/lib/llm-config";
import { cn } from "@/lib/utils";

interface QueryInputProps {
  disabled?: boolean;
  databaseConnected?: boolean;
  onRequestConnectDatabase?: () => void;
  provider: LlmProvider;
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const autosize = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  };

  const send = async () => {
    const question = value.trim();
    if (!question || !databaseConnected || disabled) return;
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "44px";
    await onSubmit(question);
  };

  return (
    <div className="space-y-3">
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
      <div className="relative rounded-2xl border border-[#174128]/22 bg-[#f7fcf3] p-1.5 transition-all duration-300 focus-within:border-accent/45 focus-within:ring-2 focus-within:ring-accent/15 sm:p-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={!databaseConnected || disabled}
          placeholder={
            databaseConnected
              ? "Ask a question about your database..."
              : "Connect database to start querying..."
          }
          className="max-h-32 min-h-[42px] w-full resize-none bg-transparent px-3 py-2.5 text-[13px] text-text-1 outline-none placeholder:text-text-3 sm:min-h-[46px] sm:px-4 sm:py-3 sm:text-sm"
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
        <div className="flex items-center gap-2 px-1.5 pb-1 pt-0 sm:px-2 sm:pb-1.5 sm:pt-0.5">
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] gap-2 sm:flex sm:flex-none sm:items-center">
            <Select
              value={provider}
              onChange={onProviderChange}
              options={providerOptions}
              className={cn(
                "min-w-0 sm:w-auto sm:min-w-[150px]",
                "[&>button]:h-8 [&>button]:rounded-lg [&>button]:border-[#174128]/24 [&>button]:bg-[#f2f9ed] [&>button]:text-xs [&>button]:font-medium sm:[&>button]:h-9 sm:[&>button]:rounded-xl sm:[&>button]:text-[13px]",
              )}
              menuSide="top"
              menuMinWidthClassName="min-w-[160px] sm:min-w-[190px]"
            />
            <Select
              value={model}
              onChange={onModelChange}
              options={modelOptions}
              className={cn(
                "min-w-0 sm:w-auto sm:min-w-[260px]",
                "[&>button]:h-8 [&>button]:rounded-lg [&>button]:border-[#174128]/24 [&>button]:bg-[#f2f9ed] [&>button]:text-xs [&>button]:font-medium sm:[&>button]:h-9 sm:[&>button]:rounded-xl sm:[&>button]:text-[13px]",
              )}
              menuSide="top"
              menuAlign="mobile-right-desktop-left"
              menuMinWidthClassName="min-w-[220px] max-w-[min(90vw,320px)] sm:min-w-[280px] sm:max-w-[360px]"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void send()}
            disabled={!databaseConnected || disabled || !value.trim()}
            className="ml-auto h-9 w-9 shrink-0 rounded-xl bg-[#2ed52e] px-0 text-white transition-transform hover:brightness-105 active:scale-95 sm:h-9 sm:w-auto sm:px-4"
            aria-label="Search"
          >
            <ArrowUp className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden text-xs font-bold uppercase tracking-wider sm:inline">Search</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
