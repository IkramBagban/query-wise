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
  relationEdgeIdsByColumn: Record<string, string[]>;
  activeRelationEdgeId?: string | null;
  hoveredRelationEdgeId?: string | null;
  isEmphasized?: boolean;
  isHovered?: boolean;
  isDragging?: boolean;
  onRelationColumnClick?: (edgeIds: string[]) => void;
  onRelationColumnHover?: (edgeIds: string[]) => void;
  onRelationColumnHoverEnd?: () => void;
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

function getRelationAwarePositions(
  tables: SchemaTable[],
  degreeByTable: Map<string, number>,
  relationships: SchemaInfo["relationships"],
): Map<string, { x: number; y: number }> {
  const tableByName = new Map(tables.map((table) => [table.name, table]));
  const adjacency = new Map<string, Set<string>>();
  for (const table of tables) {
    adjacency.set(table.name, new Set<string>());
  }

  for (const relation of relationships) {
    adjacency.get(relation.fromTable)?.add(relation.toTable);
    adjacency.get(relation.toTable)?.add(relation.fromTable);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  const columnGap = 430;
  const rowGap = 270;
  const componentGap = 170;
  let currentY = 0;

  const allTableNames = [...tableByName.keys()].sort((a, b) => {
    const aDegree = degreeByTable.get(a) ?? 0;
    const bDegree = degreeByTable.get(b) ?? 0;
    if (bDegree !== aDegree) return bDegree - aDegree;
    return a.localeCompare(b);
  });

  for (const seed of allTableNames) {
    if (visited.has(seed)) continue;

    const component: string[] = [];
    const stack = [seed];
    visited.add(seed);
    while (stack.length > 0) {
      const tableName = stack.pop();
      if (!tableName) continue;
      component.push(tableName);
      for (const next of adjacency.get(tableName) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    const root = [...component].sort((a, b) => {
      const aDegree = degreeByTable.get(a) ?? 0;
      const bDegree = degreeByTable.get(b) ?? 0;
      if (bDegree !== aDegree) return bDegree - aDegree;
      return a.localeCompare(b);
    })[0];

    const depthByTable = new Map<string, number>();
    depthByTable.set(root, 0);
    const queue = [root];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const depth = depthByTable.get(current) ?? 0;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (depthByTable.has(neighbor)) continue;
        depthByTable.set(neighbor, depth + 1);
        queue.push(neighbor);
      }
    }

    const layers = new Map<number, string[]>();
    for (const tableName of component) {
      const depth = depthByTable.get(tableName) ?? 0;
      if (!layers.has(depth)) layers.set(depth, []);
      layers.get(depth)?.push(tableName);
    }

    let componentMaxRows = 1;
    const sortedDepths = [...layers.keys()].sort((a, b) => a - b);
    for (const depth of sortedDepths) {
      const layerTables = (layers.get(depth) ?? []).sort((a, b) => {
        const aDegree = degreeByTable.get(a) ?? 0;
        const bDegree = degreeByTable.get(b) ?? 0;
        if (bDegree !== aDegree) return bDegree - aDegree;
        return a.localeCompare(b);
      });
      componentMaxRows = Math.max(componentMaxRows, layerTables.length);
      layerTables.forEach((tableName, rowIndex) => {
        positions.set(tableName, {
          x: depth * columnGap,
          y: currentY + rowIndex * rowGap,
        });
      });
    }

    currentY += componentMaxRows * rowGap + componentGap;
  }

  return positions;
}

function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  const outgoingColumns = new Set(data.outgoingForeignKeyColumns);
  const incomingColumns = new Set(data.incomingReferenceColumns);
  const isEmphasized = data.isEmphasized ?? false;
  const isHovered = data.isHovered ?? false;
  const isDragging = data.isDragging ?? false;

  return (
    <div
      className={`relative w-[320px] overflow-hidden rounded-xl border bg-white transition-all duration-150 ${
        isDragging
          ? "border-[#1f6a39]/70 shadow-[0_18px_38px_rgba(31,106,57,0.35)]"
          : isHovered
            ? "border-[#2d7b42]/55 shadow-[0_14px_30px_rgba(45,123,66,0.24)]"
            : isEmphasized
              ? "border-[#2d7b42]/40 shadow-[0_12px_28px_rgba(45,123,66,0.16)]"
              : "border-[#174128]/18 shadow-[0_10px_26px_rgba(10,50,24,0.12)]"
      }`}
    >
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
          const relationEdgeIds = data.relationEdgeIdsByColumn[column.name] ?? [];
          const isRelationColumn = relationEdgeIds.length > 0;
          const isActiveRelationColumn =
            data.activeRelationEdgeId !== null &&
            data.activeRelationEdgeId !== undefined &&
            relationEdgeIds.includes(data.activeRelationEdgeId);
          const isHoveredRelationColumn =
            data.hoveredRelationEdgeId !== null &&
            data.hoveredRelationEdgeId !== undefined &&
            relationEdgeIds.includes(data.hoveredRelationEdgeId);
          const isInteractiveColumn = isRelationColumn || column.isPrimaryKey || column.isForeignKey;

          return (
            <div
              key={`${data.table.name}.${column.name}`}
              className="h-[22px] text-[11px]"
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
              <button
                type="button"
                className={`flex h-full w-full items-center justify-between rounded px-1 py-0.5 text-left ${
                  isRelationColumn ? "cursor-pointer" : "cursor-default"
                } ${
                  isActiveRelationColumn
                    ? "bg-[#d9efd5] text-[#1f6a39]"
                    : isHoveredRelationColumn
                      ? "bg-[#e6f3df] text-[#2d7b42]"
                      : isInteractiveColumn
                        ? "hover:bg-[#edf7e8]"
                        : "text-text-1"
                }`}
                onClick={(event) => {
                  if (!isRelationColumn) return;
                  event.stopPropagation();
                  data.onRelationColumnClick?.(relationEdgeIds);
                }}
                onMouseEnter={() => {
                  if (!isRelationColumn) return;
                  data.onRelationColumnHover?.(relationEdgeIds);
                }}
                onMouseLeave={() => data.onRelationColumnHoverEnd?.()}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {column.isPrimaryKey ? <KeyRound className="h-3 w-3 text-warning" /> : null}
                  {!column.isPrimaryKey && column.isForeignKey ? <Link2 className="h-3 w-3 text-accent" /> : null}
                  <span className="truncate">{column.name}</span>
                  {column.isPrimaryKey ? (
                    <span className="rounded bg-[#ffefcc] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] text-[#8d6a00]">
                      PK
                    </span>
                  ) : null}
                  {column.isForeignKey ? (
                    <span className="rounded bg-[#dff2e4] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] text-[#1f6a39]">
                      FK
                    </span>
                  ) : null}
                </span>
                <span className="truncate pl-2 font-mono text-text-3">{column.fullType ?? column.type}</span>
              </button>
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
  const positionsByTable = getRelationAwarePositions(schema.tables, degreeByTable, schema.relationships);

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

  const relationEdgeIdsByTableColumn = new Map<string, Map<string, string[]>>();

  const nodes: Node<TableNodeData>[] = sortedTables.map((table, index) => {
    const position = positionsByTable.get(table.name) ?? { x: (index % 3) * 390, y: Math.floor(index / 3) * 330 };
    return {
      id: table.name,
      type: "tableNode",
      position,
      data: {
        table,
        outgoingForeignKeyColumns: [...(outgoingByTable.get(table.name) ?? [])],
        incomingReferenceColumns: [...(incomingByTable.get(table.name) ?? [])],
        relationEdgeIdsByColumn: {},
      },
      draggable: true,
    };
  });

  const edges: Edge[] = schema.relationships.map((relationship, index) => {
    const edgeId = `rel-${relationship.fromTable}-${relationship.fromColumn}-${relationship.toTable}-${relationship.toColumn}-${index}`;
    const sourceTableMap = relationEdgeIdsByTableColumn.get(relationship.fromTable) ?? new Map<string, string[]>();
    const sourceEdgeIds = sourceTableMap.get(relationship.fromColumn) ?? [];
    sourceEdgeIds.push(edgeId);
    sourceTableMap.set(relationship.fromColumn, sourceEdgeIds);
    relationEdgeIdsByTableColumn.set(relationship.fromTable, sourceTableMap);

    const targetTableMap = relationEdgeIdsByTableColumn.get(relationship.toTable) ?? new Map<string, string[]>();
    const targetEdgeIds = targetTableMap.get(relationship.toColumn) ?? [];
    targetEdgeIds.push(edgeId);
    targetTableMap.set(relationship.toColumn, targetEdgeIds);
    relationEdgeIdsByTableColumn.set(relationship.toTable, targetTableMap);

    const sourceColumns = columnSetByTable.get(relationship.fromTable);
    const targetColumns = columnSetByTable.get(relationship.toTable);
    const sourceHandle = sourceColumns?.has(relationship.fromColumn)
      ? makeSourceHandleId(relationship.fromTable, relationship.fromColumn)
      : undefined;
    const targetHandle = targetColumns?.has(relationship.toColumn)
      ? makeTargetHandleId(relationship.toTable, relationship.toColumn)
      : undefined;

    return {
      id: edgeId,
      source: relationship.fromTable,
      target: relationship.toTable,
      sourceHandle,
      targetHandle,
      type: "smoothstep",
      pathOptions: { offset: 26, borderRadius: 14 },
      label: relationship.fromColumn,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#486856" },
      animated: false,
      style: { stroke: "#5f8a70", strokeWidth: 1.35, strokeDasharray: "4 6", opacity: 0.72 },
      labelStyle: { fontSize: 11, fill: "#355442", fontWeight: 600 },
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 6,
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.92, stroke: "#dbe9d4" },
    };
  });

  for (const node of nodes) {
    const tableColumnMap = relationEdgeIdsByTableColumn.get(node.id);
    if (!tableColumnMap) continue;
    const relationEdgeIdsByColumn: Record<string, string[]> = {};
    for (const [columnName, edgeIds] of tableColumnMap.entries()) {
      relationEdgeIdsByColumn[columnName] = edgeIds;
    }
    node.data = {
      ...node.data,
      relationEdgeIdsByColumn,
    };
  }

  return { nodes, edges };
}

export function ErDiagramModal({ open, onOpenChange, schema }: ErDiagramModalProps) {
  const graph = useMemo(() => buildGraph(schema), [schema]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TableNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedRelationEdgeId, setSelectedRelationEdgeId] = useState<string | null>(null);
  const [hoveredRelationEdgeId, setHoveredRelationEdgeId] = useState<string | null>(null);
  const [hoveredTableId, setHoveredTableId] = useState<string | null>(null);
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);

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

  const effectiveSelectedRelationEdgeId = useMemo(() => {
    if (!selectedRelationEdgeId) return null;
    const stillExists = edges.some((edge) => edge.id === selectedRelationEdgeId);
    return stillExists ? selectedRelationEdgeId : null;
  }, [edges, selectedRelationEdgeId]);

  const effectiveHoveredRelationEdgeId = useMemo(() => {
    if (!hoveredRelationEdgeId) return null;
    const stillExists = edges.some((edge) => edge.id === hoveredRelationEdgeId);
    return stillExists ? hoveredRelationEdgeId : null;
  }, [edges, hoveredRelationEdgeId]);

  const effectiveHoveredTableId = useMemo(() => {
    if (!hoveredTableId) return null;
    const stillExists = nodes.some((node) => node.id === hoveredTableId);
    return stillExists ? hoveredTableId : null;
  }, [hoveredTableId, nodes]);

  const effectiveDraggingTableId = useMemo(() => {
    if (!draggingTableId) return null;
    const stillExists = nodes.some((node) => node.id === draggingTableId);
    return stillExists ? draggingTableId : null;
  }, [draggingTableId, nodes]);

  const effectiveRelationEdgeId = effectiveSelectedRelationEdgeId ?? effectiveHoveredRelationEdgeId;
  const effectiveTableFocusId = effectiveSelectedTableId ?? effectiveHoveredTableId;

  const focusedTableIds = useMemo(() => {
    if (effectiveRelationEdgeId) {
      const relationEdge = edges.find((edge) => edge.id === effectiveRelationEdgeId);
      if (!relationEdge) return null;
      return new Set<string>([relationEdge.source, relationEdge.target]);
    }

    if (!effectiveTableFocusId) return null;

    const related = new Set<string>([effectiveTableFocusId]);
    for (const edge of edges) {
      if (edge.source === effectiveTableFocusId) {
        related.add(edge.target);
      }
      if (edge.target === effectiveTableFocusId) {
        related.add(edge.source);
      }
    }
    return related;
  }, [edges, effectiveRelationEdgeId, effectiveTableFocusId]);

  const renderedNodes = useMemo(() => {
    return nodes.map((node) => {
      const isFocused = focusedTableIds ? focusedTableIds.has(node.id) : true;
      return {
        ...node,
        data: {
          ...node.data,
          activeRelationEdgeId: effectiveRelationEdgeId,
          hoveredRelationEdgeId: effectiveHoveredRelationEdgeId,
          isEmphasized: isFocused,
          isHovered: node.id === effectiveHoveredTableId,
          isDragging: node.id === effectiveDraggingTableId,
          onRelationColumnClick: (edgeIds: string[]) => {
            const nextEdgeId = edgeIds[0];
            if (!nextEdgeId) return;
            setSelectedTableId(null);
            setSelectedRelationEdgeId(nextEdgeId);
          },
          onRelationColumnHover: (edgeIds: string[]) => {
            const nextEdgeId = edgeIds[0];
            if (!nextEdgeId) return;
            setHoveredRelationEdgeId(nextEdgeId);
          },
          onRelationColumnHoverEnd: () => setHoveredRelationEdgeId(null),
        },
        style: {
          ...node.style,
          opacity: isFocused ? 1 : 0.26,
          transition: "opacity 140ms ease",
        },
      };
    });
  }, [
    effectiveDraggingTableId,
    effectiveHoveredRelationEdgeId,
    effectiveHoveredTableId,
    effectiveRelationEdgeId,
    focusedTableIds,
    nodes,
  ]);

  const renderedEdges = useMemo(() => {
    return edges.map((edge) => {
      const isActiveRelationEdge = effectiveRelationEdgeId !== null && edge.id === effectiveRelationEdgeId;
      const isRelatedToFocus =
        effectiveRelationEdgeId === null &&
        effectiveTableFocusId !== null &&
        (edge.source === effectiveTableFocusId || edge.target === effectiveTableFocusId);

      if (effectiveRelationEdgeId) {
        if (isActiveRelationEdge) {
          return {
            ...edge,
            animated: true,
            label: edge.label,
            markerEnd: { type: MarkerType.ArrowClosed, color: "#1f6a39" },
            style: { ...edge.style, stroke: "#1f6a39", strokeWidth: 2.6, strokeDasharray: "10 8", opacity: 1 },
          };
        }

        return {
          ...edge,
          animated: false,
          label: undefined,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#adc2b2" },
          style: { ...edge.style, stroke: "#adc2b2", strokeWidth: 1.05, strokeDasharray: "3 7", opacity: 0.24 },
        };
      }

      if (!effectiveTableFocusId) {
        return {
          ...edge,
          animated: false,
          label: undefined,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#5f8a70" },
          style: { ...edge.style, stroke: "#5f8a70", strokeWidth: 1.35, strokeDasharray: "4 6", opacity: 0.72 },
        };
      }

      if (isRelatedToFocus) {
        return {
          ...edge,
          animated: true,
          label: edge.label,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#2d7b42" },
          style: { ...edge.style, stroke: "#2d7b42", strokeWidth: 2.35, strokeDasharray: "10 8", opacity: 1 },
        };
      }

      return {
        ...edge,
        animated: false,
        label: undefined,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#adc2b2" },
        style: { ...edge.style, stroke: "#adc2b2", strokeWidth: 1.05, strokeDasharray: "3 7", opacity: 0.26 },
      };
    });
  }, [edges, effectiveRelationEdgeId, effectiveTableFocusId]);

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
                onNodeClick={(_, node) => {
                  setSelectedRelationEdgeId(null);
                  setSelectedTableId(node.id);
                }}
                onNodeMouseEnter={(_, node) => setHoveredTableId(node.id)}
                onNodeMouseLeave={(_, node) => {
                  if (draggingTableId === node.id) return;
                  setHoveredTableId((current) => (current === node.id ? null : current));
                }}
                onNodeDragStart={(_, node) => {
                  setDraggingTableId(node.id);
                  setHoveredTableId(node.id);
                }}
                onNodeDragStop={(_, node) => {
                  setDraggingTableId(null);
                  setHoveredTableId(node.id);
                }}
                onEdgeMouseEnter={(_, edge) => setHoveredRelationEdgeId(edge.id)}
                onEdgeMouseLeave={() => setHoveredRelationEdgeId(null)}
                onEdgeClick={(_, edge) => {
                  setSelectedTableId(null);
                  setSelectedRelationEdgeId(edge.id);
                }}
                onPaneClick={() => {
                  setSelectedTableId(null);
                  setSelectedRelationEdgeId(null);
                }}
                defaultEdgeOptions={{
                  type: "smoothstep",
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
                      {effectiveRelationEdgeId
                        ? `Focused relation: ${effectiveRelationEdgeId}`
                        : effectiveSelectedTableId
                          ? `Focused: ${effectiveSelectedTableId}`
                          : "Click a table, key, or line to focus relationships"}
                    </p>
                    {effectiveSelectedTableId || effectiveRelationEdgeId ? (
                      <button
                        className="mt-1 text-[11px] font-semibold text-accent hover:underline"
                        onClick={() => {
                          setSelectedTableId(null);
                          setSelectedRelationEdgeId(null);
                        }}
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
