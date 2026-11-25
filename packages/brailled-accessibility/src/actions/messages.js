import {defineMessages} from 'react-intl';

const fromTexts = (prefix, description, texts) => defineMessages(Object.fromEntries(
    Object.entries(texts).map(([key, defaultMessage]) =>
        [key, {id: `${prefix}.${key}`, defaultMessage, description}])
));

// Each action's spoken name and what it does, by action id with dots as underscores.
const ACTION_TEXTS = {
    help_whereAmI: ['where am I', 'Says where you are in the editor.'],
    help_whatCanIDo: ['what can I do here', 'Lists the actions you can use here.'],
    help_commandBox: ['type a command', 'Opens a box for typing a command.'],
    go_menu: ['go to menu', 'Moves to the menu bar.'],
    go_stage: ['go to stage', 'Moves to the stage area.'],
    go_devices: ['go to devices', 'Shows the Devices tab.'],
    go_sprites: ['go to sprites', 'Shows the Sprites tab.'],
    go_background: ['go to background', 'Shows the Background tab.'],
    go_palette: ['go to block palette', 'Moves to the block categories.'],
    go_scripts: ['go to scripts', 'Moves to the scripts area.'],
    view_blocks: ['show blocks', 'Shows the scripts as blocks.'],
    view_outline: ['show outline', 'Shows the scripts as an outline.'],
    view_python: ['show Python', 'Shows the scripts as Python code.'],
    view_toggle: ['switch view', 'Switches between Blocks and Outline.'],
    move_next: ['next', 'Moves to the next item here.'],
    move_previous: ['previous', 'Moves to the previous item here.'],
    program_describe: ['read program', 'Reads all the scripts of this sprite.'],
    program_describeScript: ['read script', 'Reads the current script.'],
    edit_insert: ['add block', 'Adds a block after the current one.'],
    edit_insertBefore: ['add block before', 'Adds a block before the current one.'],
    edit_delete: ['delete block', 'Deletes the current block.'],
    edit_values: ['edit values', 'Changes the values of the current block.'],
    edit_move: ['move block', 'Picks up the current block, or puts it after the current one.'],
    edit_moveBefore: ['put block before', 'Puts the picked up block before the current one.'],
    edit_moveNewScript: ['move to new script', 'Puts the picked up block in a new script.'],
    edit_cancelMove: ['cancel move', 'Leaves the picked up block where it was.'],
    edit_wrap: ['wrap block', 'Puts the current block inside a loop or condition.'],
    edit_wrapFollowing: ['wrap following blocks', 'Puts this block and those under it inside a loop or condition.'],
    edit_createData: ['new variable', 'Makes a variable, list or message.'],
    edit_renameData: ['rename variable', 'Renames a variable, list or message.'],
    edit_undo: ['undo', 'Reverses the last edit.'],
    edit_redo: ['redo', 'Makes the reversed edit again.'],
    project_run: ['run', 'Starts the project, as the green flag does.'],
    project_stop: ['stop', 'Stops the project.'],
    sprite_library: ['open sprite library', 'Opens the library of sprites to add one.']
};

const names = fromTexts('brailled.action.name', 'Spoken name of an action',
    Object.fromEntries(Object.entries(ACTION_TEXTS).map(([key, [name]]) => [key, name])));
const descriptions = fromTexts('brailled.action.description', 'What an action does',
    Object.fromEntries(Object.entries(ACTION_TEXTS).map(([key, [, description]]) => [key, description])));

// What is said in answer to an action, and why one cannot be used.
const speech = fromTexts('brailled.speech', 'Spoken answer in the editor', {
    needsOutline: 'Switch to the Outline view first. Say "show outline", or press Alt+Shift+O.',
    needsMoving: 'No block is picked up. Say "move block" first.',
    pythonSoon: 'The Python view is coming soon.',
    needsSprite: 'No sprite is selected.',
    notReady: 'That part of the editor is not available right now.',
    paletteMissing: 'The block palette is not available.',
    atMenu: 'Menu bar.',
    atStage: 'Stage area.',
    atDevices: 'Devices tab.',
    atSprites: 'Sprites tab.',
    atBackground: 'Background tab.',
    atPalette: 'Block categories.',
    atScripts: 'Scripts area.',
    atBlocks: 'Blocks view.',
    atOutline: 'Outline view.',
    started: 'Project started.',
    stopped: 'Project stopped.',
    libraryOpened: 'Sprite library opened.',
    firstItem: 'This is the first item.',
    lastItem: 'This is the last item.',
    noItems: 'There is nothing to move through here.',
    itemInTree: '{item}. Level {level}, {position} of {count}.',
    control: '{name}, {role}.',
    youAreIn: 'You are in the {zone}.',
    youAreInOn: 'You are in the {zone}, on {control}.',
    youAreOn: 'You are on {control}.',
    noFocus: 'Nothing has keyboard focus.',
    selected: '{isStage, select, true {The stage is selected.} other {Sprite {name} is selected.}}',
    codeTab: '{view, select, outline {Outline view.} other {Blocks view.}}',
    otherTab: '{tab, select, costumes {Costumes tab.} other {Sounds tab.}}',
    outlinePlace: 'In the outline: {item}, level {level}, {position} of {count}, in script {script} of {scripts}.',
    moving: 'Moving {item}.',
    device: '{mode, select, upload {Upload} other {Live}} mode. No device connected.',
    running: '{running, select, true {The project is running.} other {The project is stopped.}}',
    canDoHere: 'Here you can: {list}.',
    canDoAnywhere: 'Anywhere you can: {list}.',
    withShortcut: '{name} ({shortcut})',
    commandTitle: 'Type a command',
    commandLabel: 'Command',
    commandHint: 'For example: where am I, what can I do here, read program, next, undo, go to stage, stop.',
    commandRun: 'Run',
    commandUnknown: 'I do not understand "{text}". Try "what can I do here".',
    commandEmpty: 'Type a command first.',
    blockValueBox: 'Block value'
});

const zoneNames = fromTexts('brailled.zone', 'Name of a part of the editor', {
    menu: 'menu bar',
    stage: 'stage area',
    palette: 'block palette',
    scripts: 'scripts area',
    dialog: 'dialog'
});

const roleNames = fromTexts('brailled.role', 'Kind of control', {
    button: 'button',
    link: 'link',
    textbox: 'text field',
    combobox: 'drop-down',
    radio: 'radio button',
    checkbox: 'checkbox',
    slider: 'slider',
    tab: 'tab',
    treeitem: 'tree item',
    option: 'option',
    menuitem: 'menu item',
    navigation: 'navigation',
    main: 'main area',
    complementary: 'side area',
    group: 'group'
});

export {
    descriptions,
    names,
    roleNames,
    speech,
    zoneNames
};
