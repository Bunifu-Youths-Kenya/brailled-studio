# brailled-accessibility

Brailled's own interface code for the editor: accessibility features for blind students, plus the layout pieces
the editor needs around them.

| Source file | What it provides |
| - | - |
| `src/shell.jsx` | Skip links, zone ids and the focus indicator |
| `src/menu-bar-items.jsx` | Product name, language picker, Save, Help and Examples |
| `src/stage-tabs.jsx` | Devices, Sprites and Background tabs under the stage |
| `src/devices-panel.jsx` | Devices panel (interface only; nothing connects yet) |
| `src/scripts-views.jsx` | Blocks / Outline / Python toggle |
| `src/palette-area.jsx` | Search placeholder and the block category landmark |
| `src/view-shortcut.js` | Alt+Shift+O between Blocks and Outline |
| `src/use-kept-state.js` | State that survives the editor rebuilding on a language change |
| `src/outline/` | The Outline view and its editing keys and dialogs |
| `src/commands/` | The editing command format, validator and executor |

Voice editing and the AI layer will go here too. Neither exists yet.

## Outline view

A tree of the selected sprite's program, with scripts ordered as on screen: top to bottom, then left to right.
All changes go through the editing commands below.

| File | Role |
| - | - |
| `tree.js` | Builds the tree from VM block data |
| `sentence.js` | Turns one block, with its reporters, into a sentence |
| `block-definitions.js` | Reads translated label text from scratch-blocks |
| `fallback-labels.js` | English labels for opcodes scratch-blocks does not define |
| `navigation.js` | Keyboard movement, and keeping the user's place across changes |
| `diff.js` | Finds added, removed, moved and changed blocks to announce |
| `colours.js` | Colour names, so that no colour is read as a code |
| `outline-view.jsx`, `outline-item.jsx` | The tree and its live region |
| `editing.js`, `use-editing.js` | What the editing keys do |
| `block-picker.jsx`, `value-editor.jsx`, `dialog.jsx` | The block search and value dialogs |

| Key | Action |
| - | - |
| Up, Down, Home, End | Move |
| Right / Left | Expand or enter / collapse or go to the parent |
| Space | Expand or collapse |
| Enter | Edit the block's values; on other items, expand or collapse |
| I / Shift+I | Add a block after / before the current item |
| Delete or Backspace | Delete the block, with what it holds; on a script, the whole script |
| D / Shift+D | Describe the program / the current script |
| Control+Z / Control+Y (or Control+Shift+Z) | Undo / redo |
| Alt+Shift+O | Switch between Blocks and Outline |

Move and wrap have no keys yet; they are available as commands.

Known limits:

- Comments, and variable and list values, are not shown.
- Changes are announced in both views while the Code tab is open, and not on the Costumes or Sounds tabs.

## How it is used

`scratch-gui` imports `src/index.js` by relative path and compiles it with its own webpack and Babel
configuration. The package has no build step and is not listed in the root `workspaces`; its peer dependencies
resolve from the root `node_modules`. Jest in `scratch-gui` compiles it using this package's `.babelrc`.

All user-visible strings go through `react-intl`, with ids starting `brailled.`. No translations exist yet.

## Editing commands

`getEditor(vm)` returns the engine that the keyboard interface uses, and that voice and AI input should use.
In development builds it is also `window.brailled`.

```js
const editor = getEditor(vm);
editor.run({op: 'insert', block: 'motion_movesteps', after: blockId, args: {STEPS: 10}});
// {ok: true, changed: true, message: 'Added: move 10 steps, after wait 2 seconds', focusId: '...'}
```

| Operation | Properties |
| - | - |
| `insert` | `block`; one of `after`, `before`, `inside: {block, branch}`, or none for a new script; `args` |
| `delete` | `block`; `withFollowing` to delete the blocks under it too |
| `set-value` | `block`, `name`, `value`: text, a number, `{block, args}`, or `null` to empty the slot |
| `move` | `block`; one of `after`, `before`, `inside`, `newScript: true`; `withFollowing` |
| `wrap` | `block`, `in` (a loop or if); `through` for a run of blocks; `args` |
| `undo`, `redo` | none |
| `describe` | `script` (any block id in it) to describe one script |

The format is defined by [`src/commands/schema.json`](src/commands/schema.json).
[`SUPPORTED-BLOCKS.md`](SUPPORTED-BLOCKS.md) lists the opcodes and value names.

- `run(command)` returns the result and passes it to `subscribe` listeners; the Outline announces `message`.
- `run([...])` applies several editing commands as one step, all or none.
- `validate(command)` checks without changing anything and gives the reason for a refusal.
- `listBlocks(kind)` and `valuesOf(blockId)` say what can be created and edited.
- Commands act on the selected sprite or stage. Each has its own undo history, separate from the workspace's
  Control+Z. Undo is refused if the blocks it would change have been altered some other way.
- Every change redraws the workspace, which clears the workspace's own undo history.

| File | Role |
| - | - |
| `schema.json`, `schema-check.js` | The command format and its check |
| `catalog.js` | Known blocks: shapes, values and defaults |
| `planner.js`, `values.js` | Applies a command to a copy of the program |
| `program.js` | Structure queries and rules |
| `apply.js` | Writes the change through the VM's block methods, and reverses it |
| `context.js` | Sprites, sounds, variables and messages of the project |
| `readback.js`, `messages.js` | Spoken results, refusals and program summaries |
| `editor.js` | The engine and undo history |

## Test and lint

From this directory, after `npm ci` at the repository root:

```sh
npm test
npm run lint
```
