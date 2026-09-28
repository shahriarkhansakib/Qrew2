/**
 * Formula Evaluator — Client-side token map builder and formula evaluator.
 *
 * Takes fully-loaded sections data (with nested rows, charges, and sectionCharges)
 * and produces a flat map of token → computed number for live preview in the builder.
 *
 * Token hierarchy (computed in visual sort order — NOT topological order):
 *  1. Row base  = row.initialValue (manual-entry) or 0 for formula rows (external refs unknown)
 *  2. Row charge tokens = evaluated formula (e.g. PORT_DUES * 0.1)
 *  3. Row TOTAL = base + sum of row charges  (token: rowToken_TOTAL)
 *  4. SEC_X     = sum of all row bases in section (NOT SEC_X_BASE — no _BASE suffix)
 *  5. SEC_X_CHARGES = sum of all row charge amounts in section
 *  6. Section charges = evaluated formula (e.g. SEC_A * 0.1)
 *  7. SEC_X_TOTAL = SEC_X + SEC_X_CHARGES + section charge amounts
 *
 * NOTE: This evaluator uses VISUAL sort order, not topological order.
 * For templates with forward-referencing formulas, preview values for those
 * rows will show 0. The server-side AstEvaluatorService is authoritative.
 *
 * Note: Formula rows that reference external tokens (FILE_*, ORG_*, CAT_*) will
 * show 0 here since those external values aren't available at template-edit time.
 */

export type TokenMap = Record<string, number>;

/**
 * Decode an AST formula string from the database back to human-readable tokens.
 * - Replaces {{$row:UUID}} with the row's rowToken
 * - Strips {{ and }} from external tokens like {{FILE_GRT}}
 */
export function decodeFormula(
  formula: string | null | undefined,
  sections: any[],
  templateConstants?: any[],
): string {
  if (!formula) return "";
  let decoded = formula;

  // 0. Replace unified {{$tok:UUID}}
  decoded = decoded.replace(/\{\{\$tok:([0-9a-fA-F-]+)\}\}_BASE/g, (match, id) => {
    for (const sec of sections || []) {
      if (sec.id === id && sec.sectionToken) return `SEC_${sec.sectionToken}_BASE`;
      const row = sec.rows?.find((r: any) => r.id === id);
      if (row?.rowToken) return `${row.rowToken}_BASE`;
    }
    return match;
  });
  decoded = decoded.replace(/\{\{\$tok:([0-9a-fA-F-]+)\}\}_CHARGES/g, (match, id) => {
    for (const sec of sections || []) {
      if (sec.id === id && sec.sectionToken) return `SEC_${sec.sectionToken}_CHARGES`;
      const row = sec.rows?.find((r: any) => r.id === id);
      if (row?.rowToken) return `${row.rowToken}_CHARGES`;
    }
    return match;
  });
  decoded = decoded.replace(/\{\{\$tok:([0-9a-fA-F-]+)\}\}_TOTAL/g, (match, id) => {
    for (const sec of sections || []) {
      if (sec.id === id && sec.sectionToken) return `SEC_${sec.sectionToken}`;
      const row = sec.rows?.find((r: any) => r.id === id);
      if (row?.rowToken) return row.rowToken;
    }
    return match;
  });
  decoded = decoded.replace(/\{\{\$tok:([0-9a-fA-F-]+)\}\}/g, (match, id) => {
    for (const sec of sections || []) {
      if (sec.id === id && sec.sectionToken) return `SEC_${sec.sectionToken}`;
      const sc = sec.sectionCharges?.find((c: any) => c.id === id);
      if (sc?.chargeToken) return sc.chargeToken;
      const row = sec.rows?.find((r: any) => r.id === id);
      if (row?.rowToken) return row.rowToken;
      for (const r of sec.rows || []) {
        const rc = r.charges?.find((c: any) => c.id === id);
        if (rc?.chargeToken) return rc.chargeToken;
      }
    }
    if (templateConstants) {
      const arr = Array.isArray(templateConstants)
        ? templateConstants
        : Object.values(templateConstants);
      const constant = arr.find((c: any) => c.id === id);
      if (constant?.token) return constant.token;
    }
    return match;
  });

  // 1. Replace row UUIDs (legacy)
  decoded = decoded.replace(/\{\{\$row:([0-9a-fA-F-]+)\}\}_BASE/g, (match, id) => {
    for (const sec of sections || []) {
      const row = sec.rows?.find((r: any) => r.id === id);
      if (row?.rowToken) return `${row.rowToken}_BASE`;
    }
    return match;
  });
  decoded = decoded.replace(/\{\{\$row:([0-9a-fA-F-]+)\}\}_CHARGES/g, (match, id) => {
    for (const sec of sections || []) {
      const row = sec.rows?.find((r: any) => r.id === id);
      if (row?.rowToken) return `${row.rowToken}_CHARGES`;
    }
    return match;
  });
  decoded = decoded.replace(/\{\{\$row:([0-9a-fA-F-]+)\}\}_TOTAL/g, (match, id) => {
    for (const sec of sections || []) {
      const row = sec.rows?.find((r: any) => r.id === id);
      if (row?.rowToken) return row.rowToken;
    }
    return match;
  });
  decoded = decoded.replace(/\{\{\$row:([0-9a-fA-F-]+)\}\}/g, (match, id) => {
    for (const sec of sections || []) {
      const row = sec.rows?.find((r: any) => r.id === id);
      if (row?.rowToken) return row.rowToken;
    }
    return match;
  });

  // 1.5 Replace sec UUIDs (legacy)
  decoded = decoded.replace(/\{\{\$sec:([0-9a-fA-F-]+)\}\}_BASE/g, (match, id) => {
    const sec = (sections || []).find((s: any) => s.id === id);
    if (sec?.sectionToken) return `SEC_${sec.sectionToken}_BASE`;
    return match;
  });
  decoded = decoded.replace(/\{\{\$sec:([0-9a-fA-F-]+)\}\}_CHARGES/g, (match, id) => {
    const sec = (sections || []).find((s: any) => s.id === id);
    if (sec?.sectionToken) return `SEC_${sec.sectionToken}_CHARGES`;
    return match;
  });
  decoded = decoded.replace(/\{\{\$sec:([0-9a-fA-F-]+)\}\}_TOTAL/g, (match, id) => {
    const sec = (sections || []).find((s: any) => s.id === id);
    if (sec?.sectionToken) return `SEC_${sec.sectionToken}`;
    return match;
  });
  decoded = decoded.replace(/\{\{\$sec:([0-9a-fA-F-]+)\}\}/g, (match, id) => {
    const sec = (sections || []).find((s: any) => s.id === id);
    if (sec?.sectionToken) return `SEC_${sec.sectionToken}`;
    return match;
  });

  // 1.7 Replace tpl UUIDs (legacy)
  const tplRegex = /\{\{\$tpl:([0-9a-fA-F-]+)\}\}/g;
  decoded = decoded.replace(tplRegex, (match, id) => {
    if (!templateConstants) return match;
    const arr = Array.isArray(templateConstants)
      ? templateConstants
      : Object.values(templateConstants);
    const constant = arr.find((c: any) => c.id === id);
    if (constant?.token) return constant.token;
    return match;
  });

  // 2. Strip {{ and }} from other tokens
  decoded = decoded.replace(/\{\{([A-Z0-9_]+)\}\}/g, "$1");

  // 3. Strip FILE_, GBL_/ORG_, and EXP_ (except EXP_TOTAL) prefixes to bare tokens for UI display
  decoded = decoded.replace(/\bFILE_([A-Z0-9_]+)\b/g, "$1");
  decoded = decoded.replace(/\b(?:GBL_|ORG_)([A-Z0-9_]+)\b/g, "$1");
  decoded = decoded.replace(/\bEXP_(?!TOTAL\b)([A-Z0-9_]+)\b/g, "$1");

  return decoded;
}

/**
 * Safely evaluate an arithmetic expression string where all identifiers have
 * already been substituted with numeric literals.
 * Returns null if evaluation fails or result is not finite.
 */
function safeEval(expr: string): number | null {
  try {
    // Validate: after substitution, only digits, operators, and whitespace/parens
    // should remain. Reject anything else to prevent code injection.
    if (!/^[\d\s+\-*/.()]+$/.test(expr.trim())) return null;
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expr})`)() as number;
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/**
 * Evaluate a formula string by substituting known token values.
 * Tokens are substituted longest-first to avoid partial matches
 * (e.g., PORT_DUES_TOTAL substituted before PORT_DUES).
 *
 * Returns the numeric result, or null if any token is unresolved.
 */
export function evaluateFormula(formula: string, tokens: TokenMap): number | null {
  if (!formula?.trim()) return null;

  // Support legacy formula tokens gracefully without polluting the canonical token map or autocomplete
  let expr = formula
    .trim()
    .replace(/(?<![A-Z0-9_])FILE_([A-Z0-9_]+)(?![A-Z0-9_])/g, (_, k) =>
      tokens[k] !== undefined ? String(tokens[k]) : `FILE_${k}`,
    )
    .replace(/(?<![A-Z0-9_])GBL_([A-Z0-9_]+)(?![A-Z0-9_])/g, (_, k) =>
      tokens[k] !== undefined ? String(tokens[k]) : `GBL_${k}`,
    )
    .replace(/(?<![A-Z0-9_])ORG_([A-Z0-9_]+)(?![A-Z0-9_])/g, (_, k) =>
      tokens[k] !== undefined ? String(tokens[k]) : `ORG_${k}`,
    )
    .replace(/(?<![A-Z0-9_])([A-Z0-9_]+)_TOTAL(?![A-Z0-9_])/g, (_, k) =>
      tokens[k] !== undefined ? String(tokens[k]) : `${k}_TOTAL`,
    );

  // Sort tokens longest-first to avoid substring replacement issues
  const sortedTokens = Object.keys(tokens).sort((a, b) => b.length - a.length);

  for (const token of sortedTokens) {
    // Use word-boundary-like replacement: token must not be preceded/followed
    // by another word character to avoid partial matches.
    expr = expr.replace(
      new RegExp(`(?<![A-Z0-9_])${token}(?![A-Z0-9_])`, "g"),
      String(tokens[token]),
    );
  }

  return safeEval(expr);
}

export function extractTokens(formula: string): string[] {
  if (!formula) return [];
  const matches = formula.match(/[A-Z_][A-Z0-9_]*/g);
  return matches ? Array.from(new Set(matches)) : [];
}

export interface CircularDependencyResult {
  invalidTokens: Set<string>;
  tokenReasons: Map<string, string>;
}

/**
 * Computes all tokens that would cause a circular dependency if referenced in the active cell,
 * detects any existing cycles in the template graph via Kahn's algorithm, parses any backend
 * validation cycle errors, and propagates invalidation across entire dependent rows and sections.
 */
export function getCircularDependencyTokens(
  selectedCell: any | null,
  sections: any[],
  templateConstants?: any[],
  validationErrors?: any[],
): CircularDependencyResult {
  const invalidTokens = new Set<string>();
  const tokenReasons = new Map<string, string>();

  if (!sections || !Array.isArray(sections)) {
    return { invalidTokens, tokenReasons };
  }

  // 1. Build adjacency list: dependency -> dependents (data flow)
  const graph = new Map<string, string[]>();
  const allNodes = new Set<string>();
  const inDegree = new Map<string, number>();

  const ensureNode = (node: string) => {
    if (!graph.has(node)) graph.set(node, []);
    allNodes.add(node);
    if (!inDegree.has(node)) inDegree.set(node, 0);
  };

  const addEdge = (dependency: string, dependent: string) => {
    if (!dependency || !dependent || dependency === dependent) return;
    ensureNode(dependency);
    ensureNode(dependent);
    graph.get(dependency)!.push(dependent);
    inDegree.set(dependent, (inDegree.get(dependent) || 0) + 1);
  };

  // Maps for row & section expansion
  const tokenToRowMap = new Map<string, any>();
  const tokenToSectionMap = new Map<string, any>();

  for (const section of sections) {
    if (!section.sectionToken) continue;
    const secToken = section.sectionToken;
    const secBase = `SEC_${secToken}_BASE`;
    const secCharges = `SEC_${secToken}_CHARGES`;
    const secTotal = `SEC_${secToken}`;
    const secTotalAlt = `SEC_${secToken}_TOTAL`;

    ensureNode(secBase);
    ensureNode(secCharges);
    ensureNode(secTotal);
    ensureNode(secTotalAlt);

    tokenToSectionMap.set(secBase, section);
    tokenToSectionMap.set(secCharges, section);
    tokenToSectionMap.set(secTotal, section);
    tokenToSectionMap.set(secTotalAlt, section);

    addEdge(secBase, secTotal);
    addEdge(secCharges, secTotal);
    addEdge(secBase, secTotalAlt);
    addEdge(secCharges, secTotalAlt);

    // Section charges
    for (const sc of section.sectionCharges ?? []) {
      if (!sc.chargeToken) continue;
      ensureNode(sc.chargeToken);
      tokenToSectionMap.set(sc.chargeToken, section);

      // Section charges depend on section base
      addEdge(secBase, sc.chargeToken);
      addEdge(sc.chargeToken, secCharges);
      addEdge(sc.chargeToken, secTotal);
      addEdge(sc.chargeToken, secTotalAlt);

      if (sc.formula) {
        const decoded = decodeFormula(sc.formula, sections, templateConstants);
        for (const ref of extractTokens(decoded)) {
          addEdge(ref, sc.chargeToken);
        }
      }
    }

    // Rows
    for (const row of section.rows ?? []) {
      if (!row.rowToken) continue;
      const rowToken = row.rowToken;
      const rowBase = `${rowToken}_BASE`;
      const rowChargesToken = `${rowToken}_CHARGES`;
      const rowTotal = rowToken;
      const rowTotalAlt = `${rowToken}_TOTAL`;

      ensureNode(rowBase);
      ensureNode(rowChargesToken);
      ensureNode(rowTotal);
      ensureNode(rowTotalAlt);

      tokenToRowMap.set(rowBase, row);
      tokenToRowMap.set(rowChargesToken, row);
      tokenToRowMap.set(rowTotal, row);
      tokenToRowMap.set(rowTotalAlt, row);
      tokenToSectionMap.set(rowBase, section);
      tokenToSectionMap.set(rowChargesToken, section);
      tokenToSectionMap.set(rowTotal, section);
      tokenToSectionMap.set(rowTotalAlt, section);

      // Base & charges sum add to total
      addEdge(rowBase, rowTotal);
      addEdge(rowBase, rowTotalAlt);
      addEdge(rowChargesToken, rowTotal);
      addEdge(rowChargesToken, rowTotalAlt);
      // Row base adds to section base
      addEdge(rowBase, secBase);

      // Row formula
      if (row.valueType === "formula" && row.formula) {
        const decoded = decodeFormula(row.formula, sections, templateConstants);
        for (const ref of extractTokens(decoded)) {
          addEdge(ref, rowBase);
        }
      }

      // Row charges
      for (const charge of row.charges ?? []) {
        if (!charge.chargeToken) continue;
        ensureNode(charge.chargeToken);
        tokenToRowMap.set(charge.chargeToken, row);
        tokenToSectionMap.set(charge.chargeToken, section);

        // Every row charge computes from its row base (e.g. ROW_BASE * rate%)
        addEdge(rowBase, charge.chargeToken);
        addEdge(charge.chargeToken, rowChargesToken);
        addEdge(charge.chargeToken, secCharges);

        if (charge.formula) {
          const decoded = decodeFormula(charge.formula, sections, templateConstants);
          for (const ref of extractTokens(decoded)) {
            addEdge(ref, charge.chargeToken);
          }
        }
      }
    }
  }

  // 2. Kahn's Algorithm to find existing cycles in the template
  const kahnInDegree = new Map(inDegree);
  const kahnQueue: string[] = [];
  for (const node of allNodes) {
    if ((kahnInDegree.get(node) || 0) === 0) {
      kahnQueue.push(node);
    }
  }

  let processedCount = 0;
  while (kahnQueue.length > 0) {
    const node = kahnQueue.shift()!;
    processedCount++;
    for (const dep of graph.get(node) || []) {
      const curDeg = kahnInDegree.get(dep)! - 1;
      kahnInDegree.set(dep, curDeg);
      if (curDeg === 0) {
        kahnQueue.push(dep);
      }
    }
  }

  if (processedCount < allNodes.size) {
    for (const [node, deg] of kahnInDegree.entries()) {
      if (deg > 0) {
        invalidTokens.add(node);
        tokenReasons.set(node, `Involved in a circular dependency in this template`);
      }
    }
  }

  // 3. Process backend validation errors (e.g. from failed save toast)
  if (validationErrors && Array.isArray(validationErrors)) {
    for (const err of validationErrors) {
      if (!err) continue;
      const msg = String(err.message || "");
      if (err.code === "CIRCULAR_DEPENDENCY" || msg.toLowerCase().includes("circular dependency")) {
        const tokensInMsg = msg.match(/\b([A-Z_][A-Z0-9_]*)\b/g) || [];
        for (const tok of tokensInMsg) {
          if (allNodes.has(tok)) {
            invalidTokens.add(tok);
            tokenReasons.set(tok, `Detected in circular dependency by calculation engine`);
          }
        }
      }
      if (err.token && allNodes.has(err.token)) {
        invalidTokens.add(err.token);
        tokenReasons.set(err.token, `Invalid reference: ${err.message || "creates cycle"}`);
      }
      if (err.rowToken && allNodes.has(err.rowToken)) {
        invalidTokens.add(err.rowToken);
        tokenReasons.set(err.rowToken, `Invalid reference: ${err.message || "creates cycle"}`);
      }
    }
  }

  // 4. Multi-seed Reachability (Transitive Downstream Dependents of current cell)
  if (selectedCell) {
    const cellLabel = selectedCell.breadcrumb || "active cell";
    const seeds = new Set<string>();

    if (selectedCell.row) {
      const rowToken = selectedCell.row.rowToken;
      if (rowToken) {
        seeds.add(rowToken);
        seeds.add(`${rowToken}_BASE`);
        seeds.add(`${rowToken}_CHARGES`);
        seeds.add(`${rowToken}_TOTAL`);
        for (const c of selectedCell.row.charges || []) {
          if (c.chargeToken) seeds.add(c.chargeToken);
        }
      }
      // If editing row base, also seed the section base and charges that this row feeds
      if (!selectedCell.chargeId && selectedCell.sectionId) {
        const sec = sections.find((s: any) => s.id === selectedCell.sectionId);
        if (sec?.sectionToken) {
          seeds.add(`SEC_${sec.sectionToken}_BASE`);
          seeds.add(`SEC_${sec.sectionToken}_CHARGES`);
          seeds.add(`SEC_${sec.sectionToken}`);
          seeds.add(`SEC_${sec.sectionToken}_TOTAL`);
        }
      }
    }

    if (selectedCell.chargeId) {
      if (selectedCell.token) seeds.add(selectedCell.token);
      if (selectedCell.row?.rowToken) {
        seeds.add(`${selectedCell.row.rowToken}_CHARGES`);
        seeds.add(selectedCell.row.rowToken);
        seeds.add(`${selectedCell.row.rowToken}_TOTAL`);
      }
      if (selectedCell.sectionId) {
        const sec = sections.find((s: any) => s.id === selectedCell.sectionId);
        if (sec?.sectionToken) {
          seeds.add(`SEC_${sec.sectionToken}_CHARGES`);
          seeds.add(`SEC_${sec.sectionToken}`);
          seeds.add(`SEC_${sec.sectionToken}_TOTAL`);
        }
      }
    }

    if (selectedCell.isSectionCharge && selectedCell.sectionId) {
      if (selectedCell.token) seeds.add(selectedCell.token);
      const sec = sections.find((s: any) => s.id === selectedCell.sectionId);
      if (sec?.sectionToken) {
        seeds.add(`SEC_${sec.sectionToken}_CHARGES`);
        seeds.add(`SEC_${sec.sectionToken}`);
        seeds.add(`SEC_${sec.sectionToken}_TOTAL`);
      }
    }

    // BFS to find all downstream dependent tokens
    const queue = Array.from(seeds);
    const visited = new Set<string>(seeds);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const dependents = graph.get(curr) || [];
      for (const dep of dependents) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
          invalidTokens.add(dep);
          if (!tokenReasons.has(dep)) {
            tokenReasons.set(
              dep,
              `Creates circular dependency: "${dep}" depends on "${cellLabel}"`,
            );
          }
        }
      }
    }
  }

  // 5. Full Row & Section Expansion:
  // If ANY token in row R is invalid/dependent, ALL tokens of row R are invalid for this cell.
  // If ANY token in section S is invalid/dependent, ALL tokens of section S are invalid for this cell.
  const cellName = selectedCell?.breadcrumb || "the active cell";
  const initialInvalidList = Array.from(invalidTokens);

  for (const token of initialInvalidList) {
    // Row expansion
    const row = tokenToRowMap.get(token);
    if (row?.rowToken) {
      const rowVariants = [
        row.rowToken,
        `${row.rowToken}_BASE`,
        `${row.rowToken}_CHARGES`,
        `${row.rowToken}_TOTAL`,
        ...(row.charges || []).map((c: any) => c.chargeToken),
      ].filter(Boolean);

      for (const variant of rowVariants) {
        if (!invalidTokens.has(variant)) {
          invalidTokens.add(variant);
          tokenReasons.set(
            variant,
            `Creates circular dependency: row "${row.label || row.rowToken}" depends on ${cellName}`,
          );
        }
      }
    }

    // Section expansion
    const sec = tokenToSectionMap.get(token);
    if (sec?.sectionToken) {
      const secVariants = [
        `SEC_${sec.sectionToken}`,
        `SEC_${sec.sectionToken}_BASE`,
        `SEC_${sec.sectionToken}_CHARGES`,
        `SEC_${sec.sectionToken}_TOTAL`,
        ...(sec.sectionCharges || []).map((c: any) => c.chargeToken),
      ].filter(Boolean);

      for (const variant of secVariants) {
        if (!invalidTokens.has(variant)) {
          invalidTokens.add(variant);
          tokenReasons.set(
            variant,
            `Creates circular dependency: section "${sec.label || sec.sectionToken}" depends on ${cellName}`,
          );
        }
      }
    }
  }

  return { invalidTokens, tokenReasons };
}

/**
 * Returns a set of all tokens that transitively depend on `targetToken`.
 * Provided for backward compatibility.
 */
export function getTransitiveDependents(
  targetToken: string,
  sections: any[],
  templateConstants?: any[],
): Set<string> {
  const { invalidTokens } = getCircularDependencyTokens(
    { token: targetToken, breadcrumb: targetToken },
    sections,
    templateConstants,
  );
  return invalidTokens;
}

/**
 * Build the complete token map from template sections data.
 * Sections must already have .rows[].charges, .sectionCharges populated.
 */
export function buildTokenMap(
  sections: any[],
  orgConfigs?: any[],
  templateConstants?: any[],
  fileFields?: any[],
  categoriesData?: any[],
): TokenMap {
  const tokens: TokenMap = {};

  // Inject global constants first so they are available for formulas (bare canonical key only)
  if (orgConfigs) {
    for (const config of orgConfigs) {
      if (config.isFormulaInjectable && config.configKey) {
        const parsedVal = parseFloat(config.configValue);
        const val = Number.isNaN(parsedVal) ? 0 : parsedVal;
        const numVal = config.valueType === "percentage" ? val / 100 : val;
        const baseKey = config.configKey.replace(/^(ORG_|GBL_)/, "");
        tokens[baseKey] = numVal;
      }
    }
  }

  // Inject template constants next (bare canonical key only)
  if (templateConstants) {
    const constantsArray = Array.isArray(templateConstants)
      ? templateConstants
      : Object.values(templateConstants);
    for (const constant of constantsArray) {
      const parsedVal = parseFloat(constant.value ?? constant.defaultValue);
      const val = Number.isNaN(parsedVal) ? 0 : parsedVal;
      const key = constant.key ?? constant.token;
      if (key) {
        tokens[key] = val;
      }
    }
  }

  // Inject file fields (bare canonical key only)
  if (fileFields) {
    for (const field of fileFields) {
      if (field.isFormulaInjectable) {
        let bareToken = (field.label || "")
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, "_")
          .replace(/^FILE_/, "");
        if (field.fieldType === "file_field" && field.fileFieldKey) {
          bareToken = field.fileFieldKey.toUpperCase().replace(/^FILE_/, "");
        } else if (field.fieldType === "org_config" && field.orgConfigKey) {
          bareToken = field.orgConfigKey.toUpperCase().replace(/^(GBL_|ORG_)/, "");
        }
        tokens[bareToken] = 0;
      }
    }
  }

  // Inject expense categories (bare canonical key and EXP_TOTAL)
  tokens.EXP_TOTAL = 0;
  if (categoriesData) {
    for (const cat of categoriesData) {
      const key = cat.tokenKey;
      if (key && key !== "EXP_TOTAL") {
        const bare = key.replace(/^EXP_/, "");
        tokens[bare] = 0;
      }
    }
  }

  // Initialize all known tokens to 0 so formulas can at least evaluate without returning null
  for (const section of sections) {
    tokens[`SEC_${section.sectionToken}`] = 0;
    tokens[`SEC_${section.sectionToken}_BASE`] = 0;
    tokens[`SEC_${section.sectionToken}_CHARGES`] = 0;
    for (const row of section.rows ?? []) {
      tokens[row.rowToken] = 0;
      tokens[`${row.rowToken}_BASE`] = 0;
      tokens[`${row.rowToken}_CHARGES`] = 0;
      for (const charge of row.charges ?? []) {
        if (charge.chargeToken) tokens[charge.chargeToken] = 0;
      }
    }
    for (const sc of section.sectionCharges ?? []) {
      if (sc.chargeToken) tokens[sc.chargeToken] = 0;
    }
  }

  let changed = true;
  let passes = 0;

  while (changed && passes < 5) {
    changed = false;
    passes++;

    for (const section of sections) {
      const sectionToken: string = section.sectionToken;
      const rows: any[] = section.rows ?? [];
      const sectionCharges: any[] = section.sectionCharges ?? [];

      let sectionBase = 0;
      let sectionRowChargesTotal = 0;

      for (const row of rows) {
        const rowCharges: any[] = row.charges ?? [];

        let rowBase = 0;
        if (row.valueType === "formula" && row.formula) {
          // Decode first!
          const decoded = decodeFormula(row.formula, sections, templateConstants);
          const evaluated = evaluateFormula(decoded, tokens);
          if (evaluated !== null) {
            rowBase = evaluated;
          }
        } else if (row.valueType !== "formula" && row.initialValue != null) {
          const val = parseFloat(String(row.initialValue));
          if (!Number.isNaN(val)) {
            rowBase = val;
          }
        }

        if (tokens[`${row.rowToken}_BASE`] !== rowBase) {
          tokens[`${row.rowToken}_BASE`] = rowBase;
          changed = true;
        }

        let rowChargesSum = 0;
        for (const charge of rowCharges) {
          if (!charge.formula) continue;
          const decoded = decodeFormula(charge.formula, sections, templateConstants);
          const val = evaluateFormula(decoded, tokens);
          if (val !== null) {
            rowChargesSum += val;
            if (charge.chargeToken) {
              if (tokens[charge.chargeToken] !== val) changed = true;
              tokens[charge.chargeToken] = val;
            }
          }
        }

        if (tokens[`${row.rowToken}_CHARGES`] !== rowChargesSum) {
          tokens[`${row.rowToken}_CHARGES`] = rowChargesSum;
          changed = true;
        }

        const rowTotal = rowBase + rowChargesSum;
        if (tokens[row.rowToken] !== rowTotal) {
          tokens[row.rowToken] = rowTotal;
          changed = true;
        }

        sectionBase += rowBase;
        sectionRowChargesTotal += rowChargesSum;
      }

      if (tokens[`SEC_${sectionToken}_BASE`] !== sectionBase) {
        tokens[`SEC_${sectionToken}_BASE`] = sectionBase;
        changed = true;
      }
      if (tokens[`SEC_${sectionToken}_CHARGES`] !== sectionRowChargesTotal) {
        tokens[`SEC_${sectionToken}_CHARGES`] = sectionRowChargesTotal;
        changed = true;
      }

      let sectionChargesSum = 0;
      for (const sc of sectionCharges) {
        const decoded = decodeFormula(sc.formula, sections, templateConstants);
        const fullFormula = (decoded ?? "").trim();
        const val = evaluateFormula(fullFormula, tokens);
        if (val !== null) {
          sectionChargesSum += val;
          if (sc.chargeToken) {
            if (tokens[sc.chargeToken] !== val) changed = true;
            tokens[sc.chargeToken] = val;
          }
        }
      }

      const secChargesTotal = sectionRowChargesTotal + sectionChargesSum;
      if (tokens[`SEC_${sectionToken}_CHARGES`] !== secChargesTotal) {
        tokens[`SEC_${sectionToken}_CHARGES`] = secChargesTotal;
        changed = true;
      }

      const secTotal = sectionBase + secChargesTotal;
      if (tokens[`SEC_${sectionToken}`] !== secTotal) {
        tokens[`SEC_${sectionToken}`] = secTotal;
        changed = true;
      }
    }
  }

  return tokens;
}

/** Round a number to 2 decimal places for display. */
export function fmt(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return val % 1 === 0 ? String(val) : val.toFixed(2);
}
