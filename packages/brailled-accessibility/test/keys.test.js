import {moveCommand, pickUp, wrapRange} from '../src/outline/editing.js';
import {findPath} from '../src/outline/navigation.js';
import buildOutline from '../src/outline/tree.js';

import nested from './fixtures/nested-loop-if-else.json';

const outline = buildOutline(nested);
const path = id => findPath(outline, id);
const node = id => path(id).at(-1);

describe('the move key', () => {
    test('picks up a block, or a whole script from its heading', () => {
        expect(pickUp(node('repeat'))).toEqual({nodeId: 'repeat', block: 'repeat', withFollowing: false});
        expect(pickUp(node('script:hat'))).toEqual({nodeId: 'script:hat', block: 'hat', withFollowing: true});
        expect(pickUp(node('ifelse:SUBSTACK'))).toBeNull();
        expect(pickUp(null)).toBeNull();
    });

    const picked = pickUp(node('say'));

    test('puts it after or before the destination', () => {
        expect(moveCommand(picked, node('repeat'), {})).toEqual({op: 'move', block: 'say', after: 'repeat'});
        expect(moveCommand(picked, node('repeat'), {before: true}))
            .toEqual({op: 'move', block: 'say', before: 'repeat'});
    });

    test('puts it inside an empty loop, or in a new script', () => {
        expect(moveCommand(picked, node('after:SUBSTACK:empty'), {}))
            .toEqual({op: 'move', block: 'say', inside: {block: 'after', branch: 'SUBSTACK'}});
        expect(moveCommand(picked, node('repeat'), {newScript: true}))
            .toEqual({op: 'move', block: 'say', newScript: true});
    });

    test('moves what follows with a script', () => {
        expect(moveCommand(pickUp(node('script:hat')), null, {newScript: true}))
            .toEqual({op: 'move', block: 'hat', withFollowing: true, newScript: true});
    });
});

describe('the wrap key', () => {
    test('takes the current block, or it and those under it', () => {
        expect(wrapRange(path('repeat'), false)).toEqual({block: 'repeat'});
        expect(wrapRange(path('repeat'), true)).toEqual({block: 'repeat', through: 'after'});
        expect(wrapRange(path('after'), true)).toEqual({block: 'after'});
        expect(wrapRange(path('move'), true)).toEqual({block: 'move'});
    });

    test('takes everything under the starting block of a script', () => {
        expect(wrapRange(path('script:hat'), false)).toEqual({block: 'repeat', through: 'after'});
    });

    test('has nothing to take on a branch or an empty place', () => {
        expect(wrapRange(path('ifelse:SUBSTACK'), false)).toBeNull();
        expect(wrapRange(path('after:SUBSTACK:empty'), true)).toBeNull();
        expect(wrapRange(null, false)).toBeNull();
    });
});
