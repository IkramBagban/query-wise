"use client";

import { useRef } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ComposerBoxProps {
  question: string;
  setQuestion: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  size?: "hero" | "docked";
}

/**
 * Shared chat input: auto-growing textarea with an inline send button,
 * Enter to run, Shift+Enter for a new line. Used by the empty-workspace
 * hero and the docked conversation composer.
 */
export function ComposerBox({
  question,
  setQuestion,
  onSubmit,
  submitting,
  disabled,
  placeholder = "Ask anything about your data...",
  autoFocus,
  size = "docked",
}: ComposerBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = Boolean(question.trim()) && !disabled && !submitting;
  const hero = size === "hero";

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, hero ? 220 : 180)}px`;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-[0_6px_30px_rgba(22,66,40,0.08)] transition-all duration-200 focus-within:border-accent-2/50 focus-within:shadow-[0_8px_36px_rgba(46,213,46,0.12)] focus-within:ring-2 focus-within:ring-accent/20">
      <textarea
        ref={textareaRef}
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value);
          autoGrow();
        }}
        onKeyDown={onKeyDown}
        disabled={disabled}
        maxLength={500}
        rows={hero ? 2 : 1}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={`w-full resize-none rounded-t-2xl bg-transparent px-4 pb-1 outline-none placeholder:text-faint disabled:cursor-not-allowed ${
          hero ? "min-h-16 pt-4 text-base leading-relaxed sm:px-5" : "min-h-11 pt-3 text-sm leading-relaxed"
        }`}
      />
      <div className={`flex items-center justify-between gap-3 px-3 ${hero ? "pb-2.5 sm:pl-5" : "pb-2 pl-4"}`}>
        <p className="hidden text-[11px] text-faint sm:block">
          <kbd className="rounded border border-border bg-surface-2 px-1 py-0.5 font-sans text-[10px]">Enter</kbd> to run ·{" "}
          <kbd className="rounded border border-border bg-surface-2 px-1 py-0.5 font-sans text-[10px]">Shift+Enter</kbd> for new line
        </p>
        <div className="ml-auto flex items-center gap-3">
          {question.length >= 400 ? (
            <span className="text-[11px] tabular-nums text-faint">{question.length}/500</span>
          ) : null}
          <Button
            type="button"
            loading={submitting}
            disabled={!canSubmit}
            onClick={onSubmit}
            aria-label="Run query"
            className={hero ? "size-10 rounded-xl p-0" : "size-9 rounded-lg p-0"}
          >
            {!submitting ? <Send className="size-4" /> : null}
          </Button>
        </div>
      </div>
    </div>
  );
}
