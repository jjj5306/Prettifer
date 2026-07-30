#!/usr/bin/env node
/* global console, process, URL */
/**
 * Fails only on security advisories that are not in the allowlist, so the audit
 * output keeps meaning something. `npm audit` reports one entry per affected
 * package, which turns a single upstream advisory into dozens of lines; this
 * collapses them to distinct advisories first.
 *
 * A stale allowlist entry is also a failure. That is deliberate: it is how we
 * learn an advisory was fixed upstream and the entry can be dropped.
 */
import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const ALLOWLIST_PATH = new URL("../security/audit-allowlist.json", import.meta.url);

/** `npm audit` exits non-zero when it finds anything, so failure is expected. */
async function readAudit() {
  // A fixed command string, so `exec` needs no argument escaping. Windows
  // cannot spawn npm.cmd without a shell, and passing an argument array with a
  // shell is deprecated (DEP0190).
  const run = promisify(exec);
  try {
    const { stdout } = await run("npm audit --json", {
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (error) {
    if (typeof error.stdout === "string" && error.stdout.length > 0) {
      return JSON.parse(error.stdout);
    }
    throw new Error(`npm audit could not be read: ${error.message}`);
  }
}

/** Collapses per-package entries into distinct advisories. */
function distinctAdvisories(report) {
  const advisories = new Map();
  for (const entry of Object.values(report.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      if (typeof via !== "object") {
        continue;
      }
      const key = `${via.url ?? via.source ?? via.title}|${via.name}`;
      if (!advisories.has(key)) {
        advisories.set(key, {
          advisory: advisoryId(via.url),
          package: via.name,
          severity: via.severity,
          title: via.title,
          url: via.url,
        });
      }
    }
  }
  return [...advisories.values()];
}

function advisoryId(url) {
  return /GHSA-[\w-]+/u.exec(url ?? "")?.[0] ?? url ?? "unknown";
}

const report = await readAudit();
const allowed = JSON.parse(await readFile(ALLOWLIST_PATH, "utf8"));
const allowedKeys = new Map(
  allowed.map((item) => [`${item.advisory}|${item.package}`, item]),
);

const advisories = distinctAdvisories(report);
const unexpected = advisories.filter(
  (item) => !allowedKeys.has(`${item.advisory}|${item.package}`),
);
const matched = new Set(
  advisories
    .map((item) => `${item.advisory}|${item.package}`)
    .filter((key) => allowedKeys.has(key)),
);
const stale = [...allowedKeys.keys()].filter((key) => !matched.has(key));

console.log(
  `npm audit: ${String(advisories.length)} distinct advisor${advisories.length === 1 ? "y" : "ies"}`
  + ` across ${String(Object.keys(report.vulnerabilities ?? {}).length)} package entries`,
);
for (const item of advisories) {
  const state = allowedKeys.has(`${item.advisory}|${item.package}`) ? "known" : "UNEXPECTED";
  console.log(`  [${state}] ${item.severity} ${item.package} ${item.advisory}`);
  console.log(`      ${item.title}`);
}

for (const item of allowed) {
  if (item.reviewBy !== undefined && new Date(item.reviewBy) < new Date()) {
    console.log(`  note: ${item.advisory} passed its review date ${item.reviewBy}`);
  }
}

if (unexpected.length > 0) {
  console.error(
    `\n${String(unexpected.length)} advisory(ies) are not in security/audit-allowlist.json.`
    + "\nFix them, or add an entry with a reason if they cannot be fixed yet.",
  );
  process.exit(1);
}

if (stale.length > 0) {
  console.error(
    `\n${String(stale.length)} allowlist entry(ies) no longer match any advisory:`
    + `\n  ${stale.join("\n  ")}`
    + "\nThe advisory was resolved upstream. Remove the entry from"
    + " security/audit-allowlist.json.",
  );
  process.exit(1);
}

console.log("\nNo unexpected advisories.");
