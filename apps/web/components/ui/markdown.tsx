"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "motion/react";

function StreamText({ children }: { children: React.ReactNode }) {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      const words = child.split(/(\s+)/);
      return words.map((word, i) => {
        if (!word) return null;
        if (!word.trim()) return word;
        if (word === "█") {
          return (
            <motion.span
              key={i}
              animate={{ opacity: [1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="inline-block text-accent"
            >
              ▋
            </motion.span>
          );
        }
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="inline-block"
          >
            {word}
          </motion.span>
        );
      });
    }
    return child;
  });
}

/** Themed markdown for assistant answers (bold, lists, GFM tables, code). */
export function Markdown({ children, className = "", streaming = false }: { children: string; className?: string; streaming?: boolean }) {
  const TextWrapper = streaming ? StreamText : React.Fragment;
  const content = streaming ? children + (children.endsWith(" ") ? "█" : " █") : children;
  return (
    <div className={`min-w-0 text-sm leading-relaxed text-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0"><TextWrapper>{children}</TextWrapper></p>,
          strong: ({ children }) => {
            let text = "";
            React.Children.forEach(children, (c) => { if (typeof c === "string") text += c; });
            const isNumber = /^[0-9.,$%+-]+$/.test(text.trim()) && text.trim().length > 0;
            if (isNumber) {
              return (
                <strong 
                  className="font-bold bg-clip-text text-transparent"
                  style={{ backgroundImage: "linear-gradient(90deg, var(--accent), var(--accent-strong), var(--accent))", backgroundSize: "200% auto" }}
                >
                  <TextWrapper>{children}</TextWrapper>
                </strong>
              );
            }
            return <strong className="font-semibold text-text"><TextWrapper>{children}</TextWrapper></strong>;
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent-strong underline underline-offset-2"><TextWrapper>{children}</TextWrapper></a>
          ),
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="[&>p]:my-0"><TextWrapper>{children}</TextWrapper></li>,
          h1: ({ children }) => <h3 className="mb-1.5 mt-3 text-base font-semibold first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-1.5 mt-3 text-base font-semibold first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold first:mt-0">{children}</h4>,
          code: ({ children, className }) =>
            className?.includes("language-") ? (
              <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 text-xs">
                <code>{children}</code>
              </pre>
            ) : (
              <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
            ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface-2 text-left">{children}</thead>,
          th: ({ children }) => <th className="border-b border-border px-3 py-2 font-semibold text-muted">{children}</th>,
          td: ({ children }) => <td className="border-b border-border px-3 py-1.5 tabular-nums last:border-b-0">{children}</td>,
          hr: () => <hr className="my-3 border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-accent-2/40 pl-3 text-muted">{children}</blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
