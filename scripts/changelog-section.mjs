#!/usr/bin/env node
/* global process */
/**
 * Prints the CHANGELOG section of one version, so a release stops before the
 * build rather than after it when the section is missing.
 *
 *   node scripts/changelog-section.mjs 0.3.0 [outputFile] [changelogFile]
 *
 * With an output path the section is written to that file instead of printed: a
 * pipe on a Windows runner re-encodes anything outside ASCII, which would mangle
 * punctuation and any language other than English.
 */
import { readFile, writeFile } from "node:fs/promises";

import { changelogSection } from "./lib/changelog.mjs";

const [version, output, file = "CHANGELOG.md"] = process.argv.slice(2);

if (version === undefined || !/^\d+\.\d+\.\d+/u.test(version)) {
  fail(`Pass a version, for example 0.3.0. Received: ${String(version)}`);
}

const changelog = await readFile(file, "utf8").catch((error) => {
  fail(`${file} could not be read: ${String(error)}`);
});

let section;
try {
  section = changelogSection(changelog, version);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (output === undefined) {
  process.stdout.write(`${section}\n`);
} else {
  await writeFile(output, `${section}\n`, "utf8");
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
