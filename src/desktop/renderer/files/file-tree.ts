import type { ReviewEntry } from "./review-entries.js";

export interface FileTreeDirectory {
  readonly kind: "directory";
  readonly name: string;
  readonly path: string;
  readonly children: readonly FileTreeNode[];
}

export interface FileTreeFile {
  readonly kind: "file";
  readonly name: string;
  readonly path: string;
  readonly entry: ReviewEntry;
}

export type FileTreeNode = FileTreeDirectory | FileTreeFile;

/**
 * A directory under construction. Children are held in one insertion-ordered
 * map keyed by segment name, so looking a directory up and adding a child read
 * the same collection. A repository cannot hold a file and a directory with the
 * same name in one directory, which makes the name a safe key.
 */
interface MutableDirectory {
  readonly kind: "directory";
  readonly name: string;
  readonly path: string;
  readonly children: Map<string, MutableNode>;
}

type MutableNode = MutableDirectory | FileTreeFile;

/**
 * Builds the changed file hierarchy and joins directory chains that hold a
 * single directory, so deep repository paths do not indent one level per
 * segment. The joined row keeps the deepest directory path as its identity.
 */
export function buildFileTree(
  entries: readonly ReviewEntry[],
): readonly FileTreeNode[] {
  return joinSingleChildDirectories(buildDirectoryTree(entries));
}

function joinSingleChildDirectories(
  nodes: readonly FileTreeNode[],
): readonly FileTreeNode[] {
  return nodes.map((node) => {
    if (node.kind === "file") {
      return node;
    }
    const segments = [node.name];
    let deepest = node;
    while (deepest.children.length === 1) {
      const [onlyChild] = deepest.children;
      if (onlyChild?.kind !== "directory") {
        break;
      }
      segments.push(onlyChild.name);
      deepest = onlyChild;
    }
    return {
      kind: "directory",
      name: segments.join("/"),
      path: deepest.path,
      children: joinSingleChildDirectories(deepest.children),
    };
  });
}

function buildDirectoryTree(
  entries: readonly ReviewEntry[],
): readonly FileTreeNode[] {
  const root = newDirectory("", "");

  for (const entry of entries) {
    const segments = entry.path.split(/[\\/]/u).filter((segment) => segment.length > 0);
    const fileName = segments.at(-1) ?? entry.path;
    let parent = root;
    let directoryPath = "";

    for (const segment of segments.slice(0, -1)) {
      directoryPath =
        directoryPath.length === 0 ? segment : `${directoryPath}/${segment}`;
      parent = openDirectory(parent, segment, directoryPath);
    }

    parent.children.set(fileName, {
      kind: "file",
      name: fileName,
      path: entry.path,
      entry,
    });
  }

  return freezeChildren(root);
}

function newDirectory(name: string, path: string): MutableDirectory {
  return { kind: "directory", name, path, children: new Map() };
}

/** Returns the named child directory, creating it on first use. */
function openDirectory(
  parent: MutableDirectory,
  name: string,
  path: string,
): MutableDirectory {
  const existing = parent.children.get(name);
  if (existing?.kind === "directory") {
    return existing;
  }
  const directory = newDirectory(name, path);
  parent.children.set(name, directory);
  return directory;
}

/** Derives the read-only nodes from the insertion order of each child map. */
function freezeChildren(directory: MutableDirectory): readonly FileTreeNode[] {
  return [...directory.children.values()].map((child) =>
    child.kind === "file"
      ? child
      : {
        kind: "directory",
        name: child.name,
        path: child.path,
        children: freezeChildren(child),
      },
  );
}
