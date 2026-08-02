/** One place a symbol appears in a file. */
export interface SymbolOccurrence {
  /** 1-based. */
  readonly line: number;
  /** 1-based, inclusive. */
  readonly column: number;
  /** The whole line, so a list can show context without reading the file again. */
  readonly text: string;
}

/**
 * Finds whole-word occurrences of a symbol in file contents.
 *
 * Line comments and string literals are stripped first so a list of references
 * is not padded with prose. Block comments spanning several lines are not
 * tracked: doing that well needs a real lexer per language, and the cost of a
 * stray hit inside a comment is far lower than the cost of hiding a real one.
 */
export function findOccurrences(
  contents: string,
  name: string,
): readonly SymbolOccurrence[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const pattern = new RegExp(String.raw`(?<![A-Za-z0-9_$])` + escaped + String.raw`(?![A-Za-z0-9_$])`, "gu");
  const found: SymbolOccurrence[] = [];

  contents.split(/\r?\n/u).forEach((text, index) => {
    const searchable = maskCommentsAndStrings(text);
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(searchable)) !== null) {
      found.push({ line: index + 1, column: match.index + 1, text });
    }
  });
  return found;
}

/**
 * Replaces string literals and the tail of a line comment with spaces, keeping
 * every column aligned so reported positions still point at the original text.
 */
function maskCommentsAndStrings(line: string): string {
  let masked = "";
  let quote: string | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? "";
    if (quote !== undefined) {
      masked += " ";
      if (character === "\\") {
        masked += " ";
        index += 1;
        continue;
      }
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      masked += " ";
      continue;
    }
    const rest = line.slice(index);
    if (rest.startsWith("//") || rest.startsWith("#")) {
      return masked + " ".repeat(line.length - index);
    }
    masked += character;
  }
  return masked;
}
