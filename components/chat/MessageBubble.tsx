"use client";

import { Bot, CircleUserRound, Sparkles } from "lucide-react";

import { MessageResultCard } from "@/components/chat/MessageResultCard";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { Tooltip } from "@/components/ui/tooltip";
import type { ChartType, ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  pending?: boolean;
  onChartTypeChange: (messageId: string, type: ChartType) => void;
  onSaveWidget: (message: ChatMessage) => Promise<void>;
}

export function MessageBubble({ message, pending = false, onChartTypeChange, onSaveWidget }: MessageBubbleProps) {
  if (pending) {
    return (
      <div className="flex max-w-[78%] items-start gap-2">
        <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[#174128]/20 bg-[#edf7ea] text-[#1f5c2f]">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="rounded-2xl border border-[#174128]/16 bg-white px-4 py-3 shadow-[0_8px_22px_rgba(14,41,24,0.08)]">
          <ThinkingIndicator />
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="ml-auto flex w-full max-w-[78%] items-start justify-end gap-2">
        <div className="rounded-2xl bg-[#2ed52e] px-4 py-3 text-sm font-medium text-white shadow-[0_12px_24px_rgba(46,213,46,0.28)]">
          {message.content}
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
        <p className="text-sm leading-relaxed text-text-1">{message.content}</p>
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
