import { beforeEach, describe, expect, it } from "vitest";

import {
  GroupingRuleStoreError,
  createGroupingRuleStore,
  repositoryKey,
  unavailableGroupingRuleStore,
  type GroupingRuleFileSystem,
} from "../../../src/desktop/main/grouping-rule-store.js";

const FILE_PATH = "C:/users/jun/AppData/Prettifer/grouping-rules.json";
const DIRECTORY_PATH = "C:/users/jun/AppData/Prettifer";

class FakeFileSystem implements GroupingRuleFileSystem {
  contents: string | null = null;
  writeError: Error | null = null;
  readonly createdDirectories: string[] = [];

  readFile(path: string): Promise<string> {
    expect(path).toBe(FILE_PATH);
    if (this.contents === null) {
      return Promise.reject(Object.assign(new Error("missing"), { code: "ENOENT" }));
    }
    return Promise.resolve(this.contents);
  }

  writeFile(path: string, contents: string): Promise<void> {
    expect(path).toBe(FILE_PATH);
    if (this.writeError !== null) {
      return Promise.reject(this.writeError);
    }
    this.contents = contents;
    return Promise.resolve();
  }

  makeDirectory(path: string): Promise<void> {
    this.createdDirectories.push(path);
    return Promise.resolve();
  }
}

describe("repositoryKey", () => {
  it("uses forward slashes and drops a trailing separator", () => {
    expect(repositoryKey("C:\\repos\\prettifer\\")).toBe("c:/repos/prettifer");
  });

  it("lower cases only the drive letter", () => {
    expect(repositoryKey("D:/Repos/Prettifer")).toBe("d:/Repos/Prettifer");
  });

  it("leaves a POSIX path alone", () => {
    expect(repositoryKey("/home/jun/prettifer")).toBe("/home/jun/prettifer");
  });
});

describe("createGroupingRuleStore", () => {
  let files: FakeFileSystem;

  beforeEach(() => {
    files = new FakeFileSystem();
  });

  const store = () => createGroupingRuleStore(FILE_PATH, DIRECTORY_PATH, files);

  it("reports no rules when the file does not exist yet", async () => {
    await expect(store().read("C:/repos/a")).resolves.toEqual([]);
  });

  it("restores the rules saved for that repository in order", async () => {
    const rules = [
      { prefix: "tests", name: "Tests" },
      { prefix: "src", name: "Source" },
    ];

    await store().write("C:/repos/a", rules);

    await expect(store().read("C:/repos/a")).resolves.toEqual(rules);
  });

  it("keeps the rules of each repository apart", async () => {
    await store().write("C:/repos/a", [{ prefix: "tests", name: "Tests" }]);
    await store().write("C:/repos/b", [{ prefix: "docs", name: "Docs" }]);

    await expect(store().read("C:/repos/a")).resolves
      .toEqual([{ prefix: "tests", name: "Tests" }]);
    await expect(store().read("C:/repos/b")).resolves
      .toEqual([{ prefix: "docs", name: "Docs" }]);
  });

  it("finds the rules again when the same repository is written differently", async () => {
    await store().write("C:\\repos\\a\\", [{ prefix: "tests", name: "Tests" }]);

    await expect(store().read("c:/repos/a")).resolves
      .toEqual([{ prefix: "tests", name: "Tests" }]);
  });

  it("reports unreadable content instead of replacing it", async () => {
    files.contents = "{ not json";

    await expect(store().read("C:/repos/a")).rejects
      .toMatchObject({ code: "GROUPING_RULES_UNREADABLE" });
    await expect(store().write("C:/repos/a", [])).rejects
      .toMatchObject({ code: "GROUPING_RULES_UNREADABLE" });
    expect(files.contents).toBe("{ not json");
  });

  it("reports content whose shape it does not understand", async () => {
    files.contents = JSON.stringify({ version: 1, repositories: { "c:/repos/a": 7 } });

    await expect(store().read("C:/repos/a")).rejects
      .toMatchObject({ code: "GROUPING_RULES_UNREADABLE" });
  });

  it("turns a write failure into a diagnosable error", async () => {
    files.writeError = new Error("disk full");

    const failure = await store().write("C:/repos/a", []).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GroupingRuleStoreError);
    expect((failure as GroupingRuleStoreError).code).toBe("GROUPING_RULES_WRITE_FAILED");
    expect((failure as GroupingRuleStoreError).nextAction).not.toBe("");
  });

  it("keeps overlapping writes in order", async () => {
    // Reading is held open so the second write starts while the first is still
    // deciding what to save, which is what two quick edits look like.
    let releaseFirstRead: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { releaseFirstRead = resolve; });
    const contents = files.readFile.bind(files);
    let reads = 0;
    files.readFile = async (path: string) => {
      reads += 1;
      if (reads === 1) {
        await held;
      }
      return contents(path);
    };
    const writing = store();

    const first = writing.write("C:/repos/a", [{ prefix: "one", name: "One" }]);
    const second = writing.write("C:/repos/a", [{ prefix: "two", name: "Two" }]);
    releaseFirstRead?.();
    await Promise.all([first, second]);

    await expect(store().read("C:/repos/a")).resolves
      .toEqual([{ prefix: "two", name: "Two" }]);
  });

  it("creates the settings folder before writing", async () => {
    await store().write("C:/repos/a", []);

    expect(files.createdDirectories).toEqual([DIRECTORY_PATH]);
  });
});

describe("unavailableGroupingRuleStore", () => {
  it("fails both operations with a next action", async () => {
    const store = unavailableGroupingRuleStore();

    await expect(store.read("C:/repos/a")).rejects
      .toMatchObject({ code: "GROUPING_RULES_UNAVAILABLE" });
    await expect(store.write("C:/repos/a", [])).rejects
      .toMatchObject({ code: "GROUPING_RULES_UNAVAILABLE" });
  });
});
