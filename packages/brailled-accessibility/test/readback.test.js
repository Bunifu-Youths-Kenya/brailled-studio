import {makeProject} from './helpers.js';

import nested from './fixtures/nested-loop-if-else.json';
import simple from './fixtures/simple-sequence.json';

const say = (program, command, options = {}) => makeProject({program, ...options}).editor.run(command).message;

describe('what a command says', () => {
    test.each([
        [{op: 'insert', block: 'motion_movesteps', after: 'wait'}, 'Added: move 10 steps, after wait 2 seconds'],
        [{op: 'insert', block: 'control_wait', before: 'move'}, 'Added: wait 1 second, before move 10 steps'],
        [{op: 'insert', block: 'event_whenflagclicked'}, 'Added a new script: when green flag clicked'],
        [{op: 'delete', block: 'wait'}, 'Deleted: wait 2 seconds'],
        [{op: 'delete', block: 'hat', withFollowing: true},
            'Deleted 3 blocks, starting with when green flag clicked'],
        [{op: 'set-value', block: 'move', name: 'STEPS', value: 20},
            'Changed: move 20 steps. Was: move 10 steps'],
        [{op: 'move', block: 'wait', before: 'move'}, 'Moved: wait 2 seconds, before move 10 steps'],
        [{op: 'move', block: 'wait', newScript: true}, 'Moved: wait 2 seconds, to a new script'],
        [{op: 'wrap', block: 'move', in: 'control_repeat'}, 'Put move 10 steps inside repeat 10'],
        [{op: 'wrap', block: 'move', through: 'wait', in: 'control_forever'},
            'Put 2 blocks, starting with move 10 steps, inside forever'],
        [{op: 'set-value', block: 'move', name: 'STEPS', value: 10}, 'No change.']
    ])('%j', (command, sentence) => {
        expect(say(simple, command)).toBe(sentence);
    });

    test.each([
        [{op: 'insert', block: 'motion_movesteps', inside: {block: 'after'}},
            'Added: move 10 steps, inside forever'],
        [{op: 'insert', block: 'control_wait', inside: {block: 'ifelse', branch: 'SUBSTACK2'}},
            'Added: wait 1 second, in the else part of if ((x position) > 50) then'],
        [{op: 'delete', block: 'repeat'}, 'Deleted: repeat 10, and 3 blocks inside it'],
        [{op: 'set-value', block: 'gt', name: 'OPERAND2', value: 60},
            'Changed: if ((x position) > 60) then. Was: if ((x position) > 50) then']
    ])('in nested stacks, %j', (command, sentence) => {
        expect(say(nested, command)).toBe(sentence);
    });

    test('tells an if with an else apart from a plain if', () => {
        const {editor} = makeProject({program: simple});
        expect(editor.run({op: 'insert', block: 'control_if_else', after: 'wait'}).message)
            .toBe('Added: if empty then, else, after wait 2 seconds');
        expect(editor.run({op: 'wrap', block: 'move', in: 'control_if'}).message)
            .toBe('Put move 10 steps inside if empty then');
        const names = editor.listBlocks('instruction').map(entry => entry.name);
        expect(new Set(names).size).toBe(names.length);
    });

    test('undo and redo repeat what is reversed or redone', () => {
        const {editor} = makeProject({program: simple});
        editor.run({op: 'insert', block: 'motion_movesteps', after: 'wait'});
        expect(editor.run({op: 'undo'}).message)
            .toBe('Undone. Added: move 10 steps, after wait 2 seconds');
        expect(editor.run({op: 'redo'}).message)
            .toBe('Redone. Added: move 10 steps, after wait 2 seconds');
    });

    test('every result reaches subscribers, including rejections', () => {
        const {editor} = makeProject({program: simple});
        const heard = [];
        const stop = editor.subscribe(result => heard.push(result.message));
        editor.run({op: 'delete', block: 'wait'});
        editor.run({op: 'delete', block: 'wait'});
        stop();
        editor.run({op: 'undo'});
        expect(heard).toEqual(['Deleted: wait 2 seconds', 'Not done. There is no block with the id "wait" here.']);
    });
});

describe('describing a program', () => {
    const describeAll = (program, command = {op: 'describe'}) => say(program, command);

    test('reads a script as one passage', () => {
        const {editor} = makeProject();
        editor.run({op: 'insert', block: 'event_whenflagclicked'});
        editor.run({op: 'insert', block: 'control_repeat', after: 'new1'});
        const loop = editor.run({op: 'describe'});
        expect(loop.message).toBe('When green flag clicked: repeat 10: nothing.');
        editor.run({op: 'insert', block: 'motion_movesteps', inside: {block: 'new2'}});
        editor.run({op: 'insert', block: 'control_wait', after: 'new4'});
        expect(editor.run({op: 'describe'}).message)
            .toBe('When green flag clicked: repeat 10: move 10 steps, wait 1 second.');
    });

    test('says where loops and conditions end when more follows', () => {
        expect(describeAll(nested)).toBe('When green flag clicked: repeat 10: ' +
            'if ((x position) > 50) then: move 10 steps, else: say hi, end repeat, forever: nothing.');
    });

    test('numbers several scripts from top to bottom', () => {
        const {editor} = makeProject({program: simple});
        editor.run({op: 'insert', block: 'event_whenthisspriteclicked'});
        expect(editor.run({op: 'describe'}).message).toBe(
            'Script 1: When green flag clicked: move 10 steps, wait 2 seconds. ' +
            'Script 2: When this sprite clicked.');
    });

    test('can describe only the script holding a block', () => {
        const {editor} = makeProject({program: simple});
        editor.run({op: 'insert', block: 'control_wait'});
        expect(editor.run({op: 'describe', script: 'wait'}).message)
            .toBe('When green flag clicked: move 10 steps, wait 2 seconds.');
    });

    test('says so when there is nothing', () => {
        expect(makeProject().editor.run({op: 'describe'}).message).toBe('Sprite1 has no blocks.');
    });
});
