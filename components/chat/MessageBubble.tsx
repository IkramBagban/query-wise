"use client";

import { CodeBlock } from "@/components/ui/code-block";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import type { ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  pending?: boolean;
  onViewResult?: () => void;
}

export function MessageBubble({ message, pending = false, onViewResult }: MessageBubbleProps) {
  if (pending) {
    return (
      <div className="max-w-[82%] rounded-lg border border-border bg-surface-2 px-3 py-2">
        <ThinkingIndicator />
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[82%] rounded-lg bg-accent px-3 py-2 text-sm text-text-1">
        {message.content}
      </div>
    );
  }

  return (
    <div className="max-w-[90%] space-y-2 rounded-lg border border-border bg-surface-2 px-3 py-3">
      <p className="text-sm text-text-1">{message.content}</p>
      {message.sql ? <CodeBlock sql={message.sql} /> : null}
      {message.result ? (
        <div className="flex items-center justify-between text-xs text-text-2">
          <span>
            {message.result.rowCount} rows · {message.result.executionTimeMs}ms
          </span>
          {onViewResult ? (
            <button className="text-accent hover:underline" onClick={onViewResult}>
              View chart
            </button>
          ) : null}
        </div>
      ) : null}
      {message.error ? <p className="text-xs text-danger">{message.error}</p> : null}
    </div>
  );
}
