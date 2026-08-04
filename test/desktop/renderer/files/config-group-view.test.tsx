// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChangedFilePane } from "../../../../src/desktop/renderer/files/ChangedFilePane.js";
import { GROUP_RULE_LIMIT } from "../../../../src/grouping/group-rule.js";
import type { GroupingRulesState } from "../../../../src/desktop/renderer/state/app-state.js";
import type {
  CompositeDiffResultDto,
  GroupRuleDto,
} from "../../../../src/desktop/shared/index.js";

const result: CompositeDiffResultDto = {
  baseCommit: "a".repeat(40),
  selectedCommits: ["b".repeat(40)],
  files: [
    { path: "README.md", status: "modified" as const, beforeContent: "1", afterContent: "2" },
    { path: "src/main/App.java", status: "added" as const, beforeContent: null, afterContent: "a" },
    { path: "src/test/AppTest.java", status: "added" as const, beforeContent: null, afterContent: "t" },
  ],
  mainlineParents: {},
  problemFiles: [],
  unifiedDiff: "diff",
};

const emptyResult = { ...result, files: [], problemFiles: [] };

const ready = (rules: readonly GroupRuleDto[]): GroupingRulesState =>
  ({ status: "ready", rules, saveDiagnostic: null });

function renderPane(
  rulesState: GroupingRulesState,
  overrides: Partial<{
    result: CompositeDiffResultDto;
    selectedFilePath: string | null;
    onSelectFile: (path: string) => void;
    onChangeRules: (rules: readonly GroupRuleDto[]) => void;
  }> = {},
) {
  return render(
    <StrictMode>
      <ChangedFilePane
        result={overrides.result ?? result}
        selectedFilePath={overrides.selectedFilePath ?? null}
        repositoryPath="C:\work\repo"
        groupingRules={rulesState}
        onSelectFile={overrides.onSelectFile ?? vi.fn()}
        onChangeRules={overrides.onChangeRules ?? vi.fn()}
      />
    </StrictMode>,
  );
}

const openConfigView = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Config View" }));
};

const groupHeaders = () =>
  screen.getAllByRole("button", { expanded: true }).map((button) => button.textContent);

describe("Config View", () => {
  it("shows one group per rule in the order the user arranged them", async () => {
    const user = userEvent.setup();
    renderPane(ready([
      { prefix: "src/test", name: "Tests" },
      { prefix: "src", name: "Source" },
    ]));

    await openConfigView(user);

    expect(screen.getByRole("button", { name: "Config View" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(groupHeaders()).toEqual(["▾Tests1", "▾Source1", "▾Ungrouped1"]);
  });

  it("puts a file under the longest matching prefix only", async () => {
    const user = userEvent.setup();
    renderPane(ready([
      { prefix: "src", name: "Source" },
      { prefix: "src/test", name: "Tests" },
    ]));

    await openConfigView(user);

    const files = screen.getAllByRole("button", { name: /file: /iu });
    expect(files.map((button) => button.textContent)).toEqual([
      "Asrc/main/App.java",
      "Asrc/test/AppTest.java",
      "MREADME.md",
    ]);
  });

  it("keeps files no rule matched in a last group and preserves the file count", async () => {
    const user = userEvent.setup();
    renderPane(ready([{ prefix: "src", name: "Source" }]));

    await openConfigView(user);

    expect(groupHeaders().at(-1)).toBe("▾Ungrouped1");
    expect(screen.getAllByRole("button", { name: /file: /iu })).toHaveLength(
      result.files.length,
    );
  });

  it("marks a rule that matched nothing so it is not read as missing", async () => {
    const user = userEvent.setup();
    renderPane(ready([{ prefix: "docs", name: "Docs" }]));

    await openConfigView(user);

    expect(screen.getByRole("button", { name: /^Docs, rule docs to Docs, 0 files$/u }))
      .toBeInTheDocument();
    expect(screen.getByText("No changed files under docs.")).toBeInTheDocument();
  });

  it("names the applied rule on every file", async () => {
    const user = userEvent.setup();
    renderPane(ready([{ prefix: "src/test", name: "Tests" }]));

    await openConfigView(user);

    expect(screen.getByRole("button", {
      name: "View file: src/test/AppTest.java (Added), rule src/test to Tests",
    })).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "View file: README.md (Modified), no rule matched",
    })).toBeInTheDocument();
  });

  it("selects a file from a group", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    renderPane(ready([{ prefix: "src", name: "Source" }]), { onSelectFile });

    await openConfigView(user);
    await user.click(screen.getByRole("button", {
      name: "View file: src/main/App.java (Added), rule src to Source",
    }));

    expect(onSelectFile).toHaveBeenCalledWith("src/main/App.java");
  });

  it("collapses and expands a group with the keyboard and keeps its file count", async () => {
    const user = userEvent.setup();
    renderPane(ready([{ prefix: "src", name: "Source" }]));
    await openConfigView(user);

    const group = screen.getByRole("button", { name: /^Source, / });
    group.focus();
    await user.keyboard("{Enter}");

    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(group).toHaveFocus();
    expect(group.textContent).toContain("2");
    expect(screen.queryByRole("button", {
      name: /file: src\/main\/App\.java/u,
    })).toBeNull();

    await user.keyboard(" ");
    expect(group).toHaveAttribute("aria-expanded", "true");
  });

  it("expands the group of the file under review when the view changes", async () => {
    const user = userEvent.setup();
    renderPane(ready([{ prefix: "src", name: "Source" }]), {
      selectedFilePath: "src/main/App.java",
    });
    await openConfigView(user);

    await user.click(screen.getByRole("button", { name: /^Source, / }));
    await user.click(screen.getByRole("button", { name: "List View" }));
    await openConfigView(user);

    expect(screen.getByRole("button", { name: /^Source, / }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", {
      name: "Currently viewing file: src/main/App.java (Added), rule src to Source",
    })).toBeInTheDocument();
  });

  it("explains what to set up when the repository has no rules", async () => {
    const user = userEvent.setup();
    renderPane(ready([]));

    await openConfigView(user);

    expect(screen.getByText("No group rules for this repository yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a rule" })).toBeInTheDocument();
    // Rules are filed under the repository path, so the guidance names it.
    expect(screen.getByText(/Rules are kept in the Prettifer settings for/u))
      .toHaveTextContent("C:\\work\\repo");
  });

  it("replaces the guidance with groups once the first rule exists", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPane(ready([]));
    await openConfigView(user);
    expect(screen.getByText("No group rules for this repository yet.")).toBeInTheDocument();

    rerender(
      <StrictMode>
        <ChangedFilePane
          result={result}
          selectedFilePath={null}
          repositoryPath="C:\work\repo"
          groupingRules={ready([{ prefix: "src", name: "Source" }])}
          onSelectFile={vi.fn()}
          onChangeRules={vi.fn()}
        />
      </StrictMode>,
    );

    expect(screen.queryByText("No group rules for this repository yet.")).toBeNull();
    expect(screen.getByRole("button", { name: /^Source, / })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Ungrouped, / })).toBeInTheDocument();
  });

  it("keeps grouping with the valid rules and explains the rule it left out", async () => {
    const user = userEvent.setup();
    renderPane(ready([
      { prefix: "src", name: "Source" },
      { prefix: "../outside", name: "Outside" },
    ]));

    await openConfigView(user);

    expect(screen.getByText(/must be a repository-relative path/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Source, / })).toBeInTheDocument();
  });

  it("keeps the file list when every stored rule was left out", async () => {
    const user = userEvent.setup();
    renderPane(ready([{ prefix: "/etc", name: "Config" }]));

    await openConfigView(user);

    expect(screen.getByText(/must be a repository-relative path/u)).toBeInTheDocument();
    expect(screen.queryByText("No group rules for this repository yet.")).toBeNull();
    expect(screen.getAllByRole("button", { name: /file: /iu })).toHaveLength(
      result.files.length,
    );
  });

  it("reports a settings file it could not read and leaves the other views alone", async () => {
    const user = userEvent.setup();
    renderPane({
      status: "error",
      diagnostic: {
        code: "GROUPING_RULES_UNREADABLE",
        message: "The saved grouping rules are not in a form Prettifer understands.",
        nextAction: "Fix or remove the grouping rules file, then reopen the repository.",
      },
    });

    await openConfigView(user);

    expect(screen.getByRole("alert")).toHaveTextContent(/not in a form Prettifer understands/u);
    expect(screen.getByText("Tree View and List View are unaffected.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "List View" }));
    expect(screen.getAllByRole("button", { name: /file: /iu })).toHaveLength(
      result.files.length,
    );
  });

  it("reports a save that did not reach the settings file", async () => {
    const user = userEvent.setup();
    renderPane({
      status: "ready",
      rules: [{ prefix: "src", name: "Source" }],
      saveDiagnostic: {
        code: "GROUPING_RULES_WRITE_FAILED",
        message: "Prettifer could not save the grouping rules.",
        nextAction: "Check that Prettifer can write to its settings folder, then save again.",
      },
    });

    await openConfigView(user);

    expect(screen.getByRole("alert")).toHaveTextContent(/could not save the grouping rules/u);
    expect(screen.getByRole("button", { name: /^Source, / })).toBeInTheDocument();
  });

  it("shows problem and binary files in their group with the same state", async () => {
    const user = userEvent.setup();
    const withProblem = {
      ...result,
      files: [
        ...result.files,
        {
          path: "src/main/logo.png",
          status: "modified" as const,
          binary: true as const,
          beforeContent: null,
          afterContent: null,
        },
      ],
      problemFiles: [{
        path: "src/main/Conflict.java",
        code: "CONTENT_CHOICE_REQUIRED" as const,
        commit: "c".repeat(40),
        nextAction: "Choose the content to keep.",
      }],
    };
    renderPane(ready([{ prefix: "src/main", name: "Product" }]), { result: withProblem });

    await openConfigView(user);

    expect(screen.getByRole("button", {
      name: "View file: src/main/Conflict.java (Problem), rule src/main to Product",
    })).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "View file: src/main/logo.png (Modified), rule src/main to Product",
    })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Product, / }).textContent).toContain("3");
  });

  it("does not start new work when only the view changes", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    const onChangeRules = vi.fn();
    renderPane(ready([{ prefix: "src", name: "Source" }]), {
      selectedFilePath: "src/main/App.java",
      onSelectFile,
      onChangeRules,
    });

    await openConfigView(user);
    await user.click(screen.getByRole("button", { name: "Tree View" }));
    await openConfigView(user);
    await user.click(screen.getByRole("button", { name: "List View" }));

    expect(onSelectFile).not.toHaveBeenCalled();
    expect(onChangeRules).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {
      name: "Currently viewing file: src/main/App.java (Added)",
    })).toBeInTheDocument();
  });

  it("offers the rule editor when the result has no changed files", async () => {
    const user = userEvent.setup();
    renderPane(ready([{ prefix: "src", name: "Source" }]), { result: emptyResult });

    await openConfigView(user);

    expect(screen.getByText("No changed files in this result.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit group rules" })).toBeInTheDocument();
  });
});

describe("group rule editor", () => {
  const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
    await openConfigView(user);
    await user.click(screen.getByRole("button", { name: "Edit group rules" }));
  };

  it("adds a rule at the end of the list", async () => {
    const user = userEvent.setup();
    const onChangeRules = vi.fn();
    renderPane(ready([{ prefix: "src", name: "Source" }]), { onChangeRules });
    await openEditor(user);

    await user.type(screen.getByLabelText("Path prefix"), "src/test/");
    await user.type(screen.getByLabelText("Group name"), "Tests");
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(onChangeRules).toHaveBeenCalledWith([
      { prefix: "src", name: "Source" },
      { prefix: "src/test", name: "Tests" },
    ]);
  });

  it("refuses a duplicate prefix and keeps what the user typed", async () => {
    const user = userEvent.setup();
    const onChangeRules = vi.fn();
    renderPane(ready([{ prefix: "src", name: "Source" }]), { onChangeRules });
    await openEditor(user);

    await user.type(screen.getByLabelText("Path prefix"), "src/");
    await user.type(screen.getByLabelText("Group name"), "Code");
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/already used by the group Source/u);
    expect(screen.getByLabelText("Path prefix")).toHaveValue("src/");
    expect(onChangeRules).not.toHaveBeenCalled();
  });

  it("refuses a duplicate group name", async () => {
    const user = userEvent.setup();
    const onChangeRules = vi.fn();
    renderPane(ready([{ prefix: "src", name: "Source" }]), { onChangeRules });
    await openEditor(user);

    await user.type(screen.getByLabelText("Path prefix"), "lib");
    await user.type(screen.getByLabelText("Group name"), "source");
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/already used by the prefix src/u);
    expect(onChangeRules).not.toHaveBeenCalled();
  });

  it("refuses a rule without a prefix", async () => {
    const user = userEvent.setup();
    const onChangeRules = vi.fn();
    renderPane(ready([]), { onChangeRules });
    await openEditor(user);

    await user.type(screen.getByLabelText("Group name"), "Tests");
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/needs a repository path prefix/u);
    expect(onChangeRules).not.toHaveBeenCalled();
  });

  it("edits an existing rule in place", async () => {
    const user = userEvent.setup();
    const onChangeRules = vi.fn();
    renderPane(ready([
      { prefix: "src", name: "Source" },
      { prefix: "docs", name: "Docs" },
    ]), { onChangeRules });
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Edit Source" }));
    await user.clear(screen.getByLabelText("Group name"));
    await user.type(screen.getByLabelText("Group name"), "Product code");
    await user.click(screen.getByRole("button", { name: "Save rule" }));

    expect(onChangeRules).toHaveBeenCalledWith([
      { prefix: "src", name: "Product code" },
      { prefix: "docs", name: "Docs" },
    ]);
  });

  it("deletes a rule", async () => {
    const user = userEvent.setup();
    const onChangeRules = vi.fn();
    renderPane(ready([
      { prefix: "src", name: "Source" },
      { prefix: "docs", name: "Docs" },
    ]), { onChangeRules });
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Delete Source" }));

    expect(onChangeRules).toHaveBeenCalledWith([{ prefix: "docs", name: "Docs" }]);
  });

  it("changes the display order", async () => {
    const user = userEvent.setup();
    const onChangeRules = vi.fn();
    renderPane(ready([
      { prefix: "src", name: "Source" },
      { prefix: "docs", name: "Docs" },
    ]), { onChangeRules });
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Move Docs up" }));

    expect(onChangeRules).toHaveBeenCalledWith([
      { prefix: "docs", name: "Docs" },
      { prefix: "src", name: "Source" },
    ]);
  });

  it("says the rule list is full instead of adding one more", async () => {
    const user = userEvent.setup();
    const onChangeRules = vi.fn();
    const full = Array.from(
      { length: GROUP_RULE_LIMIT },
      (_unused, index) => ({ prefix: `dir${String(index)}`, name: `Group ${String(index)}` }),
    );
    renderPane(ready(full), { onChangeRules });
    await openEditor(user);

    await user.type(screen.getByLabelText("Path prefix"), "extra");
    await user.type(screen.getByLabelText("Group name"), "Extra");
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      new RegExp(`applies at most ${String(GROUP_RULE_LIMIT)} rules`, "u"),
    );
    expect(onChangeRules).not.toHaveBeenCalled();
  });

  it("opens from the keyboard and moves focus into the form", async () => {
    const user = userEvent.setup();
    renderPane(ready([]));
    await openConfigView(user);

    const entry = screen.getByRole("button", { name: "Edit group rules" });
    entry.focus();
    await user.keyboard("{Enter}");

    expect(entry).toHaveAttribute("aria-expanded", "true");
    await user.tab();
    expect(screen.getByLabelText("Path prefix")).toHaveFocus();
  });
});
