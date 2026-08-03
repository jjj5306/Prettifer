/**
 * Reading CHANGELOG.md, shared by the release-notes renderer and the CLI that
 * checks a version before a release starts building.
 */

/**
 * The body of the `## vVERSION` section, without its heading.
 *
 * A release that says nothing about what changed is worse than no release note,
 * so an absent or empty section is an error rather than an empty string.
 */
export function changelogSection(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## v${version}`);
  if (start < 0) {
    throw new Error(
      `CHANGELOG.md has no "## v${version}" section. Add one before releasing ${version}.`,
    );
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const section = (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
  if (section.length === 0) {
    throw new Error(`The "## v${version}" section of CHANGELOG.md is empty.`);
  }
  return section;
}
