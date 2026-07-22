/* global console, process */

import {
  CompositeDiffService,
  verifyGitEnvironment,
} from "../dist/index.js";

const [repositoryPath, baseRef, headRef, ...selectedCommits] =
  process.argv.slice(2);

if (
  repositoryPath === undefined ||
  baseRef === undefined ||
  headRef === undefined ||
  selectedCommits.length === 0
) {
  console.error(
    "사용법: node examples/compose-selected-commits.mjs " +
      "<repository-path> <base-ref> <head-ref> <commit> [commit ...]",
  );
  process.exit(1);
}

try {
  await verifyGitEnvironment();
  const result = await new CompositeDiffService().compose({
    repositoryPath,
    baseRef,
    headRef,
    selectedCommits,
  });

  console.log(
    JSON.stringify(
      {
        baseCommit: result.baseCommit,
        selectedCommits: result.selectedCommits,
        files: result.files,
      },
      null,
      2,
    ),
  );
  console.log("\n--- unified diff ---\n");
  process.stdout.write(result.unifiedDiff);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (
    typeof error === "object" &&
    error !== null &&
    "nextAction" in error
  ) {
    console.error(`다음 행동: ${String(error.nextAction)}`);
  }
  process.exitCode = 1;
}
