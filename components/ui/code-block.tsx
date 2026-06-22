"use client";

import { useMemo, useState } from "react";
import { Check, Clipboard, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "JOIN", "ON", "GROUP", "BY", "ORDER", "LIMIT", "HAVING", "WITH", "AS", "INNER", "LEFT", "RIGHT", "COUNT", "SUM", "AVG", "MIN", "MAX", "DISTINCT",
];

interface CodeBlockProps {
  sql: string;
  variant?: "default" | "dark";
}

export function CodeBlock({ sql, variant = "default" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const highlighted = useMemo(() => {
    return sql.split(/(\s+)/).map((part, index) => {
      const upper = part.toUpperCase();
      const keyword = SQL_KEYWORDS.includes(upper);
      return (
        <span key={`${part}-${index}`} className={keyword ? "text-accent" : variant === "dark" ? "text-white/85" : "text-text-2"}>
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
    <div className={cn("rounded-md border p-3", variant === "dark" ? "border-white/10 bg-black/20" : "border-border bg-surface-2")}>
      <div className="mb-2 flex items-center justify-between">
        <span className={cn("text-[11px] uppercase tracking-wide", variant === "dark" ? "text-white/55" : "text-text-3")}>SQL query</span>
        <Button variant="ghost" size="sm" className={variant === "dark" ? "border-white/15 text-white hover:bg-white/10 hover:text-white" : ""} onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className={cn("overflow-x-auto font-mono text-xs leading-6", !expanded && showCollapse && "max-h-[4.8rem] overflow-hidden")}>
        <code>{highlighted}</code>
      </pre>
      {showCollapse ? (
        <Button variant="ghost" size="sm" className={cn("mt-2", variant === "dark" && "border-white/15 text-white hover:bg-white/10 hover:text-white")} onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}
