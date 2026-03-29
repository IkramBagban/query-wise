import { MarkerType } from "@xyflow/react";

import type { TableEdge, TableNode } from "./types";

export function getEffectiveId<T extends { id: string }>(items: T[], id: string | null): string | null {
  if (!id) return null;
  const stillExists = items.some((item) => item.id === id);
  return stillExists ? id : null;
}

export function getFocusedTableIds(
  edges: TableEdge[],
  effectiveRelationEdgeId: string | null,
  effectiveTableFocusId: string | null,
): Set<string> | null {
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
}

type RenderNodesInput = {
  nodes: TableNode[];
  focusedTableIds: Set<string> | null;
  effectiveRelationEdgeId: string | null;
  effectiveHoveredRelationEdgeId: string | null;
  effectiveHoveredTableId: string | null;
  effectiveDraggingTableId: string | null;
  onRelationColumnClick: (edgeIds: string[]) => void;
  onRelationColumnHover: (edgeIds: string[]) => void;
  onRelationColumnHoverEnd: () => void;
};

export function renderNodes(input: RenderNodesInput): TableNode[] {
  return input.nodes.map((node) => {
    const isFocused = input.focusedTableIds ? input.focusedTableIds.has(node.id) : true;
    return {
      ...node,
      data: {
        ...node.data,
        activeRelationEdgeId: input.effectiveRelationEdgeId,
        hoveredRelationEdgeId: input.effectiveHoveredRelationEdgeId,
        isEmphasized: isFocused,
        isHovered: node.id === input.effectiveHoveredTableId,
        isDragging: node.id === input.effectiveDraggingTableId,
        onRelationColumnClick: input.onRelationColumnClick,
        onRelationColumnHover: input.onRelationColumnHover,
        onRelationColumnHoverEnd: input.onRelationColumnHoverEnd,
      },
      style: {
        ...node.style,
        opacity: isFocused ? 1 : 0.26,
        transition: "opacity 140ms ease",
      },
    };
  });
}

export function renderEdges(
  edges: TableEdge[],
  effectiveRelationEdgeId: string | null,
  effectiveTableFocusId: string | null,
): TableEdge[] {
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
}

