import type { ChatMessage, SchemaInfo } from "@/types";
import { getModel, type Provider, withModelFallback } from "./client";
import { buildSchemaContext } from "./prompts";
import { generateText } from "ai";

interface GenerateSQLParams {
  question: string;
  schema: SchemaInfo;
  history: ChatMessage[];
  provider: Provider;
  model: string;
  apiKey: string;
}

export type ModelMessage = { role: "user" | "assistant"; content: string };

function cleanSQL(raw: string): string {
  const withoutFences = raw
    .replace(/```sql\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim();

  const sqlStartIndex = withoutFences.search(/\b(SELECT|WITH)\b/i);
  const fromFirstSqlToken =
    sqlStartIndex >= 0 ? withoutFences.slice(sqlStartIndex) : withoutFences;

  const firstSemicolonIndex = fromFirstSqlToken.indexOf(";");
  const singleStatement =
    firstSemicolonIndex >= 0
      ? fromFirstSqlToken.slice(0, firstSemicolonIndex)
      : fromFirstSqlToken;

  return singleStatement.trim();
}

export async function generateSQL(params: GenerateSQLParams): Promise<string> {
  const systemPrompt = buildSchemaContext(params.schema);
  const historyMessages: ModelMessage[] = params.history
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content:
        message.role === "user"
          ? message.content
          : (message.sql ?? message.content),
    }));

  const messages: ModelMessage[] = [
    ...historyMessages,
    { role: "user", content: params.question },
  ];

  const { text } = await withModelFallback({
    provider: params.provider,
    model: params.model,
    execute: async (candidateModel) =>
      generateText({
        model: getModel(params.provider, candidateModel, params.apiKey),
        system: systemPrompt,
        messages,
        maxOutputTokens: 2500,
        temperature: 0.1,
      }),
  });

  return cleanSQL(text);
}
