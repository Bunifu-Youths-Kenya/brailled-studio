import {nameColour, NAMED_COLOURS, parseColour} from '../src/outline/colours.js';

describe('colour names', () => {
    test.each(Object.entries(NAMED_COLOURS))('%s is named back as itself', (name, hex) => {
        expect(nameColour(hex)).toBe(name);
        expect(parseColour(name)).toBe(hex);
    });

    test('names any colour without codes', () => {
        for (let value = 0; value < 0xffffff; value += 4099) {
            const hex = `#${value.toString(16).padStart(6, '0')}`;
            expect(Object.keys(NAMED_COLOURS).concat('dark brown', 'light brown', 'dark orange', 'light pink'))
                .toContain(nameColour(hex));
        }
    });

    test('reads names and codes, and nothing else', () => {
        expect(parseColour(' Light  Gray ')).toBe(NAMED_COLOURS['light grey']);
        expect(parseColour('#ABCDEF')).toBe('#abcdef');
        expect(parseColour('sparkly')).toBeNull();
    });
});
