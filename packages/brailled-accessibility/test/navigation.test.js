import {keepPlace, navigate, reveal} from '../src/outline/navigation.js';
import buildOutline from '../src/outline/tree.js';

import nested from './fixtures/nested-loop-if-else.json';

const outline = buildOutline(nested);
const press = (key, currentId, collapsed = new Set()) => navigate(outline, {currentId, collapsed}, key);

describe('navigate', () => {
    test('Down and Up follow reading order and stop at the ends', () => {
        expect(press('ArrowDown', 'repeat').currentId).toBe('ifelse');
        expect(press('ArrowUp', 'repeat').currentId).toBe('hat');
        expect(press('ArrowUp', 'script:hat').currentId).toBe('script:hat');
    });

    test('Down skips the contents of a collapsed block', () => {
        expect(press('ArrowDown', 'repeat', new Set(['repeat'])).currentId).toBe('after');
    });

    test('Home and End jump to the first and last visible items', () => {
        expect(press('Home', 'say').currentId).toBe('script:hat');
        expect(press('End', 'hat').currentId).toBe('after:SUBSTACK:empty');
        expect(press('End', 'hat', new Set(['after'])).currentId).toBe('after');
    });

    test('Right expands a collapsed block, then enters it', () => {
        const expanded = press('ArrowRight', 'repeat', new Set(['repeat']));
        expect(expanded).toEqual({currentId: 'repeat', collapsed: new Set()});
        expect(press('ArrowRight', 'repeat').currentId).toBe('ifelse');
        expect(press('ArrowRight', 'hat').currentId).toBe('hat');
    });

    test('Left collapses an expanded block, then goes to the parent', () => {
        expect(press('ArrowLeft', 'repeat').collapsed).toEqual(new Set(['repeat']));
        expect(press('ArrowLeft', 'repeat', new Set(['repeat'])).currentId).toBe('script:hat');
        expect(press('ArrowLeft', 'move').currentId).toBe('ifelse:SUBSTACK');
    });

    test('leaves other keys alone', () => {
        expect(press('Tab', 'repeat')).toBeNull();
    });
});

describe('keeping the place after a change', () => {
    const without = id => {
        const copy = structuredClone(nested);
        const gone = copy.blocks[id];
        const parent = copy.blocks[gone.parent];
        if (parent.next === id) parent.next = gone.next;
        if (gone.next) copy.blocks[gone.next].parent = parent.id;
        delete copy.blocks[id];
        return buildOutline(copy);
    };

    test('stays on a block that still exists', () => {
        expect(keepPlace(outline, without('say'), 'move')).toBe('move');
    });

    test('goes to the following block when the current one is removed', () => {
        expect(keepPlace(outline, without('repeat'), 'repeat')).toBe('after');
    });

    test('goes to a neighbour or parent when there is no following block', () => {
        expect(keepPlace(outline, without('after'), 'after')).toBe('repeat');
    });

    test('follows a script whose first block changes', () => {
        const copy = structuredClone(nested);
        copy.blocks.hat.parent = 'new';
        copy.blocks.new = {...structuredClone(copy.blocks.after), id: 'new', parent: null, next: 'hat'};
        copy.scripts = ['new'];
        expect(keepPlace(outline, buildOutline(copy), 'script:hat')).toBe('script:new');
    });

    test('expands whatever hides the current block', () => {
        expect(reveal(outline, new Set(['repeat', 'after']), 'say')).toEqual(new Set(['after']));
    });
});
