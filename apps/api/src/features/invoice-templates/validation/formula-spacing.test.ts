import { normalizeFormulaSpacing } from "@starter/db/formula-codec";
import { describe, expect, it } from "vitest";

describe("Formula Spacing Engine — Canonical Delimiter-Owned Spacing", () => {
  describe("Binary Arithmetic Operators (+, -, *, /, //, %)", () => {
    it("normalizes basic arithmetic expressions to single-space delimiter padding", () => {
      expect(normalizeFormulaSpacing("A+B")).toBe("A + B");
      expect(normalizeFormulaSpacing("A-B")).toBe("A - B");
      expect(normalizeFormulaSpacing("A*B")).toBe("A * B");
      expect(normalizeFormulaSpacing("A/B")).toBe("A / B");
      expect(normalizeFormulaSpacing("A//B")).toBe("A // B");
      expect(normalizeFormulaSpacing("A%B")).toBe("A % B");
    });

    it("collapses irregular or multiple spaces around operators", () => {
      expect(normalizeFormulaSpacing("A    +    B")).toBe("A + B");
      expect(normalizeFormulaSpacing("PORT_DUES   *   0.15")).toBe("PORT_DUES * 0.15");
      expect(normalizeFormulaSpacing("SEC_A_BASE   //   2")).toBe("SEC_A_BASE // 2");
    });

    it("handles chained operators and expressions cleanly", () => {
      expect(normalizeFormulaSpacing("ROW1*0.15+ROW2*2-ROW3/10")).toBe(
        "ROW1 * 0.15 + ROW2 * 2 - ROW3 / 10",
      );
    });
  });

  describe("Percentage Syntactic Sugar vs Modulo Operator", () => {
    it("preserves percentages clinging to numbers while padding binary operators", () => {
      expect(normalizeFormulaSpacing("PORT_DUES * 50%")).toBe("PORT_DUES * 50%");
      expect(normalizeFormulaSpacing("PORT_DUES*50%")).toBe("PORT_DUES * 50%");
      expect(normalizeFormulaSpacing("PORT_DUES * 50 %")).toBe("PORT_DUES * 50%");
      expect(normalizeFormulaSpacing("PORT_DUES * 0.15%")).toBe("PORT_DUES * 0.15%");
      expect(normalizeFormulaSpacing("50% + 20%")).toBe("50% + 20%");
    });

    it("pads modulo operator % between operands with spaces", () => {
      expect(normalizeFormulaSpacing("ROW1%ROW2")).toBe("ROW1 % ROW2");
      expect(normalizeFormulaSpacing("ROW1 % ROW2")).toBe("ROW1 % ROW2");
      expect(normalizeFormulaSpacing("ROW1 // ROW2")).toBe("ROW1 // ROW2");
    });
  });

  describe("Unary Minus vs Binary Subtraction", () => {
    it("distinguishes unary minus at start of formula from binary minus", () => {
      expect(normalizeFormulaSpacing("-10 + 5")).toBe("-10 + 5");
      expect(normalizeFormulaSpacing("- 10 + 5")).toBe("-10 + 5");
      expect(normalizeFormulaSpacing("-PORT_DUES * 2")).toBe("-PORT_DUES * 2");
    });

    it("distinguishes unary minus directly after operators or opening parentheses", () => {
      expect(normalizeFormulaSpacing("A * -1")).toBe("A * -1");
      expect(normalizeFormulaSpacing("A * - 1")).toBe("A * -1");
      expect(normalizeFormulaSpacing("(-5 + 10)")).toBe("(-5 + 10)");
      expect(normalizeFormulaSpacing("( - 5 + 10 )")).toBe("(-5 + 10)");
      expect(normalizeFormulaSpacing("CLAMP(-10, -50, 0)")).toBe("CLAMP(-10, -50, 0)");
    });

    it("formats binary subtraction with spaces on both sides", () => {
      expect(normalizeFormulaSpacing("A-B")).toBe("A - B");
      expect(normalizeFormulaSpacing("10-5")).toBe("10 - 5");
      expect(normalizeFormulaSpacing("(A + B) - C")).toBe("(A + B) - C");
      expect(normalizeFormulaSpacing("50% - 10")).toBe("50% - 10");
    });
  });

  describe("Parentheses Spacing and Depth Invariants", () => {
    it("ensures zero internal space inside parentheses", () => {
      expect(normalizeFormulaSpacing("( A + B )")).toBe("(A + B)");
      expect(normalizeFormulaSpacing("(   PORT_DUES   )")).toBe("(PORT_DUES)");
      expect(normalizeFormulaSpacing("( ( A + B ) * ( C - D ) )")).toBe("((A + B) * (C - D))");
    });

    it("ensures binary operators outside parentheses have standard single spaces", () => {
      expect(normalizeFormulaSpacing("(A+B)*(C+D)")).toBe("(A + B) * (C + D)");
      expect(normalizeFormulaSpacing("(A + B) * (C + D)")).toBe("(A + B) * (C + D)");
      expect(normalizeFormulaSpacing("A+(B*C)")).toBe("A + (B * C)");
    });
  });

  describe("Function Calls and Arguments", () => {
    it("ensures zero space between function name and opening parenthesis", () => {
      expect(normalizeFormulaSpacing("CLAMP ( A , 10 , 100 )")).toBe("CLAMP(A, 10, 100)");
      expect(normalizeFormulaSpacing("ROUND ( PORT_DUES , 2 )")).toBe("ROUND(PORT_DUES, 2)");
      expect(normalizeFormulaSpacing("MIN ( A , B )")).toBe("MIN(A, B)");
      expect(normalizeFormulaSpacing("MAX ( A , B , C )")).toBe("MAX(A, B, C)");
    });

    it("formats commas with zero leading space and exactly one trailing space", () => {
      expect(normalizeFormulaSpacing("CLAMP(A,10,100)")).toBe("CLAMP(A, 10, 100)");
      expect(normalizeFormulaSpacing("CLAMP(A , 10 , 100)")).toBe("CLAMP(A, 10, 100)");
      expect(normalizeFormulaSpacing("ROUND(PORT_DUES,2)")).toBe("ROUND(PORT_DUES, 2)");
    });

    it("formats nested function calls cleanly", () => {
      expect(normalizeFormulaSpacing("ROUND( CLAMP( CRANE_BASE * 1.2 , 100 , 500 ) , 2 )")).toBe(
        "ROUND(CLAMP(CRANE_BASE * 1.2, 100, 500), 2)",
      );
    });
  });

  describe("Database Storage Placeholders & Token Tags", () => {
    it("preserves encoded token tags and surrounding operator spacing", () => {
      expect(normalizeFormulaSpacing("{{$tok:row-1}}_BASE*0.15")).toBe(
        "{{$tok:row-1}}_BASE * 0.15",
      );
      expect(normalizeFormulaSpacing("{{$tok:row-1}}+{{$tok:row-2}}")).toBe(
        "{{$tok:row-1}} + {{$tok:row-2}}",
      );
      expect(normalizeFormulaSpacing("{{$row:row-1}}_BASE   *   GBL_VAT_RATE")).toBe(
        "{{$row:row-1}}_BASE * GBL_VAT_RATE",
      );
    });
  });

  describe("Edge Cases and Degenerate Inputs", () => {
    it("handles empty or whitespace-only strings gracefully", () => {
      expect(normalizeFormulaSpacing("")).toBe("");
      expect(normalizeFormulaSpacing("   ")).toBe("");
      expect(normalizeFormulaSpacing(null as any)).toBe("");
      expect(normalizeFormulaSpacing(undefined as any)).toBe("");
    });

    it("handles single token or single number cleanly", () => {
      expect(normalizeFormulaSpacing("PORT_DUES")).toBe("PORT_DUES");
      expect(normalizeFormulaSpacing("  PORT_DUES  ")).toBe("PORT_DUES");
      expect(normalizeFormulaSpacing("1500.50")).toBe("1500.50");
      expect(normalizeFormulaSpacing("  1500.50  ")).toBe("1500.50");
    });
  });

  describe("Token Addition, Removal, and Variant Swapping Invariants", () => {
    it("maintains canonical spacing when swapping a token variant (e.g. Base -> Charges -> Total)", () => {
      const initial = "PORT_DUES_BASE * 0.15 + SEC_A_BASE";
      expect(normalizeFormulaSpacing(initial)).toBe("PORT_DUES_BASE * 0.15 + SEC_A_BASE");

      // Swap PORT_DUES_BASE -> PORT_DUES_CHARGES
      const swapped1 = initial.replace("PORT_DUES_BASE", "PORT_DUES_CHARGES");
      expect(normalizeFormulaSpacing(swapped1)).toBe("PORT_DUES_CHARGES * 0.15 + SEC_A_BASE");

      // Swap to bare Total
      const swapped2 = swapped1.replace("PORT_DUES_CHARGES", "PORT_DUES");
      expect(normalizeFormulaSpacing(swapped2)).toBe("PORT_DUES * 0.15 + SEC_A_BASE");
    });

    it("maintains canonical spacing when prepending or appending tokens and operators", () => {
      let formula = "PORT_DUES";
      expect(normalizeFormulaSpacing(formula)).toBe("PORT_DUES");

      // User types operator + and operand
      formula = `${formula} + VAT_RATE`;
      expect(normalizeFormulaSpacing(formula)).toBe("PORT_DUES + VAT_RATE");

      // User wraps into parentheses and multiplies
      formula = `(${formula}) * 1.5`;
      expect(normalizeFormulaSpacing(formula)).toBe("(PORT_DUES + VAT_RATE) * 1.5");

      // User wraps into CLAMP function with bounds
      formula = `CLAMP(${formula}, 100, 5000)`;
      expect(normalizeFormulaSpacing(formula)).toBe(
        "CLAMP((PORT_DUES + VAT_RATE) * 1.5, 100, 5000)",
      );

      // User removes an inner token: replace VAT_RATE with 0
      formula = formula.replace("VAT_RATE", "0");
      expect(normalizeFormulaSpacing(formula)).toBe("CLAMP((PORT_DUES + 0) * 1.5, 100, 5000)");

      // User removes the outer CLAMP wrapping
      formula = "(PORT_DUES + 0) * 1.5";
      expect(normalizeFormulaSpacing(formula)).toBe("(PORT_DUES + 0) * 1.5");
    });

    it("handles backspacing simulation without breaking canonical formatting", () => {
      // Starting from a complex formula: "ROUND(PORT_DUES * 0.15 + VAT_RATE, 2)"
      const f1 = "ROUND(PORT_DUES * 0.15 + VAT_RATE, 2)";
      expect(normalizeFormulaSpacing(f1)).toBe("ROUND(PORT_DUES * 0.15 + VAT_RATE, 2)");

      // Backspacing ", 2)"
      const f2 = "ROUND(PORT_DUES * 0.15 + VAT_RATE";
      expect(normalizeFormulaSpacing(f2)).toBe("ROUND(PORT_DUES * 0.15 + VAT_RATE");

      // Backspacing " + VAT_RATE"
      const f3 = "ROUND(PORT_DUES * 0.15";
      expect(normalizeFormulaSpacing(f3)).toBe("ROUND(PORT_DUES * 0.15");

      // Backspacing " * 0.15"
      const f4 = "ROUND(PORT_DUES";
      expect(normalizeFormulaSpacing(f4)).toBe("ROUND(PORT_DUES");

      // Backspacing "("
      const f5 = "ROUND";
      expect(normalizeFormulaSpacing(f5)).toBe("ROUND");
    });
  });
});
