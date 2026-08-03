/** An identifier found under a cursor, with the columns it spans. */
export interface SymbolReference {
  readonly name: string;
  /** 1-based, inclusive. */
  readonly startColumn: number;
  /** 1-based, exclusive. */
  readonly endColumn: number;
}

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/gu;

/**
 * Reads the identifier at a 1-based column of a single line. A cursor touching
 * either edge of an identifier still selects it, which is what a click on the
 * first character has to do.
 */
export function symbolAt(line: string, column: number): SymbolReference | null {
  if (column < 1) {
    return null;
  }
  IDENTIFIER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IDENTIFIER.exec(line)) !== null) {
    const startColumn = match.index + 1;
    const endColumn = startColumn + match[0].length;
    if (column >= startColumn && column <= endColumn) {
      return { name: match[0], startColumn, endColumn };
    }
    if (startColumn > column) {
      return null;
    }
  }
  return null;
}
