"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Database, KeyRound, Link2 } from "lucide-react";

import { TABLE_BODY_PADDING, TABLE_HEADER_HEIGHT, TABLE_ROW_HEIGHT, makeSourceHandleId, makeTargetHandleId } from "./graph";
import type { TableNode as TableNodeType } from "./types";

export function TableNode({ data }: NodeProps<TableNodeType>) {
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
            <div key={`${data.table.name}.${column.name}`} className="h-[22px] text-[11px]">
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

