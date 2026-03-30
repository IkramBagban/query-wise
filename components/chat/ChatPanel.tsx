"use client";

import { useState } from "react";

import { QueryInput } from "@/components/chat/QueryInput";
import { MessageList } from "@/components/chat/MessageList";
import type { ChartType, ChatMessage, QueryRequest, QueryResponse } from "@/types";

interface ChatPanelProps {
  connectionString?: string;
  provider: "google" | "anthropic";
  model: string;
  modelOptions: { label: string; value: string }[];
  onModelChange: (value: string) => void;
  apiKey: string;
  onSaveWidget: (message: ChatMessage) => Promise<void>;
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type QuerySseEvent =
  | { type: "stage"; label: string }
  | { type: "text_delta"; chunk: string }
  | { type: "sql"; sql: string }
  | { type: "query_stats"; rowCount: number; executionTimeMs: number }
  | { type: "final"; payload: QueryResponse }
  | { type: "error"; message: string };

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) return null;

  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export function ChatPanel({
  connectionString,
  provider,
  model,
  modelOptions,
  onModelChange,
  apiKey,
  onSaveWidget,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [pendingContent, setPendingContent] = useState("");

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
    setPendingStage("Analyzing request");
    setPendingContent("");

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
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error ?? "Query failed");
      }

      if (!response.body) {
        throw new Error("Stream was not available.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalPayload: QueryResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let boundaryIndex = buffer.indexOf("\n\n");
        while (boundaryIndex >= 0) {
          const block = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          boundaryIndex = buffer.indexOf("\n\n");

          const parsedEvent = parseSseBlock(block);
          if (!parsedEvent) continue;

          const parsedData = JSON.parse(parsedEvent.data) as Record<string, unknown>;

          const event: QuerySseEvent =
            parsedEvent.event === "stage"
              ? { type: "stage", label: String(parsedData.label ?? "") }
              : parsedEvent.event === "text_delta"
                ? { type: "text_delta", chunk: String(parsedData.chunk ?? "") }
                : parsedEvent.event === "sql"
                  ? { type: "sql", sql: String(parsedData.sql ?? "") }
                  : parsedEvent.event === "query_stats"
                    ? {
                        type: "query_stats",
                        rowCount: Number(parsedData.rowCount ?? 0),
                        executionTimeMs: Number(parsedData.executionTimeMs ?? 0),
                      }
                    : parsedEvent.event === "final"
                      ? { type: "final", payload: parsedData as unknown as QueryResponse }
                      : parsedEvent.event === "error"
                        ? { type: "error", message: String(parsedData.message ?? "Unknown error") }
                        : ({ type: "stage", label: "" } as const);

          if (event.type === "stage") {
            if (event.label.trim()) setPendingStage(event.label);
            continue;
          }

          if (event.type === "text_delta") {
            if (event.chunk) {
              setPendingContent((prev) => prev + event.chunk);
            }
            continue;
          }

          if (event.type === "sql") {
            setPendingStage("SQL generated");
            continue;
          }

          if (event.type === "query_stats") {
            setPendingStage(`Fetched ${event.rowCount} rows`);
            continue;
          }

          if (event.type === "error") {
            throw new Error(event.message);
          }

          if (event.type === "final") {
            finalPayload = event.payload;
          }
        }
      }

      if (buffer.trim()) {
        const parsedEvent = parseSseBlock(buffer);
        if (parsedEvent?.event === "final") {
          const parsedData = JSON.parse(parsedEvent.data) as QueryResponse;
          finalPayload = parsedData;
        }
      }

      const body = finalPayload;
      if (!body) {
        throw new Error("No final response received from stream.");
      }

      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: body.explanation,
        sql: body.mode === "query" ? body.sql : undefined,
        result: body.mode === "query" ? body.result : undefined,
        chartConfig: body.mode === "query" ? body.chartConfig : undefined,
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
      setPendingStage(null);
      setPendingContent("");
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
        pendingStage={pendingStage}
        pendingContent={pendingContent}
        onChartTypeChange={handleChartTypeChange}
        onSaveWidget={onSaveWidget}
      />
      <div className="sticky bottom-0 z-20 bg-transparent px-2 pb-2 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
        <div className="mx-auto w-full max-w-[1080px]">
          <QueryInput
            disabled={isLoading}
            model={model}
            modelOptions={modelOptions}
            onModelChange={onModelChange}
            onSubmit={handleSend}
          />
        </div>
      </div>
    </section>
  );
}
