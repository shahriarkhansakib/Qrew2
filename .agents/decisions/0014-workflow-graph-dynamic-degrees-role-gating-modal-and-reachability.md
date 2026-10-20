# ADR-0014: Workflow Studio Dynamic Node Degrees, 5-Color Hierarchy, Modal Gating, and BFS Path Reachability Architecture

- **Status**: Accepted
- **Date**: 2026-10-21
- **Scope**: Workflows, Visual Graph, PBAC, State Machine, BFS Reachability

---

## 1. Context & Problem Statement

Following initial workflow graph stabilization, usability and architectural refinements were required:

1. **Modal Edge Creation Leak**: The "Transitions & Role-Gating" tab previously listed all stages in the organization with checkboxes, allowing users to create edges from a flat checklist. Edge creation belongs strictly on the 2D visual canvas.
2. **Manual Boolean `isTerminal` Flaw**: Storing a manual boolean `isTerminal` caused state desynchronization. A stage's terminal nature is mathematically intrinsic to having zero outbound transitions ($\text{out-degree} = 0$).
3. **5-Tier Node Visual Hierarchy**: The workflow canvas lacked clear visual discrimination between system defaults, alternative entry stages, terminal completion stages, and active intermediate stages.
4. **Direct Edge vs Path Reachability Invariant**: The previous invariant enforced a rigid *direct edge* between `Created` and `Completed` (`Created -> Completed`), which broke real-world pipelines that route files through intermediate review/approval stages. The true requirement is **Graph Reachability** ($\text{Created} \rightsquigarrow \text{Completed}$ and $\forall \text{initial} \rightsquigarrow \text{terminal}$).

---

## 2. Decision & Architecture

### 2.1 Modal Edge Creation Gating & Focused Role PBAC
- **Scope**: The Stage Modal's "Transitions & Role-Gating" tab displays **only directly connected outgoing edges** (`node.transitions`).
- **Role Configuration**: Users configure `allowedRoleIds` for each existing edge.
- **Edge Disconnection**: An explicit `Disconnect` action allows removing an edge from inside the modal.
- **Canvas Exclusivity**: Edge creation is strictly confined to 3 canvas gestures:
  1. Click `+` on a node (creates child node + edge)
  2. Click `+` on an edge (splits edge and inserts node)
  3. The **Connect** tool in the toolbar (draws edge between two existing nodes)
- **Empty State**: Stages with 0 outgoing edges display an informative card explaining that the stage dynamically acts as a terminal stage.

### 2.2 Dynamic Node Degree & 5-Color Semantic Palette
Nodes are dynamically classified using in-degree and out-degree without manual boolean toggles:
1. **Default Initial (`Created`)**: Royal Indigo (`#6366f1`) — Primary entry point.
2. **Other Starting Nodes** ($in=0 \land out>0$): Vibrant Violet (`#8b5cf6`) — Alternative starting branches.
3. **Default Terminal (`Completed`)**: Signature Emerald (`#10b981`) — Primary goal completion stage.
4. **Other Terminal Nodes** ($in>0 \land out=0$): Teal / Mint (`#0d9488` / `#14b8a6`) or Rose (`#f43f5e` for negative termination like Cancelled/Rejected).
5. **Intermediate Nodes** ($in>0 \land out>0$): Sky Blue (`#3b82f6` or custom user color).
* *Unconnected Draft Nodes* ($in=0 \land out=0$): Neutral Slate (`#64748b` with dashed styling) to prevent false classification.

### 2.3 Directed Path Reachability (BFS Invariant)
- **Direct Edge Requirement Eradicated**: Pipelines no longer require a direct edge `Created -> Completed`.
- **Backend BFS Validation**: `PUT /api/project-statuses/:id/transitions` validates that:
  - $\text{Created} \rightsquigarrow \text{Completed}$ (A directed path connects `Created` to `Completed`).
  - Active starting nodes ($in=0 \land out>0$) must reach at least one terminal node ($out=0$).
- **Canvas Live Graph Health**: The canvas toolbar displays a live health indicator (`Workflow Valid` or `Path Broken: [Stage Name]`), providing real-time reachability feedback.

---

## 3. Consequences

### Positive
- Prevents accidental edge creation from modal checklists.
- Purely mathematical, self-synchronizing node classification based on DAG degrees.
- Rich 5-tier semantic color coding with instant visual recognition.
- Enables flexible multi-stage approval pipelines while guaranteeing graph reachability from start to finish.
