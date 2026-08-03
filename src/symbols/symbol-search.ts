import {
  gitRunOptions,
  GitCommandError,
  type GitCommandRunner,
} from "../git/git-command-runner.js";
import { declarationKindOf, type DeclarationKind } from "./declarations.js";
import {
  symbolLanguageForPath,
  SYMBOL_FILE_EXTENSIONS,
} from "./language-support.js";

/** One line in the repository that mentions the symbol. */
export interface SymbolHit {
  readonly path: string;
  /** 1-based. */
  readonly line: number;
  readonly text: string;
  /** What the line declares, or null when it only mentions the symbol. */
  readonly kind: DeclarationKind | null;
}

export interface SymbolSearchResult {
  readonly hits: readonly SymbolHit[];
  /** True when the limit cut the list, so the screen can say so. */
  readonly truncated: boolean;
}

export class SymbolSearchError extends Error {
  readonly code = "SYMBOL_SEARCH_FAILED";

  constructor(options?: ErrorOptions) {
    super("The repository could not be searched for that symbol.", options);
    this.name = "SymbolSearchError";
  }
}

/** A common name can appear thousands of times; the list stays reviewable. */
const DEFAULT_LIMIT = 200;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

/**
 * Searches a commit for a symbol with `git grep`.
 *
 * Searching a commit rather than the working tree means the user's branch, HEAD
 * and uncommitted work are never read or touched. No index is kept: `git grep`
 * answers a repository-wide query in about a tenth of a second, so there is no
 * index to build, invalidate or report as unfinished.
 */
export class SymbolSearchService {
  constructor(
    private readonly git: GitCommandRunner,
    private readonly limit: number = DEFAULT_LIMIT,
  ) {}

  async search(
    repositoryPath: string,
    commit: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<SymbolSearchResult> {
    if (!IDENTIFIER.test(name)) {
      return { hits: [], truncated: false };
    }

    // exit code 1 only means "nothing matched".
    const pathspec = SYMBOL_FILE_EXTENSIONS.map((extension) => `*.${extension}`);
    let stdout: string;
    try {
      const output = await this.git.run(
        [
          "grep",
          "--line-number",
          "--no-color",
          "--fixed-strings",
          "--word-regexp",
          "-e",
          name,
          commit,
          "--",
          ...pathspec,
        ],
        gitRunOptions(repositoryPath, signal, [0, 1]),
      );
      stdout = output.stdout;
    } catch (error) {
      throw new SymbolSearchError(
        error instanceof GitCommandError ? { cause: error } : { cause: error },
      );
    }

    const hits: SymbolHit[] = [];
    let truncated = false;
    for (const record of stdout.split(/\r?\n/u)) {
      if (record.length === 0) {
        continue;
      }
      const parsed = parseGrepRecord(record, commit);
      if (parsed === null) {
        continue;
      }
      const language = symbolLanguageForPath(parsed.path);
      if (language === null) {
        continue;
      }
      if (hits.length >= this.limit) {
        truncated = true;
        break;
      }
      hits.push({
        ...parsed,
        kind: declarationKindOf(language, parsed.text, name),
      });
    }
    return { hits, truncated };
  }
}

/**
 * `git grep <commit>` prints `<commit>:<path>:<line>:<text>`. A path may contain
 * a colon, so the commit prefix is removed by length and the remaining fields are
 * split from the left only as far as needed.
 */
function parseGrepRecord(
  record: string,
  commit: string,
): { path: string; line: number; text: string } | null {
  const prefix = `${commit}:`;
  if (!record.startsWith(prefix)) {
    return null;
  }
  const rest = record.slice(prefix.length);
  const lineSeparator = rest.search(/:\d+:/u);
  if (lineSeparator < 0) {
    return null;
  }
  const path = rest.slice(0, lineSeparator);
  const afterPath = rest.slice(lineSeparator + 1);
  const textSeparator = afterPath.indexOf(":");
  const line = Number(afterPath.slice(0, textSeparator));
  if (!Number.isInteger(line) || line < 1) {
    return null;
  }
  return { path, line, text: afterPath.slice(textSeparator + 1) };
}
