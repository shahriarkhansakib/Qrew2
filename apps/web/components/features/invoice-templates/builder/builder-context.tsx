"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { getCircularDependencyTokens, type TokenMap } from "@/lib/formula-evaluator";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A "selected cell" is the value cell of a row in the table.
 * Clicking the value cell opens the formula bar for editing.
 */
export type SelectedCell = {
  // ── Routing ───────────────────────────────────────────────────────────────
  templateId: string;
  sectionId: string;
  rowId: string;
  /** Full row object — needed to PATCH the row atomically. */
  row: any;
  /** Charge ID if this cell represents a charge. */
  chargeId?: string;
  /** True if this is a section charge (has no parent row). */
  isSectionCharge?: boolean;

  // ── Display ───────────────────────────────────────────────────────────────
  /** Human-readable breadcrumb shown on the left side of the formula bar.
   *  e.g. "Port Dues" */
  breadcrumb: string;

  // ── Current value ─────────────────────────────────────────────────────────
  /** 'normal' → initialValue field.  'formula' → formula field. */
  valueType: "normal" | "formula";
  /**
   * What shows in the formula bar input:
   *  - normal type: "1000"
   *  - formula type: "= PORT_DUES * 0.1"  (leading = is cosmetic)
   */
  currentInput: string;
  /** The token of the specific cell being edited (used to prevent self-referencing) */
  token?: string;
};

// ─── Context ──────────────────────────────────────────────────────────────────

export type ExternalTokens = {
  global: Set<string>;
  template: Set<string>;
  file: Set<string>;
  category: Set<string>;
};

type BuilderContextValue = {
  selectedCell: SelectedCell | null;
  setSelectedCell: (cell: SelectedCell | null) => void;
  /** Live token map — updated by the workspace whenever sections data changes. */
  tokenMap: TokenMap;
  setTokenMap: (map: TokenMap) => void;
  sections: any[];
  setSections?: (sections: any[]) => void;
  externalTokens: ExternalTokens;
  setExternalTokens?: (tokens: ExternalTokens) => void;
  hiddenTokens: Set<string>;
  invalidTokens: Set<string>;
  tokenDisabledReasons: Map<string, string>;
  getTokenDisabledReason: (token: string) => string | undefined;
  tokenPoolOpen: boolean;
  apiBasePath: string;
  mode: "template" | "draft" | "preview" | "fill";
  invalidateKey: readonly string[];
  validationErrors?: any[];
  clipboardToken: string | null;
  setClipboardToken: (token: string | null) => void;
  getTokenColor: (token: string) => string;
};

const DEFAULT_EXTERNAL_TOKENS: ExternalTokens = {
  global: new Set(),
  template: new Set(),
  file: new Set(),
  category: new Set(),
};

const BuilderContext = createContext<BuilderContextValue>({
  selectedCell: null,
  setSelectedCell: () => {},
  tokenMap: {},
  setTokenMap: () => {},
  sections: [],
  externalTokens: DEFAULT_EXTERNAL_TOKENS,
  setExternalTokens: () => {},
  hiddenTokens: new Set(),
  invalidTokens: new Set(),
  tokenDisabledReasons: new Map(),
  getTokenDisabledReason: () => undefined,
  tokenPoolOpen: false,
  apiBasePath: "",
  mode: "template",
  invalidateKey: [],
  clipboardToken: null,
  setClipboardToken: () => {},
  getTokenColor: () => "text-slate-400",
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BuilderProvider({
  tokenPoolOpen = false,
  apiBasePath,
  mode = "template",
  invalidateKey,
  validationErrors = [],
  children,
}: {
  templateId?: string;
  draftId?: string;
  tokenPoolOpen?: boolean;
  apiBasePath: string;
  mode?: "template" | "draft" | "preview" | "fill";
  invalidateKey: readonly string[];
  validationErrors?: any[];
  children: React.ReactNode;
}) {
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [tokenMap, setTokenMap] = useState<TokenMap>({});
  const [sections, setSections] = useState<any[]>([]);
  const [clipboardToken, setClipboardToken] = useState<string | null>(null);
  const [externalTokens, setExternalTokens] = useState<ExternalTokens>(DEFAULT_EXTERNAL_TOKENS);

  const tokenTypes = useMemo(() => {
    const rowBases = new Set<string>();
    const rowChargeTotals = new Set<string>();
    const rowTotals = new Set<string>();
    const rowChargeItems = new Set<string>();

    const secBases = new Set<string>();
    const secChargeTotals = new Set<string>();
    const secTotals = new Set<string>();
    const secChargeItems = new Set<string>();

    for (const sec of sections) {
      if (sec.sectionToken) {
        secTotals.add(`SEC_${sec.sectionToken}`);
        secBases.add(`SEC_${sec.sectionToken}_BASE`);
        secChargeTotals.add(`SEC_${sec.sectionToken}_CHARGES`);
        for (const charge of sec.sectionCharges || []) {
          secChargeItems.add(charge.chargeToken);
        }
      }
      for (const row of sec.rows || []) {
        if (row.rowToken) {
          rowTotals.add(row.rowToken);
          rowBases.add(`${row.rowToken}_BASE`);
          rowChargeTotals.add(`${row.rowToken}_CHARGES`);
          for (const charge of row.charges || []) {
            rowChargeItems.add(charge.chargeToken);
          }
        }
      }
    }
    return {
      rowBases,
      rowChargeTotals,
      rowTotals,
      rowChargeItems,
      secBases,
      secChargeTotals,
      secTotals,
      secChargeItems,
    };
  }, [sections]);

  const getTokenColor = useCallback(
    (token: string) => {
      if (token === "EXP_TOTAL") return "text-rose-500 font-bold bg-rose-500/15";
      if (externalTokens.category?.has(token) || token.startsWith("EXP_")) return "text-rose-400 bg-rose-500/10";
      if (externalTokens.global.has(token) || token.startsWith("GBL_")) return "text-indigo-400";
      if (externalTokens.template.has(token) || token.startsWith("TPL_")) return "text-blue-400";
      if (externalTokens.file.has(token) || token.startsWith("FILE_")) return "text-sky-400";

      const t = tokenTypes;

      // Section tokens
      if (t.secBases.has(token)) return "text-primary font-semibold";
      if (t.secTotals.has(token)) return "text-slate-400 font-bold";
      if (t.secChargeTotals.has(token)) return "text-orange-400 font-medium";
      if (t.secChargeItems.has(token)) return "text-orange-400/70";

      // Row tokens
      if (t.rowBases.has(token)) return "text-violet-400 font-semibold";
      if (t.rowTotals.has(token)) return "text-slate-400 font-bold";
      if (t.rowChargeTotals.has(token)) return "text-accent-foreground font-medium";
      if (t.rowChargeItems.has(token)) return "text-accent-foreground/70";

      // Fallbacks if token missing from AST but looks like one
      if (token.startsWith("SEC_")) {
        if (token.endsWith("_BASE")) return "text-primary font-semibold";
        if (token.endsWith("_CHARGES")) return "text-orange-400 font-medium";
        return "text-slate-400 font-bold";
      }
      if (token.endsWith("_BASE")) return "text-violet-400 font-semibold";
      if (token.endsWith("_CHARGES")) return "text-accent-foreground font-medium";

      return "text-slate-400 font-bold";
    },
    [tokenTypes, externalTokens],
  );

  const { invalidTokens, tokenReasons: circularReasons } = useMemo(() => {
    return getCircularDependencyTokens(selectedCell, sections, undefined, validationErrors);
  }, [selectedCell, sections, validationErrors]);

  const { hiddenTokens, hiddenReasons } = useMemo(() => {
    const set = new Set<string>();
    const reasons = new Map<string, string>();
    if (!selectedCell) return { hiddenTokens: set, hiddenReasons: reasons };

    // 1. If inside a section (row or row charge), exclude containing section's tokens and all its charges
    if (selectedCell.sectionId && !selectedCell.isSectionCharge) {
      const sec = sections.find((s) => s.id === selectedCell.sectionId);
      if (sec) {
        const secLabel = sec.label || sec.sectionToken || "containing section";
        if (sec.sectionToken) {
          const secTokens = [
            sec.sectionToken,
            `SEC_${sec.sectionToken}`,
            `SEC_${sec.sectionToken}_BASE`,
            `SEC_${sec.sectionToken}_CHARGES`,
            `SEC_${sec.sectionToken}_TOTAL`,
          ];
          for (const t of secTokens) {
            set.add(t);
            reasons.set(t, `Rows cannot reference their containing section "${secLabel}"`);
          }
        }
        for (const charge of sec.charges || sec.sectionCharges || []) {
          if (charge.chargeToken) {
            set.add(charge.chargeToken);
            reasons.set(
              charge.chargeToken,
              `Rows cannot reference charges of containing section "${secLabel}"`,
            );
          }
        }
      }
    }

    // 2. Self and own row/section charge exclusions
    if (selectedCell.token) {
      const clean = selectedCell.token.replace(/_(BASE|TOTAL|CHARGES)$/, "");
      const selfTokens = [
        selectedCell.token,
        clean,
        `${clean}_BASE`,
        `${clean}_CHARGES`,
        `${clean}_TOTAL`,
      ];
      for (const t of selfTokens) {
        set.add(t);
        reasons.set(t, "Cannot reference the active cell's own token");
      }
    }

    // If editing a row (base or charge):
    if (selectedCell.row) {
      const rowToken = selectedCell.row.rowToken;
      const rowLabel = selectedCell.row.label || rowToken || "active row";
      if (rowToken) {
        const rowTokens = [
          rowToken,
          `${rowToken}_BASE`,
          `${rowToken}_CHARGES`,
          `${rowToken}_TOTAL`,
        ];
        for (const t of rowTokens) {
          set.add(t);
          if (!reasons.has(t)) {
            reasons.set(t, `Cannot reference tokens of active row "${rowLabel}"`);
          }
        }

        // If editing row base, also exclude all charges of that row
        if (!selectedCell.chargeId) {
          for (const c of selectedCell.row.charges || []) {
            if (c.chargeToken) {
              set.add(c.chargeToken);
              reasons.set(
                c.chargeToken,
                `Row base cannot reference its own row charge "${c.label || c.chargeToken}"`,
              );
            }
          }
        }
      }
    }

    // If editing a section charge:
    if (selectedCell.isSectionCharge && selectedCell.sectionId) {
      const sec = sections.find((s) => s.id === selectedCell.sectionId);
      if (sec && sec.sectionToken) {
        const secTokens = [
          sec.sectionToken,
          `SEC_${sec.sectionToken}`,
          `SEC_${sec.sectionToken}_CHARGES`,
          `SEC_${sec.sectionToken}_TOTAL`,
        ];
        for (const t of secTokens) {
          set.add(t);
          reasons.set(t, "Section charges cannot reference section total or charges sum");
        }
      }
    }

    return { hiddenTokens: set, hiddenReasons: reasons };
  }, [selectedCell, sections]);

  const tokenDisabledReasons = useMemo(() => {
    const map = new Map<string, string>();
    for (const [t, r] of circularReasons.entries()) map.set(t, r);
    for (const [t, r] of hiddenReasons.entries()) map.set(t, r);
    return map;
  }, [circularReasons, hiddenReasons]);

  const getTokenDisabledReason = useCallback(
    (token: string) => {
      if (invalidTokens.has(token)) {
        return tokenDisabledReasons.get(token) || "Creates a circular dependency";
      }
      if (hiddenTokens.has(token)) {
        return tokenDisabledReasons.get(token) || "Not allowed in this cell";
      }
      return undefined;
    },
    [invalidTokens, hiddenTokens, tokenDisabledReasons],
  );

  // Expose context
  const value = {
    selectedCell,
    setSelectedCell,
    tokenMap,
    setTokenMap,
    sections,
    setSections,
    externalTokens,
    setExternalTokens,
    hiddenTokens,
    invalidTokens,
    tokenDisabledReasons,
    getTokenDisabledReason,
    tokenPoolOpen,
    apiBasePath,
    mode,
    invalidateKey,
    validationErrors,
    clipboardToken,
    setClipboardToken,
    getTokenColor,
  };

  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useBuilderContext(): BuilderContextValue {
  return useContext(BuilderContext);
}

// ─── Helper — build SelectedCell from a row ───────────────────────────────────

export function cellFromRow({
  templateId,
  sectionId,
  row,
  decodedFormula,
}: {
  templateId: string;
  sectionId: string;
  row: any;
  decodedFormula?: string;
}): SelectedCell {
  const isFormula = row.valueType === "formula";

  return {
    templateId,
    sectionId,
    rowId: row.id,
    row,
    token: row.rowToken,
    breadcrumb: row.label || "Untitled Row",
    valueType: isFormula ? "formula" : "normal",
    currentInput: isFormula
      ? `${decodedFormula ?? row.formula ?? ""}`
      : String(row.initialValue ?? ""),
  };
}

export function cellFromRowCharge({
  templateId,
  sectionId,
  row,
  charge,
  decodedFormula,
}: {
  templateId: string;
  sectionId: string;
  row: any;
  charge: any;
  decodedFormula?: string;
}): SelectedCell {
  return {
    templateId,
    sectionId,
    rowId: row.id,
    row,
    chargeId: charge.id,
    token: charge.chargeToken,
    breadcrumb: charge.label || "Untitled Charge",
    valueType: "formula",
    currentInput: `${decodedFormula ?? charge.formula ?? ""}`,
  };
}

export function cellFromSectionCharge({
  templateId,
  sectionId,
  charge,
  sectionToken,
}: {
  templateId: string;
  sectionId: string;
  charge: any;
  sectionToken: string;
}): SelectedCell {
  return {
    templateId,
    sectionId,
    rowId: "", // Not attached to a row
    row: null,
    chargeId: charge.id,
    isSectionCharge: true,
    token: charge.chargeToken,
    breadcrumb: charge.label || "Untitled Section Charge",
    valueType: "formula",
    currentInput: `${charge.formula ?? ""}`,
  };
}
