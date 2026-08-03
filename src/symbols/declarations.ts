import type { SymbolLanguage } from "./language-support.js";

/**
 * Recognizes a line that declares a symbol. There is no semantic analysis here
 * by design: the issue rules out language servers, so a declaration is a line
 * that looks like one. Callers must treat each match as a candidate rather than
 * a fact, which is why the screen offers a choice when several match.
 *
 * `NAME` is replaced with the escaped symbol before the pattern is compiled.
 */
const PATTERNS: Readonly<Record<SymbolLanguage, readonly string[]>> = {
  java: [
    // class Name, interface Name, enum Name, record Name
    String.raw`\b(?:class|interface|enum|record|@interface)\s+NAME\b`,
    // Method: at least one modifier or a return type must precede the name, and
    // a line starting with a control keyword is a call rather than a declaration.
    String.raw`^\s*(?!(?:return|if|while|for|switch|catch|throw|new|else|do)\b)(?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[^>]*>\s*)?(?:[\w.$<>\[\],?]+\s+)+NAME\s*\(`,
    // Constructor: no type in front, so require a body to open on the same line.
    String.raw`^\s*(?:(?:public|protected|private)\s+)?NAME\s*\([^;]*\)\s*(?:throws[\w\s,.$]*)?\{`,
    // Field: a type in front, an assignment or a semicolon after the name
    String.raw`^\s*(?:(?:public|protected|private|static|final|transient|volatile)\s+)+[\w.$<>\[\],?]+\s+NAME\s*(?:=|;)`,
  ],
  cpp: [
    String.raw`\b(?:class|struct|union|enum|namespace)\s+NAME\b`,
    String.raw`\btypedef\b[^;]*\bNAME\s*;`,
    String.raw`^\s*#\s*define\s+NAME\b`,
    // Function definition or declaration, optionally qualified by a class
    String.raw`^\s*(?:[\w:<>*&\[\]~,\s]+\s+)?(?:[\w:<>]+::)?NAME\s*\([^;]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:\{|;|:)`,
  ],
  typescript: [
    String.raw`\b(?:class|interface|enum|type|function|const|let|var)\s+NAME\b`,
    String.raw`\bfunction\s*\*?\s*NAME\s*[<(]`,
    // Class members and object properties holding a function
    String.raw`^\s*(?:(?:public|protected|private|readonly|static|async|abstract|override)\s+)*NAME\s*[<(]`,
  ],
};

const ESCAPE = /[.*+?^${}()|[\]\\]/gu;

/** Whether the line declares `name` in that language. */
export function declaresSymbol(
  language: SymbolLanguage,
  line: string,
  name: string,
): boolean {
  const escaped = name.replace(ESCAPE, String.raw`\$&`);
  return PATTERNS[language].some((pattern) =>
    new RegExp(pattern.replaceAll("NAME", escaped), "u").test(line),
  );
}
