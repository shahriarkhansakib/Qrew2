"use client";

import { useCallback, useState } from "react";

export type ColumnFilters = Record<string, string>;

export function useTableCellFilter() {
  const [filters, setFilters] = useState<ColumnFilters>({});

  const setFilter = useCallback((columnKey: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [columnKey]: value,
    }));
  }, []);

  const toggleFilter = useCallback((columnKey: string, value: string) => {
    setFilters((prev) => {
      // If already filtered by this column (regardless of exact value or matching value), toggle it off
      if (prev[columnKey]) {
        const next = { ...prev };
        delete next[columnKey];
        return next;
      }
      return {
        ...prev,
        [columnKey]: value,
      };
    });
  }, []);

  const clearColumnFilter = useCallback((columnKey: string) => {
    setFilters((prev) => {
      if (!prev[columnKey]) return prev;
      const next = { ...prev };
      delete next[columnKey];
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
  }, []);

  const filterRows = useCallback(
    <T>(data: T[], extractors: Record<string, (row: T) => any>): T[] => {
      if (!data || !Array.isArray(data)) return [];
      const activeKeys = Object.keys(filters).filter(
        (k) => filters[k] !== undefined && filters[k] !== null && filters[k] !== "",
      );
      if (activeKeys.length === 0) return data;

      return data.filter((row) => {
        return activeKeys.every((colKey) => {
          const targetValue = String(filters[colKey]).trim().toLowerCase();
          const extractor = extractors[colKey];
          if (!extractor) return true;
          const rawValue = extractor(row);
          if (rawValue === undefined || rawValue === null)
            return targetValue === "" || targetValue === "-";
          const cellStr = String(rawValue).trim().toLowerCase();
          return cellStr === targetValue || cellStr.includes(targetValue);
        });
      });
    },
    [filters],
  );

  const isColumnFiltered = useCallback(
    (columnKey: string) => {
      return Boolean(filters[columnKey]);
    },
    [filters],
  );

  return {
    filters,
    setFilter,
    toggleFilter,
    clearColumnFilter,
    clearAllFilters,
    filterRows,
    isColumnFiltered,
    hasActiveFilters: Object.keys(filters).length > 0,
  };
}
