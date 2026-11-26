import {defineMessages} from 'react-intl';

// Why a command was rejected, by `CommandError` key.
const reasons = defineMessages(Object.fromEntries(Object.entries({
    notACommand: 'A command must be an object with an "op".',
    unknownOperation: 'There is no operation "{op}". Use one of: {options}.',
    missing: 'The command needs "{name}".',
    unexpected: 'The command has an unexpected property "{name}".',
    badValue: 'The command has the wrong kind of value for "{path}".',
    notOneOf: '"{path}" must be one of: {options}.',
    unknownOpcode: 'There is no block called "{opcode}".',
    unknownBlock: 'The block "{opcode}" cannot be edited yet.',
    cannotCreate: 'The block "{opcode}" cannot be created yet.',
    noSuchBlock: 'There is no block with the id "{id}" here.',
    notForStage: 'The stage cannot use "{opcode}".',
    onlyForStage: 'Only the stage can use "{opcode}".',
    noSuchValue: 'The block "{opcode}" has no value called "{name}". It has: {options}.',
    plainValueOnly: '{slot} takes a choice, not a block or nothing.',
    noChoices: 'There is nothing to choose for {slot}.',
    notAChoice: '"{value}" is not a choice for {slot}. Choose one of: {options}.',
    notANumber: '{slot} must be a number, not "{value}".',
    notPositive: '{slot} must be a number that is zero or more, not "{value}".',
    notWhole: '{slot} must be a whole number, not "{value}".',
    notAPosition: '{slot} must be a position in the list, not "{value}".',
    notAColour: '"{value}" is not a colour I know.',
    noVariable: 'There is no variable called "{name}".',
    noList: 'There is no list called "{name}".',
    emptyMessage: 'A message needs a name.',
    instructionAsValue: '"{opcode}" is an instruction, so it cannot go in a value slot.',
    needsConditionHere: '{slot} needs a condition, such as a comparison.',
    needsCondition: '"{block}" is not a condition, so it cannot go in that slot.',
    hatNotFirst: '"{block}" starts a script, so it cannot go under or inside another block.',
    nothingAfter: 'Nothing can come after "{block}" in the same stack.',
    valueNotInstruction: '"{block}" is a value, not an instruction. Put it in a value slot.',
    instructionNotValue: '"{block}" is an instruction, so it cannot go in a value slot.',
    notInStack: '"{block}" is not part of a stack of instructions.',
    holdsNothing: '"{block}" cannot hold other blocks.',
    noSuchBranch: '"{block}" has no such part.',
    onePosition: 'Give only one of after, before, inside or newScript.',
    needPosition: 'Say where to move the block: after, before, inside or newScript.',
    insideItself: 'A block cannot be moved inside or next to itself.',
    cannotMoveValue: 'Only instructions can be moved. Change values with set-value.',
    cannotDeleteSlot: 'A value slot cannot be deleted. Change its value instead.',
    procedureInUse: 'This custom block is still used. Delete the blocks that use it first.',
    notSameStack: 'The first and last block must be in the same stack, in that order.',
    noTarget: 'No sprite is selected.',
    nothingToUndo: 'There is nothing to undo.',
    nothingToRedo: 'There is nothing to redo.',
    changedSince: 'The program has since been changed in another way, so this cannot be safely reversed.',
    oneAtATime: 'Undo, redo, describe, create and rename must be run on their own.',
    notAContainer: '"{opcode}" is not a loop or condition, so nothing can go inside it.',
    emptyName: 'A {kind, select, list {list} message {message} other {variable}} needs a name.',
    nameTaken: 'There is already a {kind, select, list {list} message {message} other {variable}} ' +
        'called "{name}".',
    nameUsedBySprite: 'A sprite already has its own {kind, select, list {list} other {variable}} ' +
        'called "{name}".',
    stageScope: 'The stage\'\'s variables and lists are for all sprites.',
    messageScope: 'Messages are always for all sprites.',
    noItem: 'There is no {kind, select, list {list} message {message} other {variable}} called "{name}".',
    itemInUse: 'Blocks use "{name}", so it cannot be removed. Delete or change those blocks first.',
    cloudVariable: 'Cloud variables cannot be renamed here.'
}).map(([key, defaultMessage]) => [key, {
    id: `brailled.command.reason.${key}`,
    defaultMessage,
    description: 'Why an editing command was rejected'
}])));

// What a command did, said back to the user.
const readbacks = defineMessages(Object.fromEntries(Object.entries({
    notDone: 'Not done. {reason}',
    noChange: 'No change.',
    addedScript: 'Added a new script: {block}',
    added: 'Added: {block}, {place}',
    deleted: 'Deleted: {block}',
    deletedHolding: 'Deleted: {block}, and {count, plural, one {# block} other {# blocks}} inside it',
    deletedStack: 'Deleted {count, plural, one {# block} other {# blocks}}, starting with {block}',
    changed: 'Changed: {block}. Was: {previous}',
    moved: 'Moved: {block}, {place}',
    movedStack: 'Moved {block} and the blocks under it, {place}',
    movedScript: 'Moved: {block}, to a new script',
    wrapped: 'Put {block} inside {holder}',
    wrappedMany: 'Put {count} blocks, starting with {block}, inside {holder}',
    after: 'after {block}',
    before: 'before {block}',
    inside: 'inside {block}',
    withElse: '{block}, else',
    insideThen: 'in the then part of {block}',
    insideElse: 'in the else part of {block}',
    createdItem: 'Created {kind, select, list {list} other {variable}} {name}, ' +
        '{scope, select, sprite {for this sprite only} other {for all sprites}}',
    createdMessage: 'Created message {name}. It is saved with the project once a block uses it.',
    renamedItem: 'Renamed {kind, select, list {list} message {message} other {variable}} {from} to {to}',
    undone: 'Undone. {sentence}',
    redone: 'Redone. {sentence}',
    emptyProgram: '{name} has no blocks.',
    summaryScript: 'Script {number}: {summary}.',
    summaryHat: '{hat}: {rest}',
    summaryHolder: '{block}: {inner}',
    summaryElse: '{first}, else: {second}',
    summaryNothing: 'nothing',
    endRepeat: 'end repeat',
    endForever: 'end forever',
    endIf: 'end if',
    endOther: 'end'
}).map(([key, defaultMessage]) => [key, {
    id: `brailled.command.${key}`,
    defaultMessage,
    description: 'Spoken result of an editing command'
}])));

// What a command would do, said before it is done. Keys match those above.
const plans = defineMessages(Object.fromEntries(Object.entries({
    addedScript: 'Start a new script with {block}',
    added: 'Add {block}, {place}',
    deleted: 'Delete {block}',
    deletedHolding: 'Delete {block}, and {count, plural, one {# block} other {# blocks}} inside it',
    deletedStack: 'Delete {count, plural, one {# block} other {# blocks}}, starting with {block}',
    changed: 'Change {previous} to {block}',
    moved: 'Move {block}, {place}',
    movedStack: 'Move {block} and the blocks under it, {place}',
    movedScript: 'Move {block} to a new script',
    wrapped: 'Put {block} inside {holder}',
    wrappedMany: 'Put {count} blocks, starting with {block}, inside {holder}',
    createdItem: 'Create {kind, select, list {list} other {variable}} {name}, ' +
        '{scope, select, sprite {for this sprite only} other {for all sprites}}',
    createdMessage: 'Create message {name}',
    renamedItem: 'Rename {kind, select, list {list} message {message} other {variable}} {from} to {to}',
    undo: 'Undo the last change: {sentence}',
    redo: 'Redo: {sentence}',
    describe: 'Read the program'
}).map(([key, defaultMessage]) => [key, {
    id: `brailled.command.plan.${key}`,
    defaultMessage,
    description: 'A proposed change, not yet made'
}])));

export {
    plans,
    readbacks,
    reasons
};
