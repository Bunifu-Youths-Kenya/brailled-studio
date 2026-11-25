# Brailled changes

A running list of every edit made to files that come from Scratch. Add an entry in the same commit as the edit.

Upstream base: `scratchfoundation/scratch-editor`, branch `develop`, commit `40faacc80`.

## Edits to Scratch files

| Date | File | What | Why |
| - | - | - | - |
| 2026-11-25 | `packages/scratch-gui/src/reducers/vm.ts` | Non-production builds assign the VM to `window.vm`. Adds a type declaration for `process`, which the package's TypeScript config lacks. | Inspect projects from the browser console. |
| 2026-11-25 | `packages/scratch-gui/webpack.config.js` | The dev server listens on `localhost` only. | Keep the development editor off the local network. |
| 2026-11-25 | `packages/scratch-gui/src/components/gui/gui.jsx` | Stage column moved ahead of the editor; stage controls placed below the stage; skip links, landmark ids, view toggle and palette wrapper added from `brailled-accessibility`. | mBlock-style layout with matching reading and focus order; screen reader zones. |
| 2026-11-25 | `packages/scratch-gui/src/components/gui/gui.jsx` | Renders the Outline view, registers the Alt+Shift+O shortcut, and keeps the chosen view when the interface is rebuilt. | Read-only Outline view. |
| 2026-11-25 | `packages/scratch-gui/src/components/gui/gui.css` | Row for the editor tabs plus view toggle; end padding on the editor column. | Place the toggle top right and keep the last column off the window edge. |
| 2026-11-25 | `packages/scratch-gui/src/components/stage-wrapper/stage-wrapper.jsx` | New `controlsBelowStage` prop renders the stage controls after the stage, except in full screen. Both parts are keyed. | Controls under the stage without breaking the full screen focus trap or the player. |
| 2026-11-25 | `packages/scratch-gui/src/components/controls/controls.jsx` | Stop button comes before the green flag (everywhere, including the player). | Layout order: stop, green flag, stage size. |
| 2026-11-25 | `packages/scratch-gui/src/components/target-pane/target-pane.jsx` | Sprite list and stage selector placed in Devices / Sprites / Background tabs; sprite library rendered outside the tabs. | Left column tabbed panel. |
| 2026-11-25 | `packages/scratch-gui/src/components/target-pane/target-pane.css` | Removed the side margin on the stage selector. | It no longer sits beside the sprite list. |
| 2026-11-25 | `packages/scratch-gui/src/components/stage-selector/stage-selector.jsx`, `stage-selector.css` | The "Stage" heading is a button. | The stage could not be selected with the keyboard. |
| 2026-11-25 | `packages/scratch-gui/src/components/extension-button/extension-button.jsx`, `extension-button.css` | Visible "Extension" label. | Labelled button at the bottom of the palette. |
| 2026-11-25 | `packages/scratch-gui/src/components/menu-bar/menu-bar.jsx` | Logo replaced by the "Brailled" name; language picker moved to the bar; Save button added; Tutorials and Debug replaced by Help (placeholder) and Examples (opens the tutorial library); Settings moved after Edit, without language; unused logo imports and prop declarations removed. | Target menu bar, with no Scratch logo. |
| 2026-11-25 | `packages/scratch-gui/src/playground/render-gui.jsx` | No longer passes `showComingSoon` or `onClickLogo`. | Removes the Share, community and "scratch-cat" account placeholders and the link to scratch.mit.edu. |
| 2026-11-25 | `packages/scratch-gui/package.json` | Jest `babelrcRoots` includes `../brailled-accessibility`. | Tests that render the editor must compile the new package. |

## Files added by Brailled

These are new files, not edits to Scratch's own.

| Date | File |
| - | - |
| 2026-11-25 | `packages/brailled-accessibility/package.json` |
| 2026-11-25 | `packages/brailled-accessibility/README.md` |
| 2026-11-25 | `packages/brailled-accessibility/.babelrc` |
| 2026-11-25 | `packages/brailled-accessibility/eslint.config.mjs` |
| 2026-11-25 | `packages/brailled-accessibility/src/devices-panel.css` |
| 2026-11-25 | `packages/brailled-accessibility/src/devices-panel.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/index.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/menu-bar-items.css` |
| 2026-11-25 | `packages/brailled-accessibility/src/menu-bar-items.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/palette-area.css` |
| 2026-11-25 | `packages/brailled-accessibility/src/palette-area.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/scripts-views.css` |
| 2026-11-25 | `packages/brailled-accessibility/src/scripts-views.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/shell.css` |
| 2026-11-25 | `packages/brailled-accessibility/src/shell.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/stage-tabs.css` |
| 2026-11-25 | `packages/brailled-accessibility/src/stage-tabs.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/block-definitions.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/diff.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/fallback-labels.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/messages.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/navigation.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/outline-item.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/outline-view.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/outline.css` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/sentence.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/tree.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/words.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/use-kept-state.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/view-shortcut.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/diff.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/fixtures/empty-sprite.json` |
| 2026-11-25 | `packages/brailled-accessibility/test/fixtures/nested-loop-if-else.json` |
| 2026-11-25 | `packages/brailled-accessibility/test/fixtures/simple-sequence.json` |
| 2026-11-25 | `packages/brailled-accessibility/test/navigation.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/tree.test.js` |
| 2026-11-25 | `packages/logos/Braille bot  Bio.svg` |
| 2026-11-25 | `LICENSE-NOTES.md` |
| 2026-11-25 | `BRAILLED-CHANGES.md` |
