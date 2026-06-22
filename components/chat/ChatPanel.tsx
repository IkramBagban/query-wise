"use client";

import { QueryInput } from "@/components/chat/QueryInput";
import { MessageList } from "@/components/chat/MessageList";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { LlmProvider } from "@/lib/llm-config";
import { sendQuery } from "@/lib/chat/send-query";
import { useAppState } from "@/store/app-state";
import type { ChartType, ChatMessage } from "@/types";
import { useEffect, useState } from "react";

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
  externalQuestion?: string | null;
  onExternalQuestionConsumed?: () => void;
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
  externalQuestion,
  onExternalQuestionConsumed,
}: ChatPanelProps) {
  const [clearChatConfirmOpen, setClearChatConfirmOpen] = useState(false);
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

  // Handle re-run from query history
  useEffect(() => {
    if (externalQuestion && !pendingQuery.isLoading) {
      void handleSend(externalQuestion);
      onExternalQuestionConsumed?.();
    }
  }, [externalQuestion]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChartTypeChange = (messageId: string, type: ChartType) => {
    updateMessageChartType(messageId, type);
  };

  const handleClearChat = () => {
    if (pendingQuery.isLoading) return;
    if (!messages.length) return;
    setClearChatConfirmOpen(true);
  };

  const confirmClearChat = () => {
    clearMessages();
    setClearChatConfirmOpen(false);
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-[#fbfdfc]">
      <MessageList
        messages={messages}
        isLoading={pendingQuery.isLoading}
        pendingStage={pendingQuery.stage}
        pendingContent={pendingQuery.content}
        onOpenSettingsModal={onOpenSettingsModal}
        onChartTypeChange={handleChartTypeChange}
        onSaveWidget={onSaveWidget}
      />
      <div className="sticky bottom-0 z-20 bg-gradient-to-t from-[#fbfdfc] via-[#fbfdfc]/98 to-transparent px-3 pb-3 pt-2 sm:px-6 sm:pb-4">
        <div className="mx-auto w-full max-w-[900px]">
          <div className="mb-1 flex items-center justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              disabled={pendingQuery.isLoading || messages.length === 0}
              className="h-7 border-0 bg-transparent px-2 text-[10px] text-[#718178] hover:bg-[#f2f6f3] hover:text-danger"
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
          <p className="mt-3 text-center text-[10px] text-[#87968e]">
            QueryWise can make mistakes. Please verify important results.
          </p>
        </div>
      </div>
      <Dialog open={clearChatConfirmOpen} onOpenChange={setClearChatConfirmOpen} panelClassName="max-w-md">
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-text-1">Clear chat?</h2>
            <p className="text-sm text-text-2">This removes all messages from this conversation.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setClearChatConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmClearChat}>
              Clear chat
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
