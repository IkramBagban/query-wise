import type { PendingQueryState } from "@/store/app-state";
import { consumeQuerySse } from "@/lib/chat/query-sse-client";
import {
  createMessageId,
  isApiKeyErrorMessage,
  type QuerySseEvent,
} from "@/lib/chat/query-sse-events";
import type { LlmProvider } from "@/lib/llm-config";
import type { ChatMessage, QueryRequest } from "@/types";

interface SendQueryParams {
  question: string;
  isDatabaseConnected: boolean;
  messages: ChatMessage[];
  setMessages: (
    value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  setPendingQuery: (
    value:
      | PendingQueryState
      | ((prev: PendingQueryState) => PendingQueryState),
  ) => void;
  connectionString?: string;
  provider: LlmProvider;
  model: string;
  apiKey: string;
}

export async function sendQuery({
  question,
  isDatabaseConnected,
  messages,
  setMessages,
  setPendingQuery,
  connectionString,
  provider,
  model,
  apiKey,
}: SendQueryParams): Promise<void> {
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
    const body = await consumeQuerySse(payload, (event: QuerySseEvent) => {
      if (event.type === "stage") {
        if (event.label.trim()) {
          setPendingQuery((prev) => ({ ...prev, stage: event.label }));
        }
        return;
      }

      if (event.type === "text_delta") {
        if (event.chunk) {
          setPendingQuery((prev) => ({
            ...prev,
            content: prev.content + event.chunk,
          }));
        }
        return;
      }

      if (event.type === "sql") {
        setPendingQuery((prev) => ({ ...prev, stage: "SQL generated" }));
        return;
      }

      if (event.type === "query_stats") {
        setPendingQuery((prev) => ({
          ...prev,
          stage: `Fetched ${event.rowCount} rows`,
        }));
        return;
      }

      if (event.type === "error") {
        throw new Error(event.message);
      }
    });

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
}


