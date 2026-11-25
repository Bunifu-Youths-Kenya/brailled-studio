# Brailled changes

A running list of every edit made to files that come from Scratch. Add an entry in the same commit as the edit.

Upstream base: `scratchfoundation/scratch-editor`, branch `develop`, commit `40faacc80`.

## Edits to Scratch files

| Date | File | What | Why |
| - | - | - | - |
| 2026-11-25 | `packages/scratch-gui/src/reducers/vm.ts` | Non-production builds assign the VM to `window.vm`. Adds a type declaration for `process`, which the package's TypeScript config lacks. | Inspect projects from the browser console. |
| 2026-11-25 | `packages/scratch-gui/webpack.config.js` | The dev server listens on `localhost` only. | Keep the development editor off the local network. |

## Files added by Brailled

These are new files, not edits to Scratch's own.

| Date | File |
| - | - |
| 2026-11-25 | `packages/brailled-accessibility/package.json` |
| 2026-11-25 | `packages/brailled-accessibility/README.md` |
| 2026-11-25 | `packages/logos/Braille bot  Bio.svg` |
| 2026-11-25 | `LICENSE-NOTES.md` |
| 2026-11-25 | `BRAILLED-CHANGES.md` |
