import { MarkerType } from "@xyflow/react";

import type { SchemaInfo, SchemaTable } from "@/types";

import type { TableEdge, TableNode } from "./types";

const TABLE_COLUMN_GAP = 430;
const TABLE_ROW_GAP = 270;
const COMPONENT_GAP = 170;

export const TABLE_HEADER_HEIGHT = 40;
export const TABLE_BODY_PADDING = 10;
export const TABLE_ROW_HEIGHT = 22;

export function makeSourceHandleId(tableName: string, columnName: string): string {
  return `${tableName}::${columnName}::source`;
}

export function makeTargetHandleId(tableName: string, columnName: string): string {
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
          x: depth * TABLE_COLUMN_GAP,
          y: currentY + rowIndex * TABLE_ROW_GAP,
        });
      });
    }

    currentY += componentMaxRows * TABLE_ROW_GAP + COMPONENT_GAP;
  }

  return positions;
}

export function buildGraph(schema: SchemaInfo | null): { nodes: TableNode[]; edges: TableEdge[] } {
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

  const nodes: TableNode[] = sortedTables.map((table, index) => {
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

  const edges: TableEdge[] = schema.relationships.map((relationship, index) => {
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

