"use client";

import { useMemo, useState } from "react";
import { Check, Clipboard, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "JOIN", "ON", "GROUP", "BY", "ORDER", "LIMIT", "HAVING", "WITH", "AS", "INNER", "LEFT", "RIGHT", "COUNT", "SUM", "AVG", "MIN", "MAX", "DISTINCT",
];

interface CodeBlockProps {
  sql: string;
}

export function CodeBlock({ sql }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const highlighted = useMemo(() => {
    return sql.split(/(\s+)/).map((part, index) => {
      const upper = part.toUpperCase();
      const keyword = SQL_KEYWORDS.includes(upper);
      return (
        <span key={`${part}-${index}`} className={keyword ? "font-semibold text-accent-strong" : "text-code-text"}>
          {part}
        </span>
      );
    });
  }, [sql]);

  const lines = sql.split("\n");
  const showCollapse = lines.length > 3;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="rounded-md border border-border bg-code-bg p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-faint">SQL query</span>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="w-[72px] justify-center px-0">
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="check"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 text-success"
              >
                <Check className="h-3.5 w-3.5" /> Copied
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5"
              >
                <Clipboard className="h-3.5 w-3.5" /> Copy
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </div>
      <pre className={cn("overflow-x-auto font-mono text-xs leading-6", !expanded && showCollapse && "max-h-[4.8rem] overflow-hidden")}>
        <code>{highlighted}</code>
      </pre>
      {showCollapse ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}
