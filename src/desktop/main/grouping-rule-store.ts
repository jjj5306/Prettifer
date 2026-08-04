import type { GroupRule } from "../../grouping/group-rule.js";

export type GroupingRuleStoreErrorCode =
  | "GROUPING_RULES_UNAVAILABLE"
  | "GROUPING_RULES_UNREADABLE"
  | "GROUPING_RULES_WRITE_FAILED";

export class GroupingRuleStoreError extends Error {
  readonly subject = "Group rules";

  constructor(
    readonly code: GroupingRuleStoreErrorCode,
    readonly nextAction: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GroupingRuleStoreError";
  }
}

/** Reads and writes the rules of one repository. */
export interface GroupingRuleStore {
  read(repositoryPath: string): Promise<readonly GroupRule[]>;
  write(repositoryPath: string, rules: readonly GroupRule[]): Promise<void>;
}

/** The file operations the store needs, kept narrow so tests supply their own. */
export interface GroupingRuleFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  makeDirectory(path: string): Promise<void>;
}

interface StoredFile {
  readonly version: 1;
  readonly repositories: Record<string, { readonly rules: GroupRule[] }>;
}

const FILE_VERSION = 1;

/**
 * Keeps the grouping rules of every repository in one file outside the
 * repositories themselves, so reviewing never adds a file to the user's working
 * tree. Repositories are told apart by their normalized root path, which the
 * session already holds.
 *
 * The file path is fixed when the store is created and never built from a
 * request, so nothing a window sends can steer a write.
 */
export function createGroupingRuleStore(
  filePath: string,
  directoryPath: string,
  files: GroupingRuleFileSystem,
): GroupingRuleStore {
  const load = async (): Promise<StoredFile> => {
    let contents: string;
    try {
      contents = await files.readFile(filePath);
    } catch (error) {
      if (isMissingFile(error)) {
        return { version: FILE_VERSION, repositories: {} };
      }
      throw new GroupingRuleStoreError(
        "GROUPING_RULES_UNREADABLE",
        "Check that Prettifer can read its settings folder, then try again.",
        "Prettifer could not read the saved grouping rules.",
        { cause: error },
      );
    }
    return parseStoredFile(contents);
  };

  return {
    async read(repositoryPath: string): Promise<readonly GroupRule[]> {
      const stored = await load();
      return stored.repositories[repositoryKey(repositoryPath)]?.rules ?? [];
    },

    async write(repositoryPath: string, rules: readonly GroupRule[]): Promise<void> {
      // Loading first means a file that cannot be understood is reported instead
      // of replaced, so rules saved by another version are never thrown away.
      const stored = await load();
      const next: StoredFile = {
        version: FILE_VERSION,
        repositories: {
          ...stored.repositories,
          [repositoryKey(repositoryPath)]: { rules: [...rules] },
        },
      };
      try {
        await files.makeDirectory(directoryPath);
        await files.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`);
      } catch (error) {
        throw new GroupingRuleStoreError(
          "GROUPING_RULES_WRITE_FAILED",
          "Check that Prettifer can write to its settings folder, then save again.",
          "Prettifer could not save the grouping rules.",
          { cause: error },
        );
      }
    },
  };
}

/**
 * Stands in for the store when no settings location was configured. It fails
 * loudly instead of keeping rules that would disappear on the next start.
 */
export function unavailableGroupingRuleStore(): GroupingRuleStore {
  const fail = (): Promise<never> => Promise.reject(new GroupingRuleStoreError(
    "GROUPING_RULES_UNAVAILABLE",
    "Restart Prettifer. Group rules need a settings location.",
    "Prettifer has no place to keep grouping rules in this session.",
  ));
  return { read: fail, write: fail };
}

/**
 * Identifies a repository by its root path. Separators and a trailing slash are
 * normalized, and a Windows drive letter is lower cased, so the same repository
 * opened through a differently written path keeps its rules.
 */
export function repositoryKey(repositoryPath: string): string {
  const normalized = repositoryPath.replaceAll("\\", "/").replace(/\/+$/u, "");
  return normalized.replace(/^[A-Za-z](?=:)/u, (drive) => drive.toLowerCase());
}

function parseStoredFile(contents: string): StoredFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw unreadable(error);
  }
  if (!isRecord(parsed) || !isRecord(parsed.repositories)) {
    throw unreadable(undefined);
  }
  const repositories: StoredFile["repositories"] = {};
  for (const [key, value] of Object.entries(parsed.repositories)) {
    if (!isRecord(value) || !Array.isArray(value.rules) || !value.rules.every(isStoredRule)) {
      throw unreadable(undefined);
    }
    repositories[key] = {
      rules: value.rules.map((rule) => ({ prefix: rule.prefix, name: rule.name })),
    };
  }
  return { version: FILE_VERSION, repositories };
}

function unreadable(cause: unknown): GroupingRuleStoreError {
  return new GroupingRuleStoreError(
    "GROUPING_RULES_UNREADABLE",
    "Fix or remove the grouping rules file, then reopen the repository. Prettifer left it unchanged.",
    "The saved grouping rules are not in a form Prettifer understands.",
    cause === undefined ? undefined : { cause },
  );
}

function isStoredRule(value: unknown): value is GroupRule {
  return isRecord(value)
    && typeof value.prefix === "string"
    && typeof value.name === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
