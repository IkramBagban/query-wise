import "server-only";
import { generateText } from "ai";
import { getModel, type Provider } from "./client";
import { runRoutedTask } from "./model-router";

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
  apiKeys: string[];
  abortSignal?: AbortSignal;
}): Promise<string> {
  const system = [
    "You name analytics conversations for a data app.",
    "Write a specific, descriptive title of 3 to 6 words (never 1–2 words).",
    "Name the metric/entity and the angle, like a dashboard tab a person would recognize.",
    "Use Title Case. No quotes, no trailing punctuation, no markdown, no labels, no 'Analysis of' filler.",
    "Examples:",
    "- Question 'how many orders last month' -> Monthly Order Volume",
    "- Question 'top customers by revenue' -> Top Customers By Revenue",
    "- Question 'why did signups drop in June' -> June Signup Decline Drivers",
  ].join("\n");

  const prompt = [
    "Write the title for this conversation based on its first exchange.",
    "",
    "User asked:",
    params.userMessage.slice(0, 1200),
    "",
    "Assistant answered:",
    params.assistantMessage.slice(0, 1200),
    "",
    "Title (3-6 words, Title Case):",
  ].join("\n");

  // Utility work: run on the cheap cross-provider chain, off the agent's quota.
  const { text } = await runRoutedTask({
    task: "utility",
    execute: ({ provider, model, apiKey }) =>
      generateText({
        model: getModel(provider, model, apiKey),
        system,
        prompt,
        maxOutputTokens: 24,
        temperature: 0.3,
        abortSignal: params.abortSignal,
      }),
  });

  return sanitizeConversationTitle(text);
}
