import "server-only";
import { generateText } from "ai";
import { getModel, type Provider, withModelFallback } from "./client";

const MAX_CONVERSATION_TITLE_LENGTH = 120;

export function sanitizeConversationTitle(raw: string): string {
  const compact = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();

  if (!compact) return "";
  return compact.length <= MAX_CONVERSATION_TITLE_LENGTH
    ? compact
    : compact.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 3).trimEnd() + "...";
}

export async function generateConversationTitle(params: {
  userMessage: string;
  assistantMessage: string;
  provider: Provider;
  model: string;
  apiKey: string;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const system = [
    "You write short, useful conversation titles for an analytics chat app.",
    "Return only the title text.",
    "Do not use quotation marks, punctuation at the end, markdown, or labels.",
  ].join(" ");

  const prompt = [
    "Create a concise title from the first user message and the first assistant response.",
    "Requirements:",
    "- 3 to 6 words when possible.",
    "- Describe the actual analysis or conversation topic.",
    "- Do not copy the user's full prompt.",
    "- Do not mention SQL unless SQL itself is the topic.",
    "",
    "User message:",
    params.userMessage.slice(0, 1200),
    "",
    "Assistant response:",
    params.assistantMessage.slice(0, 1200),
  ].join("\n");

  const { text } = await withModelFallback({
    provider: params.provider,
    model: params.model,
    execute: async (candidateModel) =>
      generateText({
        model: getModel(params.provider, candidateModel, params.apiKey),
        system,
        prompt,
        maxOutputTokens: 32,
        temperature: 0.1,
        abortSignal: params.abortSignal,
      }),
  });

  return sanitizeConversationTitle(text);
}
