# Brailled changes

A running list of every edit made to files that come from Scratch. Add an entry in the same commit as the edit.

Upstream base: `scratchfoundation/scratch-editor`, branch `develop`, commit `40faacc80`.

## Edits to Scratch files

| Date | File | Change |
| - | - | - |
| 2026-11-25 | `packages/scratch-gui/src/reducers/vm.ts` | Non-production builds assign the VM to `window.vm` for console inspection. Adds a type declaration for `process`, which the package's TypeScript config lacks. |

## Files added by Brailled

These are new files, not edits to Scratch's own.

| Date | File |
| - | - |
| 2026-11-25 | `packages/brailled-accessibility/package.json` |
| 2026-11-25 | `packages/brailled-accessibility/README.md` |
| 2026-11-25 | `LICENSE-NOTES.md` |
| 2026-11-25 | `BRAILLED-CHANGES.md` |
