import type { CompositeDiffResultDto } from "../../shared/index.js";

type CompositeFile = CompositeDiffResultDto["files"][number];

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
  readonly file: CompositeFile;
}

export type FileTreeNode = FileTreeDirectory | FileTreeFile;

interface MutableDirectory {
  readonly kind: "directory";
  readonly name: string;
  readonly path: string;
  readonly children: FileTreeNode[];
  readonly directories: Map<string, MutableDirectory>;
}

/**
 * Builds the changed file hierarchy and joins directory chains that hold a
 * single directory, so deep repository paths do not indent one level per
 * segment. The joined row keeps the deepest directory path as its identity.
 */
export function buildFileTree(
  files: readonly CompositeFile[],
): readonly FileTreeNode[] {
  return joinSingleChildDirectories(buildDirectoryTree(files));
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
  files: readonly CompositeFile[],
): readonly FileTreeNode[] {
  const root: MutableDirectory = {
    kind: "directory",
    name: "",
    path: "",
    children: [],
    directories: new Map(),
  };

  for (const file of files) {
    const segments = file.path.split(/[\\/]/u).filter((segment) => segment.length > 0);
    const fileName = segments.at(-1) ?? file.path;
    let parent = root;
    let directoryPath = "";

    for (const segment of segments.slice(0, -1)) {
      directoryPath =
        directoryPath.length === 0 ? segment : `${directoryPath}/${segment}`;
      const existing = parent.directories.get(segment);
      if (existing !== undefined) {
        parent = existing;
        continue;
      }
      const directory: MutableDirectory = {
        kind: "directory",
        name: segment,
        path: directoryPath,
        children: [],
        directories: new Map(),
      };
      parent.directories.set(segment, directory);
      parent.children.push(directory);
      parent = directory;
    }

    parent.children.push({
      kind: "file",
      name: fileName,
      path: file.path,
      file,
    });
  }

  return root.children;
}
