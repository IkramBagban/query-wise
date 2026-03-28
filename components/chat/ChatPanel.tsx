"use client";

import { useMemo, useState } from "react";

import { QueryInput } from "@/components/chat/QueryInput";
import { MessageList } from "@/components/chat/MessageList";
import type { ChatMessage, QueryRequest, QueryResponse } from "@/types";

interface ChatPanelProps {
  connectionString?: string;
  provider: "google" | "anthropic";
  model: string;
  apiKey: string;
  onResultChange: (message: ChatMessage | null) => void;
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatPanel({ connectionString, provider, model, apiKey, onResultChange }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeResultId, setActiveResultId] = useState<string>();

  const activeResult = useMemo(
    () => messages.find((message) => message.id === activeResultId) ?? null,
    [activeResultId, messages],
  );

  const handleSend = async (question: string) => {
    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: question,
      timestamp: Date.now(),
    };

    const nextHistory = [...messages, userMessage];
    setMessages(nextHistory);
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
      setActiveResultId(assistantMessage.id);
      onResultChange(assistantMessage);
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

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-transparent">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        activeMessageId={activeResult?.id}
        onSelectResult={(message) => {
          setActiveResultId(message.id);
          onResultChange(message);
        }}
      />
      <div className="p-4 bg-gradient-to-t from-bg via-bg/80 to-transparent">
        <QueryInput disabled={isLoading || !apiKey} onSubmit={handleSend} />
      </div>
    </section>

  );
}
