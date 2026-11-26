// Outlines the blocks that were just changed, on the canvas and in the Outline, for those who look at them.
const MARK = 'data-brailled-changed';
const HIGHLIGHT_MS = 15000;
const REDRAW_MS = 300;

const PLACES = [
    ['[data-brailled-workspace] .blocklyBlockCanvas g[data-id]', 'id'],
    ['[data-brailled-outline] [data-node-id]', 'nodeId']
];

const createHighlighter = document => {
    let repeat = null;
    let finish = null;

    const clear = () => {
        clearInterval(repeat);
        clearTimeout(finish);
        document.querySelectorAll(`[${MARK}]`).forEach(element => element.removeAttribute(MARK));
    };

    return {
        clear,
        show: ids => {
            clear();
            const wanted = new Set(ids);
            const mark = () => PLACES.forEach(([selector, key]) => document.querySelectorAll(selector)
                .forEach(element => element.toggleAttribute(MARK, wanted.has(element.dataset[key]))));
            mark();
            // The workspace and outline are drawn again after a change.
            repeat = setInterval(mark, REDRAW_MS);
            finish = setTimeout(clear, HIGHLIGHT_MS);
        }
    };
};

export {
    HIGHLIGHT_MS,
    createHighlighter
};
