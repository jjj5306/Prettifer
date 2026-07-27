interface DialogResult {
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
}

interface FolderDialog {
  show(): Promise<DialogResult>;
}

interface E2EEnvironment {
  readonly PRETTIFER_E2E?: string;
  readonly PRETTIFER_E2E_REPOSITORIES?: string;
  readonly PRETTIFER_E2E_GIT_PATH?: string;
  readonly PRETTIFER_E2E_COMPOSITION_DELAY_MS?: string;
}

export function createFolderSelectionBoundary(
  dialog: FolderDialog,
  environment: E2EEnvironment,
): { selectFolder(): Promise<string | null> } {
  const fixturePaths = parseFixturePaths(environment);
  let fixtureIndex = 0;
  return {
    async selectFolder(): Promise<string | null> {
      const fixturePath = fixturePaths[Math.min(fixtureIndex, fixturePaths.length - 1)];
      if (fixturePath !== undefined) {
        fixtureIndex += 1;
        return fixturePath;
      }
      const result = await dialog.show();
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
  };
}

export function e2eGitPath(environment: E2EEnvironment): string | undefined {
  return environment.PRETTIFER_E2E === "1"
    ? environment.PRETTIFER_E2E_GIT_PATH
    : undefined;
}

export function e2eCompositionDelay(
  environment: E2EEnvironment,
): () => Promise<void> {
  const parsed = environment.PRETTIFER_E2E === "1"
    ? Number(environment.PRETTIFER_E2E_COMPOSITION_DELAY_MS ?? "0")
    : 0;
  const milliseconds = Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, 2_000)
    : 0;
  return () => milliseconds === 0
    ? Promise.resolve()
    : new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
      });
}

function parseFixturePaths(environment: E2EEnvironment): readonly string[] {
  if (
    environment.PRETTIFER_E2E !== "1" ||
    environment.PRETTIFER_E2E_REPOSITORIES === undefined
  ) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(environment.PRETTIFER_E2E_REPOSITORIES);
    return Array.isArray(parsed) && parsed.every((path) => typeof path === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}
