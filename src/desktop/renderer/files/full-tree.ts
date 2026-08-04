import type { CompositeDiffResultDto } from "../../shared/index.js";
import type { ReviewEntry } from "./review-entries.js";

/** What the result did to a file, plus the case the result never touched. */
export type FullTreeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "problem"
  | "unchanged";

export interface FullTreeFile {
  readonly kind: "file";
  readonly name: string;
  readonly path: string;
  readonly status: FullTreeStatus;
  /** The composed entry, or null for a file the result never touched. */
  readonly entry: ReviewEntry | null;
}

export interface FullTreeDirectory {
  readonly kind: "directory";
  readonly name: string;
  readonly path: string;
  /** True when a changed file sits anywhere below, so a folded row can say so. */
  readonly hasChanges: boolean;
  readonly children: readonly FullTreeNode[];
}

export type FullTreeNode = FullTreeDirectory | FullTreeFile;

interface MutableDirectory {
  readonly kind: "directory";
  readonly name: string;
  readonly path: string;
  readonly children: Map<string, MutableNode>;
}

type MutableNode = MutableDirectory | FullTreeFile;

/**
 * Builds the whole repository structure with the review's changes placed in it.
 *
 * The path set is the union of the two inputs. The comparison base has the files
 * the selection deleted but not the ones it added, so neither side alone
 * describes the structure the user is reviewing.
 *
 * Directories are ordered before files at each level, and each group keeps the
 * order Git reported, so the layout is stable between renders.
 */
export function buildFullTree(
  basePaths: readonly string[],
  entries: readonly ReviewEntry[],
): readonly FullTreeNode[] {
  const changed = new Map(entries.map((entry) => [entry.path, entry]));
  const root = new Map<string, MutableNode>();

  for (const path of unionOfPaths(basePaths, entries)) {
    const entry = changed.get(path) ?? null;
    insert(root, path, {
      kind: "file",
      name: lastSegment(path),
      path,
      status: statusOf(entry),
      entry,
    });
  }

  return freeze([...root.values()]);
}

/**
 * The paths a result changed, problem files included. They decide which folders
 * Full Tree opens, so the workbench and the panel read them the same way.
 */
export function changedPathsOf(
  result: CompositeDiffResultDto,
): readonly string[] {
  return [
    ...result.files.map((file) => file.path),
    ...result.problemFiles.map((problem) => problem.path),
  ];
}

/**
 * The directories to show open when the tree first appears: every ancestor of a
 * changed path. Everything else starts folded, so the rows rendered follow the
 * size of the change rather than the size of the repository.
 */
export function directoriesLeadingTo(
  paths: readonly string[],
): ReadonlySet<string> {
  const open = new Set<string>();
  for (const path of paths) {
    const segments = path.split("/");
    // The last segment is the file itself, which is not a directory.
    for (let depth = 1; depth < segments.length; depth += 1) {
      open.add(segments.slice(0, depth).join("/"));
    }
  }
  return open;
}

function unionOfPaths(
  basePaths: readonly string[],
  entries: readonly ReviewEntry[],
): readonly string[] {
  const seen = new Set(basePaths);
  const added = entries
    .map((entry) => entry.path)
    .filter((path) => !seen.has(path));
  return [...basePaths, ...added];
}

function statusOf(entry: ReviewEntry | null): FullTreeStatus {
  if (entry === null) {
    return "unchanged";
  }
  return entry.kind === "problem" ? "problem" : entry.file.status;
}

function insert(
  root: Map<string, MutableNode>,
  path: string,
  file: FullTreeFile,
): void {
  const segments = path.split("/");
  let children = root;
  for (let depth = 0; depth < segments.length - 1; depth += 1) {
    const name = segments[depth] ?? "";
    const directoryPath = segments.slice(0, depth + 1).join("/");
    const existing = children.get(name);
    if (existing?.kind === "directory") {
      children = existing.children;
      continue;
    }
    const created: MutableDirectory = {
      kind: "directory",
      name,
      path: directoryPath,
      children: new Map<string, MutableNode>(),
    };
    children.set(name, created);
    children = created.children;
  }
  children.set(file.name, file);
}

/** Freezes the built directories and works out which of them hold a change. */
function freeze(nodes: readonly MutableNode[]): readonly FullTreeNode[] {
  const directories = nodes.filter(isMutableDirectory);
  const files = nodes.filter((node): node is FullTreeFile => node.kind === "file");
  return [
    ...directories.map((directory) => {
      const children = freeze([...directory.children.values()]);
      return {
        kind: "directory" as const,
        name: directory.name,
        path: directory.path,
        hasChanges: children.some(holdsChange),
        children,
      };
    }),
    ...files,
  ];
}

function holdsChange(node: FullTreeNode): boolean {
  return node.kind === "directory" ? node.hasChanges : node.status !== "unchanged";
}

function isMutableDirectory(node: MutableNode): node is MutableDirectory {
  return node.kind === "directory";
}

function lastSegment(path: string): string {
  return path.split("/").at(-1) ?? path;
}
