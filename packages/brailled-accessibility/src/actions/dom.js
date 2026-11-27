// What the page says about itself: names and roles of controls, and which part of the editor holds them.

const ZONES = [
    ['dialog', 'dialog[open], .ReactModal__Content'],
    ['voice', '[data-brailled-zone="voice"]'],
    ['palette', '[data-brailled-zone="palette"]'],
    ['menu', 'header'],
    ['stage', 'aside'],
    ['scripts', 'main']
];

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

const tidy = text => (text || '').replace(/\s+/g, ' ').trim();

// The text of an element's content, as read aloud: pictures speak their `alt`, hidden parts nothing.
const contentText = node => {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1 || node.getAttribute('aria-hidden') === 'true') return '';
    if (node.tagName.toLowerCase() === 'img') return ` ${node.getAttribute('alt') || ''} `;
    return Array.from(node.childNodes).map(contentText)
        .join(' ');
};

// Roles whose name may come from their content.
const NAMED_BY_CONTENT = new Set(['button', 'link', 'tab', 'radio', 'checkbox', 'option', 'menuitem',
    'treeitem']);

const roleOf = element => {
    const explicit = element.getAttribute('role');
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (tag === 'input') {
        const type = element.getAttribute('type') || 'text';
        if (type === 'radio' || type === 'checkbox') return type;
        if (type === 'range') return 'slider';
        return ['button', 'submit', 'reset', 'file', 'image'].includes(type) ? 'button' : 'textbox';
    }
    return {
        a: element.hasAttribute('href') ? 'link' : null,
        button: 'button',
        select: 'combobox',
        textarea: 'textbox',
        header: 'banner',
        main: 'main',
        aside: 'complementary',
        nav: 'navigation'
    }[tag] || null;
};

/**
 * The accessible name of an element: a simplified form of the browser's own calculation, enough to say what
 * has focus.
 * @param {Element} element The element.
 * @returns {string} The name, or an empty string if it has none.
 */
const accessibleName = element => {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
        const text = tidy(labelledBy.split(/\s+/)
            .map(id => element.ownerDocument.getElementById(id)?.textContent || '')
            .join(' '));
        if (text) return text;
    }
    const label = tidy(element.getAttribute('aria-label'));
    if (label) return label;
    if (element.labels?.length) {
        const text = tidy(Array.from(element.labels, item => contentText(item)).join(' '));
        if (text) return text;
    }
    if (element.tagName.toLowerCase() === 'img') return tidy(element.getAttribute('alt'));
    if (NAMED_BY_CONTENT.has(roleOf(element))) {
        const text = tidy(contentText(element));
        if (text) return text;
    }
    return tidy(element.getAttribute('title') || element.getAttribute('placeholder') ||
        (roleOf(element) === 'button' ? element.getAttribute('value') : ''));
};

// The part of the editor that holds an element: `menu`, `stage`, `palette`, `scripts`, `dialog` or null.
const zoneOf = element => {
    if (!element) return null;
    const found = ZONES.find(([, selector]) => element.closest(selector));
    return found ? found[0] : null;
};

// Whether keys pressed on an element enter or choose its text, so that they are not to be taken for anything else.
const takesTyping = element => !!element &&
    (!!element.isContentEditable || ['textbox', 'combobox', 'searchbox'].includes(roleOf(element)));

// Whether a dialog is open, which keeps the keyboard and screen reader to itself.
const hasOpenDialog = document => !!document?.querySelector('.ReactModal__Overlay, dialog[open]');

const zoneElement = (document, zone) => document.querySelector(ZONES.find(([name]) => name === zone)[1]);

const isShown = element => {
    if (!element.getClientRects().length) return false;
    return element.ownerDocument.defaultView.getComputedStyle(element).visibility !== 'hidden';
};

// The controls inside an element that the keyboard can reach, in order.
const focusableWithin = (container, shown = isShown) => Array.from(container.querySelectorAll(FOCUSABLE))
    .filter(element => element.getAttribute('tabindex') !== '-1' && !element.disabled && shown(element));

export {
    accessibleName,
    focusableWithin,
    hasOpenDialog,
    roleOf,
    takesTyping,
    tidy,
    zoneElement,
    zoneOf
};
