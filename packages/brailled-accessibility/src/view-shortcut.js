import {useEffect, useRef} from 'react';

const VIEW_SHORTCUT_LABEL = 'Alt+Shift+O';
// The physical key, because Alt changes the character typed on some keyboards.
const VIEW_SHORTCUT_CODE = 'KeyO';

const focusView = view => {
    const target = view === 'outline' ?
        document.querySelector('[data-brailled-outline] [tabindex="0"]') :
        document.querySelector('[data-brailled-workspace] .blocklySvg .blocklyWorkspace');
    target?.focus();
};

/**
 * Alt+Shift+O switches between the Blocks and Outline views and moves focus into the one it shows. From the
 * Costumes or Sounds tab it goes to the Code tab and shows the outline.
 * @param {object} options Options.
 * @param {boolean} options.enabled Whether the shortcut applies.
 * @param {string} options.view The selected view: `blocks` or `outline`.
 * @param {boolean} options.isBlocksTab Whether the Code tab, which holds the views, is selected.
 * @param {function(string)} options.onChangeView Selects a view.
 * @param {function()} options.onShowBlocksTab Selects the Code tab.
 */
const useViewShortcut = ({enabled, view, isBlocksTab, onChangeView, onShowBlocksTab}) => {
    const focusRequested = useRef(false);

    useEffect(() => {
        if (!enabled) return;
        const handleKeyDown = event => {
            if (event.code !== VIEW_SHORTCUT_CODE || !event.altKey || !event.shiftKey ||
                event.ctrlKey || event.metaKey || event.repeat) return;
            // Dialogs keep focus to themselves.
            if (document.querySelector('.ReactModal__Overlay')) return;
            event.preventDefault();
            event.stopPropagation();
            focusRequested.current = true;
            onChangeView(isBlocksTab && view === 'outline' ? 'blocks' : 'outline');
            if (!isBlocksTab) onShowBlocksTab();
        };
        document.addEventListener('keydown', handleKeyDown, true);
        return () => document.removeEventListener('keydown', handleKeyDown, true);
    }, [enabled, view, isBlocksTab, onChangeView, onShowBlocksTab]);

    useEffect(() => {
        if (!focusRequested.current || !isBlocksTab) return;
        // Wait until the view is visible: hidden elements cannot take focus.
        const frame = requestAnimationFrame(() => {
            focusRequested.current = false;
            focusView(view);
        });
        return () => cancelAnimationFrame(frame);
    }, [view, isBlocksTab]);
};

export {
    VIEW_SHORTCUT_LABEL,
    useViewShortcut
};
