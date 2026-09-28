"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBuilderContext } from "../builder-context";
import { renderHighlightedToken, SyntaxOverlay } from "../formula-bar-syntax";
import { getChunkAtCursor, isValidTokenPrefix, validateFormulaSave } from "../formula-bar-utils";
import { useFormulaAutocomplete } from "../use-formula-autocomplete";
import { useFormulaKeyDown } from "../use-formula-keydown";
import { useSaveCellMutation } from "../use-save-cell";
import { FormulaActions } from "./formula-actions";
import { useFormulaHistory } from "./use-formula-history";

export function TemplateFormulaBar() {
  const {
    selectedCell,
    setSelectedCell,
    tokenMap,
    sections,
    clipboardToken,
    getTokenColor,
    hiddenTokens,
    invalidTokens,
    getTokenDisabledReason,
  } = useBuilderContext();
  const saveMutation = useSaveCellMutation();

  const [inputValue, setInputValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const cursorPosRef = useRef(0);
  const { history, historyIndex, undo, redo, resetHistory, markUndoRedo } = useFormulaHistory(
    inputValue,
    setInputValue,
  );

  const isDirty = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // We need to sync cursorPos whenever inputValue changes or selection changes.
  useEffect(() => {
    if (inputRef.current) {
      const pos = inputRef.current.selectionStart ?? inputValue.length;
      setCursorPos(pos);
      cursorPosRef.current = pos;
    }
  }, [inputValue]);

  const selectedCellRef = useRef(selectedCell);
  useEffect(() => {
    selectedCellRef.current = selectedCell;
  }, [selectedCell]);

  const isActive = !!selectedCell;
  const isPending = saveMutation.isPending;

  const {
    state: ac,
    setState: setAcState,
    setActiveIdx,
    isVisible: acVisible,
    lastWord,
    allTokens,
  } = useFormulaAutocomplete(
    inputValue,
    cursorPos,
    tokenMap,
    isActive,
    selectedCell?.token,
    invalidTokens,
    hiddenTokens,
  );

  const allTokensRef = useRef<string[]>(allTokens);
  const hiddenTokensRef = useRef<Set<string>>(hiddenTokens);
  const invalidTokensRef = useRef<Set<string>>(invalidTokens);
  useEffect(() => {
    allTokensRef.current = allTokens;
    hiddenTokensRef.current = hiddenTokens;
    invalidTokensRef.current = invalidTokens;
  }, [allTokens, hiddenTokens, invalidTokens]);

  const isFormulaInput = selectedCell?.valueType === "formula";

  useEffect(() => {
    const initial = selectedCell?.currentInput ?? "";
    resetHistory(initial);
    setInputValue(initial);
    isDirty.current = false;
    if (overlayRef.current && inputRef.current) {
      overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }, [selectedCell, resetHistory]);

  useEffect(() => {
    const handleInsertToken = (e: any) => {
      if (!selectedCellRef.current) return;
      const tokenToInsert: string = e.detail.trim();

      setInputValue((prev) => {
        const base = prev ?? "";

        // We use the exact cursor position to determine where to insert!
        const cursor = cursorPosRef.current;
        const before = base.slice(0, cursor);
        const after = base.slice(cursor);

        const trimmedBefore = before.trimEnd();
        const lastChar = trimmedBefore[trimmedBefore.length - 1];

        // Ensure we don't insert a closing parenthesis without an open one (globally)
        if (tokenToInsert === ")") {
          const openCount = (base.match(/\(/g) || []).length;
          const closeCount = (base.match(/\)/g) || []).length;
          if (closeCount >= openCount) {
            toast.error("Cannot add closing parenthesis (no open pair)");
            return prev;
          }
        }

        const isBinaryOp = ["+", "-", "*", "/", "%", "//"].includes(tokenToInsert);
        const isOpenParen = tokenToInsert === "(";
        const isCloseParen = tokenToInsert === ")";
        const isOp = isBinaryOp || isOpenParen || isCloseParen;

        if (isBinaryOp || isOpenParen) {
          if (trimmedBefore.length > 0) {
            const lastWordMatch = trimmedBefore.match(/[A-Z0-9_]+$/);
            const lastWordInBuffer = lastWordMatch ? lastWordMatch[0] : "";
            const isLegacy =
              lastWordInBuffer.startsWith("GBL_") ||
              lastWordInBuffer.startsWith("FILE_") ||
              lastWordInBuffer.endsWith("_TOTAL");
            const canonicalEquivalent = lastWordInBuffer
              .replace(/^(GBL_|FILE_)/, "")
              .replace(/_TOTAL$/, "");
            if (
              lastWordInBuffer &&
              !allTokensRef.current.includes(lastWordInBuffer) &&
              !(isLegacy && allTokensRef.current.includes(canonicalEquivalent)) &&
              !/^[0-9.]+$/.test(lastWordInBuffer)
            ) {
              toast.error(
                `"${lastWordInBuffer}" is not a complete token. Finish the token before adding an operator.`,
              );
              return prev;
            }
            if (isOpenParen && lastChar && /[A-Z0-9_)]/.test(lastChar)) {
              toast.error("Add an operator before opening a parenthesis after a token or number.");
              return prev;
            }
          }
          if (isBinaryOp && trimmedBefore.length > 0) {
            if (tokenToInsert === "/" && before.endsWith(" / ")) {
              const newVal = `${before.slice(0, -3)} // ${after}`;
              setTimeout(() => inputRef.current?.setSelectionRange(cursor + 1, cursor + 1), 0);
              return newVal;
            }
            const lastMeaningfulChar = lastChar;
            if (lastMeaningfulChar && /[+\-*/%]/.test(lastMeaningfulChar)) {
              return prev;
            }
          }
        }

        if (!isOp && trimmedBefore.length > 0) {
          if (lastChar && /[A-Za-z0-9_)]/.test(lastChar)) {
            toast.error("Add an operator before inserting another token.");
            return prev;
          }
        }

        if (!isOp && selectedCellRef.current?.token) {
          const currentToken = selectedCellRef.current.token;
          if (tokenToInsert === currentToken || tokenToInsert === `${currentToken}_TOTAL`) {
            toast.error(
              `Circular reference: a formula cannot reference its own token "${tokenToInsert}"`,
            );
            return prev;
          }
          if (invalidTokensRef.current.has(tokenToInsert)) {
            toast.error(`Circular reference: "${tokenToInsert}" depends on the current cell.`);
            return prev;
          }
          if (hiddenTokensRef.current.has(tokenToInsert)) {
            toast.error(`Invalid token: "${tokenToInsert}" is hidden or not applicable here.`);
            return prev;
          }
        }

        const prefix = before.endsWith(" ") || before === "" ? "" : " ";
        // If 'after' already starts with a space or is empty, no suffix needed.
        const suffix =
          after.startsWith(" ") || after === "" || isOpenParen || isCloseParen ? "" : " ";

        let inserted = tokenToInsert;
        if (!isOpenParen && !isCloseParen) {
          inserted = tokenToInsert + suffix;
        }

        const newVal = before + prefix + inserted + after;

        // Reposition cursor exactly after the insertion (including suffix)
        const newCursorPos = before.length + prefix.length + inserted.length;
        setTimeout(() => inputRef.current?.setSelectionRange(newCursorPos, newCursorPos), 0);

        return newVal;
      });
      isDirty.current = true;
      inputRef.current?.focus();
    };

    window.addEventListener("insert-token", handleInsertToken);
    return () => window.removeEventListener("insert-token", handleInsertToken);
  }, []);

  useEffect(() => {
    if (selectedCell) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [selectedCell?.rowId, selectedCell?.chargeId, selectedCell]);

  const handleSave = useCallback(() => {
    if (!selectedCell || saveMutation.isPending) return;
    if (!isDirty.current) {
      setSelectedCell(null);
      return;
    }
    const trimmed = inputValue.trim();
    if (trimmed === selectedCell.currentInput) {
      setSelectedCell(null);
      return;
    }

    if (trimmed !== "" && selectedCell.valueType === "formula") {
      const fullTokenList = Object.keys(tokenMap);
      const error = validateFormulaSave(
        trimmed,
        fullTokenList,
        selectedCell.token,
        invalidTokens,
        hiddenTokens,
      );
      if (error) {
        toast.error(error);
        inputRef.current?.focus();
        return;
      }
    }

    saveMutation.mutate({ cell: selectedCell, rawInput: trimmed });
  }, [
    selectedCell,
    inputValue,
    saveMutation,
    setSelectedCell,
    tokenMap,
    invalidTokens,
    hiddenTokens,
  ]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (!isActive) return;
      const target = e.target as HTMLElement;
      if (
        target.closest(".formula-bar-container") ||
        target.closest(".token-pool-container") ||
        target.closest(".row-action-trigger") ||
        target.closest(".insertable-token")
      ) {
        return;
      }
      if (isDirty.current) {
        handleSave();
      } else {
        setSelectedCell(null);
      }
    };
    document.addEventListener("mousedown", handleGlobalClick);
    return () => document.removeEventListener("mousedown", handleGlobalClick);
  }, [isActive, handleSave, setSelectedCell]);

  const insertToken = useCallback(
    (token: string) => {
      if (!selectedCellRef.current) return;
      const target = inputRef.current;
      const selStart = target?.selectionStart ?? inputValue.length;

      const withoutPartial = inputValue.slice(0, selStart - lastWord.length);
      const afterCursor = inputValue.slice(selStart);

      const padLeft =
        withoutPartial.endsWith(" ") || withoutPartial === "" || withoutPartial.endsWith("(")
          ? ""
          : " ";
      const newVal = `${withoutPartial + padLeft + token} ${afterCursor}`;

      setInputValue(newVal);
      isDirty.current = true;

      setAcState((prev) => ({ ...prev, items: [] }));

      setTimeout(() => {
        inputRef.current?.focus();
        const pos = withoutPartial.length + padLeft.length + token.length + 1;
        inputRef.current?.setSelectionRange(pos, pos);
      }, 0);
    },
    [inputValue, lastWord, setAcState],
  );

  const handleKeyDown = useFormulaKeyDown({
    inputValue,
    setInputValue,
    isDirty,
    inputRef: inputRef as any,
    allTokens,
    acVisible,
    ac,
    insertToken,
    setActiveIdx,
    setAcState,
    handleSave,
    setSelectedCell,
    currentToken: selectedCell?.token,
    invalidTokens,
    onUndo: () => undo(inputRef, isDirty),
    onRedo: () => redo(inputRef, isDirty),
  });

  const handleMouseDeleteWord = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!inputRef.current) return;
    const cursor = cursorPosRef.current;

    setInputValue((prev) => {
      if (!prev) return prev;
      const chunk = getChunkAtCursor(prev, cursor);
      if (!chunk) return prev;

      let removeStart = chunk.start;
      let removeEnd = chunk.end;

      // Expand to consume ONE adjacent space to keep spacing clean
      if (prev[removeEnd] === " ") removeEnd++;
      else if (prev[removeStart - 1] === " ") removeStart--;

      const newVal = prev.slice(0, removeStart) + prev.slice(removeEnd);

      // We must reposition cursor after render
      setTimeout(() => {
        inputRef.current?.setSelectionRange(removeStart, removeStart);
      }, 0);

      return newVal;
    });
    isDirty.current = true;
    inputRef.current?.focus();
  };
  const handleMouseBackspace = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!inputRef.current) return;
    const cursor = cursorPosRef.current;
    if (cursor === 0) return;

    // We are deleting the character at `cursor - 1`.
    const charToDelete = inputValue[cursor - 1];

    if (charToDelete !== " ") {
      // Check if we are inside a token chunk
      const chunk = getChunkAtCursor(inputValue, cursor - 1);
      if (chunk && /^[A-Za-z0-9_.]+$/.test(chunk.text)) {
        // Calculate what the chunk would look like after deletion
        const relativePos = cursor - 1 - chunk.start;
        const newChunkText = chunk.text.slice(0, relativePos) + chunk.text.slice(relativePos + 1);

        // If the new chunk text is not a valid prefix, block the deletion!
        if (newChunkText.length > 0 && !isValidTokenPrefix(newChunkText, allTokensRef.current)) {
          toast.error(`Cannot delete: "${newChunkText}" does not match any valid token.`);
          return; // silent reject or toast
        }
      }
    }

    setInputValue((prev) => {
      // handle smart deletion of ` // `
      if (cursor >= 4 && prev.slice(cursor - 4, cursor) === " // ") {
        setTimeout(() => inputRef.current?.setSelectionRange(cursor - 4, cursor - 4), 0);
        return prev.slice(0, cursor - 4) + prev.slice(cursor);
      }

      // handle smart deletion of ` + `
      if (cursor >= 3 && prev[cursor - 1] === " ") {
        const char2 = prev[cursor - 2];
        const char3 = prev[cursor - 3];
        if (/[+\-*/%]/.test(char2) && char3 === " ") {
          setTimeout(() => inputRef.current?.setSelectionRange(cursor - 3, cursor - 3), 0);
          return prev.slice(0, cursor - 3) + prev.slice(cursor);
        }
      }

      const newCursor = cursor - 1;
      const newVal = prev.slice(0, newCursor) + prev.slice(cursor);

      setTimeout(() => inputRef.current?.setSelectionRange(newCursor, newCursor), 0);
      return newVal;
    });
    isDirty.current = true;
    inputRef.current?.focus();
  };

  const handleMouseClear = (e: React.MouseEvent) => {
    e.preventDefault();
    setInputValue("");
    isDirty.current = true;
    inputRef.current?.focus();
  };

  const handleMousePaste = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!clipboardToken) return;

    if (hiddenTokens.has(clipboardToken)) {
      toast.error(`Cannot paste: "${clipboardToken}" is hidden or not applicable here.`);
      return;
    }
    if (invalidTokens.has(clipboardToken)) {
      toast.error(`Cannot paste: "${clipboardToken}" creates a circular dependency.`);
      return;
    }
    if (
      selectedCell?.token &&
      (clipboardToken === selectedCell.token || clipboardToken === `${selectedCell.token}_TOTAL`)
    ) {
      toast.error(`Cannot paste: a formula cannot reference its own token "${clipboardToken}"`);
      return;
    }
    insertToken(clipboardToken);
  };

  const handleMouseInsertChar = (e: React.MouseEvent, char: string) => {
    e.preventDefault();
    setInputValue((prev) => prev + char);
    isDirty.current = true;
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col w-full sticky top-0 z-30 formula-bar-container">
      <FormulaActions
        isActive={isActive}
        historyIndex={historyIndex}
        historyLength={history.length}
        clipboardToken={clipboardToken}
        onUndo={(e) => {
          e.preventDefault();
          undo(inputRef, isDirty);
        }}
        onRedo={(e) => {
          e.preventDefault();
          redo(inputRef, isDirty);
        }}
        onPaste={handleMousePaste}
        onInsertChar={handleMouseInsertChar}
        onDeleteWord={handleMouseDeleteWord}
        onBackspace={handleMouseBackspace}
        onClear={handleMouseClear}
      />

      <div className="relative w-full z-40 shadow-sm" style={{ height: 36 }}>
        <div
          className={cn(
            "absolute top-0 left-0 w-full flex items-stretch border border-border bg-background transition-all duration-150 rounded-md shadow-md",
            isActive ? "ring-1 ring-inset ring-primary/40" : "",
          )}
          style={{ minHeight: 36 }}
        >
          <div className="w-12 sm:w-48 md:w-52 shrink-0 flex items-center gap-2 px-2 sm:px-3 border-r border-border bg-muted/30">
            <span
              className="text-sm font-bold select-none shrink-0"
              style={{ color: isActive ? "#a78bfa" : undefined }}
            >
              ƒx
            </span>
            {isActive ? (
              <span
                className="hidden sm:inline text-xs text-foreground/70 truncate font-medium"
                title={selectedCell.breadcrumb}
              >
                {selectedCell.breadcrumb}
              </span>
            ) : (
              <span className="hidden sm:inline text-xs text-muted-foreground/30 italic truncate">
                no cell selected
              </span>
            )}
          </div>

          <div className="flex-1 relative flex items-center">
            {isActive && isFormulaInput && (
              <div
                ref={overlayRef}
                className="absolute inset-0 px-3 py-1.5 pointer-events-none whitespace-pre-wrap break-all overflow-hidden font-mono text-sm leading-normal"
                aria-hidden="true"
              >
                <SyntaxOverlay value={inputValue} getTokenColor={getTokenColor} />
              </div>
            )}

            <TextareaAutosize
              ref={inputRef}
              minRows={1}
              maxRows={5}
              value={inputValue}
              onScroll={(e) => {
                if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop;
              }}
              onPaste={(e) => {
                e.preventDefault();
                const clipboardRaw = e.clipboardData.getData("text");
                if (!clipboardRaw) return;

                // Flat value input (non-formula)
                if (!isFormulaInput) {
                  const numeric = clipboardRaw.trim().replace(/[^0-9.-]/g, "");
                  if (!numeric) {
                    toast.error("Only numbers can be pasted into a flat value cell.");
                    return;
                  }
                  const target = inputRef.current;
                  const selStart = target?.selectionStart ?? inputValue.length;
                  const selEnd = target?.selectionEnd ?? inputValue.length;
                  const newVal = inputValue.slice(0, selStart) + numeric + inputValue.slice(selEnd);
                  setInputValue(newVal);
                  isDirty.current = true;
                  setTimeout(() => {
                    const pos = selStart + numeric.length;
                    target?.setSelectionRange(pos, pos);
                  }, 0);
                  return;
                }

                // Formula input
                let pasted = clipboardRaw.trim().toUpperCase();
                if (pasted.startsWith("=")) {
                  pasted = pasted.slice(1).trim();
                }

                // Disallow invalid characters
                if (!/^[A-Z0-9_.\s+\-*/%()]+$/.test(pasted)) {
                  toast.error("Pasted text contains invalid characters for a formula.");
                  return;
                }

                // 1. Validate all tokens inside pasted string
                const tokensInPaste = pasted.match(/[A-Z_][A-Z0-9_]*/g) || [];
                const fullTokenList = Object.keys(tokenMap);
                for (const t of tokensInPaste) {
                  if (hiddenTokens.has(t)) {
                    toast.error(`Cannot paste: "${t}" is not allowed in this cell.`);
                    return;
                  }
                  if (invalidTokens.has(t)) {
                    toast.error(`Cannot paste: "${t}" creates a circular dependency.`);
                    return;
                  }
                  if (
                    selectedCell?.token &&
                    (t === selectedCell.token || t === `${selectedCell.token}_TOTAL`)
                  ) {
                    toast.error(`Cannot paste: a formula cannot reference its own token "${t}"`);
                    return;
                  }
                  if (!allTokensRef.current.includes(t) && !fullTokenList.includes(t)) {
                    toast.error(`Cannot paste: "${t}" does not match any valid token.`);
                    return;
                  }
                }

                // 2. Strictly normalize operator spacing
                let normalized = pasted
                  .replace(/\s*\/\/\s*/g, " // ")
                  .replace(/\s*([+\-*/])\s*/g, " $1 ")
                  .replace(/\s{2,}/g, " ")
                  .replace(/\(\s+/g, "(")
                  .replace(/\s+\)/g, ")")
                  .replace(/\)(?=[A-Z0-9])/g, ") ")
                  .replace(/([A-Z0-9_])\(/g, "$1 (")
                  .trim();

                // Preserve percentage attached to numbers: "50 %" -> "50%"
                normalized = normalized.replace(/(\d+)\s+%/g, "$1%");

                // 3. Boundary validation at cursor position
                const target = inputRef.current;
                const selStart = target?.selectionStart ?? inputValue.length;
                const selEnd = target?.selectionEnd ?? inputValue.length;
                const before = inputValue.slice(0, selStart);
                const after = inputValue.slice(selEnd);

                let padLeft = "";
                let padRight = "";

                const trimmedBefore = before.trimEnd();
                if (trimmedBefore.length > 0) {
                  const lastChar = trimmedBefore[trimmedBefore.length - 1];
                  const firstPastedChar = normalized[0];

                  if (/[A-Z0-9_)]/.test(lastChar) && /[A-Z0-9_(]/.test(firstPastedChar)) {
                    toast.error("Add an operator before pasting a token/number.");
                    return;
                  }
                  if (
                    !before.endsWith(" ") &&
                    !before.endsWith("(") &&
                    !/[+\-*/%]/.test(firstPastedChar)
                  ) {
                    padLeft = " ";
                  }
                }

                const cleanAfter = after.trimStart();
                if (cleanAfter.length > 0) {
                  const lastPastedChar = normalized[normalized.length - 1];
                  const firstAfterChar = cleanAfter[0];

                  if (/[A-Z0-9_)]/.test(lastPastedChar) && /[A-Z0-9_(]/.test(firstAfterChar)) {
                    toast.error("Add an operator between pasted content and subsequent tokens.");
                    return;
                  }
                  if (
                    !after.startsWith(" ") &&
                    !after.startsWith(")") &&
                    !/[+\-*/%]/.test(lastPastedChar)
                  ) {
                    padRight = " ";
                  }
                }

                const candidateVal =
                  before.trimEnd() +
                  (padLeft || (before.endsWith(" ") ? " " : "")) +
                  normalized +
                  (padRight || (after.startsWith(" ") ? " " : "")) +
                  after.trimStart();

                // Check parenthesis balance
                const openCount = (candidateVal.match(/\(/g) || []).length;
                const closeCount = (candidateVal.match(/\)/g) || []).length;
                if (closeCount > openCount) {
                  toast.error("Cannot paste: closing parentheses exceed opening parentheses.");
                  return;
                }

                setInputValue(candidateVal);
                isDirty.current = true;

                setTimeout(() => {
                  const newPos = before.trimEnd().length + (padLeft ? 1 : 0) + normalized.length;
                  target?.setSelectionRange(newPos, newPos);
                }, 0);
              }}
              onSelect={(e) => {
                const pos = e.currentTarget.selectionStart ?? inputValue.length;
                setCursorPos(pos);
                cursorPosRef.current = pos;
              }}
              onChange={(e) => {
                setInputValue(e.target.value.toUpperCase());
                isDirty.current = true;
              }}
              onKeyDown={handleKeyDown as any}
              disabled={!isActive || isPending}
              placeholder={
                isActive ? (isFormulaInput ? "Enter formula..." : "Enter number...") : ""
              }
              className={cn(
                "w-full px-3 py-1.5 bg-transparent resize-none outline-none font-mono text-sm relative z-10 whitespace-pre-wrap break-all overflow-y-auto leading-normal",
                isFormulaInput
                  ? inputValue
                    ? "text-transparent caret-foreground"
                    : "text-foreground placeholder:text-muted-foreground/40 caret-foreground"
                  : "text-foreground placeholder:text-muted-foreground/40",
                !isActive && "text-muted-foreground/30 placeholder:font-sans",
                isPending && "opacity-40",
              )}
              spellCheck={false}
              autoComplete="off"
            />

            {acVisible && ac.items.length > 0 && (
              <div className="absolute top-full left-0 z-50 w-80 bg-popover border border-border rounded-b-md shadow-xl overflow-hidden">
                <div className="px-3 py-1 border-b border-border/40 bg-muted/20 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground/50 select-none">
                    ↑↓ navigate · Tab/Enter insert · Esc close
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 select-none">
                    {ac.items.length} token{ac.items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {ac.items.map((token, i) => {
                    const val = tokenMap[token];
                    const display =
                      val == null ? "—" : val % 1 === 0 ? String(val) : val.toFixed(2);
                    const isInvalid = invalidTokens.has(token);
                    const disabledReason = isInvalid
                      ? getTokenDisabledReason(token) || "Creates circular dependency"
                      : undefined;

                    return (
                      <button
                        key={token}
                        type="button"
                        title={disabledReason}
                        className={cn(
                          "w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors relative group/item",
                          isInvalid
                            ? "opacity-50 cursor-not-allowed bg-muted/10"
                            : "hover:bg-muted/20",
                          i === ac.activeIdx && !isInvalid && "bg-primary/10",
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (!isInvalid) insertToken(token);
                        }}
                        onMouseEnter={() => {
                          if (!isInvalid) setActiveIdx(i);
                        }}
                      >
                        <div className="flex items-center gap-2 overflow-hidden flex-1">
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              getTokenColor(token).replace("text-", "bg-").split(" ")[0],
                            )}
                          />
                          <span
                            className={cn(
                              "font-mono text-xs truncate min-w-0",
                              isInvalid
                                ? "text-muted-foreground line-through"
                                : getTokenColor(token),
                            )}
                          >
                            {renderHighlightedToken(token, lastWord)}
                          </span>
                          {isInvalid && (
                            <div
                              title={disabledReason}
                              className="text-yellow-500 flex items-center shrink min-w-0 gap-1.5"
                            >
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span className="text-[10px] text-yellow-600/80 truncate font-sans">
                                {disabledReason
                                  ?.replace(/^Creates circular dependency:\s*/i, "")
                                  .replace(/^Disabled:\s*/i, "") || "Creates circular dependency"}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="font-mono text-xs text-muted-foreground/50 shrink-0">
                          {display}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {isPending && (
            <div className="flex items-center gap-1.5 px-3 shrink-0 text-xs text-muted-foreground/50">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving
            </div>
          )}

          {isActive && !isPending && (
            <div className="flex items-center px-3 shrink-0 gap-3">
              <button
                type="button"
                className="flex items-center gap-1.5 group cursor-pointer animate-in fade-in zoom-in-95 duration-100"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSave();
                }}
              >
                <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border/50 bg-muted/30 text-muted-foreground/50 group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary transition-all font-mono">
                  Enter
                </kbd>
                <span className="text-[10px] text-muted-foreground/40 group-hover:text-primary transition-colors">
                  save
                </span>
              </button>

              <button
                type="button"
                className="flex items-center gap-1.5 group cursor-pointer animate-in fade-in zoom-in-95 duration-100"
                onMouseDown={(e) => {
                  e.preventDefault();
                  isDirty.current = false;
                  setSelectedCell(null);
                }}
              >
                <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border/50 bg-muted/30 text-muted-foreground/50 group-hover:border-destructive/40 group-hover:bg-destructive/5 group-hover:text-destructive transition-all font-mono">
                  Esc
                </kbd>
                <span className="text-[10px] text-muted-foreground/40 group-hover:text-destructive transition-colors">
                  cancel
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
