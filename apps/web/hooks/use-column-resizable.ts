"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/constants";

export type ColumnWidthMap = Record<string, number>;

interface UseColumnResizableOptions {
  tableId: string;
  defaultWidths?: ColumnWidthMap;
  minWidth?: number;
  maxWidth?: number;
}

export function useColumnResizable({
  tableId,
  defaultWidths = {},
  minWidth = 80,
  maxWidth = 600,
}: UseColumnResizableOptions) {
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(defaultWidths);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial load from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`table-widths-${tableId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          setColumnWidths((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch (_e) {}
  }, [tableId]);

  // 2. Fetch from Database per-user settings
  const { data: userPrefsData } = useQuery({
    queryKey: ["userPreferences"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/user-preferences`, {
        credentials: "include",
      });
      if (!res.ok) return { preferences: {} };
      return res.json();
    },
    staleTime: 60000,
  });

  useEffect(() => {
    if (userPrefsData?.preferences?.tableWidths?.[tableId]) {
      const dbWidths = userPrefsData.preferences.tableWidths[tableId];
      if (dbWidths && typeof dbWidths === "object") {
        setColumnWidths((prev) => {
          const next = { ...prev, ...dbWidths };
          try {
            localStorage.setItem(`table-widths-${tableId}`, JSON.stringify(next));
          } catch (_e) {}
          return next;
        });
      }
    }
  }, [userPrefsData, tableId]);

  // Sync to DB (debounced)
  const syncToDatabase = useCallback(
    (widths: ColumnWidthMap) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch(`${apiUrl}/api/workspaces/user-preferences`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              preferences: {
                tableWidths: {
                  [tableId]: widths,
                },
              },
            }),
          });
        } catch (_e) {}
      }, 600);
    },
    [tableId],
  );

  const handleResizeStart = useCallback(
    (columnKey: string, startEvent: React.MouseEvent, currentElementWidth?: number) => {
      // Disable drag resizing on mobile screens (< 768px)
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        return;
      }

      startEvent.stopPropagation();
      startEvent.preventDefault();

      const startX = startEvent.clientX;
      const initialWidth =
        columnWidths[columnKey] || currentElementWidth || defaultWidths[columnKey] || 150;

      let latestWidths = { ...columnWidths };

      const onMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(initialWidth + deltaX)));

        latestWidths = { ...latestWidths, [columnKey]: newWidth };
        setColumnWidths((prev) => {
          const next = { ...prev, [columnKey]: newWidth };
          try {
            localStorage.setItem(`table-widths-${tableId}`, JSON.stringify(next));
          } catch (_err) {}
          return next;
        });
      };

      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        syncToDatabase(latestWidths);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [columnWidths, defaultWidths, minWidth, maxWidth, tableId, syncToDatabase],
  );

  const resetColumnWidth = useCallback(
    (columnKey: string) => {
      setColumnWidths((prev) => {
        const next = { ...prev };
        delete next[columnKey];
        try {
          localStorage.setItem(`table-widths-${tableId}`, JSON.stringify(next));
        } catch (_e) {}
        syncToDatabase(next);
        return next;
      });
    },
    [tableId, syncToDatabase],
  );

  return {
    columnWidths,
    handleResizeStart,
    resetColumnWidth,
  };
}
