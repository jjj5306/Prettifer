# Prettifer
Config-driven Git diff views for humans and AI agents.

## Initial UX Mockup

The following mockup captures the initial product direction: select commits
from a Git graph, inspect the files changed by a commit, group the combined
changes, and review the final result in a side-by-side diff.

This is a concept mockup. Visual details may change as the specification is
refined.

![Prettifer initial UX mockup](docs/assets/prettifer-initial-ux-mockup.png)

## Core

The core composes non-contiguous commits from one linear branch history into
the final selected file state and a unified diff. Calculations run in an
isolated temporary Git worktree so the current branch, index, working files,
and untracked files remain unchanged.

The current core scope supports text-file additions, modifications, and
deletions. Merge-parent selection, binary content, rename detection, and
partial results for conflicting files are tracked as later capabilities.

## Development

Requirements:

- Node.js `20.19+`, `22.13+`, or `24+`
- Git `2.30+`

Install and verify the project:

```shell
npm install
npm test
npm run typecheck
npm run lint
npm run build
```
