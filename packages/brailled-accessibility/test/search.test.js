import {deleteCommand, insertCommand, insertPosition, searchBlocks} from '../src/outline/editing.js';
import buildOutline from '../src/outline/tree.js';

import nested from './fixtures/nested-loop-if-else.json';

describe('searching blocks by spoken name', () => {
    const entries = [
        {name: 'move 10 steps', category: 'Motion'},
        {name: 'say Hello! for 2 seconds', category: 'Looks'},
        {name: 'wait 1 second', category: 'Control'},
        {name: 'wait until empty', category: 'Control'}
    ];
    const found = query => searchBlocks(entries, query).map(entry => entry.name);

    test('matches every typed word, in any order', () => {
        expect(found('steps move')).toEqual(['move 10 steps']);
        expect(found('MOVE')).toEqual(['move 10 steps']);
    });
    test('finds singular names from plural words', () => {
        expect(found('wait seconds')).toEqual(['wait 1 second']);
    });
    test('puts names that start with the query first', () => {
        expect(found('second')).toEqual(['say Hello! for 2 seconds', 'wait 1 second']);
        expect(found('wait')).toEqual(['wait 1 second', 'wait until empty']);
    });
    test('matches categories, and everything when empty', () => {
        expect(found('motion')).toEqual(['move 10 steps']);
        expect(found('')).toHaveLength(4);
        expect(found('jump')).toEqual([]);
    });
});

describe('what the editing keys act on', () => {
    const [script] = buildOutline(nested);
    const [, repeat, forever] = script.children;
    const [ifElse] = repeat.children;
    const [, otherwise] = ifElse.children;

    test('adds after or before the current block', () => {
        expect(insertPosition(repeat, false)).toEqual({after: 'repeat'});
        expect(insertPosition(repeat, true)).toEqual({before: 'repeat'});
    });
    test('adds at either end of a script', () => {
        expect(insertPosition(script, false)).toEqual({after: 'after'});
        expect(insertPosition(script, true)).toEqual({before: 'hat'});
    });
    test('adds inside a branch or an empty loop', () => {
        expect(insertPosition(otherwise, false)).toEqual({inside: {block: 'ifelse', branch: 'SUBSTACK2'}});
        expect(insertPosition(forever.children[0], false))
            .toEqual({inside: {block: 'after', branch: 'SUBSTACK'}});
    });
    test('starts a new script for a hat or an empty program', () => {
        expect(insertPosition(null, false)).toEqual({});
        expect(insertCommand('event_whenflagclicked', {after: 'repeat'}))
            .toEqual({op: 'insert', block: 'event_whenflagclicked'});
    });
    test('deletes a block, or a whole script, but not a branch', () => {
        expect(deleteCommand(repeat)).toEqual({op: 'delete', block: 'repeat'});
        expect(deleteCommand(script)).toEqual({op: 'delete', block: 'hat', withFollowing: true});
        expect(deleteCommand(otherwise)).toBeNull();
    });
});
