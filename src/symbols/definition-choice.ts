import type { DeclarationKind } from "./declarations.js";

/**
 * What the place the user pointed at says about the symbol. Only construction is
 * detected: it is the one context that reliably changes which declaration is
 * wanted, and every extra guess would be another way to be wrong.
 */
export type SymbolUsage = "construction" | "plain";

/**
 * Which kinds answer a definition lookup first.
 *
 * `constructor` sits last for a plain use on purpose: a reader who wanted the
 * constructor would have pointed at a `new`, so sending them to one when a type
 * declaration exists is almost always wrong.
 */
const ORDER: Readonly<Record<SymbolUsage, readonly DeclarationKind[]>> = {
  construction: ["constructor", "type", "method", "field", "alias", "macro", "variable"],
  plain: ["type", "method", "field", "alias", "macro", "variable", "constructor"],
};

/**
 * The declarations worth offering, highest-ranking kind only.
 *
 * Keeping lower kinds would bury the answer: a search for `total` finds local
 * variables all over the repository, and listing them beside the method makes the
 * list useless. Several declarations of the same kind stay together, because
 * overloads and same-named types are a genuine choice for the reader to make.
 */
export function preferredDeclarations<T extends { readonly kind: DeclarationKind | null }>(
  hits: readonly T[],
  usage: SymbolUsage,
): readonly T[] {
  for (const kind of ORDER[usage]) {
    const matching = hits.filter((hit) => hit.kind === kind);
    if (matching.length > 0) {
      return matching;
    }
  }
  return [];
}

/**
 * Whether the symbol at that column is being constructed, as in `new UtVar(`.
 * Only the text left of the symbol is read, so a call on the following line is
 * not mistaken for one here.
 */
export function usageAt(line: string, startColumn: number): SymbolUsage {
  const before = line.slice(0, Math.max(startColumn - 1, 0));
  return /\bnew\s*$/u.test(before) ? "construction" : "plain";
}
