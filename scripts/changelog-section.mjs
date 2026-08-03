#!/usr/bin/env node
/* global process */
/**
 * Writes the CHANGELOG section of one version, for the release notes.
 *
 * A release that says nothing about what changed is worse than no release note,
 * so a missing or empty section exits non-zero and stops the publish.
 *
 * The section is written to a file rather than to stdout: a pipe on a Windows
 * runner re-encodes anything outside ASCII, which would mangle punctuation and
 * any language other than English.
 *
 * Usage: node scripts/changelog-section.mjs 0.3.0 [outputFile] [changelogFile]
 */
import { readFile, writeFile } from "node:fs/promises";

const [version, output, file = "CHANGELOG.md"] = process.argv.slice(2);

if (version === undefined || !/^\d+\.\d+\.\d+/u.test(version)) {
  fail(`Pass a version, for example 0.3.0. Received: ${String(version)}`);
}

const changelog = await readFile(file, "utf8").catch((error) => {
  fail(`${file} could not be read: ${String(error)}`);
});

/*
 * Sections are `## vMAJOR.MINOR.PATCH`. Splitting on the heading keeps the body
 * intact, including the nested `###` headings inside a section.
 */
const heading = `## v${version}`;
const start = changelog.split("\n").findIndex((line) => line.trim() === heading);
if (start < 0) {
  fail(`${file} has no "${heading}" section. Add one before releasing ${version}.`);
}

const lines = changelog.split("\n").slice(start + 1);
const end = lines.findIndex((line) => line.startsWith("## "));
const section = (end < 0 ? lines : lines.slice(0, end)).join("\n").trim();

if (section.length === 0) {
  fail(`The "${heading}" section of ${file} is empty.`);
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
