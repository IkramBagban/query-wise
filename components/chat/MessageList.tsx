"use client";

import { useEffect, useRef } from "react";
import { Boxes, CircleDollarSign, LayoutDashboard, UsersRound } from "lucide-react";

import { BrandMark } from "@/components/brand/BrandMark";
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
    <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 sm:px-6 sm:py-5">
      <div className="mx-auto w-full max-w-[1080px]">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-[360px] max-w-3xl flex-col items-center justify-center px-4 py-12 text-center">
            <BrandMark className="size-16 rounded-2xl shadow-[0_8px_24px_rgba(18,115,66,0.12)]" />
            <h1 className="mt-5 font-syne text-3xl font-bold tracking-[-0.04em] text-[#111b16] sm:text-4xl">
              Ask anything about <span className="text-[#078943]">your data</span>
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-[#718178]">
              Get instant insights, create visualizations, and generate SQL all from a simple conversation.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {[
                [CircleDollarSign, "Revenue this month"],
                [Boxes, "Top products"],
                [UsersRound, "Retention analysis"],
                [LayoutDashboard, "Create a dashboard"],
              ].map(([Icon, label]) => (
                <span
                  key={label as string}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-[#dce5df] bg-white px-4 text-xs font-medium text-[#405249] shadow-[0_3px_10px_rgba(25,58,40,0.03)]"
                >
                  <Icon className="size-4 text-[#078943]" />
                  {label as string}
                </span>
              ))}
            </div>
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
