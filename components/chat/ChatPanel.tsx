"use client";

import { QueryInput } from "@/components/chat/QueryInput";
import { MessageList } from "@/components/chat/MessageList";
import { Button } from "@/components/ui/button";
import type { LlmProvider } from "@/lib/llm-config";
import { sendQuery } from "@/lib/chat/send-query";
import { useAppState } from "@/store/app-state";
import type { ChartType, ChatMessage } from "@/types";

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
    clearMessages,
    updateMessageChartType,
  } = useAppState();

  const handleSend = async (question: string) => {
    await sendQuery({
      question,
      isDatabaseConnected,
      messages,
      setMessages,
      setPendingQuery,
      connectionString,
      provider,
      model,
      apiKey,
    });
  };

  const handleChartTypeChange = (messageId: string, type: ChartType) => {
    updateMessageChartType(messageId, type);
  };

  const handleClearChat = () => {
    if (pendingQuery.isLoading) return;
    if (!messages.length) return;

    const confirmed = window.confirm("Clear this chat conversation? This only removes messages.");
    if (!confirmed) return;

    clearMessages();
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
          <div className="mb-2 flex items-center justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              disabled={pendingQuery.isLoading || messages.length === 0}
              className="border-danger/25 bg-white/80 text-danger hover:bg-danger/10"
            >
              Clear chat
            </Button>
          </div>
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
          <p className="mt-2 px-1 text-[11px] text-text-3">
            Chat history is temporary for this browser session and may reset when this tab is closed.
          </p>
        </div>
      </div>
    </section>
  );
}
