"use client";

import { ArrowUp, BarChart3, Paperclip } from "lucide-react";
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
    <div className="flex flex-col gap-3">
      {!databaseConnected ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#174128]/20 bg-[#edf8e9] px-3 py-2 text-xs text-[#1f5a35]">
          <p>Database not connected. Click to connect and start chatting.</p>
          <button
            type="button"
            onClick={onRequestConnectDatabase}
            className="rounded-lg border border-[#174128]/25 bg-white px-2.5 py-1 font-semibold text-[#1f5a35] cursor-pointer"
          >
            Connect DB
          </button>
        </div>
      ) : null}
      <div className="relative rounded-2xl border border-[#d9e3dd] bg-white p-2 shadow-[0_10px_30px_rgba(25,58,40,0.09)] transition-all duration-300 focus-within:border-[#86c5a4] focus-within:ring-2 focus-within:ring-[#159558]/10">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={!databaseConnected || disabled}
          placeholder={
            databaseConnected
              ? "Ask your database anything..."
              : "Connect database to start querying..."
          }
          className="max-h-32 min-h-[52px] w-full resize-none bg-transparent px-3 py-2.5 text-sm text-[#17291f] outline-none placeholder:text-[#819188] sm:min-h-[58px] sm:px-4 sm:py-3"
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
              value={model}
              onChange={onModelChange}
              options={modelOptions}
              className={cn(
                "min-w-0 sm:w-auto sm:min-w-[260px]",
                "[&>button]:h-9 [&>button]:rounded-lg [&>button]:border-[#dce5df] [&>button]:bg-white [&>button]:text-xs [&>button]:font-medium",
              )}
              menuSide="top"
              menuAlign="mobile-right-desktop-left"
              menuMinWidthClassName="min-w-[220px] max-w-[min(90vw,320px)] sm:min-w-[280px] sm:max-w-[360px]"
            />
            <button
              type="button"
              className="hidden h-9 items-center gap-2 rounded-lg border border-[#dce5df] px-3 text-xs font-medium text-[#405249] sm:flex"
            >
              <BarChart3 className="size-4" />
              Chart
            </button>
            <button
              type="button"
              className="hidden h-9 items-center gap-2 rounded-lg border border-[#dce5df] px-3 text-xs font-medium text-[#405249] sm:flex"
            >
              <Paperclip className="size-4" />
              Add context
            </button>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void send()}
            disabled={!databaseConnected || disabled || !value.trim()}
            className="ml-auto h-10 w-10 shrink-0 rounded-lg bg-[#078943] px-0 text-white transition-transform hover:bg-[#06783b] active:scale-95 sm:w-auto sm:px-5"
            aria-label="Search"
          >
            <ArrowUp className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden text-xs font-semibold sm:inline">Run</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
