import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Strips unnecessary trailing decimal zeros (.0, .00, .000) from numeric values.
 * Examples:
 *   formatNumber(50.00) -> "50"
 *   formatNumber("50.000") -> "50"
 *   formatNumber(5.50) -> "5.5"
 *   formatNumber(0) -> "0"
 *   formatNumber("—") -> "—"
 */
export function formatNumber(val: number | string | null | undefined, maxDecimals = 3): string {
  if (val === null || val === undefined || val === "") return "0";
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "" || trimmed === "—" || trimmed === "N/A" || trimmed === "-")
      return trimmed || "0";
    const num = parseFloat(trimmed);
    if (Number.isNaN(num)) return val;
    const factor = 10 ** maxDecimals;
    const rounded = Math.round((num + Number.EPSILON) * factor) / factor;
    return rounded.toString();
  }
  if (typeof val === "number") {
    if (Number.isNaN(val)) return "0";
    const factor = 10 ** maxDecimals;
    const rounded = Math.round((val + Number.EPSILON) * factor) / factor;
    return rounded.toString();
  }
  return String(val);
}

export function formatCurrency(val: number | string | null | undefined, prefix = "৳"): string {
  if (val === null || val === undefined || val === "" || val === "—") return "—";
  const numStr = formatNumber(val, 2);
  if (numStr === "—") return "—";
  return `${prefix}${numStr}`;
}
