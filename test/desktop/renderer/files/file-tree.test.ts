import { describe, expect, it } from "vitest";

import { buildFileTree } from "../../../../src/desktop/renderer/files/file-tree.js";

describe("buildFileTree", () => {
  it("groups repository-relative paths while preserving original file identities", () => {
    const files = [
      { path: "src/auth/login.ts", status: "modified" as const, beforeContent: "", afterContent: "" },
      { path: "src/app.ts", status: "added" as const, beforeContent: null, afterContent: "" },
      { path: "README.md", status: "deleted" as const, beforeContent: "", afterContent: null },
    ];

    expect(buildFileTree(files)).toEqual([
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
              file: files[0],
            }],
          },
          {
            kind: "file",
            name: "app.ts",
            path: "src/app.ts",
            file: files[1],
          },
        ],
      },
      {
        kind: "file",
        name: "README.md",
        path: "README.md",
        file: files[2],
      },
    ]);
  });

  it("accepts Windows separators without changing the original path", () => {
    const file = {
      path: "src\\app.ts",
      status: "modified" as const,
      beforeContent: "",
      afterContent: "",
    };

    expect(buildFileTree([file])).toEqual([{
      kind: "directory",
      name: "src",
      path: "src",
      children: [{
        kind: "file",
        name: "app.ts",
        path: "src\\app.ts",
        file,
      }],
    }]);
  });
});
