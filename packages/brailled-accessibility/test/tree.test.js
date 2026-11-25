import buildOutline from '../src/outline/tree.js';

import emptySprite from './fixtures/empty-sprite.json';
import nested from './fixtures/nested-loop-if-else.json';
import simple from './fixtures/simple-sequence.json';

// The outline as indented lines, to compare structure and wording at a glance.
const lines = nodes => nodes.flatMap(node => [
    `${'  '.repeat(node.level - 1)}${node.text}`,
    ...(node.children ? lines(node.children) : [])
]);
const flatten = nodes => nodes.flatMap(node => [node, ...(node.children ? flatten(node.children) : [])]);

const field = (name, value) => ({[name]: {name, value}});
const block = (id, opcode, extra = {}) =>
    ({id, opcode, inputs: {}, fields: {}, next: null, parent: null, topLevel: false, shadow: false, ...extra});
const single = (...blocks) => ({
    blocks: Object.fromEntries(blocks.map(b => [b.id, b])),
    scripts: [blocks[0].id]
});

describe('buildOutline', () => {
    test('an empty sprite has an empty outline', () => {
        expect(buildOutline(emptySprite)).toEqual([]);
    });

    test('a simple sequence is one script listing its blocks in order', () => {
        const outline = buildOutline(simple);
        expect(lines(outline)).toEqual([
            'Script 1 of 1: when green flag clicked',
            '  when green flag clicked',
            '  move 10 steps',
            '  wait 2 seconds'
        ]);
        const [script] = outline;
        expect(script).toMatchObject({type: 'script', level: 1, setsize: 1, posinset: 1});
        expect(script.children.map(n => [n.id, n.level, n.posinset, n.setsize, n.children])).toEqual([
            ['hat', 2, 1, 3, null],
            ['move', 2, 2, 3, null],
            ['wait', 2, 3, 3, null]
        ]);
    });

    test('a loop containing if/else nests each stack under its block', () => {
        const outline = buildOutline(nested);
        expect(lines(outline)).toEqual([
            'Script 1 of 1: when green flag clicked',
            '  when green flag clicked',
            '  repeat 10',
            '    if ((x position) > 50) then',
            '      then',
            '        move 10 steps',
            '      else',
            '        say hi',
            '  forever',
            '    no blocks inside'
        ]);
        const byId = new Map(flatten(outline).map(n => [n.id, n]));
        expect(byId.get('repeat')).toMatchObject({level: 2, posinset: 2, setsize: 3});
        expect(byId.get('ifelse')).toMatchObject({level: 3, posinset: 1, setsize: 1});
        expect(byId.get('ifelse:SUBSTACK2')).toMatchObject({type: 'branch', level: 4, posinset: 2, setsize: 2});
        expect(byId.get('say')).toMatchObject({level: 5, posinset: 1, setsize: 1});
        // Reporters are part of their block's sentence, not nodes of their own.
        expect(byId.has('gt')).toBe(false);
    });

    test('an if with nothing inside is still expandable', () => {
        const [script] = buildOutline(single(block('if', 'control_if')));
        expect(script.children[0].text).toBe('if empty then');
        expect(script.children[0].children).toEqual([expect.objectContaining({type: 'empty'})]);
    });

    test('numbers each script and skips ids that are not blocks of the program', () => {
        const outline = buildOutline({
            blocks: {a: block('a', 'event_whenflagclicked'),
                b: block('b', 'motion_xposition'),
                s: block('s', 'text', {shadow: true})},
            scripts: ['a', 's', 'gone', 'b']
        });
        expect(outline.map(n => n.text)).toEqual([
            'Script 1 of 2: when green flag clicked',
            'Script 2 of 2: x position'
        ]);
    });

    test('words labels and menu choices come from the block definitions', () => {
        const definitions = {
            motion_goto: {lines: [{message: 'ir a %1', args: [{type: 'input_value', name: 'TO'}]}]},
            motion_goto_menu: {lines: [{message: '%1',
                args: [{type: 'field_dropdown',
                    name: 'TO',
                    options: () => [['posición aleatoria', '_random_']]}]}]},
            motion_turnright: {lines: [{message: 'girar %1 %2 grados',
                args: [
                    {type: 'field_image'}, {type: 'input_value', name: 'DEGREES'}]}]}
        };
        const outline = buildOutline({
            ...single(
                block('go', 'motion_goto', {next: 'turn', inputs: {TO: {block: 'menu', shadow: 'menu'}}}),
                block('menu', 'motion_goto_menu', {shadow: true, fields: field('TO', '_random_')}),
                block('turn', 'motion_turnright', {inputs: {DEGREES: {block: 'n', shadow: 'n'}}}),
                block('n', 'math_number', {shadow: true, fields: field('NUM', '15')})
            ),
            getDefinition: b => definitions[b.opcode] || null
        });
        expect(outline[0].children.map(n => n.text)).toEqual([
            'ir a posición aleatoria',
            'girar clockwise 15 grados'
        ]);
    });

    test('unknown opcodes fall back to a readable form of the opcode and its values', () => {
        const [script] = buildOutline(single(
            block('p', 'pen_setPenColorParam', {
                fields: field('PARAM', 'color'),
                inputs: {VALUE: {block: 'n', shadow: 'n'}}
            }),
            block('n', 'math_number', {shadow: true, fields: field('NUM', '5')})
        ));
        expect(script.children[0].text).toBe('pen: set pen color param, param color, value 5');
    });

    test('custom blocks are named with their arguments', () => {
        const definition = block('def', 'procedures_definition', {
            inputs: {custom_block: {block: 'proto', shadow: 'proto'}}, next: 'call'
        });
        const prototype = block('proto', 'procedures_prototype', {shadow: true,
            mutation: {
                proccode: 'jump %s times', argumentnames: '["count"]', argumentids: '["arg"]'
            }});
        const call = block('call', 'procedures_call', {
            mutation: {proccode: 'jump %s times', argumentids: '["arg"]'},
            inputs: {arg: {block: 'three', shadow: 'three'}}
        });
        const three = block('three', 'text', {shadow: true, fields: field('TEXT', '3')});
        const [script] = buildOutline({
            ...single(definition, prototype, call, three),
            getDefinition: b => (b.opcode === 'procedures_definition' ?
                {lines: [{message: 'define %1', args: [{type: 'input_value', name: 'custom_block'}]}]} :
                null)
        });
        expect(script.children.map(n => n.text)).toEqual(['define jump (count) times', 'jump 3 times']);
    });
});
