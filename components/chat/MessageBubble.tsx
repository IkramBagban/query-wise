"use client";

import type { ReactNode } from "react";
import { Bot, CircleUserRound, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MessageResultCard } from "@/components/chat/MessageResultCard";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { Tooltip } from "@/components/ui/tooltip";
import type { ChartType, ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  pending?: boolean;
  pendingStage?: string | null;
  pendingContent?: string;
  onChartTypeChange: (messageId: string, type: ChartType) => void;
  onSaveWidget: (message: ChatMessage) => Promise<void>;
}

function RichText({
  content,
  className,
}: {
  content: string;
  className: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          h1: ({ children }) => <h1 className="mb-2 text-lg font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 text-base font-bold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 text-sm font-semibold">{children}</h3>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children as ReactNode}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children as ReactNode}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-[#174128]/16">
              <table className="min-w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[#ecf7e7]">{children}</thead>,
          tbody: ({ children }) => <tbody className="bg-white">{children}</tbody>,
          tr: ({ children }) => <tr className="odd:bg-white even:bg-[#f9fdf7]">{children}</tr>,
          th: ({ children }) => (
            <th className="border-b border-[#174128]/16 px-3 py-2 text-left font-semibold text-[#173f2a]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-[#174128]/10 px-3 py-2 align-top text-text-1">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-current/30 pl-3 italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-black/8 px-1 py-0.5 font-mono text-[0.92em]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-black/8 p-3 font-mono text-xs">
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-2 border-current/20" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function MessageBubble({
  message,
  pending = false,
  pendingStage,
  pendingContent = "",
  onChartTypeChange,
  onSaveWidget,
}: MessageBubbleProps) {
  if (pending) {
    return (
      <div className="flex max-w-[78%] items-start gap-2">
        <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[#174128]/20 bg-[#edf7ea] text-[#1f5c2f]">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="rounded-2xl border border-[#174128]/16 bg-white px-4 py-3 shadow-[0_8px_22px_rgba(14,41,24,0.08)]">
          <ThinkingIndicator stage={pendingStage} content={pendingContent} />
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="ml-auto flex w-full max-w-[78%] items-start justify-end gap-2">
        <div className="rounded-2xl bg-[#2ed52e] px-4 py-3 text-sm font-medium text-white shadow-[0_12px_24px_rgba(46,213,46,0.28)]">
          <RichText content={message.content} className="text-sm leading-relaxed text-white" />
        </div>
        <Tooltip content="You">
          <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[#174128]/25 bg-white text-[#255d35] shadow-[0_4px_14px_rgba(14,41,24,0.08)]">
            <CircleUserRound className="h-4 w-4" />
          </span>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex max-w-[82%] items-start gap-2">
      <Tooltip content="QueryWise Analyst">
        <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[#174128]/20 bg-[#edf7ea] text-[#1d552e]">
          <Bot className="h-4 w-4" />
        </span>
      </Tooltip>
      <div className="w-full space-y-3 rounded-2xl border border-[#174128]/16 bg-white px-4 py-4 shadow-[0_10px_26px_rgba(14,41,24,0.08)]">
        <RichText content={message.content} className="text-sm leading-relaxed text-text-1" />
        {message.result || message.sql ? (
          <MessageResultCard
            message={message}
            onChartTypeChange={onChartTypeChange}
            onSaveWidget={onSaveWidget}
          />
        ) : null}
        {message.error ? <p className="text-xs text-danger">{message.error}</p> : null}
      </div>
    </div>
  );
}
