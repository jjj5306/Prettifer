import type { CompositeDiffResultDto } from "../../shared/index.js";

type CompositeFile = CompositeDiffResultDto["files"][number];
type CompositeProblemFile = CompositeDiffResultDto["problemFiles"][number];

export type ReviewEntry =
  | Readonly<{ kind: "file"; path: string; file: CompositeFile }>
  | Readonly<{ kind: "problem"; path: string; problem: CompositeProblemFile }>;

/**
 * Interleaves composed files and problem files into one list so a problem stays
 * at the position it would have had in the result.
 *
 * Both inputs already arrive ordered from the main process, which owns the
 * ordering rule. This merges them instead of sorting, so the main process stays
 * the only place that decides the order.
 */
export function buildReviewEntries(
  result: CompositeDiffResultDto,
): readonly ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  let fileIndex = 0;
  let problemIndex = 0;

  while (fileIndex < result.files.length || problemIndex < result.problemFiles.length) {
    const file = result.files[fileIndex];
    const problem = result.problemFiles[problemIndex];
    if (file === undefined) {
      if (problem === undefined) {
        break;
      }
      entries.push({ kind: "problem", path: problem.path, problem });
      problemIndex += 1;
      continue;
    }
    if (problem === undefined || file.path <= problem.path) {
      entries.push({ kind: "file", path: file.path, file });
      fileIndex += 1;
      continue;
    }
    entries.push({ kind: "problem", path: problem.path, problem });
    problemIndex += 1;
  }

  return entries;
}
