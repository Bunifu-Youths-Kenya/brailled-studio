import {CATALOG} from '../src/commands/catalog.js';
import {makeProject, problems} from './helpers.js';

import nested from './fixtures/nested-loop-if-else.json';
import simple from './fixtures/simple-sequence.json';

// Run commands, undo them all, then redo them all, checking the program at each end.
const roundTrip = (project, commands) => {
    const before = project.program();
    const states = [before];
    for (const command of commands) {
        const result = project.editor.run(command);
        expect(result).toMatchObject({ok: true});
        expect(problems(project.program())).toEqual([]);
        states.push(project.program());
    }
    for (let i = states.length - 2; i >= 0; i--) {
        expect(project.editor.run({op: 'undo'})).toMatchObject({ok: true});
        expect(project.program()).toEqual(states[i]);
    }
    for (let i = 1; i < states.length; i++) {
        expect(project.editor.run({op: 'redo'})).toMatchObject({ok: true});
        expect(project.program()).toEqual(states[i]);
    }
    return states;
};

describe('apply, then undo, returns the same JSON', () => {
    test.each([
        ['insert at the end', {op: 'insert', block: 'motion_movesteps', after: 'after'}, 'simple'],
        ['insert at the top of a script', {op: 'insert', block: 'looks_show', before: 'hat'}, 'loose'],
        ['insert a new script', {op: 'insert', block: 'event_whenflagclicked'}, 'nested'],
        ['insert into an empty loop', {op: 'insert',
            block: 'looks_say',
            inside: {block: 'after'}}, 'nested'],
        ['insert at the start of a branch', {op: 'insert',
            block: 'looks_show',
            inside: {block: 'ifelse', branch: 'SUBSTACK2'}}, 'nested'],
        ['delete from the middle', {op: 'delete', block: 'repeat'}, 'nested'],
        ['delete the first block of a script', {op: 'delete', block: 'hat'}, 'nested'],
        ['delete a whole script', {op: 'delete', block: 'hat', withFollowing: true}, 'nested'],
        ['delete the only block in a branch', {op: 'delete', block: 'say'}, 'nested'],
        ['delete a condition', {op: 'delete', block: 'gt'}, 'nested'],
        ['change a value', {op: 'set-value', block: 'repeat', name: 'TIMES', value: 4}, 'nested'],
        ['cover a value with a block', {op: 'set-value',
            block: 'move',
            name: 'STEPS',
            value: {block: 'motion_xposition'}}, 'nested'],
        ['uncover a value', {op: 'set-value', block: 'gt', name: 'OPERAND1', value: 3}, 'nested'],
        ['empty a condition', {op: 'set-value', block: 'ifelse', name: 'CONDITION', value: null}, 'nested'],
        ['move a block out of a loop', {op: 'move', block: 'say', after: 'repeat'}, 'nested'],
        ['move a stack to a new script', {op: 'move',
            block: 'repeat',
            newScript: true,
            withFollowing: true}, 'nested'],
        ['wrap one block', {op: 'wrap', block: 'say', in: 'control_if'}, 'nested'],
        ['wrap a run of blocks', {op: 'wrap',
            block: 'repeat',
            through: 'after',
            in: 'control_if_else'}, 'nested']
    ])('%s', (title, command, name) => {
        const programs = {
            nested,
            simple: {blocks: {...simple.blocks,
                after: {...nested.blocks.move,
                    id: 'after',
                    parent: null,
                    inputs: {},
                    topLevel: true,
                    x: 40,
                    y: 300}},
            scripts: ['hat', 'after']},
            loose: {blocks: {hat: {...simple.blocks.move,
                id: 'hat',
                inputs: {},
                parent: null,
                next: null,
                topLevel: true,
                x: 40,
                y: 40}},
            scripts: ['hat']}
        };
        const project = makeProject({program: programs[name]});
        const states = roundTrip(project, [command]);
        expect(states[1]).not.toEqual(states[0]);
        expect(project.vm.emitWorkspaceUpdate).toHaveBeenCalledTimes(3);
    });

    test('every block the catalog can create', () => {
        for (const isStage of [false, true]) {
            const project = makeProject({isStage});
            let created = 0;
            for (const kind of ['instruction', 'value', 'boolean']) {
                for (const {opcode} of project.editor.listBlocks(kind)) {
                    if (CATALOG[opcode].shape === 'reporter' || CATALOG[opcode].shape === 'boolean') continue;
                    roundTrip(project, [{op: 'insert', block: opcode}]);
                    project.editor.run({op: 'undo'});
                    expect(project.program()).toEqual({blocks: {}, scripts: []});
                    created++;
                }
            }
            expect(created).toBeGreaterThan(isStage ? 40 : 70);
        }
    });

    test('a long run of mixed commands', () => {
        // A repeatable pseudo-random sequence.
        let seed = 7;
        const random = limit => {
            seed = (seed * 48271) % 2147483647;
            return seed % limit;
        };
        const project = makeProject({program: nested});
        const start = project.program();
        const kinds = ['control_wait', 'control_repeat', 'looks_say', 'control_if', 'motion_movesteps'];
        let done = 0;
        for (let i = 0; i < 400 && done < 90; i++) {
            const ids = Object.values(project.program().blocks).filter(b => !b.shadow)
                .map(b => b.id);
            const pick = () => ids[random(ids.length)];
            const command = [
                {op: 'insert', block: kinds[random(kinds.length)], after: pick()},
                {op: 'insert', block: kinds[random(kinds.length)], before: pick()},
                {op: 'delete', block: pick()},
                {op: 'move', block: pick(), after: pick()},
                {op: 'move', block: pick(), newScript: true, withFollowing: random(2) === 0},
                {op: 'wrap', block: pick(), in: 'control_repeat'}
            ][random(ids.length > 0 ? 6 : 1)];
            if (!project.editor.run(command).changed) continue;
            expect(problems(project.program())).toEqual([]);
            done++;
        }
        expect(done).toBe(90);
        for (let i = 0; i < done; i++) expect(project.editor.run({op: 'undo'}).ok).toBe(true);
        expect(project.program()).toEqual(start);
        expect(project.target.blocks.getScripts()).toEqual(start.scripts);
    });

    test('several commands run as one step', () => {
        const project = makeProject({program: simple});
        const before = project.program();
        expect(project.editor.run([
            {op: 'set-value', block: 'move', name: 'STEPS', value: 5},
            {op: 'set-value', block: 'wait', name: 'DURATION', value: 3}
        ]).ok).toBe(true);
        expect(project.editor.run({op: 'undo'}).ok).toBe(true);
        expect(project.program()).toEqual(before);
    });

    test('a comment goes and comes back with its block', () => {
        const program = structuredClone(simple);
        program.blocks.move.comment = 'note';
        const project = makeProject({program});
        const note = {id: 'note', blockId: 'move', text: 'go'};
        project.target.comments.note = note;
        project.editor.run({op: 'delete', block: 'move'});
        expect(project.target.comments).toEqual({});
        project.editor.run({op: 'undo'});
        expect(project.target.comments).toEqual({note});
    });

    test('a new message is created, and restored for undo and redo', () => {
        const project = makeProject();
        project.editor.run({op: 'insert', block: 'event_broadcast', args: {BROADCAST_INPUT: 'go'}});
        const messages = () => Object.values(project.stage.variables).filter(v => v.type === 'broadcast_msg');
        expect(messages().map(m => m.name)).toEqual(['go']);
        // As the editor does when it redraws and no block uses the message.
        project.editor.run({op: 'undo'});
        messages().forEach(m => delete project.stage.variables[m.id]);
        project.editor.run({op: 'redo'});
        expect(messages().map(m => m.name)).toEqual(['go']);
    });
});

describe('defaults', () => {
    test('coordinates start at where the sprite is', () => {
        const project = makeProject();
        Object.assign(project.target, {x: 99.6, y: -20});
        expect(project.editor.run({op: 'insert', block: 'motion_gotoxy'}).ok).toBe(true);
        const values = Object.values(project.program().blocks).filter(b => b.shadow)
            .map(b => b.fields.NUM.value);
        expect(values).toEqual(['100', '-20']);
    });
});

describe('history', () => {
    test('is kept for each sprite', () => {
        const project = makeProject({program: simple});
        project.editor.run({op: 'delete', block: 'move'});
        project.vm.editingTarget = project.other;
        expect(project.editor.run({op: 'undo'}).reason).toMatch(/nothing to undo/);
    });

    test('a new edit ends redo', () => {
        const project = makeProject({program: simple});
        project.editor.run({op: 'delete', block: 'move'});
        project.editor.run({op: 'undo'});
        project.editor.run({op: 'delete', block: 'wait'});
        expect(project.editor.run({op: 'redo'}).reason).toMatch(/nothing to redo/);
    });

    test('refuses to undo over a change made some other way', () => {
        const project = makeProject({program: simple});
        project.editor.run({op: 'set-value', block: 'move', name: 'STEPS', value: 5});
        project.target.blocks.changeBlock({id: 'ten', element: 'field', name: 'NUM', value: '99'});
        const result = project.editor.run({op: 'undo'});
        expect(result.reason).toMatch(/changed in another way/);
        expect(project.program().blocks.ten.fields.NUM.value).toBe('99');
    });

    test('undo leaves a script where it has since been dragged', () => {
        const project = makeProject({program: simple});
        project.editor.run({op: 'delete', block: 'move'});
        const hat = project.target.blocks.getBlock('hat');
        Object.assign(hat, {x: 500, y: 600});
        expect(project.editor.run({op: 'undo'}).ok).toBe(true);
        expect(project.target.blocks.getBlock('hat')).toMatchObject({x: 500, y: 600});
    });
});
