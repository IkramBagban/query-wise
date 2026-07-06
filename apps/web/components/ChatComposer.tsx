"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const SUGGESTIONS = [
  "Top 10 products by revenue this month",
  "How is weekly revenue trending?",
  "Which customers ordered the most?",
];

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
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const canSubmit = Boolean(question.trim()) && !disabled && !submitting;
  const hero = size === "hero";

  useEffect(() => {
    if (isFocused || question) return;
    const interval = setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % SUGGESTIONS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isFocused, question]);

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
    <div className="rounded-2xl border border-border bg-surface shadow-[0_6px_30px_rgba(22,66,40,0.08)] transition-all duration-200 focus-within:-translate-y-[1px] focus-within:border-accent-2/50 focus-within:shadow-[0_10px_40px_rgba(46,213,46,0.12)] focus-within:ring-2 focus-within:ring-accent/20">
      <div className="relative w-full">
        {!question && (
          <div className={`pointer-events-none absolute inset-x-4 truncate text-faint ${hero ? "top-4 sm:inset-x-5 text-base" : "top-3 text-sm"}`}>
             <AnimatePresence mode="popLayout" initial={false}>
               <motion.span
                 key={isFocused ? "focused" : placeholderIndex}
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 transition={{ duration: 0.24 }}
                 className="absolute left-0 top-0"
               >
                 {isFocused ? placeholder : SUGGESTIONS[placeholderIndex]}
               </motion.span>
             </AnimatePresence>
          </div>
        )}
        <textarea
          style={{ transition: "height 140ms cubic-bezier(0.2, 0, 0, 1)" }}
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
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder=""
        className={`w-full resize-none rounded-t-2xl bg-transparent px-4 pb-1 outline-none disabled:cursor-not-allowed ${
          hero ? "min-h-16 pt-4 text-base leading-relaxed sm:px-5" : "min-h-11 pt-3 text-sm leading-relaxed"
        }`}
      />
      </div>
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
            disabled={!canSubmit || submitting}
            onClick={onSubmit}
            aria-label="Run query"
            className={`${hero ? "size-10 rounded-xl p-0" : "size-9 rounded-lg p-0"} active:scale-[0.92] transition-transform duration-75`}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {!submitting ? (
                <motion.div
                  key="send"
                  exit={{ opacity: 0, x: 4, y: -4 }}
                  transition={{ duration: 0.16 }}
                >
                  <Send className="size-4" />
                </motion.div>
              ) : (
                <motion.div
                  key="spinner"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <Spinner size="sm" />
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
        </div>
      </div>
    </div>
  );
}
