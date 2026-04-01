"use client";

import { useEffect, useRef } from "react";
import { MessagesSquare } from "lucide-react";

import { MessageBubble } from "@/components/chat/MessageBubble";
import type { ChartType, ChatMessage } from "@/types";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  pendingStage?: string | null;
  pendingContent?: string;
  onOpenSettingsModal: () => void;
  onChartTypeChange: (messageId: string, type: ChartType) => void;
  onSaveWidget: (message: ChatMessage) => Promise<void>;
}

export function MessageList({
  messages,
  isLoading,
  pendingStage,
  pendingContent = "",
  onOpenSettingsModal,
  onChartTypeChange,
  onSaveWidget,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isLoading, messages, pendingStage, pendingContent]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5">
      <div className="mx-auto w-full max-w-[1080px]">
        {messages.length === 0 ? (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-dashed border-[#164229]/28 bg-white/90 p-7 text-sm text-text-2 shadow-[0_14px_30px_rgba(14,41,24,0.07)]">
            <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#24593a]">
              <MessagesSquare className="h-4 w-4" />
              Conversation
            </p>
            Ask your first question to start analysis. Results, charts, and generated SQL will appear inline here.
          </div>
        ) : null}
        <div className="flex flex-col gap-4 pb-2">
          {messages.map((message) => (
            <div key={message.id} className="animate-fade-in">
              <MessageBubble
                message={message}
                onOpenSettingsModal={onOpenSettingsModal}
                onChartTypeChange={onChartTypeChange}
                onSaveWidget={onSaveWidget}
              />
            </div>
          ))}
        </div>
        {isLoading ? (
          <div className="animate-fade-in">
            <MessageBubble
              pending
              pendingStage={pendingStage}
              pendingContent={pendingContent}
              message={{ id: "pending", role: "assistant", content: "", timestamp: 0 }}
              onChartTypeChange={onChartTypeChange}
              onSaveWidget={onSaveWidget}
            />
          </div>
        ) : null}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
