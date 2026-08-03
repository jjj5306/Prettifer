/**
 * Languages the symbol search understands. Java and C/C++ are the review targets
 * this was built for; TypeScript and JavaScript come along because the project
 * itself is written in them.
 */
export type SymbolLanguage = "java" | "cpp" | "typescript";

const EXTENSIONS: Readonly<Record<string, SymbolLanguage>> = {
  java: "java",
  c: "cpp",
  h: "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  ts: "typescript",
  tsx: "typescript",
  js: "typescript",
  jsx: "typescript",
  mjs: "typescript",
  cjs: "typescript",
};

/** Extensions the repository-wide search restricts itself to. */
export const SYMBOL_FILE_EXTENSIONS: readonly string[] = Object.freeze(
  Object.keys(EXTENSIONS),
);

/** Returns the language of a repository-relative path, or null when unsupported. */
export function symbolLanguageForPath(path: string): SymbolLanguage | null {
  const name = path.toLowerCase().split(/[\\/]/u).at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  return EXTENSIONS[name.slice(dot + 1)] ?? null;
}
