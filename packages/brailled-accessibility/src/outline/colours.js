/*
 * Colour names, so that colours can be read and chosen without hexadecimal codes. A colour is named by its
 * hue, lightness and saturation.
 */

// The colour used when someone chooses a name. Each one is named back as itself.
const NAMED_COLOURS = {
    'black': '#000000',
    'dark grey': '#404040',
    'grey': '#808080',
    'light grey': '#c0c0c0',
    'white': '#ffffff',
    'dark red': '#8b0000',
    'red': '#ff0000',
    'light red': '#ff8080',
    'brown': '#8b4513',
    'orange': '#ff8c00',
    'light orange': '#ffc680',
    'dark yellow': '#999900',
    'yellow': '#ffff00',
    'light yellow': '#ffff99',
    'dark green': '#006400',
    'green': '#00c000',
    'light green': '#90ee90',
    'dark turquoise': '#006666',
    'turquoise': '#00cccc',
    'light turquoise': '#99ffff',
    'dark blue': '#00008b',
    'blue': '#0000ff',
    'light blue': '#99ccff',
    'dark purple': '#4b0082',
    'purple': '#8000ff',
    'light purple': '#cc99ff',
    'pink': '#ff1493',
    'light pink': '#ffb3d9'
};

const HEX = /^#[0-9a-f]{6}$/i;

// Upper hue limit, in degrees, of each hue name.
const HUES = [
    [14, 'red'],
    [44, 'orange'],
    [70, 'yellow'],
    [160, 'green'],
    [195, 'turquoise'],
    [255, 'blue'],
    [290, 'purple'],
    [345, 'pink'],
    [360, 'red']
];

const toHsl = hex => {
    const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const range = max - min;
    if (range === 0) return {hue: 0, saturation: 0, lightness};
    let sixth;
    if (max === r) sixth = (((g - b) / range) + 6) % 6;
    else if (max === g) sixth = ((b - r) / range) + 2;
    else sixth = ((r - g) / range) + 4;
    return {hue: sixth * 60, saturation: range / (1 - Math.abs((2 * lightness) - 1)), lightness};
};

/**
 * Name a colour.
 * @param {string} hex A colour such as `#ff0000`.
 * @returns {string} An English name from `NAMED_COLOURS`.
 */
const nameColour = hex => {
    const {hue, saturation, lightness} = toHsl(hex);
    if (lightness <= 0.1) return 'black';
    if (lightness >= 0.94) return 'white';
    const shade = (lightness < 0.35 && 'dark ') || (lightness > 0.7 && 'light ') || '';
    if (saturation < 0.12) return `${shade}grey`;
    const name = HUES.find(([limit]) => hue < limit || limit === 360)[1];
    // Dark oranges look brown, and dark pinks look purple.
    if (name === 'orange' && lightness < 0.4) return 'brown';
    if (name === 'pink' && shade === 'dark ') return 'dark purple';
    return `${shade}${name}`;
};

/**
 * Read a colour that someone chose or said.
 * @param {string} text A colour name, or a code such as `#ff0000`.
 * @returns {?string} The colour as a lower case code, or null if it is not a colour.
 */
const parseColour = text => {
    const value = String(text).trim()
        .toLowerCase()
        .replace(/\bgray\b/, 'grey')
        .replace(/\s+/g, ' ');
    if (HEX.test(value)) return value;
    return Object.prototype.hasOwnProperty.call(NAMED_COLOURS, value) ? NAMED_COLOURS[value] : null;
};

export {
    NAMED_COLOURS,
    nameColour,
    parseColour
};
