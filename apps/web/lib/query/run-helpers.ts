import "server-only";
import { resolveChartConfig } from "@/lib/charts";
import { setGeneratedConversationTitle } from "@/lib/conversations";
import type { ChartConfig } from "@query-wise/shared/types";
import { devLogError } from "@query-wise/shared/observability";
import { generateConversationTitle } from "@/lib/llm/title";
import { getBackendLlmConfig } from "@/lib/llm/client";

/** Shared helpers for the durable query run (V2 pipeline + V3 agent paths). */

export function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

export function toV2ChartConfig(chart: ReturnType<typeof resolveChartConfig>): ChartConfig {
  return {
    schemaVersion: 1,
    type: chart.type,
    xKey: chart.xKey,
    yKey: chart.yKey,
    yKeys: chart.yKeys,
    nameKey: chart.nameKey,
    valueKey: chart.valueKey,
    seriesKey: chart.seriesKey,
    title: chart.title,
  };
}

export async function generateAndPersistTitle(input: {
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  abortSignal: AbortSignal;
  queryRunId: string;
}): Promise<void> {
  try {
    const llmConfig = getBackendLlmConfig();
    const title = await generateConversationTitle({
      ...input,
      provider: llmConfig.provider,
      model: llmConfig.model,
      apiKeys: llmConfig.apiKeys,
    });
    if (title) {
      await setGeneratedConversationTitle(input.conversationId, title);
    }
  } catch (error) {
    devLogError("conversation.title.generation-failed", "Conversation title generation failed.", error, {
      queryRunId: input.queryRunId,
    });
  }
}
