/**
 * Reads the repository path a user passed on the command line.
 *
 * The argument list differs by how the app runs, and Electron appends its own
 * switches, so both are handled here instead of at the call site.
 *
 * | run | argv |
 * |---|---|
 * | packaged | `[prettifer.exe, <path>, ...]` |
 * | development | `[electron.exe, <script>, <path>, ...]` |
 */
export function repositoryPathFromArgv(
  argv: readonly string[],
  isPackaged: boolean,
): string | null {
  const positional = argv
    .slice(isPackaged ? 1 : 2)
    .filter((argument) => !argument.startsWith("-"));
  const first = positional[0];
  return first === undefined || first.trim().length === 0 ? null : first;
}
