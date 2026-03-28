"use client";

import { useState } from "react";

import { QueryInput } from "@/components/chat/QueryInput";
import { MessageList } from "@/components/chat/MessageList";
import type { ChartType, ChatMessage, QueryRequest, QueryResponse } from "@/types";

interface ChatPanelProps {
  connectionString?: string;
  provider: "google" | "anthropic";
  model: string;
  apiKey: string;
  onSaveWidget: (message: ChatMessage) => Promise<void>;
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatPanel({ connectionString, provider, model, apiKey, onSaveWidget }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (question: string) => {
    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: question,
      timestamp: Date.now(),
    };

    const nextHistory = [...messages, userMessage];
    setMessages(nextHistory);

    if (!apiKey.trim()) {
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: "Add your API key in Settings to run queries.",
        error: "Missing LLM API key",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      return;
    }

    setIsLoading(true);

    const payload: QueryRequest = {
      question,
      history: nextHistory,
      connectionString,
      provider,
      model,
      apiKey,
    };

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error ?? "Query failed");
      }

      const body = (await response.json()) as QueryResponse;
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: body.explanation,
        sql: body.sql,
        result: body.result,
        chartConfig: body.chartConfig,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: "I couldn't complete that query.",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChartTypeChange = (messageId: string, type: ChartType) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId && message.chartConfig
          ? { ...message, chartConfig: { ...message.chartConfig, type } }
          : message,
      ),
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,#f8fdf6_0%,#f2faee_55%,#eef7eb_100%)]">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        onChartTypeChange={handleChartTypeChange}
        onSaveWidget={onSaveWidget}
      />
      <div className="sticky bottom-0 z-20 border-t border-[#174128]/16 bg-gradient-to-t from-[#edf8e8] via-[#f4faf2]/95 to-transparent px-4 pb-4 pt-3 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[1080px]">
          <QueryInput disabled={isLoading} onSubmit={handleSend} />
        </div>
      </div>
    </section>
  );
}
