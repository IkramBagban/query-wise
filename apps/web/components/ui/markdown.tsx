"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Themed markdown for assistant answers (bold, lists, GFM tables, code). */
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`min-w-0 text-sm leading-relaxed text-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent-strong underline underline-offset-2">{children}</a>
          ),
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="[&>p]:my-0">{children}</li>,
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
        {children}
      </ReactMarkdown>
    </div>
  );
}
