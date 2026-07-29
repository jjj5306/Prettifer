import type {
  CompositeDiffResultDto,
  RepositorySession,
} from "../../shared/index.js";
import type { AppState, RepositoryState } from "./app-state.js";

export function selectRepositorySession(
  repository: RepositoryState,
): RepositorySession | null {
  switch (repository.status) {
    case "empty":
      return null;
    case "ready":
    case "error":
      return repository.session;
    case "selecting":
      return selectRepositorySession(repository.previous);
  }
}

export function selectSelectedFile(
  state: AppState,
): CompositeDiffResultDto["files"][number] | null {
  if (state.composition.status !== "ready" || state.selectedFilePath === null) {
    return null;
  }
  return state.composition.result.files.find(
    (file) => file.path === state.selectedFilePath,
  ) ?? null;
}

export function selectSelectedProblemFile(
  state: AppState,
): CompositeDiffResultDto["problemFiles"][number] | null {
  if (state.composition.status !== "ready" || state.selectedFilePath === null) {
    return null;
  }
  return state.composition.result.problemFiles.find(
    (problem) => problem.path === state.selectedFilePath,
  ) ?? null;
}

/**
 * Counts selected merge commits whose mainline parent the user has not chosen
 * yet. Composition cannot start while any of them remain.
 */
export function selectPendingMainlineParents(state: AppState): number {
  if (state.range.status !== "ready") {
    return 0;
  }
  const selected = new Set(state.selectedCommitIds);
  return state.range.commits.filter(
    (commit) =>
      commit.isMerge &&
      selected.has(commit.id) &&
      state.mergeParents[commit.id] === undefined,
  ).length;
}
