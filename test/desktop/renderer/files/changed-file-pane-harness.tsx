import { ChangedFilePane } from "../../../../src/desktop/renderer/files/ChangedFilePane.js";
import { useChangedFileView } from "../../../../src/desktop/renderer/files/use-changed-file-view.js";
import type { GroupingRulesState } from "../../../../src/desktop/renderer/state/app-state.js";
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

interface PaneProps {
  readonly result: CompositeDiffResultDto;
  readonly selectedFilePath: string | null;
  readonly groupingRules?: GroupingRulesState;
  readonly repositoryPath?: string;
  readonly onSelectFile: (path: string) => void;
  readonly onChangeRules?: (rules: readonly GroupRuleDto[]) => void;
}

/**
 * Renders the panel with the view state the workbench normally owns, so a test
 * drives the real transitions instead of a stand-in.
 */
export const Pane = ({
  result,
  selectedFilePath,
  groupingRules = NO_RULES,
  repositoryPath = REPOSITORY_PATH,
  onSelectFile,
  onChangeRules = () => undefined,
}: PaneProps) => {
  const control = useChangedFileView(selectedFilePath, groupingRules);
  return (
    <ChangedFilePane
      result={result}
      selectedFilePath={selectedFilePath}
      repositoryPath={repositoryPath}
      groupingRules={groupingRules}
      control={control}
      onSelectFile={onSelectFile}
      onChangeRules={onChangeRules}
    />
  );
};
