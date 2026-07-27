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
