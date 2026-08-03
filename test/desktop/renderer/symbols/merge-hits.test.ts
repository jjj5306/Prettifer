import { describe, expect, it } from "vitest";

import { mergeSymbolHits } from "../../../../src/desktop/renderer/symbols/merge-hits.js";
import type {
  CompositeDiffResultDto,
  SymbolHitDto,
} from "../../../../src/desktop/shared/index.js";

function result(files: CompositeDiffResultDto["files"]): CompositeDiffResultDto {
  return {
    baseCommit: "c".repeat(40),
    selectedCommits: ["d".repeat(40)],
    mainlineParents: {},
    files,
    problemFiles: [],
    unifiedDiff: "",
  };
}

const hit = (
  path: string,
  line: number,
  text: string,
  isDeclaration = false,
): SymbolHitDto => ({ path, line, text, isDeclaration });

describe("mergeSymbolHits", () => {
  it("keeps repository hits for files the selection did not change", () => {
    expect(mergeSymbolHits(
      [hit("src/Other.java", 4, "public class Other { UtVar v; }")],
      result([]),
      "UtVar",
    )).toEqual([hit("src/Other.java", 4, "public class Other { UtVar v; }")]);
  });

  it("replaces stale repository hits with the composed contents of a changed file", () => {
    const hits = mergeSymbolHits(
      [hit("src/UtVar.java", 4, "class UtVar {}", true)],
      result([{
        path: "src/UtVar.java",
        status: "modified",
        beforeContent: "class UtVar {}",
        afterContent: ["// header", "public class UtVar {", "}"].join("\n"),
      }]),
      "UtVar",
    );

    expect(hits).toEqual([hit("src/UtVar.java", 2, "public class UtVar {", true)]);
  });

  it("orders hits by path and then line", () => {
    const hits = mergeSymbolHits(
      [
        hit("src/b.ts", 2, "total;"),
        hit("src/a.ts", 9, "total;"),
        hit("src/a.ts", 3, "total;"),
      ],
      result([]),
      "total",
    );

    expect(hits.map((entry) => `${entry.path}:${String(entry.line)}`))
      .toEqual(["src/a.ts:3", "src/a.ts:9", "src/b.ts:2"]);
  });

  it("skips a changed file whose language has no symbol support", () => {
    expect(mergeSymbolHits([], result([{
      path: "docs/notes.md",
      status: "modified",
      beforeContent: "total",
      afterContent: "total is described here",
    }]), "total")).toEqual([]);
  });

  it("skips a binary and a deleted changed file", () => {
    expect(mergeSymbolHits([], result([
      {
        path: "src/a.java",
        status: "modified",
        binary: true,
        beforeContent: null,
        afterContent: null,
      },
      {
        path: "src/b.java",
        status: "deleted",
        beforeContent: "class B { int total; }",
        afterContent: null,
      },
    ]), "total")).toEqual([]);
  });

  it("marks a use in a changed file as a reference rather than a declaration", () => {
    expect(mergeSymbolHits([], result([{
      path: "src/Caller.java",
      status: "modified",
      beforeContent: "",
      afterContent: "    compute(total);",
    }]), "total")).toEqual([hit("src/Caller.java", 1, "    compute(total);", false)]);
  });
});
