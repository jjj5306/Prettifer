export function applicationUrlsMatch(actual: string, expected: string): boolean {
  return normalizeApplicationUrl(actual) === normalizeApplicationUrl(expected);
}

function normalizeApplicationUrl(value: string): string {
  const slashNormalized = value.replaceAll("\\", "/");
  const windowsFileUrl = /^file:\/\/[A-Za-z]:\//u.test(slashNormalized)
    ? `file:///${slashNormalized.slice("file://".length)}`
    : slashNormalized;
  try {
    return new URL(windowsFileUrl).href;
  } catch {
    return windowsFileUrl;
  }
}
