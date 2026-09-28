"use client";

import {
  CheckCircle2,
  Flag,
  Link2,
  Minus,
  Pencil,
  Plus,
  Shield,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";

// --- Constants ---------------------------------------------------------------

const NODE_R = 28;
const NODE_D = NODE_R * 2;
const _LAYER_GAP = 150;
const NODE_GAP = 80;
const PAD = 70;
const _STEP = NODE_D + NODE_GAP; // vertical grid step size

// --- Types -------------------------------------------------------------------

interface Status {
  id: string;
  name: string;
  color: string;
  isInitial: boolean;
  isTerminal: boolean;
  isSystem: boolean;
  gridColumn?: number | null;
  gridRow?: number | null;
  transitions: { toStatusId: string }[];
  statusFields: { fieldId: string; isRequiredToEnter: boolean }[];
  createdAt: string | Date;
}

interface LayoutNode {
  status: Status;
  cx: number;
  cy: number;
  col: number;
  row: number;
}

// --- Layout: Bounding-Box Tree (Reingold-Tilford style) ----------------------
//
// Two passes:
//   Pass 1 (bottom-up):  compute the min/max relative track footprint for
//                        each node's entire subtree.
//   Pass 2 (top-down):   assign absolute tracks, nudging siblings apart
//                        only just enough so no bounding boxes collide.
//
// Children are DESIRED at offsets: 0, +1, -1, +2, -2, +3, -3, ...
// (The first child stays on the parent's track; extras alternate away.)

function computeLayout(statuses: Status[]): LayoutNode[] {
  if (!statuses || statuses.length === 0) return [];

  const ids = statuses.map((s) => s.id);
  const statusMap = Object.fromEntries(statuses.map((s) => [s.id, s]));

  // -- Build adjacency list --------------------------------------------------
  const adj: Record<string, string[]> = {};
  ids.forEach((id) => (adj[id] = []));
  statuses.forEach((s) =>
    (s.transitions ?? []).forEach((t) => {
      if (adj[s.id] && ids.includes(t.toStatusId) && t.toStatusId !== s.id)
        adj[s.id].push(t.toStatusId);
    }),
  );

  // -- Layer Assignment: Longest-Path from roots (stable under edge changes) -
  //
  // WHY longest-path and not shortest-path BFS?
  // Shortest-path: adding edge A→C pulls C to an earlier column.
  // Longest-path: layer[C] = max(parents)+1, so a new shallow parent can
  //   never decrease C's column. Node columns are STABLE when edges change.
  //
  // Two-pass:
  //   Pass A — tentative BFS (shortest) to classify forward vs back edges.
  //   Pass B — Kahn's topo sort on forward-only DAG, longest-path assignment.

  // -- Layer Assignment: Shortest-Path BFS ----------------------------------
  const inDeg: Record<string, number> = {};
  ids.forEach((id) => (inDeg[id] = 0));
  ids.forEach((id) => adj[id].forEach((tid) => (inDeg[tid] = (inDeg[tid] ?? 0) + 1)));

  const starts: string[] = statuses.filter((s) => s.isInitial).map((s) => s.id);
  if (starts.length === 0) ids.filter((id) => inDeg[id] === 0).forEach((id) => starts.push(id));
  if (starts.length === 0) starts.push(ids[0]);

  const layer: Record<string, number> = {};
  starts.forEach((id) => (layer[id] = 0));
  const bfsQ: string[] = [...starts];
  const bfsV = new Set<string>();
  let bfsH = 0;
  while (bfsH < bfsQ.length) {
    const cur = bfsQ[bfsH++];
    if (bfsV.has(cur)) continue;
    bfsV.add(cur);
    (adj[cur] ?? []).forEach((nxt) => {
      if (layer[nxt] === undefined) {
        layer[nxt] = (layer[cur] ?? 0) + 1;
        bfsQ.push(nxt);
      }
    });
  }
  let nextFree = Math.max(0, ...Object.values(layer)) + 1;
  ids.forEach((id) => {
    if (layer[id] === undefined) layer[id] = nextFree++;
  });

  // -- For bounding-box layout, only use forward edges ----------------------
  const fwdAdj: Record<string, string[]> = {};
  ids.forEach((id) => {
    fwdAdj[id] = (adj[id] ?? []).filter((nxt) => layer[nxt] > layer[id]);
    fwdAdj[id].sort(
      (a, b) =>
        new Date(statusMap[a].createdAt || 0).getTime() -
        new Date(statusMap[b].createdAt || 0).getTime(),
    );
  });

  // -- Build Primary Spanning Tree for Layout -------------------------------
  // A node can have multiple forward parents (it's a DAG).
  // We extract a primary spanning tree for bounding box calculation.
  // IMPORTANT: Sort children by createdAt so the tree structure is stable
  // when new connections are added (adding a connection adds a transition but
  // must never reorder existing children and thus never change positions).
  const treeAdj: Record<string, string[]> = {};
  ids.forEach((id) => (treeAdj[id] = []));
  const treeVisited = new Set<string>();
  starts.forEach((id) => treeVisited.add(id));
  const treeQueue = [...starts];
  let treeHead = 0;
  while (treeHead < treeQueue.length) {
    const cur = treeQueue[treeHead++];
    // Sort forward children by createdAt before spanning-tree traversal
    // so the spanning tree structure never changes when new edges are added.
    const sortedFwd = [...(fwdAdj[cur] ?? [])].sort(
      (a, b) =>
        new Date(statusMap[a].createdAt || 0).getTime() -
        new Date(statusMap[b].createdAt || 0).getTime(),
    );
    sortedFwd.forEach((nxt) => {
      if (!treeVisited.has(nxt)) {
        treeVisited.add(nxt);
        treeQueue.push(nxt);
        treeAdj[cur].push(nxt);
      }
    });
  }

  // -- Pass 1: Bottom-Up footprint calculation -------------------------------
  // footprint[id] = { min, max } relative to this node's own track = 0
  const footprint: Record<string, { min: number; max: number }> = {};

  // Process in reverse tree order (leaves first, roots last)
  const revOrder = [...treeQueue].reverse();
  ids.filter((id) => !revOrder.includes(id)).forEach((id) => revOrder.push(id));

  revOrder.forEach((id) => {
    const children = treeAdj[id] ?? [];
    if (children.length === 0) {
      footprint[id] = { min: 0, max: 0 };
      return;
    }

    let minF = 0,
      maxF = 0;
    // Sentinel: -1/+1 means "nothing placed yet" so first child at offset 0
    // stays on the parent track rather than being pushed off by 1.
    let maxPositive = -1;
    let minNegative = 1;

    children.forEach((childId, i) => {
      const cf = footprint[childId] ?? { min: 0, max: 0 };
      let desiredOffset: number;
      if (i === 0) {
        desiredOffset = 0;
      } else {
        const rank = Math.ceil(i / 2);
        desiredOffset = i % 2 !== 0 ? rank : -rank;
      }

      let offset = desiredOffset;
      if (desiredOffset >= 0) {
        const needed = maxPositive - cf.min + 1;
        offset = Math.max(desiredOffset, needed);
        maxPositive = offset + cf.max;
        minNegative = Math.min(minNegative, offset + cf.min);
      } else {
        const needed = minNegative - cf.max - 1;
        offset = Math.min(desiredOffset, needed);
        minNegative = offset + cf.min;
        maxPositive = Math.max(maxPositive, offset + cf.max);
      }

      minF = Math.min(minF, offset + cf.min);
      maxF = Math.max(maxF, offset + cf.max);
    });

    footprint[id] = { min: minF, max: maxF };
  });

  // -- Pass 2: Top-Down absolute track assignment ----------------------------
  const trackMap: Record<string, number> = {};

  let rootMaxPositive = 0;
  let rootMinNegative = 0;

  starts
    .sort(
      (a, b) =>
        new Date(statusMap[a].createdAt || 0).getTime() -
        new Date(statusMap[b].createdAt || 0).getTime(),
    )
    .forEach((id, i) => {
      if (i === 0) {
        trackMap[id] = 0;
        const f = footprint[id] ?? { min: 0, max: 0 };
        rootMaxPositive = f.max;
        rootMinNegative = f.min;
      } else {
        const rank = Math.ceil(i / 2);
        const f = footprint[id] ?? { min: 0, max: 0 };
        if (i % 2 !== 0) {
          const needed = rootMaxPositive - f.min + 1;
          trackMap[id] = Math.max(rank, needed);
          rootMaxPositive = trackMap[id] + f.max;
        } else {
          const needed = rootMinNegative - f.max - 1;
          trackMap[id] = Math.min(-rank, needed);
          rootMinNegative = trackMap[id] + f.min;
        }
      }
    });

  const visitedTD = new Set<string>();
  const tdQueue = [...starts.filter((id) => trackMap[id] !== undefined)];
  let tdHead = 0;
  while (tdHead < tdQueue.length) {
    const id = tdQueue[tdHead++];
    if (visitedTD.has(id)) continue;
    visitedTD.add(id);

    const parentTrack = trackMap[id] ?? 0;
    const children = treeAdj[id] ?? [];

    // Sentinel: parentTrack-1 / parentTrack+1 means "nothing placed yet".
    let maxPositive = parentTrack - 1;
    let minNegative = parentTrack + 1;

    children.forEach((childId, i) => {
      if (trackMap[childId] !== undefined) {
        tdQueue.push(childId);
        return;
      }
      const cf = footprint[childId] ?? { min: 0, max: 0 };
      let desiredOffset: number;
      if (i === 0) {
        desiredOffset = 0;
      } else {
        const rank = Math.ceil(i / 2);
        desiredOffset = i % 2 !== 0 ? rank : -rank;
      }

      let offset = desiredOffset;
      if (i === 0) {
        offset = 0;
        maxPositive = parentTrack + offset + cf.max;
        minNegative = parentTrack + offset + cf.min;
      } else if (desiredOffset >= 0) {
        const needed = maxPositive - parentTrack - cf.min + 1;
        offset = Math.max(desiredOffset, needed);
        maxPositive = parentTrack + offset + cf.max;
        minNegative = Math.min(minNegative, parentTrack + offset + cf.min);
      } else {
        const needed = minNegative - parentTrack - cf.max - 1;
        offset = Math.min(desiredOffset, needed);
        minNegative = parentTrack + offset + cf.min;
        maxPositive = Math.max(maxPositive, parentTrack + offset + cf.max);
      }

      trackMap[childId] = parentTrack + offset;
      tdQueue.push(childId);
    });
  }

  // Any remaining unplaced nodes
  let fallback = Math.max(0, ...Object.values(trackMap)) + 1;
  ids.forEach((id) => {
    if (trackMap[id] === undefined) {
      trackMap[id] = fallback++;
    }
  });

  // -- Compute final pixel coordinates based on Grid Grid positions ---
  const nodes = statuses.map((s) => {
    const computedCol = layer[s.id] ?? 0;
    const computedRow = trackMap[s.id] ?? 0;
    return {
      status: s,
      col: s.gridColumn ?? computedCol,
      row: s.gridRow ?? computedRow,
      cx: 0,
      cy: 0,
    };
  });

  const allRows = nodes.map((n) => n.row);
  const minRow = allRows.length > 0 ? Math.min(0, ...allRows) : 0;
  const maxRow = allRows.length > 0 ? Math.max(0, ...allRows) : 0;

  const totalH = (maxRow - minRow) * 136 + 56;
  const canvasMinH = 400;
  const verticalOffset = totalH < canvasMinH ? (canvasMinH - totalH) / 2 : PAD;

  nodes.forEach((n) => {
    n.cx = PAD + NODE_R + n.col * 206;
    n.cy = (n.row - minRow) * 136 + verticalOffset + NODE_R;
  });

  return nodes;
}

// --- Edge Path ---------------------------------------------------------------
// Adaptive Cubic Bezier routing to avoid overlapping nodes and edges.

function edgePath(
  from: LayoutNode,
  to: LayoutNode,
  isBidirectional: boolean,
): { d: string; mx: number; my: number } {
  const { cx: x1, cy: y1 } = from;
  const { cx: x2, cy: y2 } = to;

  // Self-loop guard
  if (from.status.id === to.status.id) {
    const top = y1 - NODE_R - 24;
    return {
      d: `M${x1 - 10},${y1 - NODE_R} C${x1 - 55},${top - 22} ${x1 + 55},${top - 22} ${x1 + 10},${y1 - NODE_R}`,
      mx: x1,
      my: top - 32,
    };
  }

  const isSameCol = from.col === to.col;
  const isMultiRow =
    Math.abs(from.row - to.row) > 1 || (isSameCol && Math.abs(from.row - to.row) >= 1);
  const isBackwards = to.col < from.col;

  let cp1x = x1 + 100;
  let cp1y = y1;
  let cp2x = x2 - 100;
  let cp2y = y2;

  if (isSameCol || isMultiRow) {
    const deflection = isBidirectional ? 140 : 100;
    cp1x = x1 + deflection;
    cp2x = x2 - deflection;
  }

  if (isBackwards && !isSameCol) {
    cp1x = x1 + 80;
    cp1y = y1 + 140;
    cp2x = x2 - 80;
    cp2y = y2 + 140;
  }

  // Calculate curve midpoint (t=0.5) for bezier
  const mx = 0.125 * x1 + 0.375 * cp1x + 0.375 * cp2x + 0.125 * x2;
  const my = 0.125 * y1 + 0.375 * cp1y + 0.375 * cp2y + 0.125 * y2;

  // Precise boundary points
  const d1 = Math.hypot(cp1x - x1, cp1y - y1) || 1;
  const startX = x1 + (NODE_R * (cp1x - x1)) / d1;
  const startY = y1 + (NODE_R * (cp1y - y1)) / d1;

  const d2 = Math.hypot(x2 - cp2x, y2 - cp2y) || 1;
  const endX = x2 - (NODE_R * (x2 - cp2x)) / d2;
  const endY = y2 - (NODE_R * (y2 - cp2y)) / d2;

  return { d: `M ${startX},${startY} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${endX},${endY}`, mx, my };
}

// --- Node Styling -------------------------------------------------------------

function nodeStyle(s: Status) {
  if (s.isInitial)
    return { ring: "#6366f1", dot: "#6366f1", glow: "rgba(99,102,241,0.18)", label: "#818cf8" };
  const isDynamicTerminal = !s.isInitial && s.transitions?.length === 0;
  if (isDynamicTerminal) {
    const neg = s.name.toLowerCase().match(/reject|cancel|fail|lost|declin|abort/);
    if (neg)
      return { ring: "#f43f5e", dot: "#f43f5e", glow: "rgba(244,63,94,0.18)", label: "#fb7185" };
    return { ring: "#10b981", dot: "#10b981", glow: "rgba(16,185,129,0.18)", label: "#34d399" };
  }
  const base = s.color && s.color !== "#94a3b8" ? s.color : "#64748b";
  return { ring: base, dot: base, glow: `${base}30`, label: base };
}

// --- WorkflowNodeCircle -----------------------------------------------

function WorkflowNodeCircle({
  node,
  onClick,
  onDelete,
  onBranch,
  isConnectSource,
  isConnectTarget,
  connectMode,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  node: LayoutNode;
  onClick: () => void;
  onDelete: () => void;
  onBranch: () => void;
  isConnectSource: boolean;
  isConnectTarget: boolean;
  connectMode: boolean;
  onDragStart?: (e: React.PointerEvent, id: string, cx: number, cy: number) => void;
  onDragMove?: (e: React.PointerEvent) => void;
  onDragEnd?: (e: React.PointerEvent) => void;
}) {
  const s = node.status;
  const style = nodeStyle(s);

  let ringColor = style.ring;
  let ringWidth = "border-2";
  let extraShadow = `0 0 0 4px ${style.glow}`;

  if (isConnectSource) {
    ringColor = "#6366f1";
    ringWidth = "border-[3px]";
    extraShadow = "0 0 0 6px rgba(99,102,241,0.3)";
  } else if (isConnectTarget && connectMode) {
    ringColor = "#f59e0b";
    ringWidth = "border-[3px]";
    extraShadow = "0 0 0 6px rgba(245,158,11,0.3)";
  }

  // Short label to show inside the circle (up to 4 chars)
  const shortLabel = s.name.length <= 4 ? s.name : `${s.name.slice(0, 3)}…`;

  const isDynamicTerminal = !s.isInitial && s.transitions?.length === 0;
  const isNegTerminal =
    isDynamicTerminal && s.name.toLowerCase().match(/reject|cancel|fail|lost|declin|abort|close/);

  return (
    <div
      onPointerDown={(e) => onDragStart?.(e, node.status.id, node.cx, node.cy)}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      style={{
        position: "absolute",
        left: node.cx - NODE_R,
        top: node.cy - NODE_R,
        width: NODE_D,
        height: NODE_D,
        zIndex: 20,
      }}
      className="group cursor-pointer select-none"
    >
      <div
        className={`w-full h-full rounded-full bg-background flex items-center justify-center transition-all duration-200 group-hover:scale-110 relative ${ringWidth}`}
        style={{
          borderColor: ringColor,
          boxShadow: extraShadow,
        }}
      >
        {/* Inner content: icon for special nodes, abbreviated name otherwise */}
        {isDynamicTerminal && !isNegTerminal && (
          <CheckCircle2 className="w-4 h-4" style={{ color: style.dot }} />
        )}
        {isDynamicTerminal && isNegTerminal && (
          <XCircle className="w-4 h-4" style={{ color: style.dot }} />
        )}
        {!isDynamicTerminal && (
          <span
            className="text-[9px] font-bold leading-none text-center pointer-events-none select-none"
            style={{ color: style.dot }}
          >
            {shortLabel}
          </span>
        )}

        {/* Hover tooltip: full name */}
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
          <div className="bg-popover border shadow-lg rounded-md px-2.5 py-1.5 whitespace-nowrap">
            <span className="text-xs font-bold text-foreground">{s.name}</span>
          </div>
          <div className="w-2 h-2 bg-popover border-b border-r rotate-45 mx-auto -mt-1 border-t-0 border-l-0" />
        </div>

        {!connectMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="absolute -top-2 -left-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 bg-background border border-slate-400 text-slate-500 rounded-full shadow-sm hover:bg-slate-50 hover:text-slate-800"
            title="Configure stage"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
        )}

        {!s.isSystem && !connectMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 bg-background border border-red-400 text-red-500 rounded-full shadow-sm hover:bg-red-50"
            title="Delete stage"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        )}
        {!connectMode && !isDynamicTerminal && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBranch();
            }}
            className="absolute -bottom-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 bg-background border border-indigo-400 text-indigo-500 rounded-full shadow-sm hover:bg-indigo-50"
            title="Add a branch from this stage"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      {/* Label below the circle */}
      <div
        className="absolute w-max max-w-[120px] text-center pointer-events-none"
        style={{ top: NODE_D + 8, left: "50%", transform: "translateX(-50%)" }}
      >
        <span
          className="text-[11px] font-semibold leading-tight block truncate"
          style={{ color: style.label }}
        >
          {s.name}
        </span>
        <div className="flex items-center justify-center gap-1 mt-0.5">
          {s.isInitial && <Flag className="h-2.5 w-2.5 text-indigo-400" />}
          {isDynamicTerminal && (
            <CheckCircle2 className="h-2.5 w-2.5 opacity-60" style={{ color: style.ring }} />
          )}
          {s.isSystem && <Shield className="h-2.5 w-2.5 text-violet-400 opacity-60" />}
        </div>
      </div>
    </div>
  );
}

// --- Main Graph ---------------------------------------------------------------

export function WorkflowGraph({
  statuses,
  disabled,
  onEditNode,
  onAddBetween,
  onDeleteNode,
  onAddBranch,
  onConnectNodes,
  onDeleteEdge,
  onMoveNode,
  onSwapNodes,
}: {
  statuses: Status[];
  customFields: any[];
  disabled: boolean;
  onEditNode: (status: Status) => void;
  onAddBetween: (fromId: string, toId: string) => void;
  onDeleteNode: (id: string) => void;
  onAddBranch: (id: string) => void;
  onConnectNodes: (fromId: string, toId: string) => void;
  onDeleteEdge: (fromId: string, toId: string) => void;
  onMoveNode?: (id: string, col: number, row: number) => void;
  onSwapNodes?: (
    sourceId: string,
    targetId: string,
    targetCol: number,
    targetRow: number,
    sourceCol: number,
    sourceRow: number,
  ) => void;
}) {
  const [dragState, setDragState] = useState<{
    id: string;
    pointerStartX: number;
    pointerStartY: number;
    nodeStartX: number;
    nodeStartY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [connectState, setConnectState] = useState<null | "source" | string>(null);
  const isConnectMode = connectState !== null;
  const connectSourceId = connectState !== null && connectState !== "source" ? connectState : null;

  const layoutNodes = computeLayout(statuses).map((n) => {
    if (dragState && dragState.id === n.status.id) {
      return { ...n, cx: dragState.currentX, cy: dragState.currentY };
    }
    return n;
  });
  const nodeMap = Object.fromEntries(layoutNodes.map((n) => [n.status.id, n]));

  const canvasW =
    layoutNodes.length > 0 ? Math.max(...layoutNodes.map((n) => n.cx)) + NODE_R + PAD + 200 : 600;
  const canvasH =
    layoutNodes.length > 0
      ? Math.max(...layoutNodes.map((n) => n.cy)) +
        Math.abs(Math.min(...layoutNodes.map((n) => n.cy))) +
        NODE_R +
        PAD +
        200
      : 400;

  const [zoom, setZoom] = useState(1);
  const minRow = layoutNodes.length > 0 ? Math.min(...layoutNodes.map((n) => n.row)) : 0;

  let y0 = PAD + NODE_R;
  if (layoutNodes.length > 0) {
    const row0Node = layoutNodes.find((n) => n.row === 0) || layoutNodes[0];
    y0 = row0Node.cy - row0Node.row * 136;
  }

  // Create abundant headers to cover a massive scrolling canvas
  const colHeaders = Array.from({ length: 40 }, (_, i) => i - 5);
  const rowHeaders = Array.from({ length: 40 }, (_, i) => i - 15);

  if (statuses.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[500px] border-2 border-dashed rounded-xl text-muted-foreground text-sm">
        No workflow stages configured yet. Add a stage to begin.
      </div>
    );
  }

  const edges = layoutNodes.flatMap((fromNode) =>
    (fromNode.status.transitions ?? []).flatMap((t) => {
      const toNode = nodeMap[t.toStatusId];
      // Skip self-loops
      if (!toNode || toNode.status.id === fromNode.status.id) return [];
      return [{ fromNode, toNode, edgeId: `${fromNode.status.id}->${t.toStatusId}` }];
    }),
  );

  const edgeData = edges.map(({ fromNode, toNode, edgeId }) => {
    const isBidirectional = edges.some(
      (e) => e.fromNode.status.id === toNode.status.id && e.toNode.status.id === fromNode.status.id,
    );
    const { d, mx, my } = edgePath(fromNode, toNode, isBidirectional);
    return { fromNode, toNode, edgeId, d, mx, my };
  });

  const handlePointerDown = (e: React.PointerEvent, id: string, nodeCx: number, nodeCy: number) => {
    if (isConnectMode || disabled) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      id,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      nodeStartX: nodeCx,
      nodeStartY: nodeCy,
      currentX: nodeCx,
      currentY: nodeCy,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;
    const deltaX = (e.clientX - dragState.pointerStartX) / zoom;
    const deltaY = (e.clientY - dragState.pointerStartY) / zoom;
    setDragState((prev) =>
      prev
        ? { ...prev, currentX: prev.nodeStartX + deltaX, currentY: prev.nodeStartY + deltaY }
        : null,
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragState) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    const allRows = layoutNodes.map((n) => n.row);
    const minRow = allRows.length > 0 ? Math.min(0, ...allRows) : 0;
    const maxRow = allRows.length > 0 ? Math.max(0, ...allRows) : 0;
    const totalH = (maxRow - minRow) * 136 + 56;
    const canvasMinH = 400;
    const verticalOffset = totalH < canvasMinH ? (canvasMinH - totalH) / 2 : PAD;

    const newCol = Math.max(0, Math.round((dragState.currentX - PAD - NODE_R) / 206));
    const newRow = Math.round((dragState.currentY - verticalOffset - NODE_R) / 136) + minRow;

    const collidedNode = layoutNodes.find(
      (n) => n.col === newCol && n.row === newRow && n.status.id !== dragState.id,
    );

    if (collidedNode && onSwapNodes) {
      const sourceLayoutNode = layoutNodes.find((n) => n.status.id === dragState.id);
      onSwapNodes(
        dragState.id,
        collidedNode.status.id,
        collidedNode.col,
        collidedNode.row,
        sourceLayoutNode ? sourceLayoutNode.col : 0,
        sourceLayoutNode ? sourceLayoutNode.row : 0,
      );
    } else if (onMoveNode) {
      onMoveNode(dragState.id, newCol, newRow);
    }

    setDragState(null);
  };
  const handleNodeClick = (node: LayoutNode) => {
    if (connectState === "source") {
      // Guard: terminal node cannot be a source
      if (node.status.isTerminal) return;
      setConnectState(node.status.id);
    } else if (connectSourceId !== null) {
      // Guard: cannot connect TO the initial node
      if (node.status.isInitial) return;
      // Guard: no direct self-loop
      if (connectSourceId === node.status.id) {
        setConnectState(null);
        return;
      }
      onConnectNodes(connectSourceId, node.status.id);
      setConnectState(null);
    } else if (!disabled) {
      onEditNode(node.status);
    }
  };

  return (
    <div
      className={`relative rounded-xl border ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      style={{
        minHeight: "calc(100vh - 240px)",
        minWidth: "100%",
        overflow: "auto",
        backgroundColor: "hsl(var(--background))",
      }}
    >
      {/* Zoom Controls */}
      <div className="absolute bottom-4 right-4 z-50 flex flex-col gap-1 bg-background border shadow-sm rounded-md p-1">
        <button
          onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="text-[10px] text-center text-muted-foreground w-6 font-mono select-none">
          {Math.round(zoom * 100)}%
        </div>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
      {isConnectMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full text-sm font-medium shadow-lg">
          <Link2 className="h-4 w-4 shrink-0" />
          {connectState === "source"
            ? "Select the source node"
            : "Now click the target node to connect"}
          <button
            onClick={() => setConnectState(null)}
            className="ml-1 hover:text-indigo-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <button
        onClick={() => setConnectState(isConnectMode ? null : "source")}
        className={`absolute top-3 right-3 z-40 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
          isConnectMode
            ? "bg-indigo-600 text-white border-indigo-700"
            : "bg-background text-muted-foreground border-muted-foreground/30 hover:border-primary hover:text-primary"
        }`}
      >
        <Link2 className="h-3 w-3" />
        {isConnectMode ? "Cancel" : "Connect"}
      </button>

      {/* Scaling Container */}
      <div
        style={{
          width: Math.max(canvasW, 1200) * zoom,
          height: Math.max(canvasH, 800) * zoom,
          position: "relative",
        }}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "0 0",
            width: "100%",
            height: "100%",
            position: "absolute",
          }}
        >
          <svg
            className="absolute inset-0 pointer-events-none"
            width="100%"
            height="100%"
            style={{ overflow: "visible" }}
          >
            <defs>
              {/* Default arrowhead — slate */}
              <marker
                id="wf-arr"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0,0.5 L0,7.5 L8,4 z" fill="#64748b" />
              </marker>
              {/* Hover arrowhead — indigo */}
              <marker
                id="wf-arr-h"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0,0.5 L0,7.5 L8,4 z" fill="#818cf8" />
              </marker>
              {/* Start dot marker — amber */}
              <marker
                id="wf-dot"
                markerWidth="8"
                markerHeight="8"
                refX="4"
                refY="4"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <circle cx="4" cy="4" r="3" fill="#f59e0b" />
              </marker>
              {/* Start dot marker — indigo (hover) */}
              <marker
                id="wf-dot-h"
                markerWidth="8"
                markerHeight="8"
                refX="4"
                refY="4"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <circle cx="4" cy="4" r="3" fill="#818cf8" />
              </marker>
              <pattern
                id="gridPattern"
                width="206"
                height="136"
                patternUnits="userSpaceOnUse"
                x={PAD + NODE_R - 103}
                y={y0 - 68}
              >
                <rect
                  width="206"
                  height="136"
                  fill="transparent"
                  stroke="#64748b"
                  strokeOpacity="0.25"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              </pattern>
            </defs>

            {/* Infinite Grid Background */}
            <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#gridPattern)" />

            {/* Grid Headers */}
            {colHeaders.map((c) => (
              <text
                key={`col-lbl-${c}`}
                x={98 + c * 206}
                y={y0 + minRow * 136 - 75}
                fill="#64748b"
                fontSize="12"
                fontWeight="600"
                textAnchor="middle"
                opacity="0.8"
              >
                Col {c}
              </text>
            ))}
            {rowHeaders.map((t) => (
              <text
                key={`row-lbl-${t}`}
                x={98 - 95}
                y={y0 + t * 136 + 4}
                fill="#64748b"
                fontSize="12"
                fontWeight="600"
                textAnchor="start"
                opacity="0.8"
              >
                Row {t}
              </text>
            ))}

            {edgeData.map(({ edgeId, d }) => {
              const isHovered = hoveredEdge === edgeId;
              return (
                <g key={edgeId}>
                  {/* Wide transparent hit area for hover */}
                  <path
                    d={d}
                    stroke="transparent"
                    strokeWidth={22}
                    fill="none"
                    className="pointer-events-auto cursor-pointer"
                    onMouseEnter={() => setHoveredEdge(edgeId)}
                    onMouseLeave={() => setHoveredEdge(null)}
                  />
                  {/* Visible stroke with start dot + end arrowhead */}
                  <path
                    d={d}
                    stroke={isHovered ? "#818cf8" : "#64748b"}
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    fill="none"
                    markerStart={isHovered ? "url(#wf-dot-h)" : "url(#wf-dot)"}
                    markerEnd={isHovered ? "url(#wf-arr-h)" : "url(#wf-arr)"}
                    className="transition-all duration-150"
                  />
                </g>
              );
            })}
          </svg>

          {!isConnectMode &&
            edgeData.map(({ fromNode, toNode, edgeId, mx, my }) => {
              const isHovered = hoveredEdge === edgeId;
              return (
                <div
                  key={`edge-btns-${edgeId}`}
                  style={{ position: "absolute", left: mx - 25, top: my - 11, zIndex: 30 }}
                  onMouseEnter={() => setHoveredEdge(edgeId)}
                  onMouseLeave={() => setHoveredEdge(null)}
                  className="flex gap-1"
                >
                  <button
                    onClick={() => onAddBetween(fromNode.status.id, toNode.status.id)}
                    className={`w-[22px] h-[22px] rounded-sm border-2 bg-background flex items-center justify-center transition-all duration-150 ${
                      isHovered
                        ? "opacity-100 border-indigo-500 text-indigo-500 shadow-md scale-110"
                        : "opacity-0 border-slate-400 text-slate-400"
                    }`}
                    title={`Insert stage between ${fromNode.status.name} and ${toNode.status.name}`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  {(!fromNode.status.isInitial || !toNode.status.isSystem) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteEdge(fromNode.status.id, toNode.status.id);
                      }}
                      className={`w-[22px] h-[22px] rounded-sm border-2 bg-background flex items-center justify-center transition-all duration-150 ${
                        isHovered
                          ? "opacity-100 border-red-400 text-red-500 shadow-md hover:bg-red-50 scale-110"
                          : "opacity-0 border-slate-400 text-slate-400"
                      }`}
                      title={`Delete connection ${fromNode.status.name} to ${toNode.status.name}`}
                    >
                      <X className="h-3 w-3 stroke-[3]" />
                    </button>
                  )}
                </div>
              );
            })}

          {layoutNodes.map((node) => (
            <WorkflowNodeCircle
              key={node.status.id}
              node={node}
              onClick={() => handleNodeClick(node)}
              onDelete={() => onDeleteNode(node.status.id)}
              onBranch={() => onAddBranch(node.status.id)}
              isConnectSource={connectSourceId === node.status.id}
              isConnectTarget={connectSourceId !== null && connectSourceId !== node.status.id}
              connectMode={isConnectMode}
              onDragStart={handlePointerDown}
              onDragMove={handlePointerMove}
              onDragEnd={handlePointerUp}
            />
          ))}
        </div>
      </div>

      <div className="absolute bottom-3 left-4 flex items-center gap-4 text-[10px] text-muted-foreground opacity-70 pointer-events-none z-40">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-indigo-500 inline-block" />
          Initial stage
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-primary inline-block" />
          Terminal stage
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm border border-muted-foreground/50 text-center leading-3 text-[9px]">
            +
          </span>
          Hover edge to insert
        </span>
      </div>
    </div>
  );
}
