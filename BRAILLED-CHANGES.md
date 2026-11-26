# Brailled changes

A running list of every edit made to files that come from Scratch. Add an entry in the same commit as the edit.

Upstream base: `scratchfoundation/scratch-editor`, branch `develop`, commit `40faacc80`.

## Edits to Scratch files

| Date | File | What | Why |
| - | - | - | - |
| 2026-11-25 | `packages/scratch-gui/src/reducers/vm.ts` | Non-production builds assign the VM to `window.vm`. Adds a type declaration for `process`, which the package's TypeScript config lacks. | Inspect projects from the browser console. |
| 2026-11-25 | `packages/scratch-gui/webpack.config.js` | The dev server listens on `localhost` only. | Keep the development editor off the local network. |
| 2026-11-25 | `packages/scratch-gui/src/components/gui/gui.jsx` | Stage column moved ahead of the editor; stage controls placed below the stage; skip links, landmark ids, view toggle and palette wrapper added from `brailled-accessibility`. | mBlock-style layout with matching reading and focus order; screen reader zones. |
| 2026-11-25 | `packages/scratch-gui/src/components/gui/gui.jsx` | Renders the Outline view and keeps the chosen view when the interface is rebuilt. Renders `BrailledActions`: shortcuts, command box and live region. | Outline view and action registry. |
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
| 2026-11-25 | `packages/scratch-gui/src/components/target-pane/target-pane.jsx` | Passes the VM and the sprite library handler to the stage tabs. | The "open sprite library" action. |
| 2026-11-25 | `packages/scratch-gui/src/components/menu/menu.jsx` | Menus have role `menu`; selectable items have role `menuitem`. | Focusable menu items had no accessible name. |
| 2026-11-25 | `packages/scratch-gui/src/components/menu-bar/preference-menu.jsx` | The submenu item is named. | Missing accessible name. |
| 2026-11-25 | `packages/scratch-gui/src/components/sprite-selector-item/sprite-selector-item.jsx` | The right click menu is named. | Missing accessible name. |
| 2026-11-25 | `packages/scratch-gui/src/components/monitor/monitor.jsx` | The right click menu is named after its readout. | Missing accessible name. |
| 2026-11-25 | `packages/scratch-gui/src/components/prompt/prompt.jsx` | The name input is labelled. | Missing accessible name. |
| 2026-11-25 | `packages/scratch-gui/src/components/question/question.jsx` | The answer box and send button are named. | The button showed only an icon; neither had a name. |
| 2026-11-25 | `packages/scratch-gui/src/components/library/library.jsx` | The scrolling list is a named group. | Missing accessible name. |
| 2026-11-25 | `packages/scratch-paint/src/components/mode-tools/mode-tools.jsx` | Brush and eraser size inputs are labelled. | Missing accessible name. |
| 2026-11-25 | `packages/scratch-paint/src/components/stroke-width-indicator.jsx` | The outline width input is labelled. | Missing accessible name. |
| 2026-11-25 | `packages/scratch-gui/src/components/gui/gui.jsx` | Renders the voice bar below the editor, and gives the editor area a class so that it shares the height. | Voice input. |
| 2026-11-25 | `AGENTS.md` | Lists the `brailled-accessibility` and `brailled-ai-server` packages. | The guide asks for the layout to stay current. |
| 2026-11-26 | `packages/scratch-gui/src/components/target-pane/target-pane.jsx` | Passes the stage tabs the sprite library, a way to close it, and the library's random placing of a new sprite. | The AI helper's approved "add a sprite". |
| 2026-11-26 | `.gitignore` | Ignores every `.env*` file except `.env.example`. | `.env` files hold the AI server's API key. |
| 2026-11-26 | `packages/scratch-gui/static/favicon.ico` | The Scratch icon is replaced by Brailled's braille cell, made from `packages/logos/fav.png` on a white tile. | The product must not ship the Scratch logo. |
| 2026-11-26 | `packages/scratch-gui/webpack.config.js` | Page titles say "Brailled" instead of "Scratch". | The product must not ship the Scratch name. |
| 2026-11-26 | `packages/scratch-gui/src/lib/titled-hoc.jsx` | A new project is named "Brailled Project", under a message id of its own. | The product must not ship the Scratch name; Scratch's translations of the old id would bring it back. |
| 2026-11-26 | `packages/scratch-gui/test/integration/menu-bar.test.js`, `project-state.test.js` | Expect the new default project name. | Same. |
| 2026-11-26 | `packages/scratch-gui/src/lib/layout-constants.js`, `screen-utils.js`, `src/components/gui/gui.jsx` | In a window 740 pixels high or less, the large stage is drawn at 70%. | With the voice bar below the editor, the sprites were pushed off short screens. |

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
| 2026-11-25 | `packages/brailled-accessibility/test/diff.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/fixtures/empty-sprite.json` |
| 2026-11-25 | `packages/brailled-accessibility/test/fixtures/nested-loop-if-else.json` |
| 2026-11-25 | `packages/brailled-accessibility/test/fixtures/simple-sequence.json` |
| 2026-11-25 | `packages/brailled-accessibility/test/navigation.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/tree.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/apply.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/catalog.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/context.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/editor.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/error.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/messages.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/planner.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/program.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/readback.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/schema-check.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/schema.json` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/values.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/block-picker.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/colours.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/dialog.css` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/dialog.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/editing.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/use-editing.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/value-editor.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/test/colours.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/executor.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/helpers.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/readback.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/search.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/validator.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/SUPPORTED-BLOCKS.md` |
| 2026-11-25 | `packages/brailled-accessibility/src/commands/data.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/data-dialogs.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/outline/use-moving.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/data.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/keys.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/e2e/editor.e2e.cjs` |
| 2026-11-25 | `packages/brailled-accessibility/e2e/audit-names.cjs` |
| 2026-11-25 | `packages/brailled-accessibility/src/actions/actions-host.css` |
| 2026-11-25 | `packages/brailled-accessibility/src/actions/actions-host.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/src/actions/app.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/actions/dom.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/actions/messages.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/actions/parser.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/actions/registry.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/actions/shortcuts.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/actions/snapshot.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/views.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/actions.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/test/snapshot.test.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/actions/route.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/voice/controller.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/voice/messages.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/voice/provider.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/voice/tone.js` |
| 2026-11-25 | `packages/brailled-accessibility/src/voice/voice-bar.css` |
| 2026-11-25 | `packages/brailled-accessibility/src/voice/voice-bar.jsx` |
| 2026-11-25 | `packages/brailled-accessibility/test/voice.test.js` |
| 2026-11-25 | `packages/logos/Braille bot  Bio.svg` |
| 2026-11-26 | `packages/brailled-accessibility/src/actions/preference-messages.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/actions/preferences.jsx` |
| 2026-11-26 | `packages/brailled-accessibility/src/settings.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/speech/read-aloud.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/settings.test.js` |
| 2026-11-26 | `PRIVACY-NOTES.md` |
| 2026-11-26 | `packages/brailled-accessibility/src/config.js` |
| 2026-11-26 | `packages/scratch-gui/static/brailled-config.json` |
| 2026-11-26 | `packages/brailled-accessibility/src/ai/assistant.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/ai/messages.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/ai/reply.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/ai/request.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/ai.test.js` |
| 2026-11-26 | `packages/brailled-ai-server/.env.example` |
| 2026-11-26 | `packages/brailled-ai-server/README.md` |
| 2026-11-26 | `packages/brailled-ai-server/eslint.config.mjs` |
| 2026-11-26 | `packages/brailled-ai-server/package-lock.json` |
| 2026-11-26 | `packages/brailled-ai-server/package.json` |
| 2026-11-26 | `packages/brailled-ai-server/src/app.ts` |
| 2026-11-26 | `packages/brailled-ai-server/src/config.ts` |
| 2026-11-26 | `packages/brailled-ai-server/src/index.ts` |
| 2026-11-26 | `packages/brailled-ai-server/src/limits.ts` |
| 2026-11-26 | `packages/brailled-ai-server/src/openrouter.ts` |
| 2026-11-26 | `packages/brailled-ai-server/src/prompt.ts` |
| 2026-11-26 | `packages/brailled-ai-server/src/request.ts` |
| 2026-11-26 | `packages/brailled-ai-server/test/server.test.ts` |
| 2026-11-26 | `packages/brailled-ai-server/tsconfig.json` |
| 2026-11-26 | `packages/brailled-ai-server/src/listen.ts` |
| 2026-11-26 | `packages/brailled-accessibility/src/ai/refs.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/ai/replies.jsx` |
| 2026-11-26 | `packages/brailled-accessibility/src/library.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/ai-ports.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/answers.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/assistant-host.jsx` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/check.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/executor.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/fingerprint.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/gate.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/highlight.css` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/highlight.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/machine.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/messages.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/proposal-dialog.css` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/proposal-dialog.jsx` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/queue.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/risk.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/proposals/steps.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/assistant.test.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/boundary.test.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/examples.test.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/no-network.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/proposal-setup.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/proposals.test.js` |
| 2026-11-26 | `packages/brailled-ai-server/test/no-network.ts` |
| 2026-11-26 | `packages/brailled-ai-server/vitest.config.ts` |
| 2026-11-26 | `packages/brailled-accessibility/src/brand/brailled-logo.svg` |
| 2026-11-26 | `packages/logos/fav.png` |
| 2026-11-26 | `packages/brailled-accessibility/e2e/capture-eval-projects.cjs` |
| 2026-11-26 | `packages/brailled-accessibility/src/catalog/blocks.json` |
| 2026-11-26 | `packages/brailled-accessibility/src/catalog/concepts.json` |
| 2026-11-26 | `packages/brailled-accessibility/src/memory.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/agent-side.test.js` |
| 2026-11-26 | `packages/brailled-ai-server/.gitignore` |
| 2026-11-26 | `packages/brailled-ai-server/eval/cases.json` |
| 2026-11-26 | `packages/brailled-ai-server/eval/cases.ts` |
| 2026-11-26 | `packages/brailled-ai-server/eval/projects.json` |
| 2026-11-26 | `packages/brailled-ai-server/eval/run.ts` |
| 2026-11-26 | `packages/brailled-ai-server/eval/score.ts` |
| 2026-11-26 | `packages/brailled-ai-server/src/agent.ts` |
| 2026-11-26 | `packages/brailled-ai-server/src/knowledge.ts` |
| 2026-11-26 | `packages/brailled-ai-server/src/tools.ts` |
| 2026-11-26 | `packages/brailled-ai-server/test/agent.test.ts` |
| 2026-11-26 | `packages/brailled-ai-server/test/eval.test.ts` |
| 2026-11-26 | `packages/brailled-ai-server/test/model.ts` |
| 2026-11-26 | `packages/scratch-gui/test/unit/util/screen-utils.test.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/catalog/tools.json` |
| 2026-11-26 | `packages/brailled-accessibility/src/introduction-messages.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/introduction.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/names.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/introduction.test.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/wake/browser-engine.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/wake/control.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/wake/device-engine.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/wake/engine.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/wake/match.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/wake.test.js` |
| 2026-11-26 | `packages/brailled-accessibility/src/voice/speech-config.js` |
| 2026-11-26 | `packages/brailled-accessibility/test/speech-config.test.js` |
| 2026-11-25 | `LICENSE-NOTES.md` |
| 2026-11-25 | `BRAILLED-CHANGES.md` |
