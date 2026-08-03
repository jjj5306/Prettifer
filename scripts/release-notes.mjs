#!/usr/bin/env node
/* global process */
/**
 * Renders the release notes of one version from the template and CHANGELOG.md.
 *
 * The publish workflow uses this, and so does anyone re-rendering the notes of a
 * release that already exists. One renderer means an old release re-published
 * later cannot drift from what the workflow would produce.
 *
 * Values come from the environment, so the workflow can pass its own, and flags
 * override them for a manual run:
 *
 *   node scripts/release-notes.mjs --version 0.1.0 \
 *     --sha256 <hex64> --source-sha <hex40> --out notes.md
 *
 * Every placeholder must be filled and every value must have the right shape; a
 * release note with a wrong hash is worse than none, because it tells a reader a
 * good download is corrupt.
 */
import { readFile, writeFile } from "node:fs/promises";

import { changelogSection } from "./lib/changelog.mjs";

const DEFAULTS = {
  releaseRepository: "jjj5306/prettifer-release",
  sourceRepository: "jjj5306/Prettifer",
  template: ".github/release-notes-template.md",
  changelog: "CHANGELOG.md",
};

const options = parseArguments(process.argv.slice(2));
const version = options.version ?? process.env.VERSION;
const tag = options.tag ?? process.env.TAG ?? `v${String(version)}`;
const sha256 = options.sha256 ?? process.env.SHA256;
const sourceSha = options["source-sha"] ?? process.env.SOURCE_SHA;
const releaseRepository = options["release-repository"]
  ?? process.env.RELEASE_REPOSITORY
  ?? DEFAULTS.releaseRepository;
const sourceRepository = options["source-repository"]
  ?? process.env.SOURCE_REPOSITORY
  ?? DEFAULTS.sourceRepository;

require(version, /^\d+\.\d+\.\d+$/u, "--version", "0.3.0");
require(tag, /^v\d+\.\d+\.\d+$/u, "--tag", "v0.3.0");
require(sha256, /^[0-9a-f]{64}$/u, "--sha256", "64 lowercase hex characters");
require(sourceSha, /^[0-9a-f]{40}$/u, "--source-sha", "40 lowercase hex characters");
if (tag !== `v${version}`) {
  fail(`The tag ${tag} does not match the version ${version}.`);
}

const template = await read(options.template ?? DEFAULTS.template);
const changelog = await read(options.changelog ?? DEFAULTS.changelog);

const replacements = {
  "{{TAG}}": tag,
  "{{VERSION}}": version,
  "{{CHANGES}}": section(changelog, version),
  "{{SHA256}}": sha256,
  "{{RELEASE_REPOSITORY}}": releaseRepository,
  "{{SOURCE_REPOSITORY}}": sourceRepository,
  "{{SHORT_SHA}}": sourceSha.slice(0, 7),
  "{{SHA}}": sourceSha,
};

let notes = template;
for (const [placeholder, value] of Object.entries(replacements)) {
  notes = notes.replaceAll(placeholder, value);
}
const leftover = /\{\{[A-Z_]+\}\}/u.exec(notes);
if (leftover !== null) {
  fail(`The notes still contain ${leftover[0]}.`);
}

const out = options.out ?? process.env.OUT;
if (out === undefined) {
  process.stdout.write(notes);
} else {
  await writeFile(out, notes, "utf8");
}

/** `--name value` pairs only; this runs in CI, so nothing is guessed. */
function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === undefined || !name.startsWith("--") || value === undefined) {
      fail(`Expected --name value pairs. Received: ${argv.join(" ")}`);
    }
    parsed[name.slice(2)] = value;
  }
  return parsed;
}

function require(value, shape, flag, example) {
  if (value === undefined || !shape.test(value)) {
    fail(`${flag} is missing or malformed (expected ${example}). Received: ${String(value)}`);
  }
}

async function read(path) {
  return readFile(path, "utf8").catch((error) => {
    fail(`${path} could not be read: ${String(error)}`);
  });
}

/** Turns the shared reader's error into the same exit-code failure as the rest. */
function section(changelog, version) {
  try {
    return changelogSection(changelog, version);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
