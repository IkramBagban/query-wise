import "server-only";

import type { ChartHint, ChatMessage, SchemaInfo } from "@/types";
import type { BoundedQueryResult } from "@/types/v2";
import { generateStructuredObject, type Provider } from "@/lib/llm";
import { devLog } from "@/lib/v2/observability";
import {
  ColumnPruningSchema,
  ResultExplanationSchema,
  RewriteQuestionSchema,
  SqlPlanSchema,
  TableSelectionSchema,
  type ColumnPruning,
} from "./schemas";
import { compactHistory, type TableCandidate } from "./schema-context";
import { adaptiveRetrievalLimit, retrieveCandidateTables } from "./retrieval";
import {
  STRUCTURED_PIPELINE_SYSTEM,
  columnPruningPrompt,
  explanationPrompt,
  rewritePrompt,
  sqlPlanPrompt,
  tableSelectionPrompt,
} from "./prompts";
import { cleanGeneratedSql } from "./sql";

const RERANKER_TABLE_THRESHOLD = 15;

export interface PipelineModelConfig {
  provider: Provider;
  model: string;
  apiKey: string;
  abortSignal?: AbortSignal;
}

export interface StagedPipelinePlan {
  mode: "conversation" | "query";
  standaloneQuestion: string;
  directAnswer: string | null;
  sql: string | null;
  chartHint: ChartHint | null;
  retrieval: {
    candidateTableCount: number;
    selectedTables: string[];
    prunedTables: string[];
  };
}

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

async function runLlmTableSelection(
  candidates: TableCandidate[],
  question: string,
  llm: PipelineModelConfig,
): Promise<TableCandidate[]> {
  const selection = await generateStructuredObject({
    ...llm,
    schema: TableSelectionSchema,
    schemaName: "TableSelection",
    system: STRUCTURED_PIPELINE_SYSTEM,
    prompt: tableSelectionPrompt({ question, candidates }),
    maxOutputTokens: 1200,
  });
  return selectedCandidateTables(candidates, selection.selectedTables.map((t) => t.tableName));
}

export async function planStagedNlSqlQuery(params: {
  question: string;
  history: ChatMessage[];
  schema: SchemaInfo;
  llm: PipelineModelConfig;
  onStage?: (label: string) => void;
}): Promise<StagedPipelinePlan> {
  const pipelineStartedAt = Date.now();
  params.onStage?.("Rewriting follow-up");
  const rewriteStartedAt = Date.now();
  const rewrite = await generateStructuredObject({
    ...params.llm,
    schema: RewriteQuestionSchema,
    schemaName: "RewriteQuestion",
    system: STRUCTURED_PIPELINE_SYSTEM,
    prompt: rewritePrompt({ question: params.question, history: compactHistory(params.history) }),
    maxOutputTokens: 900,
  });
  devLog("info", "nl-sql.rewrite.completed", "NL-to-SQL rewrite stage completed.", {
    durationMs: elapsedMs(rewriteStartedAt),
    requiresDatabase: rewrite.requiresDatabase,
    historyTurnCount: params.history.length,
  });

  if (!rewrite.requiresDatabase) {
    devLog("info", "nl-sql.pipeline.completed", "NL-to-SQL pipeline completed with conversational response.", {
      mode: "conversation",
      durationMs: elapsedMs(pipelineStartedAt),
    });
    return {
      mode: "conversation",
      standaloneQuestion: rewrite.standaloneQuestion,
      directAnswer: rewrite.directAnswer ?? "I can help analyze your connected database when you ask a data question.",
      sql: null,
      chartHint: null,
      retrieval: { candidateTableCount: 0, selectedTables: [], prunedTables: [] },
    };
  }

  const totalTables = params.schema.tables.length;
  const retrievalLimit = adaptiveRetrievalLimit(totalTables);
  if (retrievalLimit !== null) {
    params.onStage?.("Retrieving candidate tables");
  }
  const retrievalStartedAt = Date.now();
  const candidates = await retrieveCandidateTables({
    schema: params.schema,
    question: rewrite.standaloneQuestion,
    limit: retrievalLimit,
  });
  devLog("info", "nl-sql.retrieval.completed", "NL-to-SQL retrieval stage completed.", {
    durationMs: elapsedMs(retrievalStartedAt),
    candidateTableCount: candidates.length,
    schemaTableCount: params.schema.tables.length,
  });

  params.onStage?.("Selecting relevant tables");
  const selectionStartedAt = Date.now();
  const selectedCandidates =
    candidates.length <= RERANKER_TABLE_THRESHOLD
      ? candidates
      : await runLlmTableSelection(candidates, rewrite.standaloneQuestion, params.llm);
  devLog("info", "nl-sql.table-selection.completed", "NL-to-SQL table selection stage completed.", {
    durationMs: elapsedMs(selectionStartedAt),
    selectedTableCount: selectedCandidates.length,
    selectedTables: selectedCandidates.map((c: TableCandidate) => c.tableName),
    skippedReranker: candidates.length <= RERANKER_TABLE_THRESHOLD,
  });

  params.onStage?.("Pruning columns");
  const pruningStartedAt = Date.now();
  // prune unnecessary columns from the selected tables. 
  const pruning = await generateStructuredObject({
    ...params.llm,
    schema: ColumnPruningSchema,
    schemaName: "ColumnPruning",
    system: STRUCTURED_PIPELINE_SYSTEM,
    prompt: columnPruningPrompt({ question: rewrite.standaloneQuestion, selectedCandidates }),
    maxOutputTokens: 2400,
  });

  const normalizedPruning = normalizePruning(params.schema, selectedCandidates, pruning);
  devLog("info", "nl-sql.column-prune.completed", "NL-to-SQL column pruning stage completed.", {
    durationMs: elapsedMs(pruningStartedAt),
    prunedTableCount: normalizedPruning.tables.length,
    prunedColumnCount: normalizedPruning.tables.reduce((sum, table) => sum + table.columns.length, 0),
  });

  params.onStage?.("Generating SQL");
  const sqlStartedAt = Date.now();
  const sqlPlan = await generateStructuredObject({
    ...params.llm,
    schema: SqlPlanSchema,
    schemaName: "SqlPlan",
    system: STRUCTURED_PIPELINE_SYSTEM,
    prompt: sqlPlanPrompt({
      question: rewrite.standaloneQuestion,
      schema: params.schema,
      pruning: normalizedPruning,
    }),
    maxOutputTokens: 2800,
  });
  const sql = cleanGeneratedSql(sqlPlan.sql);
  devLog("info", "nl-sql.sql-generation.completed", "NL-to-SQL SQL generation stage completed.", {
    durationMs: elapsedMs(sqlStartedAt),
    sqlLength: sql.length,
    chartHintType: sqlPlan.chartHint?.type ?? null,
  });

  return {
    mode: "query",
    standaloneQuestion: rewrite.standaloneQuestion,
    directAnswer: null,
    sql,
    chartHint: sqlPlan.chartHint,
    retrieval: {
      candidateTableCount: candidates.length,
      selectedTables: selectedCandidates.map((candidate) => candidate.tableName),
      prunedTables: normalizedPruning.tables.map((table) => table.tableName),
    },
  };
}

export async function explainStagedNlSqlResult(params: {
  question: string;
  sql: string;
  result: BoundedQueryResult;
  llm: PipelineModelConfig;
  onStage?: (label: string) => void;
}): Promise<{ explanation: string; chartHint: ChartHint | null }> {
  params.onStage?.("Explaining result");
  const explanation = await generateStructuredObject({
    ...params.llm,
    schema: ResultExplanationSchema,
    schemaName: "ResultExplanation",
    system: STRUCTURED_PIPELINE_SYSTEM,
    prompt: explanationPrompt({
      question: params.question,
      sql: params.sql,
      result: params.result,
    }),
    maxOutputTokens: 1200,
  });

  return {
    explanation: explanation.explanation,
    chartHint: explanation.chartHint,
  };
}

function selectedCandidateTables(candidates: TableCandidate[], selectedTableNames: string[]): TableCandidate[] {
  const byName = new Map(candidates.map((candidate) => [candidate.tableName, candidate]));
  const selected = selectedTableNames
    .map((tableName) => byName.get(tableName))
    .filter((candidate): candidate is TableCandidate => Boolean(candidate));
  return selected.length > 0 ? selected.slice(0, 8) : candidates.slice(0, Math.min(5, candidates.length));
}

function normalizePruning(
  schema: SchemaInfo,
  selectedCandidates: TableCandidate[],
  pruning: ColumnPruning,
): ColumnPruning {
  const tableByName = new Map(schema.tables.map((table) => [table.name, table]));
  const selectedNames = new Set(selectedCandidates.map((candidate) => candidate.tableName));
  const tables = pruning.tables
    .filter((table) => selectedNames.has(table.tableName))
    .map((table) => {
      const schemaTable = tableByName.get(table.tableName);
      const availableColumns = new Set(schemaTable?.columns.map((column) => column.name) ?? []);
      const columns = table.columns.filter((column) => availableColumns.has(column.name));
      const joinColumns = schemaTable?.columns
        .filter((column) => column.isPrimaryKey || column.isForeignKey)
        .map((column) => ({ name: column.name, reason: "Needed for joins and entity identity." })) ?? [];
      const byName = new Map([...columns, ...joinColumns].map((column) => [column.name, column]));
      return { tableName: table.tableName, columns: [...byName.values()].slice(0, 24) };
    })
    .filter((table) => table.columns.length > 0);

  if (tables.length > 0) return { tables, joinPaths: pruning.joinPaths };

  return {
    tables: selectedCandidates.slice(0, 5).map((candidate) => ({
      tableName: candidate.tableName,
      columns: candidate.columns.slice(0, 12).map((column) => ({ name: column.name, reason: "Fallback selected candidate column." })),
    })),
    joinPaths: [],
  };
}
