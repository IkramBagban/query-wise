import type { Edge, Node } from "@xyflow/react";

import type { SchemaTable } from "@/types";

export type TableNodeData = {
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

export type TableNode = Node<TableNodeData>;
export type TableEdge = Edge;

