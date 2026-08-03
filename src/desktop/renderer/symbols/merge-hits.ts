import type { CompositeDiffResultDto, SymbolHitDto } from "../../shared/index.js";
import { declaresSymbol } from "../../../symbols/declarations.js";
import { symbolLanguageForPath } from "../../../symbols/language-support.js";
import { findOccurrences } from "../../../symbols/occurrences.js";

type CompositeFile = CompositeDiffResultDto["files"][number];

/**
 * Combines what the repository search found with what the selected result holds.
 *
 * The main process searches the comparison base, so its hits are stale for any
 * file the selection changed. Those files are searched here instead, from the
 * contents already in memory, which also keeps their contents off the boundary.
 */
export function mergeSymbolHits(
  baseHits: readonly SymbolHitDto[],
  result: CompositeDiffResultDto,
  symbol: string,
): readonly SymbolHitDto[] {
  const changed = new Set(result.files.map((file) => file.path));
  const merged: SymbolHitDto[] = baseHits.filter((hit) => !changed.has(hit.path));

  for (const file of result.files) {
    merged.push(...hitsInResultFile(file, symbol));
  }

  return merged.sort((left, right) =>
    left.path === right.path
      ? left.line - right.line
      : left.path < right.path ? -1 : 1,
  );
}

function hitsInResultFile(
  file: CompositeFile,
  symbol: string,
): readonly SymbolHitDto[] {
  const language = symbolLanguageForPath(file.path);
  if (language === null || file.binary === true) {
    return [];
  }
  // A deleted file has no composed content to search.
  const contents = file.afterContent;
  if (contents === null) {
    return [];
  }
  return findOccurrences(contents, symbol).map((occurrence) => ({
    path: file.path,
    line: occurrence.line,
    text: occurrence.text,
    isDeclaration: declaresSymbol(language, occurrence.text, symbol),
  }));
}
