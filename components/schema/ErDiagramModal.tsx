"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";

import { TableNode } from "@/components/schema/er-diagram/TableNode";
import { buildGraph } from "@/components/schema/er-diagram/graph";
import { getEffectiveId, getFocusedTableIds, renderEdges, renderNodes } from "@/components/schema/er-diagram/presentation";
import type { TableEdge, TableNode as TableNodeType } from "@/components/schema/er-diagram/types";
import { Dialog } from "@/components/ui/dialog";
import type { SchemaInfo } from "@/types";

import "@xyflow/react/dist/style.css";

interface ErDiagramModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: SchemaInfo | null;
}

export function ErDiagramModal({ open, onOpenChange, schema }: ErDiagramModalProps) {
  const graph = useMemo(() => buildGraph(schema), [schema]);
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TableEdge>([]);

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

  const effectiveSelectedTableId = useMemo(() => getEffectiveId(nodes, selectedTableId), [nodes, selectedTableId]);
  const effectiveSelectedRelationEdgeId = useMemo(
    () => getEffectiveId(edges, selectedRelationEdgeId),
    [edges, selectedRelationEdgeId],
  );
  const effectiveHoveredRelationEdgeId = useMemo(
    () => getEffectiveId(edges, hoveredRelationEdgeId),
    [edges, hoveredRelationEdgeId],
  );
  const effectiveHoveredTableId = useMemo(() => getEffectiveId(nodes, hoveredTableId), [hoveredTableId, nodes]);
  const effectiveDraggingTableId = useMemo(() => getEffectiveId(nodes, draggingTableId), [draggingTableId, nodes]);

  const effectiveRelationEdgeId = effectiveSelectedRelationEdgeId ?? effectiveHoveredRelationEdgeId;
  const effectiveTableFocusId = effectiveSelectedTableId ?? effectiveHoveredTableId;
  const focusedTableIds = useMemo(
    () => getFocusedTableIds(edges, effectiveRelationEdgeId, effectiveTableFocusId),
    [edges, effectiveRelationEdgeId, effectiveTableFocusId],
  );

  const renderedNodes = useMemo(
    () =>
      renderNodes({
        nodes,
        focusedTableIds,
        effectiveRelationEdgeId,
        effectiveHoveredRelationEdgeId,
        effectiveHoveredTableId,
        effectiveDraggingTableId,
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
      }),
    [
      effectiveDraggingTableId,
      effectiveHoveredRelationEdgeId,
      effectiveHoveredTableId,
      effectiveRelationEdgeId,
      focusedTableIds,
      nodes,
    ],
  );

  const renderedEdges = useMemo(
    () => renderEdges(edges, effectiveRelationEdgeId, effectiveTableFocusId),
    [edges, effectiveRelationEdgeId, effectiveTableFocusId],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      panelClassName="h-[92vh] max-h-[92vh] max-w-[92vw] overflow-hidden p-0 sm:max-w-[1280px]"
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
