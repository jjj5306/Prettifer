import { describe, expect, it } from "vitest";

import { declarationKindOf } from "../../../src/symbols/declarations.js";
import {
  symbolLanguageForPath,
  SYMBOL_FILE_EXTENSIONS,
} from "../../../src/symbols/language-support.js";
import { findOccurrences } from "../../../src/symbols/occurrences.js";
import { symbolAt } from "../../../src/symbols/symbol-at.js";

describe("symbolLanguageForPath", () => {
  it.each([
    ["src/com/codescroll/UtVar.java", "java"],
    ["bundles/core/src/generator.c", "cpp"],
    ["include/model.hpp", "cpp"],
    ["src/desktop/main/index.ts", "typescript"],
    ["scripts/check-audit.mjs", "typescript"],
  ])("reads %s as %s", (path, language) => {
    expect(symbolLanguageForPath(path)).toBe(language);
  });

  it.each([
    "README.md",
    "package.json",
    "docs/assets/screenshot.png",
    "Makefile",
    ".gitignore",
  ])("reports %s as unsupported", (path) => {
    expect(symbolLanguageForPath(path)).toBeNull();
  });

  it("uses only the file name, not directories that look like extensions", () => {
    expect(symbolLanguageForPath("com.example.java/notes.md")).toBeNull();
    expect(symbolLanguageForPath("com.example.md/UtVar.java")).toBe("java");
  });

  it("lists every extension the repository search may look at", () => {
    expect(SYMBOL_FILE_EXTENSIONS).toContain("java");
    expect(SYMBOL_FILE_EXTENSIONS).toContain("cpp");
    expect(SYMBOL_FILE_EXTENSIONS).toContain("ts");
    expect(SYMBOL_FILE_EXTENSIONS).not.toContain("md");
  });
});

describe("symbolAt", () => {
  const line = "  const total = computeTotal(first, second);";

  it("reads the identifier the cursor sits inside", () => {
    const column = line.indexOf("computeTotal") + 4;
    expect(symbolAt(line, column)).toEqual({
      name: "computeTotal",
      startColumn: line.indexOf("computeTotal") + 1,
      endColumn: line.indexOf("computeTotal") + 1 + "computeTotal".length,
    });
  });

  it("selects the identifier when the cursor touches its first character", () => {
    expect(symbolAt(line, line.indexOf("computeTotal") + 1)?.name).toBe("computeTotal");
  });

  it("selects the identifier when the cursor sits just past its last character", () => {
    const past = line.indexOf("computeTotal") + 1 + "computeTotal".length;
    expect(symbolAt(line, past)?.name).toBe("computeTotal");
  });

  it("reports nothing on whitespace or punctuation", () => {
    expect(symbolAt(line, 1)).toBeNull();
    expect(symbolAt("a + b", 3)).toBeNull();
  });

  it("accepts identifiers that start with an underscore or dollar sign", () => {
    expect(symbolAt("_private = $value;", 2)?.name).toBe("_private");
    expect(symbolAt("_private = $value;", 13)?.name).toBe("$value");
  });

  it("rejects a column before the line", () => {
    expect(symbolAt(line, 0)).toBeNull();
  });
});

describe("declarationKindOf recognizes a declaration at all", () => {
  it.each([
    ["public class UtVar {", "UtVar"],
    ["  interface Visitor {", "Visitor"],
    ["public enum Kind {", "Kind"],
    ["  private static final int LIMIT = 10;", "LIMIT"],
    ["  public void accept(Visitor visitor) {", "accept"],
    ["  protected List<String> names(int size) {", "names"],
    ["  UtVar(String name) {", "UtVar"],
  ])("recognizes the Java declaration in %s", (line, name) => {
    expect(declarationKindOf("java", line, name)).not.toBeNull();
  });

  it.each([
    ["    accept(visitor);", "accept"],
    ["    return names(2).size();", "names"],
    ["import com.codescroll.UtVar;", "UtVar"],
  ])("does not treat the Java use in %s as a declaration", (line, name) => {
    expect(declarationKindOf("java", line, name)).toBeNull();
  });

  it.each([
    ["struct Node {", "Node"],
    ["typedef unsigned long Id;", "Id"],
    ["#define MAX_LEN 32", "MAX_LEN"],
    ["static int compute_total(int a, int b) {", "compute_total"],
    ["void Generator::emit(const Var& var) {", "emit"],
    ["int compute_total(int a, int b);", "compute_total"],
  ])("recognizes the C/C++ declaration in %s", (line, name) => {
    expect(declarationKindOf("cpp", line, name)).not.toBeNull();
  });

  it.each([
    ["  total = compute_total(1, 2);", "compute_total"],
    ["  if (MAX_LEN > 0) {", "MAX_LEN"],
  ])("does not treat the C/C++ use in %s as a declaration", (line, name) => {
    expect(declarationKindOf("cpp", line, name)).toBeNull();
  });

  it.each([
    ["export function composeSelection(request: Request) {", "composeSelection"],
    ["const total = 1;", "total"],
    ["export interface ApplicationSeams {", "ApplicationSeams"],
    ["export type SymbolLanguage = string;", "SymbolLanguage"],
    ["  async compose(request: Request): Promise<void> {", "compose"],
  ])("recognizes the TypeScript declaration in %s", (line, name) => {
    expect(declarationKindOf("typescript", line, name)).not.toBeNull();
  });

  it.each([
    ["  await composeSelection(request);", "composeSelection"],
    ["  return total + 1;", "total"],
  ])("does not treat the TypeScript use in %s as a declaration", (line, name) => {
    expect(declarationKindOf("typescript", line, name)).toBeNull();
  });

  it("treats a name with regex characters literally", () => {
    expect(declarationKindOf("typescript", "const a$b = 1;", "a$b")).toBe("variable");
    expect(declarationKindOf("typescript", "const axb = 1;", "a.b")).toBeNull();
  });
});

describe("findOccurrences", () => {
  it("reports every whole-word occurrence with its line, column and text", () => {
    const contents = ["int total = 0;", "total = total + 1;"].join("\n");

    expect(findOccurrences(contents, "total")).toEqual([
      { line: 1, column: 5, text: "int total = 0;" },
      { line: 2, column: 1, text: "total = total + 1;" },
      { line: 2, column: 9, text: "total = total + 1;" },
    ]);
  });

  it("ignores names that merely contain the symbol", () => {
    expect(findOccurrences("subtotal = totals + 1;", "total")).toEqual([]);
  });

  it("skips line comments and string literals", () => {
    const contents = [
      "// total is explained here",
      'label = "total";',
      "int total = 0;",
      "# total in a preprocessor comment",
    ].join("\n");

    expect(findOccurrences(contents, "total")).toEqual([
      { line: 3, column: 5, text: "int total = 0;" },
    ]);
  });

  it("keeps columns aligned with the original line when masking", () => {
    const contents = 'greet("hi"); total = 1;';

    expect(findOccurrences(contents, "total")).toEqual([
      { line: 1, column: contents.indexOf("total") + 1, text: contents },
    ]);
  });

  it("resumes scanning after a string that ends with an escaped backslash", () => {
    // The literal holds `C:\\\\`, so `total` sits outside it.
    const contents = 'path = "C:\\\\"; total = 1;';

    expect(findOccurrences(contents, "total")).toEqual([
      { line: 1, column: contents.indexOf("total") + 1, text: contents },
    ]);
  });

  it("reads CRLF contents without shifting line numbers", () => {
    expect(findOccurrences("a = 1;\r\nint total = 0;", "total")).toEqual([
      { line: 2, column: 5, text: "int total = 0;" },
    ]);
  });

  it("still reports an occurrence inside a block comment", () => {
    // A documented limit: tracking block comments needs a lexer per language, and
    // a stray hit costs less than hiding a real one.
    const contents = ["/*", " * total is described here", " */"].join("\n");

    expect(findOccurrences(contents, "total")).toHaveLength(1);
  });
});
