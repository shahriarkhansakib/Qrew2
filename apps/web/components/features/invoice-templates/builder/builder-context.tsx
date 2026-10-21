"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCircularDependencyTokens, type TokenMap } from "@/lib/formula-evaluator";
import { TemplateColumnDefinition } from "./sheet-builder/types";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A "selected cell" is the value cell of a row in the table.
 * Clicking the value cell opens the formula bar for editing.
 */
export type SelectedCell = {
  // ── Routing ───────────────────────────────────────────────────────────────
  templateId?: string;
  draftId?: string;
  sectionId?: string;
  rowId: string;
  /** Full row object — needed to PATCH the row atomically. */
  row: any;
  /** Charge ID if this cell represents a charge. */
  chargeId?: string;
  /** True if this is a section charge (has no parent row). */
  isSectionCharge?: boolean;
  /** True if this is a catalog item in the Additional Line Items panel. */
  isCatalogItem?: boolean;
  /** Sheet column key if this cell is in a customizable sheet template */
  columnKey?: string;

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
  setTokenMap: (map: TokenMap | ((prev: TokenMap) => TokenMap)) => void;
  sections: any[];
  setSections?: (sections: any[] | ((prev: any[]) => any[])) => void;
  externalTokens: ExternalTokens;
  setExternalTokens?: (tokens: ExternalTokens | ((prev: ExternalTokens) => ExternalTokens)) => void;
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
  sidebarTab: "tokens" | "line-items";
  setSidebarTab: (tab: "tokens" | "line-items") => void;
  headerFields: any[];
  setHeaderFields?: (fields: any[]) => void;
  templateConstants: any[];
  setTemplateConstants?: (constants: any[]) => void;
  draftId?: string;
  templateId?: string;
  sectionSeparation: "double" | "step" | "none";
  setSectionSeparation: (style: "double" | "step" | "none") => void;
  showSectionHeaders: boolean;
  setShowSectionHeaders: (show: boolean) => void;
  showSectionSubtotals: boolean;
  setShowSectionSubtotals: (show: boolean) => void;
  templateType?: "standard" | "sheet";
  columnDefinitions?: TemplateColumnDefinition[];
  setColumnDefinitions?: (cols: TemplateColumnDefinition[]) => void;
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
  sidebarTab: "tokens",
  setSidebarTab: () => {},
  headerFields: [],
  setHeaderFields: () => {},
  templateConstants: [],
  setTemplateConstants: () => {},
  apiBasePath: "",
  mode: "template",
  invalidateKey: [],
  clipboardToken: null,
  setClipboardToken: () => {},
  getTokenColor: () => "text-slate-400",
  sectionSeparation: "double",
  setSectionSeparation: () => {},
  showSectionHeaders: true,
  setShowSectionHeaders: () => {},
  showSectionSubtotals: false,
  setShowSectionSubtotals: () => {},
  templateType: "standard",
  columnDefinitions: [],
  setColumnDefinitions: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BuilderProvider({
  templateId,
  draftId,
  tokenPoolOpen = false,
  apiBasePath,
  mode = "template",
  invalidateKey,
  validationErrors = [],
  templateType = "standard",
  columnDefinitions = [],
  children,
}: {
  templateId?: string;
  draftId?: string;
  tokenPoolOpen?: boolean;
  apiBasePath: string;
  mode?: "template" | "draft" | "preview" | "fill";
  invalidateKey: readonly string[];
  validationErrors?: any[];
  templateType?: "standard" | "sheet";
  columnDefinitions?: TemplateColumnDefinition[];
  children: React.ReactNode;
}) {
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [columns, setColumns] = useState<TemplateColumnDefinition[]>(columnDefinitions);

  useEffect(() => {
    setColumns(columnDefinitions);
  }, [columnDefinitions]);
  const [tokenMap, setTokenMapState] = useState<TokenMap>({});
  const [sections, setSectionsState] = useState<any[]>([]);
  const [clipboardToken, setClipboardToken] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"tokens" | "line-items">("tokens");
  const [headerFields, setHeaderFieldsState] = useState<any[]>([]);
  const [templateConstants, setTemplateConstantsState] = useState<any[]>([]);
  const [externalTokens, setExternalTokensState] =
    useState<ExternalTokens>(DEFAULT_EXTERNAL_TOKENS);
  const [sectionSeparation, setSectionSeparation] = useState<"double" | "step" | "none">("double");
  const [showSectionHeaders, setShowSectionHeaders] = useState(true);
  const [showSectionSubtotals, setShowSectionSubtotals] = useState(false);

  const setHeaderFields = useCallback((fieldsOrFn: any[] | ((prev: any[]) => any[])) => {
    setHeaderFieldsState((prev) => {
      const next = typeof fieldsOrFn === "function" ? fieldsOrFn(prev) : fieldsOrFn;
      if (prev === next) return prev;
      if (prev.length === next.length && prev.every((item, i) => item === next[i])) {
        return prev;
      }
      return next;
    });
  }, []);

  const setTemplateConstants = useCallback((constsOrFn: any[] | ((prev: any[]) => any[])) => {
    setTemplateConstantsState((prev) => {
      const next = typeof constsOrFn === "function" ? constsOrFn(prev) : constsOrFn;
      if (prev === next) return prev;
      if (prev.length === next.length && prev.every((item, i) => item === next[i])) {
        return prev;
      }
      return next;
    });
  }, []);

  const setTokenMap = useCallback((mapOrFn: TokenMap | ((prev: TokenMap) => TokenMap)) => {
    setTokenMapState((prev) => {
      const next = typeof mapOrFn === "function" ? mapOrFn(prev) : mapOrFn;
      if (prev === next) return prev;
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && prevKeys.every((k) => prev[k] === next[k])) {
        return prev;
      }
      return next;
    });
  }, []);

  const setSections = useCallback((sectionsOrFn: any[] | ((prev: any[]) => any[])) => {
    setSectionsState((prev) => {
      const next = typeof sectionsOrFn === "function" ? sectionsOrFn(prev) : sectionsOrFn;
      if (prev === next) return prev;
      if (prev.length === next.length && prev.every((item, i) => item === next[i])) {
        return prev;
      }
      return next;
    });
  }, []);

  const setExternalTokens = useCallback(
    (tokensOrFn: ExternalTokens | ((prev: ExternalTokens) => ExternalTokens)) => {
      setExternalTokensState((prev) => {
        const next = typeof tokensOrFn === "function" ? tokensOrFn(prev) : tokensOrFn;
        if (prev === next) return prev;
        const areSetsEqual = (a: Set<string>, b: Set<string>) =>
          a.size === b.size && Array.from(a).every((x) => b.has(x));

        if (
          areSetsEqual(prev.global, next.global) &&
          areSetsEqual(prev.template, next.template) &&
          areSetsEqual(prev.file, next.file) &&
          areSetsEqual(prev.category, next.category)
        ) {
          return prev;
        }
        return next;
      });
    },
    [],
  );

  const tokenTypes = useMemo(() => {
    const rowBases = new Set<string>();
    const rowChargeTotals = new Set<string>();
    const rowTotals = new Set<string>();
    const rowChargeItems = new Set<string>();

    const secBases = new Set<string>();
    const secChargeTotals = new Set<string>();
    const secTotals = new Set<string>();
    const secChargeItems = new Set<string>();

    const isSheet = templateType === "sheet";

    for (const sec of sections) {
      if (sec.sectionToken) {
        secTotals.add(`SEC_${sec.sectionToken}`);
        if (!isSheet) {
          secBases.add(`SEC_${sec.sectionToken}_BASE`);
          secChargeTotals.add(`SEC_${sec.sectionToken}_CHARGES`);
          for (const charge of sec.sectionCharges || []) {
            secChargeItems.add(charge.chargeToken);
          }
        }
      }
      for (const row of sec.rows || []) {
        if (row.rowToken) {
          rowTotals.add(row.rowToken);
          if (!isSheet) {
            rowBases.add(`${row.rowToken}_BASE`);
            rowChargeTotals.add(`${row.rowToken}_CHARGES`);
            for (const charge of row.charges || []) {
              rowChargeItems.add(charge.chargeToken);
            }
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
      if (["MIN", "MAX", "ROUND", "CLAMP", "ABS", "FLOOR", "CEIL"].includes(token))
        return "text-amber-400 font-semibold";
      if (token === "EXP_TOTAL") return "text-rose-400 font-semibold";
      if (externalTokens.category?.has(token) || token.startsWith("EXP_")) return "text-rose-400";
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
      if (t.rowChargeTotals.has(token)) return "text-amber-400 font-medium";
      if (t.rowChargeItems.has(token)) return "text-amber-400/70";

      // Fallbacks if token missing from AST but looks like one
      if (token.startsWith("SEC_")) {
        if (token.endsWith("_BASE")) return "text-primary font-semibold";
        if (token.endsWith("_CHARGES")) return "text-orange-400 font-medium";
        return "text-slate-400 font-bold";
      }
      if (token.endsWith("_BASE")) return "text-violet-400 font-semibold";
      if (token.endsWith("_CHARGES")) return "text-amber-400 font-medium";

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
      if (selectedCell.chargeId) {
        // Active cell is a row charge: only the charge itself is a self-reference!
        set.add(selectedCell.token);
        reasons.set(selectedCell.token, "Cannot reference the active charge's own token");
      } else {
        const isCanonicalRowToken = selectedCell.row?.rowToken === selectedCell.token;
        const clean = isCanonicalRowToken
          ? selectedCell.token
          : selectedCell.token.replace(/_(BASE|TOTAL|CHARGES)$/, "");
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
    }

    // If editing a row:
    if (selectedCell.row) {
      const rowToken = selectedCell.row.rowToken;
      const rowLabel = selectedCell.row.label || rowToken || "active row";
      if (rowToken) {
        if (selectedCell.chargeId) {
          // Editing a row charge:
          // CAN reference rowToken and rowToken_BASE.
          // CANNOT reference rowToken_CHARGES or rowToken_TOTAL.
          set.add(`${rowToken}_CHARGES`);
          reasons.set(`${rowToken}_CHARGES`, `Row charge cannot reference row charges sum`);
          set.add(`${rowToken}_TOTAL`);
          reasons.set(`${rowToken}_TOTAL`, `Row charge cannot reference row total`);
        } else {
          // Editing row base itself:
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
      if (sec?.sectionToken) {
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
  const value = useMemo(
    () => ({
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
      sidebarTab,
      setSidebarTab,
      headerFields,
      setHeaderFields,
      templateConstants,
      setTemplateConstants,
      draftId,
      templateId,
      sectionSeparation,
      setSectionSeparation,
      showSectionHeaders,
      setShowSectionHeaders,
      showSectionSubtotals,
      setShowSectionSubtotals,
      templateType,
      columnDefinitions: columns,
      setColumnDefinitions: setColumns,
    }),
    [
      selectedCell,
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
      sidebarTab,
      headerFields,
      templateConstants,
      apiBasePath,
      mode,
      invalidateKey,
      validationErrors,
      clipboardToken,
      getTokenColor,
      draftId,
      templateId,
      sectionSeparation,
      showSectionHeaders,
      showSectionSubtotals,
      templateType,
      columns,
    ],
  );

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
  columnKey,
  columnLabel,
}: {
  templateId: string;
  sectionId: string;
  row: any;
  decodedFormula?: string;
  columnKey?: string;
  columnLabel?: string;
}): SelectedCell {
  const isFormula = row.valueType === "formula";
  const rowName = row.label || row.rowToken || "Untitled Row";
  const breadcrumb = columnLabel ? `${rowName} > ${columnLabel}` : rowName;

  const currentVal =
    columnKey && row.cellValues?.[columnKey] !== undefined
      ? row.cellValues[columnKey]
      : row.initialValue;

  return {
    templateId,
    sectionId,
    rowId: row.id,
    row,
    columnKey,
    token: row.rowToken,
    breadcrumb,
    valueType: isFormula ? "formula" : "normal",
    currentInput: isFormula ? `${decodedFormula ?? row.formula ?? ""}` : String(currentVal ?? ""),
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
