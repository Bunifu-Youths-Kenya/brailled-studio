import diffOutlines from '../src/outline/diff.js';
import buildOutline from '../src/outline/tree.js';

import nested from './fixtures/nested-loop-if-else.json';
import simple from './fixtures/simple-sequence.json';

const edit = (program, change) => {
    const copy = structuredClone(program);
    change(copy.blocks, copy);
    return buildOutline(copy);
};
const none = {added: null, removed: null, moved: null, changed: null};
const addWait = (blocks, id, parent, next) => {
    blocks[id] = {id,
        opcode: 'control_wait',
        inputs: {DURATION: {block: 'two', shadow: 'two'}},
        fields: {},
        parent,
        next,
        shadow: false};
};

describe('diffOutlines', () => {
    const before = buildOutline(simple);

    test('reports nothing for an unchanged program', () => {
        expect(diffOutlines(before, buildOutline(simple))).toEqual(none);
    });

    test('reports an added block only, even though later blocks shift', () => {
        const after = edit(simple, blocks => {
            addWait(blocks, 'new', 'hat', 'move');
            blocks.hat.next = 'new';
            blocks.move.parent = 'new';
        });
        expect(diffOutlines(before, after)).toEqual({...none, added: {count: 1, text: 'wait 2 seconds'}});
    });

    test('reports a block added above a script without calling the rest moved', () => {
        const after = edit(simple, (blocks, program) => {
            addWait(blocks, 'new', null, 'hat');
            blocks.hat.parent = 'new';
            program.scripts = ['new'];
        });
        expect(diffOutlines(before, after)).toEqual({...none, added: {count: 1, text: 'wait 2 seconds'}});
    });

    test('reports removed blocks, naming the outermost one', () => {
        const after = edit(nested, blocks => {
            blocks.hat.next = 'after';
            blocks.after.parent = 'hat';
            delete blocks.repeat;
        });
        expect(diffOutlines(buildOutline(nested), after))
            .toEqual({...none, removed: {count: 4, text: 'repeat 10'}});
    });

    test('reports a changed value', () => {
        const after = edit(simple, blocks => {
            blocks.ten.fields.NUM.value = '25';
        });
        expect(diffOutlines(before, after)).toEqual({...none, changed: {count: 1, text: 'move 25 steps'}});
    });

    test('reports a block that changes places', () => {
        const after = edit(simple, blocks => {
            Object.assign(blocks.hat, {next: 'wait'});
            Object.assign(blocks.wait, {parent: 'hat', next: 'move'});
            Object.assign(blocks.move, {parent: 'wait', next: null});
        });
        const changes = diffOutlines(before, after);
        expect(changes.moved.count).toBe(1);
        expect(changes).toEqual({...none, moved: changes.moved});
    });

    test('finds one moved block in a long program quickly', () => {
        const long = {blocks: {}, scripts: ['b0']};
        const count = 3000;
        for (let i = 0; i < count; i++) {
            long.blocks[`b${i}`] = {id: `b${i}`,
                opcode: 'control_wait',
                inputs: {},
                fields: {},
                shadow: false,
                parent: i ? `b${i - 1}` : null,
                next: i < count - 1 ? `b${i + 1}` : null};
        }
        const moved = structuredClone(long);
        const link = (from, to) => {
            moved.blocks[from].next = to;
            moved.blocks[to].parent = from;
        };
        link('b9', 'b11');
        link('b2000', 'b10');
        link('b10', 'b2001');
        const [before1, after] = [buildOutline(long), buildOutline(moved)];
        const started = performance.now();
        expect(diffOutlines(before1, after).moved.count).toBe(1);
        expect(performance.now() - started).toBeLessThan(500);
    });

    test('reports a block moved out of a loop', () => {
        const after = edit(nested, blocks => {
            delete blocks.ifelse.inputs.SUBSTACK2;
            Object.assign(blocks.after, {next: 'say'});
            blocks.say.parent = 'after';
        });
        expect(diffOutlines(buildOutline(nested), after).moved).toEqual({count: 1, text: 'say hi'});
    });

    test('reports a script split off from another without reordering', () => {
        const after = edit(simple, (blocks, program) => {
            blocks.move.next = null;
            blocks.wait.parent = null;
            program.scripts = ['hat', 'wait'];
        });
        expect(diffOutlines(before, after)).toEqual({...none, moved: {count: 1, text: 'wait 2 seconds'}});
    });
});
