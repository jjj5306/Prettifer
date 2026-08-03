import { useEffect, useRef } from "react";

import type { SymbolHitDto } from "../../shared/index.js";
import type { SymbolLookupState } from "../state/app-state.js";
import styles from "./SymbolPanel.module.css";

interface SymbolPanelProps {
  readonly lookup: SymbolLookupState;
  /** True while there is a position to return to. */
  readonly canGoBack: boolean;
  readonly onGoToHit: (hit: SymbolHitDto, symbol: string) => void;
  readonly onDismiss: () => void;
  readonly onGoBack: () => void;
}

/**
 * Lists what a symbol lookup found, and offers the way back from a navigation.
 *
 * The list is a set of buttons in document order, so Tab and Shift+Tab walk it
 * and Escape closes it. Nothing here is keyboard-only or mouse-only.
 */
export const SymbolPanel = ({
  lookup,
  canGoBack,
  onGoToHit,
  onDismiss,
  onGoBack,
}: SymbolPanelProps) => {
  const listRef = useRef<HTMLUListElement>(null);
  const focusedSymbol = lookup.status === "ready" ? lookup.symbol : null;

  // A fresh list takes focus so the keyboard continues in it.
  useEffect(() => {
    if (focusedSymbol === null) {
      return;
    }
    listRef.current?.querySelector("button")?.focus();
  }, [focusedSymbol]);

  if (lookup.status === "idle" && !canGoBack) {
    return null;
  }

  /*
   * Escape is bound to each control rather than to the panel, because the panel
   * is not interactive and only its controls can hold focus.
   */
  const onEscape = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      onDismiss();
    }
  };

  return (
    <section
      id="symbol-lookup"
      className={styles.panel}
      aria-labelledby="symbol-lookup-heading"
    >
      <div className={styles.headingRow}>
        <h2 id="symbol-lookup-heading">{heading(lookup)}</h2>
        <div className={styles.actions}>
          {canGoBack ? (
            <button type="button" onClick={onGoBack} onKeyDown={onEscape}>Back</button>
          ) : null}
          {lookup.status === "idle" ? null : (
            <button type="button" onClick={onDismiss} onKeyDown={onEscape}>Close</button>
          )}
        </div>
      </div>
      <PanelBody
        lookup={lookup}
        listRef={listRef}
        onGoToHit={onGoToHit}
        onEscape={onEscape}
      />
    </section>
  );
};

const PanelBody = ({
  lookup,
  listRef,
  onGoToHit,
  onEscape,
}: {
  readonly lookup: SymbolLookupState;
  readonly listRef: React.RefObject<HTMLUListElement | null>;
  readonly onGoToHit: (hit: SymbolHitDto, symbol: string) => void;
  readonly onEscape: (event: React.KeyboardEvent) => void;
}) => {
  switch (lookup.status) {
    case "idle":
      return null;
    case "loading":
      return <p aria-live="polite">Searching the repository for {lookup.symbol}…</p>;
    case "unsupported":
      return (
        <p className={styles.notice}>
          Symbol navigation covers Java, C/C++, TypeScript and JavaScript files.
          This file is not one of them.
        </p>
      );
    case "empty":
      return (
        <p className={styles.notice}>
          {lookup.mode === "definition"
            ? `No declaration of ${lookup.symbol} was found in the repository.`
            : `No reference to ${lookup.symbol} was found in the repository.`}
          {" "}
          It may be declared outside this repository, or spelled differently.
        </p>
      );
    case "error":
      return (
        <div className={styles.notice} role="alert">
          <p>{lookup.diagnostic.message}</p>
          <p>{lookup.diagnostic.nextAction}</p>
        </div>
      );
    case "ready":
      return (
        <>
          {lookup.truncated ? (
            <p className={styles.notice}>
              Showing the first {lookup.hits.length} matches. Narrow the search by
              using a more specific name.
            </p>
          ) : null}
          <ul className={styles.hits} ref={listRef} aria-label="Symbol matches">
            {lookup.hits.map((hit) => (
              <li key={`${hit.path}:${String(hit.line)}`}>
                <button
                  type="button"
                  className={styles.hit}
                  onClick={() => { onGoToHit(hit, lookup.symbol); }}
                  onKeyDown={onEscape}
                >
                  <span
                    className={hit.isDeclaration
                      ? `${styles.kind} ${styles.declaration}`
                      : styles.kind}
                  >
                    {hit.isDeclaration ? "def" : "ref"}
                  </span>
                  <span className={styles.location}>{hit.path}:{hit.line}</span>
                  <span className={styles.line}>{hit.text.trim()}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      );
  }
};

function heading(lookup: SymbolLookupState): string {
  switch (lookup.status) {
    case "idle":
      return "Navigation";
    case "loading":
    case "unsupported":
    case "empty":
    case "error":
      return "Symbol Navigation";
    case "ready":
      return lookup.mode === "definition"
        ? `Declarations of ${lookup.symbol}`
        : `References to ${lookup.symbol}`;
  }
}
