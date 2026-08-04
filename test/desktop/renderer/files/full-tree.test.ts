import { describe, expect, it } from "vitest";

import {
  buildFullTree,
  directoriesLeadingTo,
  type FullTreeDirectory,
  type FullTreeNode,
} from "../../../../src/desktop/renderer/files/full-tree.js";
import type { ReviewEntry } from "../../../../src/desktop/renderer/files/review-entries.js";

const changed = (path: string, status: "added" | "modified" | "deleted"): ReviewEntry => ({
  kind: "file",
  path,
  file: status === "added"
    ? { path, status, beforeContent: null, afterContent: "a" }
    : status === "deleted"
      ? { path, status, beforeContent: "b", afterContent: null }
      : { path, status, beforeContent: "b", afterContent: "a" },
});

const problem = (path: string): ReviewEntry => ({
  kind: "problem",
  path,
  problem: {
    path,
    code: "CONTENT_CHOICE_REQUIRED",
    commit: "c".repeat(40),
    nextAction: "Select the prerequisite commits.",
  },
});

const directory = (nodes: readonly FullTreeNode[], name: string): FullTreeDirectory => {
  const found = nodes.find(
    (node): node is FullTreeDirectory => node.kind === "directory" && node.name === name,
  );
  if (found === undefined) {
    throw new Error(`No directory named ${name}`);
  }
  return found;
};

const paths = (nodes: readonly FullTreeNode[]): readonly string[] =>
  nodes.flatMap((node) => node.kind === "directory" ? paths(node.children) : [node.path]);

describe("buildFullTree", () => {
  // `git ls-tree -r` reports sorted paths, which is the order the tree keeps.
  const basePaths = ["README.md", "docs/guide.md", "src/app.ts", "src/util.ts"];

  it("places every tracked path in its folder", () => {
    const tree = buildFullTree(basePaths, []);

    expect(paths(tree)).toEqual([
      "docs/guide.md",
      "src/app.ts",
      "src/util.ts",
      "README.md",
    ]);
  });

  it("marks a file the result never touched as unchanged", () => {
    const tree = buildFullTree(basePaths, []);

    expect(directory(tree, "src").children.map((node) => node.kind === "file" && node.status))
      .toEqual(["unchanged", "unchanged"]);
  });

  it("takes the change status from the result", () => {
    const tree = buildFullTree(basePaths, [changed("src/app.ts", "modified")]);
    const [app] = directory(tree, "src").children;

    expect(app?.kind === "file" && app.status).toBe("modified");
  });

  it("keeps a problem file as a problem", () => {
    const tree = buildFullTree(basePaths, [problem("src/app.ts")]);
    const [app] = directory(tree, "src").children;

    expect(app?.kind === "file" && app.status).toBe("problem");
  });

  it("adds a file the comparison base does not have", () => {
    const tree = buildFullTree(basePaths, [changed("src/new/added.ts", "added")]);

    expect(paths(tree)).toContain("src/new/added.ts");
    expect(directory(directory(tree, "src").children, "new").children).toHaveLength(1);
  });

  it("keeps a deleted file, which the comparison base still has", () => {
    const tree = buildFullTree(basePaths, [changed("src/util.ts", "deleted")]);
    const utility = directory(tree, "src").children.find(
      (node) => node.kind === "file" && node.name === "util.ts",
    );

    expect(utility?.kind === "file" && utility.status).toBe("deleted");
  });

  it("does not list a path twice when the result and the base share it", () => {
    const tree = buildFullTree(basePaths, [changed("src/app.ts", "modified")]);

    expect(paths(tree).filter((path) => path === "src/app.ts")).toHaveLength(1);
  });

  it("marks a folder that holds a change anywhere below it", () => {
    const tree = buildFullTree(
      ["a/b/c/deep.ts", "other/plain.ts"],
      [changed("a/b/c/deep.ts", "modified")],
    );

    expect(directory(tree, "a").hasChanges).toBe(true);
    expect(directory(directory(tree, "a").children, "b").hasChanges).toBe(true);
    expect(directory(tree, "other").hasChanges).toBe(false);
  });

  it("keeps the order the paths arrived in within each group", () => {
    const tree = buildFullTree(["b/one.ts", "a/two.ts"], []);

    expect(tree.map((node) => node.name)).toEqual(["b", "a"]);
  });

  it("puts folders before files at each level", () => {
    const tree = buildFullTree(["z.ts", "a/inner.ts"], []);

    expect(tree.map((node) => node.kind)).toEqual(["directory", "file"]);
  });

  it("builds an empty tree from no paths", () => {
    expect(buildFullTree([], [])).toEqual([]);
  });
});

describe("directoriesLeadingTo", () => {
  it("returns every ancestor folder of a path", () => {
    expect([...directoriesLeadingTo(["a/b/c/file.ts"])]).toEqual(["a", "a/b", "a/b/c"]);
  });

  it("returns nothing for a file at the repository root", () => {
    expect([...directoriesLeadingTo(["README.md"])]).toEqual([]);
  });

  it("collects the ancestors of every path once", () => {
    const open = directoriesLeadingTo(["src/a.ts", "src/b.ts", "docs/c.md"]);

    expect([...open].sort()).toEqual(["docs", "src"]);
  });
});
