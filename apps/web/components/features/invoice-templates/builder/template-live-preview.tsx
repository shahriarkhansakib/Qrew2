"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Calculator, Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/constants";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

/** Formats a BigNumber string like "6166.206000" → "6,166.21" */
function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "";
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TemplateLivePreview({ templateId }: { templateId: string }) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const debouncedInputs = useDebounce(inputs, 500);

  // Fetch token keys to know what CAT_ inputs we can mock
  const { data: tokens } = useQuery({
    queryKey: ["invoice-tokens", templateId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoices/tokens?templateId=${templateId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const error = new Error("Failed to fetch tokens");
        (error as any).status = res.status;
        throw error;
      }
      return res.json();
    },
    staleTime: 60_000,
  });

  // Fetch the preview — NO polling. Refetches when:
  // 1. debouncedInputs changes (user types test values)
  // 2. queryClient.invalidateQueries(['invoice-preview', templateId]) is called after any mutation
  const {
    data: previewData,
    isLoading,
    error,
    isRefetching,
  } = useQuery({
    queryKey: ["invoice-preview", templateId, debouncedInputs],
    queryFn: async () => {
      const processedInputs: Record<string, string> = {};
      Object.entries(debouncedInputs).forEach(([k, v]) => {
        if (v !== undefined && v !== "" && !Number.isNaN(parseFloat(v))) {
          processedInputs[k] = v;
        }
      });

      const res = await fetch(`${apiUrl}/api/invoices/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateId, externalOverrides: processedInputs }),
      });
      if (!res.ok) {
        const errData = await res.json();
        const error = new Error(
          errData?.error?.message ||
            (typeof errData?.error === "string" ? errData.error : "Preview failed"),
        );
        (error as any).status = res.status;
        throw error;
      }
      return res.json();
    },
    retry: false,
    staleTime: Infinity, // Never auto-refetch — only refetch on explicit invalidation
    gcTime: 0, // Don't keep stale preview data around
  });

  const sections = previewData?.data?.sections ?? [];
  const grandTotal = previewData?.data?.grandTotal ?? "0";
  const validationErrors = previewData?.data?.validationErrors ?? [];
  let slCounter = 0;

  const inputTokens = [
    ...(tokens?.categories || []).map((c: any) => ({
      key: c.token,
      label: c.label,
    })),
    ...(tokens?.orgConfigs || []).map((o: any) => ({
      key: o.token,
      label: o.displayLabel,
    })),
    ...(tokens?.fileFields || []).map((f: any) => ({
      key: f.token,
      label: f.displayLabel,
    })),
  ];

  return (
    <div className="flex flex-col h-full bg-muted/10 border-l relative">
      <div className="p-4 border-b bg-background sticky top-0 z-10 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <Calculator className="h-5 w-5" />
          Live Preview
        </div>
        {(isLoading || isRefetching) && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Test Inputs Panel */}
        {inputTokens.length > 0 && (
          <div className="bg-card border rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Test Inputs
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {inputTokens.map(({ key, label }: { key: string; label: string }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs truncate" title={label}>
                    {label}
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    type="number"
                    placeholder="e.g. 100"
                    value={inputs[key] || ""}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation Errors Notice */}
        {validationErrors.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-300 p-3 rounded-xl text-xs space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
              Formula Notices ({validationErrors.length})
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-muted-foreground pl-1">
              {validationErrors.map((vErr: any, idx: number) => (
                <li key={idx}>
                  {vErr.rowToken ? `[${vErr.rowToken}] ` : ""}
                  {vErr.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* PDA Table Preview */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden font-sans">
          <div className="bg-gray-800 text-white px-4 py-2">
            <h3 className="text-sm font-bold tracking-wide uppercase">Invoice Preview</h3>
          </div>

          {error ? (
            <div className="bg-destructive/10 text-destructive p-4 flex items-start gap-3 m-4 rounded-md">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Formula Error</p>
                <p className="mt-1">{(error as any).message}</p>
              </div>
            </div>
          ) : isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Calculating...
            </div>
          ) : !sections.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No rows to preview. Add rows in the builder.
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="w-8 px-2 py-2 text-center font-bold text-gray-600 border-r border-gray-300">
                    SL
                  </th>
                  <th className="px-3 py-2 text-left font-bold text-gray-600 border-r border-gray-300">
                    DETAILS
                  </th>
                  <th className="w-24 px-2 py-2 text-right font-bold text-gray-600 border-r border-gray-300">
                    USD
                  </th>
                  <th className="w-24 px-2 py-2 text-right font-bold text-gray-600">USD</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section: any) => {
                  const sectionName =
                    section.label || (section.autoName ? `SECTION ${section.autoName}` : "");
                  return (
                    <React.Fragment key={section.sectionToken || section.id}>
                      {/* Section header row */}
                      {sectionName && (
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <td className="px-2 py-1 border-r border-gray-200" />
                          <td
                            colSpan={3}
                            className="px-3 py-1.5 font-bold text-gray-700 text-[11px] uppercase tracking-wide"
                          >
                            {sectionName}
                          </td>
                        </tr>
                      )}

                      {/* Rows */}
                      {(section.rows || []).map((row: any) => {
                        slCounter++;
                        const hasCharges = row.charges && row.charges.length > 0;
                        const baseVal = formatCurrency(row.baseValue);
                        const totalVal = formatCurrency(row.totalValue);

                        return (
                          <React.Fragment key={row.rowToken || row.id}>
                            {/* Main row */}
                            <tr className="border-b border-gray-100 hover:bg-gray-50/50">
                              <td className="px-2 py-2 text-center text-gray-500 border-r border-gray-100 align-top leading-tight">
                                {slCounter < 10 ? `0${slCounter}` : slCounter}
                              </td>
                              <td className="px-3 py-2 border-r border-gray-100">
                                <div className="font-semibold text-gray-800 leading-tight uppercase">
                                  {row.label}
                                </div>
                              </td>
                              <td className="px-2 py-2 text-right text-gray-700 font-mono border-r border-gray-100 align-top">
                                {hasCharges ? baseVal : ""}
                              </td>
                              <td className="px-2 py-2 text-right font-mono font-semibold text-gray-800 align-top">
                                {!hasCharges ? totalVal : ""}
                              </td>
                            </tr>

                            {/* Row Charge sub-rows */}
                            {hasCharges &&
                              row.charges.map((charge: any, idx: number) => {
                                const isLast = idx === row.charges.length - 1;
                                return (
                                  <tr
                                    key={charge.chargeToken || charge.id || idx}
                                    className="border-b border-gray-100 bg-muted/5"
                                  >
                                    <td className="border-r border-gray-100" />
                                    <td className="px-3 py-1.5 border-r border-gray-100">
                                      <div className="text-right text-gray-600 italic text-[11px]">
                                        {charge.label}
                                      </div>
                                      {charge.subDescription && (
                                        <div className="text-right text-gray-400 text-[10px]">
                                          {charge.subDescription}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-mono text-gray-600 border-r border-gray-100 text-[11px] align-top">
                                      {formatCurrency(charge.value)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-mono font-semibold text-gray-800 text-[11px] align-top">
                                      {isLast ? totalVal : ""}
                                    </td>
                                  </tr>
                                );
                              })}
                          </React.Fragment>
                        );
                      })}

                      {/* Section Charges */}
                      {(section.sectionCharges || []).map((sc: any) => (
                        <tr
                          key={sc.chargeToken || sc.id}
                          className="border-b border-gray-200 bg-gray-50/70"
                        >
                          <td className="border-r border-gray-200" />
                          <td className="px-3 py-1.5 border-r border-gray-200">
                            <div className="font-semibold text-gray-700 text-[11px] uppercase">
                              {sc.label}
                            </div>
                            {sc.subDescription && (
                              <div className="text-gray-500 text-[10px]">{sc.subDescription}</div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-700 border-r border-gray-200 text-[11px]">
                            {formatCurrency(sc.value)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-gray-800 text-[11px]">
                            {formatCurrency(sc.value)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* Grand Total */}
                <tr className="bg-gray-800 text-white">
                  <td className="px-2 py-2 border-r border-gray-600" />
                  <td className="px-3 py-2 font-bold text-sm uppercase tracking-wide border-r border-gray-600">
                    TOTAL
                  </td>
                  <td className="px-2 py-2 border-r border-gray-600" />
                  <td className="px-2 py-2 text-right font-mono font-bold text-sm">
                    {formatCurrency(grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
