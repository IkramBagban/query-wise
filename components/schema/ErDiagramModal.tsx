"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Database, KeyRound, Link2 } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import type { SchemaInfo, SchemaTable } from "@/types";

import "@xyflow/react/dist/style.css";

interface ErDiagramModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: SchemaInfo | null;
}

type TableNodeData = {
  table: SchemaTable;
  outgoingForeignKeyColumns: string[];
  incomingReferenceColumns: string[];
};

const TABLE_HEADER_HEIGHT = 40;
const TABLE_BODY_PADDING = 10;
const TABLE_ROW_HEIGHT = 22;

function makeSourceHandleId(tableName: string, columnName: string): string {
  return `${tableName}::${columnName}::source`;
}

function makeTargetHandleId(tableName: string, columnName: string): string {
  return `${tableName}::${columnName}::target`;
}

function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  const outgoingColumns = new Set(data.outgoingForeignKeyColumns);
  const incomingColumns = new Set(data.incomingReferenceColumns);

  return (
    <div className="relative w-[320px] overflow-hidden rounded-xl border border-[#174128]/18 bg-white shadow-[0_10px_26px_rgba(10,50,24,0.12)]">
      <div className="flex h-10 items-center justify-between border-b border-[#174128]/14 bg-[#f1f8ec] px-3 py-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-text-1">
          <Database className="h-3.5 w-3.5 text-accent" />
          {data.table.name}
        </p>
        {typeof data.table.rowCount === "number" ? (
          <span className="rounded-full bg-[#2ed52e] px-2 py-0.5 text-[11px] font-semibold text-white">
            {data.table.rowCount.toLocaleString()}
          </span>
        ) : null}
      </div>

      <div className="space-y-0 p-2.5">
        {data.table.columns.map((column, index) => {
          const rowCenterY = TABLE_HEADER_HEIGHT + TABLE_BODY_PADDING + index * TABLE_ROW_HEIGHT + TABLE_ROW_HEIGHT / 2;
          const isOutgoingForeignKey = outgoingColumns.has(column.name);
          const isIncomingReference = incomingColumns.has(column.name);

          return (
            <div
              key={`${data.table.name}.${column.name}`}
              className="grid h-[22px] grid-cols-[1fr_auto] items-center gap-2 text-[11px]"
            >
              {isIncomingReference ? (
                <Handle
                  id={makeTargetHandleId(data.table.name, column.name)}
                  type="target"
                  position={Position.Left}
                  style={{ top: rowCenterY, left: -4 }}
                  className="!h-2.5 !w-2.5 !border-0 !bg-[#486856]"
                />
              ) : null}
              {isOutgoingForeignKey ? (
                <Handle
                  id={makeSourceHandleId(data.table.name, column.name)}
                  type="source"
                  position={Position.Right}
                  style={{ top: rowCenterY, right: -4 }}
                  className="!h-2.5 !w-2.5 !border-0 !bg-[#2ed52e]"
                />
              ) : null}
            <p className="flex min-w-0 items-center gap-1.5 truncate text-text-1">
              {column.isPrimaryKey ? <KeyRound className="h-3 w-3 text-warning" /> : null}
              {!column.isPrimaryKey && column.isForeignKey ? <Link2 className="h-3 w-3 text-accent" /> : null}
              <span className="truncate">{column.name}</span>
            </p>
            <p className="truncate font-mono text-text-3">{column.fullType ?? column.type}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildGraph(schema: SchemaInfo | null): { nodes: Node<TableNodeData>[]; edges: Edge[] } {
  if (!schema) {
    return { nodes: [], edges: [] };
  }

  const degreeByTable = new Map<string, number>();
  for (const table of schema.tables) {
    degreeByTable.set(table.name, 0);
  }
  for (const relation of schema.relationships) {
    degreeByTable.set(relation.fromTable, (degreeByTable.get(relation.fromTable) ?? 0) + 1);
    degreeByTable.set(relation.toTable, (degreeByTable.get(relation.toTable) ?? 0) + 1);
  }

  const sortedTables = [...schema.tables].sort((a, b) => {
    const aDegree = degreeByTable.get(a.name) ?? 0;
    const bDegree = degreeByTable.get(b.name) ?? 0;
    if (bDegree !== aDegree) return bDegree - aDegree;
    return a.name.localeCompare(b.name);
  });

  const columnsPerRow = 3;
  const xGap = 390;
  const yGap = 330;

  const outgoingByTable = new Map<string, Set<string>>();
  const incomingByTable = new Map<string, Set<string>>();
  const columnSetByTable = new Map<string, Set<string>>();

  for (const table of schema.tables) {
    outgoingByTable.set(table.name, new Set<string>());
    incomingByTable.set(table.name, new Set<string>());
    columnSetByTable.set(table.name, new Set(table.columns.map((column) => column.name)));
  }

  for (const relationship of schema.relationships) {
    outgoingByTable.get(relationship.fromTable)?.add(relationship.fromColumn);
    incomingByTable.get(relationship.toTable)?.add(relationship.toColumn);
  }

  const nodes: Node<TableNodeData>[] = sortedTables.map((table, index) => {
    const col = index % columnsPerRow;
    const row = Math.floor(index / columnsPerRow);
    return {
      id: table.name,
      type: "tableNode",
      position: { x: col * xGap, y: row * yGap },
      data: {
        table,
        outgoingForeignKeyColumns: [...(outgoingByTable.get(table.name) ?? [])],
        incomingReferenceColumns: [...(incomingByTable.get(table.name) ?? [])],
      },
      draggable: true,
    };
  });

  const edges: Edge[] = schema.relationships.map((relationship, index) => {
    const sourceColumns = columnSetByTable.get(relationship.fromTable);
    const targetColumns = columnSetByTable.get(relationship.toTable);
    const sourceHandle = sourceColumns?.has(relationship.fromColumn)
      ? makeSourceHandleId(relationship.fromTable, relationship.fromColumn)
      : undefined;
    const targetHandle = targetColumns?.has(relationship.toColumn)
      ? makeTargetHandleId(relationship.toTable, relationship.toColumn)
      : undefined;

    return {
      id: `rel-${relationship.fromTable}-${relationship.fromColumn}-${relationship.toTable}-${relationship.toColumn}-${index}`,
      source: relationship.fromTable,
      target: relationship.toTable,
      sourceHandle,
      targetHandle,
      type: "smoothstep",
      pathOptions: { offset: 26, borderRadius: 14 },
      label: relationship.fromColumn,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#486856" },
      animated: false,
      style: { stroke: "#486856", strokeWidth: 1.5, strokeDasharray: "4 4" },
      labelStyle: { fontSize: 11, fill: "#355442", fontWeight: 600 },
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 6,
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.92, stroke: "#dbe9d4" },
    };
  });

  return { nodes, edges };
}

export function ErDiagramModal({ open, onOpenChange, schema }: ErDiagramModalProps) {
  const graph = useMemo(() => buildGraph(schema), [schema]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TableNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const nodeTypes = useMemo(
    () => ({
      tableNode: TableNode,
    }),
    [],
  );

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph.edges, graph.nodes, setEdges, setNodes]);

  const effectiveSelectedTableId = useMemo(() => {
    if (!selectedTableId) return null;
    const stillExists = nodes.some((node) => node.id === selectedTableId);
    return stillExists ? selectedTableId : null;
  }, [nodes, selectedTableId]);

  const focusedTableIds = useMemo(() => {
    if (!effectiveSelectedTableId) return null;

    const related = new Set<string>([effectiveSelectedTableId]);
    for (const edge of edges) {
      if (edge.source === effectiveSelectedTableId) {
        related.add(edge.target);
      }
      if (edge.target === effectiveSelectedTableId) {
        related.add(edge.source);
      }
    }
    return related;
  }, [edges, effectiveSelectedTableId]);

  const renderedNodes = useMemo(() => {
    if (!focusedTableIds) return nodes;
    return nodes.map((node) => {
      const isFocused = focusedTableIds.has(node.id);
      return {
        ...node,
        style: {
          ...node.style,
          opacity: isFocused ? 1 : 0.28,
          transition: "opacity 140ms ease",
        },
      };
    });
  }, [focusedTableIds, nodes]);

  const renderedEdges = useMemo(() => {
    return edges.map((edge) => {
      const isRelatedToFocus =
        effectiveSelectedTableId !== null &&
        (edge.source === effectiveSelectedTableId || edge.target === effectiveSelectedTableId);

      if (!effectiveSelectedTableId) {
        return {
          ...edge,
          animated: false,
          label: undefined,
          style: { ...edge.style, stroke: "#6b8f79", strokeWidth: 1.1, strokeDasharray: "4 6", opacity: 0.58 },
        };
      }

      if (isRelatedToFocus) {
        return {
          ...edge,
          animated: true,
          label: edge.label,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#2d7b42" },
          style: { ...edge.style, stroke: "#2d7b42", strokeWidth: 2.2, strokeDasharray: "0", opacity: 1 },
        };
      }

      return {
        ...edge,
        animated: false,
        label: undefined,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#a6bdaa" },
        style: { ...edge.style, stroke: "#a6bdaa", strokeWidth: 1, strokeDasharray: "3 7", opacity: 0.2 },
      };
    });
  }, [edges, effectiveSelectedTableId]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      panelClassName="h-[92vh] max-h-[92vh] max-w-[min(1400px,96vw)] overflow-hidden p-0"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-text-1">ER Diagram</h2>
            <p className="text-xs text-text-3">Drag tables, zoom, and inspect relationships between foreign keys.</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-text-2 hover:bg-surface-2"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 bg-[#edf5e9]">
          {schema ? (
            <ReactFlowProvider>
              <ReactFlow
                nodes={renderedNodes}
                edges={renderedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.15, minZoom: 0.3, maxZoom: 1.3 }}
                minZoom={0.2}
                maxZoom={1.6}
                onNodeClick={(_, node) => setSelectedTableId(node.id)}
                onPaneClick={() => setSelectedTableId(null)}
                defaultEdgeOptions={{
                  type: "smoothstep",
                  pathOptions: { offset: 26, borderRadius: 14 },
                }}
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={24} color="#d3e2cb" />
                <MiniMap
                  pannable
                  zoomable
                  className="!rounded-lg !border !border-[#174128]/20 !bg-white"
                  nodeColor={() => "#9ec79e"}
                />
                <Controls showInteractive={false} />
                <Panel position="top-right">
                  <div className="rounded-lg border border-[#174128]/18 bg-white/90 px-3 py-2 text-[11px] text-text-2 shadow-sm backdrop-blur">
                    <p>
                      {effectiveSelectedTableId
                        ? `Focused: ${effectiveSelectedTableId}`
                        : "Click a table to focus relationships"}
                    </p>
                    {effectiveSelectedTableId ? (
                      <button
                        className="mt-1 text-[11px] font-semibold text-accent hover:underline"
                        onClick={() => setSelectedTableId(null)}
                      >
                        Clear focus
                      </button>
                    ) : null}
                  </div>
                </Panel>
              </ReactFlow>
            </ReactFlowProvider>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-text-2">
              Connect a database to generate an ER diagram.
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
