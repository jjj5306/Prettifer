import { describe, expect, it } from "vitest";

import { buildFileTree } from "../../../../src/desktop/renderer/files/file-tree.js";
import type { ReviewEntry } from "../../../../src/desktop/renderer/files/review-entries.js";

type ComposedFile = Extract<ReviewEntry, { kind: "file" }>["file"];

/** Wraps a composed file as the review entry the tree consumes. */
function fileEntry(file: ComposedFile): ReviewEntry {
  return { kind: "file", path: file.path, file };
}

describe("buildFileTree", () => {
  it("groups repository-relative paths while preserving original file identities", () => {
    const login: ComposedFile = {
      path: "src/auth/login.ts",
      status: "modified",
      beforeContent: "",
      afterContent: "",
    };
    const app: ComposedFile = {
      path: "src/app.ts",
      status: "added",
      beforeContent: null,
      afterContent: "",
    };
    const readme: ComposedFile = {
      path: "README.md",
      status: "deleted",
      beforeContent: "",
      afterContent: null,
    };

    expect(buildFileTree([login, app, readme].map(fileEntry))).toEqual([
      {
        kind: "directory",
        name: "src",
        path: "src",
        children: [
          {
            kind: "directory",
            name: "auth",
            path: "src/auth",
            children: [{
              kind: "file",
              name: "login.ts",
              path: "src/auth/login.ts",
              entry: fileEntry(login),
            }],
          },
          {
            kind: "file",
            name: "app.ts",
            path: "src/app.ts",
            entry: fileEntry(app),
          },
        ],
      },
      {
        kind: "file",
        name: "README.md",
        path: "README.md",
        entry: fileEntry(readme),
      },
    ]);
  });

  it("joins a directory chain that holds a single directory into one row", () => {
    const generator: ComposedFile = {
      path: "bundles/core/src/com/codescroll/generator.java",
      status: "modified",
      beforeContent: "",
      afterContent: "",
    };
    const generatorTest: ComposedFile = {
      path: "bundles/core/src/com/codescroll/tests/generator-test.java",
      status: "added",
      beforeContent: null,
      afterContent: "",
    };

    expect(buildFileTree([generator, generatorTest].map(fileEntry))).toEqual([{
      kind: "directory",
      name: "bundles/core/src/com/codescroll",
      path: "bundles/core/src/com/codescroll",
      children: [
        {
          kind: "file",
          name: "generator.java",
          path: "bundles/core/src/com/codescroll/generator.java",
          entry: fileEntry(generator),
        },
        {
          kind: "directory",
          name: "tests",
          path: "bundles/core/src/com/codescroll/tests",
          children: [{
            kind: "file",
            name: "generator-test.java",
            path: "bundles/core/src/com/codescroll/tests/generator-test.java",
            entry: fileEntry(generatorTest),
          }],
        },
      ],
    }]);
  });

  it("keeps a directory that holds a single file as its own row", () => {
    const file: ComposedFile = {
      path: "docs/auth.md",
      status: "modified",
      beforeContent: "",
      afterContent: "",
    };

    expect(buildFileTree([fileEntry(file)])).toEqual([{
      kind: "directory",
      name: "docs",
      path: "docs",
      children: [{
        kind: "file",
        name: "auth.md",
        path: "docs/auth.md",
        entry: fileEntry(file),
      }],
    }]);
  });

  it("accepts Windows separators without changing the original path", () => {
    const file: ComposedFile = {
      path: "src\\app.ts",
      status: "modified",
      beforeContent: "",
      afterContent: "",
    };

    expect(buildFileTree([fileEntry(file)])).toEqual([{
      kind: "directory",
      name: "src",
      path: "src",
      children: [{
        kind: "file",
        name: "app.ts",
        path: "src\\app.ts",
        entry: fileEntry(file),
      }],
    }]);
  });

  it("places a problem file at its path position alongside composed files", () => {
    const composed: ComposedFile = {
      path: "src/app.ts",
      status: "modified",
      beforeContent: "",
      afterContent: "",
    };
    const problem: ReviewEntry = {
      kind: "problem",
      path: "src/broken.ts",
      problem: {
        path: "src/broken.ts",
        code: "CONTENT_CHOICE_REQUIRED",
        commit: "a".repeat(40),
        nextAction: "Select the prerequisite commits, then build the result again.",
      },
    };

    expect(buildFileTree([fileEntry(composed), problem])).toEqual([{
      kind: "directory",
      name: "src",
      path: "src",
      children: [
        { kind: "file", name: "app.ts", path: "src/app.ts", entry: fileEntry(composed) },
        { kind: "file", name: "broken.ts", path: "src/broken.ts", entry: problem },
      ],
    }]);
  });
});
