export interface TemplateColumnDefinition {
  id: string;
  key: string;
  label: string;
  dataType: "serial" | "date" | "text" | "number" | "select";
  width?: string;
  align?: "left" | "center" | "right";
  options?: string[];
  isTotaled?: boolean;
  defaultValue?: any;
}

export function getColumnWidthStyle(col: TemplateColumnDefinition): React.CSSProperties {
  if (col.width) {
    const match = String(col.width).match(/^(\d+)(?:px)?$/);
    if (match) {
      const px = parseInt(match[1], 10);
      return { width: `${px}px`, minWidth: `${px}px`, flexShrink: 0 };
    }
    if (col.width === "flex-1") {
      return { flex: "1 1 0%", minWidth: "140px" };
    }
    if (col.width.startsWith("w-")) {
      const tailwindToPx: Record<string, number> = {
        "w-10": 40,
        "w-12": 48,
        "w-14": 56,
        "w-16": 64,
        "w-20": 80,
        "w-24": 96,
        "w-28": 112,
        "w-32": 128,
        "w-36": 144,
        "w-40": 160,
        "w-48": 192,
        "w-64": 256,
      };
      const px = tailwindToPx[col.width];
      if (px) {
        return { width: `${px}px`, minWidth: `${px}px`, flexShrink: 0 };
      }
    }
  }

  // Defaults based on dataType
  switch (col.dataType) {
    case "serial":
      return { width: "56px", minWidth: "56px", flexShrink: 0 };
    case "date":
      return { width: "144px", minWidth: "144px", flexShrink: 0 };
    case "number":
      return { width: "144px", minWidth: "144px", flexShrink: 0 };
    case "select":
      return { width: "144px", minWidth: "144px", flexShrink: 0 };
    case "text":
    default:
      return { flex: "1 1 0%", minWidth: "160px" };
  }
}
