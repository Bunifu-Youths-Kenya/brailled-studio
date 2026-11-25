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
| `editing.js`, `use-editing.js`, `use-moving.js` | What the editing and move keys do |
| `block-picker.jsx`, `value-editor.jsx`, `data-dialogs.jsx`, `dialog.jsx` | The block search, value, and variable dialogs |

| Key | Action |
| - | - |
| Up, Down, Home, End | Move around |
| Right / Left | Expand or enter / collapse or go to the parent |
| Space | Expand or collapse |
| Enter | Edit the block's values; on other items, expand or collapse |
| I / Shift+I | Add a block after / before the current item |
| Delete or Backspace | Delete the block, with what it holds; on a script, the whole script |
| M | Pick up the block to move it; on a script's heading, the whole script |
| M / Shift+M, while moving | Put it after / before the current item; on an empty place, inside it |
| N, while moving | Put it in a new script |
| Escape, or M on the picked block | Cancel the move |
| W / Shift+W | Put the block / the block and those under it inside a loop or condition. On a script's heading, everything under its first block |
| V / Shift+V | Create / rename a variable, list or message |
| D / Shift+D | Describe the program / the current script |
| Control+Z / Control+Y (or Control+Shift+Z) | Undo / redo |
| Alt+Shift+O | Switch between Blocks and Outline |

These keys work only while focus is in the Outline. Move, wrap and variable keys are plain letters, so they do
not collide with browser shortcuts; a screen reader should pass them on in focus mode. If it takes Escape for
itself, cancel a move with M on the picked block.

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
| `wrap` | `block`, `in` (a loop or condition); `through` for a run of blocks; `args` |
| `create` | `kind`: `variable`, `list` or `message`; `name`; `scope`: `all` (the default) or `sprite` |
| `rename` | `kind`; `name`; `to` |
| `undo`, `redo` | none |
| `describe` | `script` (any block id in it) to describe one script |

The format is defined by [`src/commands/schema.json`](src/commands/schema.json).
[`SUPPORTED-BLOCKS.md`](SUPPORTED-BLOCKS.md) lists the opcodes and value names.

- `run(command)` returns the result and passes it to `subscribe` listeners; the Outline announces `message`.
- `run([...])` applies several editing commands as one step, all or none.
- `validate(command)` checks without changing anything and gives the reason for a refusal.
- `listBlocks(kind)`, `valuesOf(blockId)` and `listData()` say what can be created and edited.
- `create`, `rename`, `undo`, `redo` and `describe` run on their own, not in a batch.
- Commands act on the selected sprite or stage. Each has its own undo history, separate from the workspace's
  Control+Z. Undo is refused if the blocks it would change have been altered some other way.
- Every change redraws the workspace, which clears the workspace's own undo history.

| File | Role |
| - | - |
| `schema.json`, `schema-check.js` | The command format and its check |
| `data.js` | Creating and renaming variables, lists and messages |
| `catalog.js` | Known blocks: shapes, values and defaults |
| `planner.js`, `values.js` | Applies a command to a copy of the program |
| `program.js` | Structure queries and rules |
| `apply.js` | Writes the change through the VM's block methods, and reverses it |
| `context.js` | Sprites, sounds, variables and messages of the project |
| `readback.js`, `messages.js` | Spoken results, refusals and program summaries |
| `editor.js` | The engine and undo history |

### Variables, lists and messages

- Names are compared ignoring case. A variable or list for all sprites cannot take a name that any sprite
  already uses for its own. Messages are always for all sprites.
- Scratch discards a message that no block uses whenever it redraws the workspace. The engine remembers new
  messages and offers them until the page is reloaded; they are saved with the project once a block uses one.
- Renaming updates every block that uses the name. Undo and redo of earlier edits use the new name.
- Undoing a `create` removes the item, and is refused while any block uses it. There is no delete command.
- Cloud variables cannot be created or renamed.

### Extension blocks

Blocks from extensions, such as micro:bit or a future ESP32 board, can be supported later **without changing the
command format**: a command already names a block by opcode and its values by name.

```js
{op: 'insert', block: 'microbit_displayText', after: blockId, args: {TEXT: 'Hi'}}
```

Today the engine knows only the shapes of loaded extension blocks, so it can move, wrap and delete them. To
create them and change their values:

1. **Describe them.** Build catalog entries from the loaded extension's metadata, which the VM holds in
   `vm.runtime._blockInfo` (from each extension's `getInfo()`), and look them up wherever `CATALOG` is used.
   - `blockType`: `command` is an instruction (`isTerminal` ends a script), `reporter` a value, `Boolean` a
     condition, `hat` and `event` start scripts, and `conditional` and `loop` hold `branchCount` stacks named
     `SUBSTACK`, `SUBSTACK2` and so on. The format accepts any of these branch names, and any such block in `in`.
   - Argument types: `number`, `string`, `angle`, `color` and `Boolean` match existing kinds of slot. `matrix`
     and `note` need two new value checks; both are still strings or numbers in a command.
   - A menu that accepts reporters is a slot holding a shadow block, `<extension>_menu_<menu>`, with a field
     named after the menu. Any other menu is a drop-down field named after the argument.
2. **Load the extension.** Commands for an extension that is not loaded are refused as unknown. A person can add
   it with the Extension button. Loading it from a command (`vm.extensionManager.loadExtensionURL`) is
   asynchronous, so a caller would load it first and then run the command.
3. **New hardware** such as ESP32 is not part of the VM. It needs a VM extension with `getInfo()` and block
   implementations; once loaded it is described like any other.

## Test and lint

From this directory, after `npm ci` at the repository root:

```sh
npm test
npm run lint
```

The browser tests drive the editor in Google Chrome. Start the dev server with `npm start` at the repository
root, then run `npm run test:e2e` here. Set `CHROME_PATH` if Chrome is not at `/usr/bin/google-chrome`.
