// Brailled's colours, read from the stylesheet, are strong enough for low-vision students in every colour mode.
/* global __dirname */
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.resolve(__dirname, '../src/theme.css'), 'utf8');

// The colours set by one rule of the stylesheet.
const colours = selector => {
    const start = css.indexOf(`${selector} {`);
    const body = css.slice(start, css.indexOf('}', start));
    return Object.fromEntries(Array.from(body.matchAll(/--brailled-([a-z-]+):\s*(#[0-9a-f]{3,6})\s*;/g),
        ([, name, value]) => [name, value]));
};
const base = colours(':global(:root)');
const MODES = {
    'default': base,
    'dark': {...base, ...colours(':global(:root[data-brailled-color-mode="dark"])')},
    'high-contrast': {...base, ...colours(':global(:root[data-brailled-color-mode="high-contrast"])')}
};

const channels = hex => {
    const full = hex.length === 4 ? hex.replace(/[0-9a-f]/g, digit => digit + digit) : hex;
    return [1, 3, 5].map(at => parseInt(full.slice(at, at + 2), 16) / 255);
};
const luminance = hex => {
    const [r, g, b] = channels(hex).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
};
const contrast = (a, b) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
};

// Text on what it sits on: WCAG AAA.
const TEXT = [['text', 'canvas'], ['text-soft', 'canvas'], ['danger-text', 'canvas'], ['on-brand', 'brand'],
    ['accent', 'brand'], ['on-accent', 'accent'], ['on-selected', 'selected'], ['on-danger', 'danger'],
    ['on-menu', 'menu']];
// Borders and focus rings: at least 3:1 against what is around them.
const LINES = [['line', 'canvas'], ['focus-inner', 'canvas'], ['focus-inner', 'focus-outer'], ['accent', 'brand'],
    ['menu-line', 'menu'], ['menu-focus', 'menu']];

// The logo's lettering, drawn straight on the menu bar: at least 3:1, as for any graphic.
const LOGO = '#0088cf';

test.each(Object.entries(MODES))('the logo can be seen on the menu bar in the %s colour mode', (mode, set) => {
    expect(contrast(LOGO, set.menu)).toBeGreaterThanOrEqual(3);
});

describe.each(Object.entries(MODES))('in the %s colour mode', (mode, set) => {
    test('every colour is given', () => {
        expect(Object.keys(set).sort()).toEqual(Object.keys(base).sort());
    });

    test.each(TEXT)('%s on %s is at least 7:1', (fore, back) => {
        expect(contrast(set[fore], set[back])).toBeGreaterThanOrEqual(7);
    });

    test.each(LINES)('%s against %s is at least 3:1', (fore, back) => {
        expect(contrast(set[fore], set[back])).toBeGreaterThanOrEqual(3);
    });
});
