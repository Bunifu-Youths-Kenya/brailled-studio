import schema from '../src/commands/schema.json';
import {makeProject, problems} from './helpers.js';

import nested from './fixtures/nested-loop-if-else.json';
import simple from './fixtures/simple-sequence.json';

describe('commands that are accepted', () => {
    test.each([
        ['insert after a block', {op: 'insert', block: 'motion_movesteps', after: 'move', args: {STEPS: 10}}],
        ['insert before a block', {op: 'insert', block: 'looks_show', before: 'move'}],
        ['insert a new script', {op: 'insert', block: 'event_whenkeypressed', args: {KEY_OPTION: 'a'}}],
        ['insert a reporter in a slot', {op: 'insert',
            block: 'control_wait',
            after: 'wait',
            args: {DURATION: {block: 'operator_random', args: {FROM: 1, TO: 3}}}}],
        ['delete', {op: 'delete', block: 'move'}],
        ['set a number', {op: 'set-value', block: 'move', name: 'STEPS', value: -2.5}],
        ['move', {op: 'move', block: 'wait', before: 'move'}],
        ['move to a new script', {op: 'move', block: 'wait', newScript: true}],
        ['wrap', {op: 'wrap', block: 'move', through: 'wait', in: 'control_repeat', args: {TIMES: 3}}],
        ['wrap in if', {op: 'wrap',
            block: 'move',
            in: 'control_if',
            args: {CONDITION: {block: 'sensing_mousedown'}}}],
        ['describe', {op: 'describe'}]
    ])('%s', (title, command) => {
        const project = makeProject({program: simple});
        const before = project.program();
        expect(project.editor.validate(command)).toEqual({ok: true});
        // Checking a command changes nothing.
        expect(project.program()).toEqual(before);
        expect(project.vm.emitWorkspaceUpdate).not.toHaveBeenCalled();
        expect(project.editor.run(command).ok).toBe(true);
        expect(problems(project.program())).toEqual([]);
    });
});

describe('commands that are rejected', () => {
    const rejected = (command, options = {program: simple}) => {
        const project = makeProject(options);
        const before = project.program();
        const result = project.editor.run(command);
        expect(result.ok).toBe(false);
        expect(project.editor.validate(command)).toEqual({ok: false, reason: result.reason});
        expect(result.message).toBe(`Not done. ${result.reason}`);
        expect(project.program()).toEqual(before);
        expect(project.vm.emitWorkspaceUpdate).not.toHaveBeenCalled();
        return result.reason;
    };

    test.each([
        ['not an object', 'delete move', /must be an object/],
        ['an unknown operation', {op: 'explode'}, /no operation "explode"/],
        ['a missing property', {op: 'insert'}, /needs "block"/],
        ['an extra property', {op: 'delete', block: 'move', force: true}, /unexpected property "force"/],
        ['a wrong type', {op: 'delete', block: 7}, /wrong kind of value for "block"/],
        ['a value that is a list', {op: 'set-value', block: 'move', name: 'STEPS', value: [1]},
            /wrong kind of value for "value"/],
        ['an extra property in a nested block', {op: 'insert',
            block: 'control_wait',
            args: {DURATION: {block: 'sensing_timer', id: 'x'}}}, /wrong kind of value/],
        ['a wrapper that holds nothing', {op: 'wrap', block: 'move', in: 'looks_say'},
            /"say Hello!" is not a loop or condition|"say .*" is not a loop or condition/],
        ['an unknown wrapper', {op: 'wrap', block: 'move', in: 'control_unless'},
            /no block called "control_unless"/],
        ['a badly named branch', {op: 'insert',
            block: 'looks_show',
            inside: {block: 'move', branch: 'ELSE'}}, /wrong kind of value for "inside.branch"/],
        ['a data command without a kind', {op: 'create', name: 'x'}, /needs "kind"/],
        ['a kind that does not exist', {op: 'create', kind: 'table', name: 'x'},
            /"kind" must be one of: variable, list, message/],
        ['an unknown opcode', {op: 'insert', block: 'motion_teleport', after: 'move'},
            /no block called "motion_teleport"/],
        ['an unknown nested opcode', {op: 'set-value',
            block: 'move',
            name: 'STEPS',
            value: {block: 'nope'}}, /no block called "nope"/],
        ['an unknown block id', {op: 'delete', block: 'ghost'}, /no block with the id "ghost"/],
        ['an unknown position', {op: 'insert', block: 'looks_show', after: 'ghost'}, /no block with the id/],
        ['a hat in the middle of a stack', {op: 'insert', block: 'event_whenflagclicked', after: 'move'},
            /"when green flag clicked" starts a script/],
        ['a block above a hat', {op: 'insert', block: 'looks_show', before: 'hat'}, /starts a script/],
        ['a block after one that ends the script', {op: 'insert', block: 'control_forever', before: 'move'},
            /Nothing can come after "forever"/],
        ['a value in a stack', {op: 'insert', block: 'motion_xposition', after: 'move'},
            /is a value, not an instruction/],
        ['an instruction in a value slot', {op: 'set-value',
            block: 'move',
            name: 'STEPS',
            value: {block: 'looks_show'}}, /cannot go in a value slot/],
        ['text where a number belongs', {op: 'set-value', block: 'move', name: 'STEPS', value: 'ten'},
            /steps must be a number, not "ten"/],
        ['a negative wait', {op: 'set-value', block: 'wait', name: 'DURATION', value: -1}, /zero or more/],
        ['a value the block does not have', {op: 'set-value', block: 'move', name: 'SPEED', value: 1},
            /no value called "SPEED". It has: STEPS/],
        ['a choice that is not offered', {op: 'insert',
            block: 'motion_setrotationstyle',
            after: 'move',
            args: {STYLE: 'sideways'}}, /"sideways" is not a choice for style/],
        ['an unknown variable', {op: 'insert',
            block: 'data_setvariableto',
            after: 'move',
            args: {VARIABLE: 'lives'}}, /no variable called "lives"/],
        ['an unknown colour', {op: 'insert',
            block: 'control_wait_until',
            after: 'move',
            args: {CONDITION: {block: 'sensing_touchingcolor', args: {COLOR: 'sparkly'}}}},
        /"sparkly" is not a colour/],
        ['two positions', {op: 'insert', block: 'looks_show', after: 'move', before: 'wait'},
            /only one of after, before/],
        ['a move with nowhere to go', {op: 'move', block: 'move'}, /Say where to move/],
        ['a move next to itself', {op: 'move', block: 'move', after: 'move'}, /inside or next to itself/],
        ['moving a hat under a block', {op: 'move', block: 'hat', after: 'move'}, /starts a script/],
        ['moving a typed value', {op: 'move', block: 'ten', newScript: true}, /Only instructions/],
        ['deleting a typed value', {op: 'delete', block: 'ten'}, /value slot cannot be deleted/],
        ['wrapping a hat', {op: 'wrap', block: 'hat', in: 'control_repeat'}, /starts a script/],
        ['wrapping a backwards range', {op: 'wrap', block: 'wait', through: 'move', in: 'control_repeat'},
            /same stack, in that order/],
        ['inside a block that holds none', {op: 'insert', block: 'looks_show', inside: {block: 'move'}},
            /cannot hold other blocks/],
        ['a stage-only block on a sprite', {op: 'insert', block: 'event_whenstageclicked'}, /Only the stage/],
        ['a block that cannot be created', {op: 'insert', block: 'procedures_call', after: 'move'},
            /cannot be created yet/],
        ['undo with nothing done', {op: 'undo'}, /nothing to undo/],
        ['redo with nothing undone', {op: 'redo'}, /nothing to redo/]
    ])('%s', (title, command, reason) => {
        const project = makeProject({program: simple});
        const result = project.editor.run(command);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(reason);
        expect(project.program()).toEqual(makeProject({program: simple}).program());
    });

    test('validate and run agree, and neither changes the program', () => {
        rejected({op: 'insert', block: 'event_whenflagclicked', after: 'move'});
    });

    test('a motion block on the stage', () => {
        expect(rejected({op: 'insert', block: 'motion_movesteps'}, {isStage: true}))
            .toBe('The stage cannot use "move 10 steps".');
    });

    test('a reporter that is not a condition in a condition slot', () => {
        expect(rejected(
            {op: 'set-value', block: 'ifelse', name: 'CONDITION', value: {block: 'sensing_timer'}},
            {program: nested}
        )).toMatch(/needs a condition/);
    });

    test('a loop moved inside its own contents', () => {
        expect(rejected({op: 'move', block: 'repeat', inside: {block: 'ifelse'}}, {program: nested}))
            .toMatch(/inside or next to itself/);
    });

    test('deleting a custom block that is still used', () => {
        const mutation = {proccode: 'jump', argumentids: '[]'};
        const base = {inputs: {}, fields: {}, next: null, parent: null, topLevel: true, shadow: false};
        const program = {
            blocks: {
                def: {...base,
                    id: 'def',
                    opcode: 'procedures_definition',
                    inputs: {custom_block: {name: 'custom_block', block: 'proto', shadow: 'proto'}}},
                proto: {...base,
                    id: 'proto',
                    opcode: 'procedures_prototype',
                    parent: 'def',
                    topLevel: false,
                    shadow: true,
                    mutation: {...mutation, argumentnames: '[]'}},
                call: {...base, id: 'call', opcode: 'procedures_call', mutation}
            },
            scripts: ['def', 'call']
        };
        expect(rejected({op: 'delete', block: 'def'}, {program})).toMatch(/still used/);
        const project = makeProject({program});
        expect(project.editor.run({op: 'delete', block: 'call'}).ok).toBe(true);
        expect(project.editor.run({op: 'delete', block: 'def'}).ok).toBe(true);
    });

    test('a batch is all or nothing', () => {
        rejected([
            {op: 'delete', block: 'move'},
            {op: 'delete', block: 'ghost'}
        ]);
    });

    test('the schema lists every operation', () => {
        expect(schema.oneOf.map(option => option.$ref.split('/').pop()))
            .toEqual(
                ['insert', 'delete', 'set-value', 'move', 'wrap', 'create', 'rename', 'undo', 'redo', 'describe']);
    });
});

describe('blocks that are not recognised', () => {
    const block = (id, opcode, parent, next) =>
        ({id, opcode, inputs: {}, fields: {}, parent, next, shadow: false, topLevel: !parent, x: 0, y: 0});
    // A known block, then an unknown one, then two known ones; the unknown block ends no stack.
    const program = {
        blocks: {
            first: block('first', 'looks_show', null, 'odd'),
            odd: block('odd', 'mystery_thing', 'first', 'middle'),
            middle: block('middle', 'looks_hide', 'odd', 'last'),
            last: block('last', 'looks_show', 'middle', null),
            end: block('end', 'mystery_end', null, null)
        },
        scripts: ['first', 'end']
    };

    test.each([
        ['delete the block itself', {op: 'delete', block: 'odd'}],
        ['delete the block above it', {op: 'delete', block: 'first'}],
        ['delete the block under it', {op: 'delete', block: 'middle'}],
        ['add above it', {op: 'insert', block: 'looks_show', before: 'odd'}],
        ['add where it already has a block under it', {op: 'insert', block: 'looks_show', after: 'odd'}]
    ])('allows: %s', (title, command) => {
        const project = makeProject({program});
        expect(project.editor.run(command)).toMatchObject({ok: true});
        expect(problems(project.program())).toEqual([]);
        project.editor.run({op: 'undo'});
        expect(project.program()).toEqual(makeProject({program}).program());
    });

    test.each([
        ['move it', {op: 'move', block: 'odd', after: 'last'}],
        ['wrap it', {op: 'wrap', block: 'first', through: 'middle', in: 'control_repeat'}],
        // It might be a block that ends a script.
        ['add under it when nothing is there', {op: 'insert', block: 'looks_show', after: 'end'}]
    ])('refuses to: %s', (title, command) => {
        const result = makeProject({program}).editor.run(command);
        expect(result.reason).toMatch(/cannot be edited yet/);
    });
});
