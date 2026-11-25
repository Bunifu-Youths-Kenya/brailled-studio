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
| `src/outline/` | The read-only Outline view |

Voice editing and the AI layer will go here too. Neither exists yet.

## Outline view

A read-only tree of the selected sprite's program. It never changes the project.

| File | Role |
| - | - |
| `tree.js` | Builds the tree from VM block data |
| `sentence.js` | Turns one block, with its reporters, into a sentence |
| `block-definitions.js` | Reads translated label text from scratch-blocks |
| `fallback-labels.js` | English labels for opcodes scratch-blocks does not define |
| `navigation.js` | Keyboard movement, and keeping the user's place across changes |
| `diff.js` | Finds added, removed, moved and changed blocks to announce |
| `outline-view.jsx`, `outline-item.jsx` | The tree and its live region |

Keys: Up and Down move; Right expands or enters; Left collapses or goes to the parent; Home and End jump to the
ends; Enter or Space toggles. Alt+Shift+O switches views and moves focus into the one shown.

Known limits:

- Colours are read as hexadecimal codes.
- Comments, and variable and list values, are not shown.
- Changes are announced in both views while the Code tab is open, and not on the Costumes or Sounds tabs.

## How it is used

`scratch-gui` imports `src/index.js` by relative path and compiles it with its own webpack and Babel
configuration. The package has no build step and is not listed in the root `workspaces`; its peer dependencies
resolve from the root `node_modules`. Jest in `scratch-gui` compiles it using this package's `.babelrc`.

All user-visible strings go through `react-intl`, with ids starting `brailled.`. No translations exist yet.

## Test and lint

From this directory, after `npm ci` at the repository root:

```sh
npm test
npm run lint
```
