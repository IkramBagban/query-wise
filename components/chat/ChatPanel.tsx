"use client";

import { useAppState } from "@/components/providers/AppStateProvider";
import { QueryInput } from "@/components/chat/QueryInput";
import { MessageList } from "@/components/chat/MessageList";
import type { LlmProvider } from "@/lib/llm-config";
import type { ChartType, ChatMessage, QueryRequest, QueryResponse } from "@/types";

interface ChatPanelProps {
  isDatabaseConnected: boolean;
  onOpenConnectionModal: () => void;
  onOpenSettingsModal: () => void;
  connectionString?: string;
  provider: LlmProvider;
  model: string;
  providerOptions: { label: string; value: string }[];
  modelOptions: { label: string; value: string }[];
  onProviderChange: (value: string) => void;
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

function isApiKeyErrorMessage(message: string): boolean {
  const value = message.toLowerCase();
  return (
    value.includes("missing llm api key") ||
    value.includes("api_key_invalid") ||
    value.includes("invalid api key") ||
    value.includes("api key not valid") ||
    value.includes("please pass a valid api key")
  );
}

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
  isDatabaseConnected,
  onOpenConnectionModal,
  onOpenSettingsModal,
  connectionString,
  provider,
  model,
  providerOptions,
  modelOptions,
  onProviderChange,
  onModelChange,
  apiKey,
  onSaveWidget,
}: ChatPanelProps) {
  const {
    messages,
    setMessages,
    pendingQuery,
    setPendingQuery,
    updateMessageChartType,
  } = useAppState();

  const handleSend = async (question: string) => {
    if (!isDatabaseConnected) {
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: "Database is not connected yet. Click Connect DB to continue.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      return;
    }

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
        content: "Missing API key. Open Settings and add a valid key to continue.",
        error: "Missing LLM API key",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      return;
    }

    setPendingQuery({
      isLoading: true,
      stage: "Analyzing request",
      content: "",
    });

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
            if (event.label.trim()) {
              setPendingQuery((prev) => ({ ...prev, stage: event.label }));
            }
            continue;
          }

          if (event.type === "text_delta") {
            if (event.chunk) {
              setPendingQuery((prev) => ({
                ...prev,
                content: prev.content + event.chunk,
              }));
            }
            continue;
          }

          if (event.type === "sql") {
            setPendingQuery((prev) => ({ ...prev, stage: "SQL generated" }));
            continue;
          }

          if (event.type === "query_stats") {
            setPendingQuery((prev) => ({
              ...prev,
              stage: `Fetched ${event.rowCount} rows`,
            }));
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
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const content = isApiKeyErrorMessage(errorMessage)
        ? "Invalid API key. Open Settings, update the key, and try again."
        : "I couldn't complete that query.";
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content,
        error: errorMessage,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setPendingQuery({
        isLoading: false,
        stage: null,
        content: "",
      });
    }
  };

  const handleChartTypeChange = (messageId: string, type: ChartType) => {
    updateMessageChartType(messageId, type);
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,#f8fdf6_0%,#f2faee_55%,#eef7eb_100%)]">
      <MessageList
        messages={messages}
        isLoading={pendingQuery.isLoading}
        pendingStage={pendingQuery.stage}
        pendingContent={pendingQuery.content}
        onOpenSettingsModal={onOpenSettingsModal}
        onChartTypeChange={handleChartTypeChange}
        onSaveWidget={onSaveWidget}
      />
      <div className="sticky bottom-0 z-20 bg-gradient-to-t from-[#eef6ea] via-[#eef6ea]/95 to-transparent pl-2 pr-3 pb-2 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
        <div className="mx-auto w-full max-w-[980px]">
          <QueryInput
            disabled={!isDatabaseConnected}
            databaseConnected={isDatabaseConnected}
            onRequestConnectDatabase={onOpenConnectionModal}
            provider={provider}
            model={model}
            providerOptions={providerOptions}
            modelOptions={modelOptions}
            onProviderChange={onProviderChange}
            onModelChange={onModelChange}
            onSubmit={handleSend}
          />
        </div>
      </div>
    </section>
  );
}
