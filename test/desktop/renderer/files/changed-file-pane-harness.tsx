import { ChangedFilePane } from "../../../../src/desktop/renderer/files/ChangedFilePane.js";
import { changedPathsOf } from "../../../../src/desktop/renderer/files/full-tree.js";
import { useChangedFileView } from "../../../../src/desktop/renderer/files/use-changed-file-view.js";
import type {
  BaseTreeState,
  GroupingRulesState,
} from "../../../../src/desktop/renderer/state/app-state.js";
import type {
  CompositeDiffResultDto,
  GroupRuleDto,
} from "../../../../src/desktop/shared/index.js";

export const NO_RULES: GroupingRulesState = {
  status: "ready",
  rules: [],
  saveDiagnostic: null,
};

export const REPOSITORY_PATH = "C:\\work\\repo";

export const NO_BASE_TREE: BaseTreeState = { status: "idle" };

interface PaneProps {
  readonly result: CompositeDiffResultDto;
  readonly selectedFilePath: string | null;
  readonly groupingRules?: GroupingRulesState;
  readonly baseTree?: BaseTreeState;
  readonly repositoryPath?: string;
  readonly onSelectFile: (path: string) => void;
  readonly onChangeRules?: (rules: readonly GroupRuleDto[]) => void;
  readonly onOpenFileHistory?: () => void;
}

/**
 * Renders the panel with the view state the workbench normally owns, so a test
 * drives the real transitions instead of a stand-in.
 */
export const Pane = ({
  result,
  selectedFilePath,
  groupingRules = NO_RULES,
  baseTree = NO_BASE_TREE,
  repositoryPath = REPOSITORY_PATH,
  onSelectFile,
  onChangeRules = () => undefined,
  onOpenFileHistory = () => undefined,
}: PaneProps) => {
  const control = useChangedFileView(selectedFilePath, groupingRules, {
    changedPaths: changedPathsOf(result),
  });
  return (
    <ChangedFilePane
      isCurrentRegion={false}
      result={result}
      selectedFilePath={selectedFilePath}
      repositoryPath={repositoryPath}
      groupingRules={groupingRules}
      baseTree={baseTree}
      control={control}
      onSelectFile={onSelectFile}
      onChangeRules={onChangeRules}
      onOpenFileHistory={onOpenFileHistory}
    />
  );
};
