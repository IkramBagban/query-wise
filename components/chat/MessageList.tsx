"use client";

import { useEffect, useRef } from "react";

import { MessageBubble } from "@/components/chat/MessageBubble";
import type { ChatMessage } from "@/types";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  activeMessageId?: string;
  onSelectResult: (message: ChatMessage) => void;
}

export function MessageList({ messages, isLoading, activeMessageId, onSelectResult }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isLoading, messages]);

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-text-3">
          Ask your first question to start the analysis.
        </div>
      ) : null}
      {messages.map((message) => (
        <div key={message.id} className={activeMessageId === message.id ? "animate-fade-in" : ""}>
          <MessageBubble message={message} onViewResult={message.result ? () => onSelectResult(message) : undefined} />
        </div>
      ))}
      {isLoading ? <MessageBubble pending message={{ id: "pending", role: "assistant", content: "", timestamp: Date.now() }} /> : null}
      <div ref={bottomRef} />
    </div>
  );
}
