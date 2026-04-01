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
      <div className="relative rounded-2xl border border-[#174128]/22 bg-[#f7fcf3] p-1.5 transition-all duration-300 focus-within:border-accent/45 focus-within:ring-2 focus-within:ring-accent/15">
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
            disabled={!databaseConnected || disabled || !value.trim()}
            className="h-9 rounded-xl bg-[#2ed52e] px-4 text-white transition-transform hover:brightness-105 active:scale-95"
          >
            <ArrowUp className="mr-1.5 h-3.5 w-3.5" />{" "}
            <span className="text-xs font-bold uppercase tracking-wider">Search</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
