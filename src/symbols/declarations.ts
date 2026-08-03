import type { SymbolLanguage } from "./language-support.js";

/**
 * What a line declares. The screen shows this, and a definition lookup prefers
 * one kind over another depending on where the user pointed.
 */
export type DeclarationKind =
  | "type"
  | "constructor"
  | "method"
  | "field"
  | "variable"
  | "alias"
  | "macro";

/**
 * Recognizes what a line declares. There is no semantic analysis here by design:
 * the issue rules out language servers, so a declaration is a line that looks
 * like one. Callers must treat each match as a candidate rather than a fact,
 * which is why the screen offers a choice when several match.
 *
 * Order matters. The first matching entry wins, so a constructor is listed ahead
 * of a method: `public UtVar() {` would otherwise read as a method named `UtVar`.
 *
 * `NAME` is replaced with the escaped symbol before the pattern is compiled.
 */
interface DeclarationPattern {
  readonly kind: DeclarationKind;
  readonly pattern: string;
}

/** Optional annotations in front of a declaration, as in `@Override public …`. */
const JAVA_ANNOTATIONS = String.raw`(?:@[\w.$]+(?:\s*\([^)]*\))?\s+)*`;
const JAVA_MODIFIERS =
  String.raw`(?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp|transient|volatile|sealed|non-sealed)\s+)*`;
/** A type in the position before a name: `String`, `List<Map<K, V>>`, `int[]`. */
const JAVA_TYPE = String.raw`[\w.$]+(?:\s*<[^;=]*>)?(?:\s*\[\s*\])*`;
/**
 * Words that start a statement rather than a declaration. Without this
 * `return userCode;` and `if (total() > 0) {` read as declarations once the
 * modifier requirement is relaxed.
 */
const STATEMENT_START =
  String.raw`(?!(?:return|if|while|for|switch|case|catch|throw|throws|new|else|do|assert|break|continue|yield|super|this|package|import)\b)`;

/** The same guard for the statements C and C++ start lines with. */
const CPP_STATEMENT_START =
  String.raw`(?!(?:return|if|while|for|switch|case|else|do|goto|delete|throw|new|sizeof)\b)`;

const PATTERNS: Readonly<Record<SymbolLanguage, readonly DeclarationPattern[]>> = {
  java: [
    {
      kind: "type",
      pattern: String.raw`\b(?:class|interface|enum|record|@interface)\s+NAME\b`,
    },
    {
      // No type in front, so a body must open on the same line. `throws` may sit
      // between the parameters and the body.
      kind: "constructor",
      pattern: String.raw`^\s*${JAVA_ANNOTATIONS}(?:(?:public|protected|private)\s+)?NAME\s*\([^;]*\)\s*(?:throws[\w\s,.$]*)?\{`,
    },
    {
      // A modifier or a return type must precede the name.
      kind: "method",
      pattern: String.raw`^\s*${JAVA_ANNOTATIONS}${STATEMENT_START}${JAVA_MODIFIERS}(?:<[^>]*>\s*)?(?:${JAVA_TYPE}\s+)+NAME\s*\(`,
    },
    {
      // A field carries an access or lifetime modifier; a bare `String x;` reads
      // as a variable below. Both are declarations, and the kinds rank apart.
      kind: "field",
      pattern: String.raw`^\s*${JAVA_ANNOTATIONS}(?:(?:public|protected|private|static|final|transient|volatile)\s+)+(?:${JAVA_TYPE}\s+)NAME\s*(?:=|;)`,
    },
    {
      // `int userCode = 3;` and `String userCode;`. One type token only, so an
      // assignment such as `this.userCode = 4;` stays out.
      kind: "variable",
      pattern: String.raw`^\s*${JAVA_ANNOTATIONS}${STATEMENT_START}(?:final\s+)?(?:${JAVA_TYPE}\s+)NAME\s*(?:=[^=]|;)`,
    },
  ],
  cpp: [
    {
      kind: "type",
      pattern: String.raw`\b(?:class|struct|union|enum|namespace)\s+NAME\b`,
    },
    { kind: "alias", pattern: String.raw`\btypedef\b[^;]*\bNAME\s*;` },
    { kind: "alias", pattern: String.raw`\busing\s+NAME\s*=` },
    { kind: "macro", pattern: String.raw`^\s*#\s*define\s+NAME\b` },
    {
      /*
       * A name with no return type. `Node(int seed);` inside a class body reads
       * exactly like the call `total();`, so the bare form is only accepted with
       * a qualifier or `explicit`; otherwise a body or an initializer list must
       * follow. An in-class declaration with neither is missed on purpose: the
       * class line and the out-of-class definition are still found.
       */
      kind: "constructor",
      pattern: String.raw`^\s*(?:(?:explicit\s+)?(?:[\w:<>]+::)?~?NAME\s*\([^;]*\)\s*(?::[^;{]*)?\{|(?:explicit\s+~?NAME|[\w:<>]+::~?NAME)\s*\([^;]*\)\s*;)`,
    },
    {
      // A return type has to really be there, starting with a word character:
      // indentation alone would let `total();` read as a declaration.
      kind: "method",
      pattern: String.raw`^\s*${CPP_STATEMENT_START}(?:[\w:<>][\w:<>*&\[\]~,]*[\s*&]+)+(?:[\w:<>]+::)?NAME\s*\([^;]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?(?:\{|;|:)`,
    },
    {
      kind: "variable",
      pattern: String.raw`^\s*${CPP_STATEMENT_START}(?:static\s+|const\s+|constexpr\s+)*[\w:<>][\w:<>*&]*[\s*&]+NAME\s*(?:=[^=]|;|\[)`,
    },
  ],
  typescript: [
    {
      kind: "type",
      pattern: String.raw`\b(?:class|interface|enum)\s+NAME\b`,
    },
    { kind: "alias", pattern: String.raw`\btype\s+NAME\s*[=<]` },
    { kind: "method", pattern: String.raw`\bfunction\s*\*?\s*NAME\s*[<(]` },
    {
      kind: "variable",
      pattern: String.raw`\b(?:const|let|var)\s+NAME\b`,
    },
    {
      /*
       * Class members and object properties holding a function. A call reads the
       * same up to the parameters, so a body or a return type must follow:
       * `f(a);` is a call, while `f(a) {` and `f(a): number` are declarations.
       */
      kind: "method",
      pattern: String.raw`^\s*(?:(?:public|protected|private|readonly|static|async|abstract|override|get|set)\s+)*NAME\s*(?:<[^>]*>\s*)?\([^)]*\)\s*(?:\{|:|=>)`,
    },
    {
      kind: "field",
      pattern: String.raw`^\s*(?:(?:public|protected|private|readonly|static|declare|abstract|override)\s+)+NAME\s*(?:[?!]\s*)?(?::|=[^=])`,
    },
  ],
};

const ESCAPE = /[.*+?^${}()|[\]\\]/gu;

/**
 * What the line declares, or `null` when it declares nothing. The first matching
 * kind wins, so the order in `PATTERNS` is part of the behaviour.
 */
export function declarationKindOf(
  language: SymbolLanguage,
  line: string,
  name: string,
): DeclarationKind | null {
  const escaped = name.replace(ESCAPE, String.raw`\$&`);
  for (const { kind, pattern } of PATTERNS[language]) {
    if (new RegExp(pattern.replaceAll("NAME", escaped), "u").test(line)) {
      return kind;
    }
  }
  return null;
}
