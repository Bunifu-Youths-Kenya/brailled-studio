// What actions act on: the VM, the editing engine, and the parts of the interface that register themselves.
import {createIntl} from 'react-intl';

import {getEditor} from '../commands/editor.js';
import {SCRIPTS_VIEWS} from '../views.js';
import {accessibleName, focusableWithin, roleOf, zoneElement, zoneOf} from './dom.js';
import {roleNames, speech} from './messages.js';
import {ACTIONS, findAction} from './registry.js';
import {matches} from './shortcuts.js';
import {buildSnapshot} from './snapshot.js';

const BLOCKS_TAB = 0;
// A closing dialog needs a moment before screen readers hear the live region again.
const ANNOUNCE_DELAY_MS = 150;
// How long a preface waits for a reply before being said on its own.
const PREFACE_WAIT_MS = 2500;

const ARRIVALS = {
    menu: speech.atMenu,
    stage: speech.atStage,
    devices: speech.atDevices,
    sprites: speech.atSprites,
    background: speech.atBackground,
    voice: speech.atVoice,
    palette: speech.atPalette,
    scripts: speech.atScripts
};

const FOCUS_INTERVAL_MS = 50;
const FOCUS_ATTEMPTS = 40;
// How many checks in a row focus must stay put before it counts as having arrived.
const FOCUS_SETTLED = 4;

// Focus an element once the interface can take it. After a change of view it stays hidden for a moment, and
// the block library may then take focus away again while it redraws. `done` gets the element, or null.
const focusWhenReady = (find, done = () => {}) => {
    let attempts = 0;
    let settled = 0;
    const attempt = () => {
        const element = find();
        const holds = !!element && element.contains(document.activeElement);
        settled = holds ? settled + 1 : 0;
        if (settled >= FOCUS_SETTLED) return done(element);
        if (++attempts >= FOCUS_ATTEMPTS) return done(holds ? element : null);
        if (!holds) element?.focus();
        setTimeout(attempt, FOCUS_INTERVAL_MS);
    };
    // Not before the interface has been redrawn.
    requestAnimationFrame(() => requestAnimationFrame(attempt));
};

const createApp = vm => {
    // Each part of the interface registers an object of its own under a name.
    const parts = new Map();
    const listeners = new Set();
    let intl = createIntl({locale: 'en', defaultLocale: 'en', onError: () => {}});
    let announceTimer = null;
    let preface = null;
    let prefaceTimer = null;

    const app = {
        vm,
        editor: getEditor(vm),
        intl: () => intl,
        setIntl: next => {
            intl = next;
        },
        say: (message, values) => intl.formatMessage(message, values),

        register: (name, part) => {
            parts.set(name, part);
            return () => {
                if (parts.get(name) === part) parts.delete(name);
            };
        },
        // `{tab, view, setView, setTab, openCommandBox}`
        gui: () => parts.get('gui') || null,
        outline: () => parts.get('outline') || null,
        // `{openLibrary}`
        sprites: () => parts.get('sprites') || null,
        // The voice controller, see `voice/controller.js`.
        voice: () => parts.get('voice') || null,
        // `{handle(text, {source})}`: takes what is not a local command.
        assistant: () => parts.get('assistant') || null,

        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        // Say something through the live region. A newer message replaces one not yet said.
        announce: text => {
            clearTimeout(announceTimer);
            announceTimer = setTimeout(() => {
                const full = preface ? `${preface} ${text}` : text;
                preface = null;
                clearTimeout(prefaceTimer);
                listeners.forEach(listener => listener(full));
            }, ANNOUNCE_DELAY_MS);
        },
        // Say this before the next announcement, or on its own if none follows.
        preface: text => {
            preface = text;
            clearTimeout(prefaceTimer);
            prefaceTimer = setTimeout(() => {
                preface = null;
                app.announce(text);
            }, PREFACE_WAIT_MS);
        },

        outlineIsShown: () => {
            const gui = app.gui();
            return !!gui && gui.tab === BLOCKS_TAB && gui.view === SCRIPTS_VIEWS.outline;
        },

        // Show the Blocks or Outline view and move focus into it.
        showView: view => {
            const gui = app.gui();
            gui.setView(view);
            gui.setTab(BLOCKS_TAB);
            focusWhenReady(() => document.querySelector(view === SCRIPTS_VIEWS.outline ?
                '[data-brailled-outline] [tabindex="0"]' :
                '[data-brailled-workspace] .blocklySvg .blocklyWorkspace'));
            app.announce(app.say(view === SCRIPTS_VIEWS.outline ? speech.atOutline : speech.atBlocks));
        },

        goTo: zone => {
            const gui = app.gui();
            const arrive = element => {
                if (element) app.announce(app.say(ARRIVALS[zone]));
                else app.announce(app.say(zone === 'palette' ? speech.paletteMissing : speech.notReady));
            };
            if (zone === 'palette') {
                // The palette belongs to the Blocks view.
                gui.setView(SCRIPTS_VIEWS.blocks);
                gui.setTab(BLOCKS_TAB);
                focusWhenReady(() => zoneElement(document, 'palette'), arrive);
            } else if (zone === 'scripts') {
                focusWhenReady(() => (app.outlineIsShown() &&
                    document.querySelector('[data-brailled-outline] [tabindex="0"]')) ||
                    zoneElement(document, 'scripts'), arrive);
            } else if (zone === 'menu') {
                focusWhenReady(() => {
                    const menu = zoneElement(document, 'menu');
                    return menu && focusableWithin(menu)[0];
                }, arrive);
            } else if (zone === 'stage') {
                focusWhenReady(() => zoneElement(document, 'stage'), arrive);
            } else if (zone === 'voice') {
                focusWhenReady(() => document.querySelector('[data-brailled-zone="voice"] button'), arrive);
            } else {
                const find = () => document.querySelector(`[data-brailled-stage-tab="${zone}"]`);
                find()?.click();
                focusWhenReady(find, arrive);
            }
        },

        // Move to the next or previous item: in the outline, or among the controls of the current zone.
        step: direction => {
            const end = app.say(direction > 0 ? speech.lastItem : speech.firstItem);
            if (app.outlineIsShown() && app.outline() && zoneOf(document.activeElement) !== 'menu' &&
                zoneOf(document.activeElement) !== 'stage') {
                const result = app.outline().step(direction);
                if (!result) return app.say(speech.noItems);
                return result.moved ? app.say(speech.itemInTree, result) : end;
            }
            const current = document.activeElement;
            const zone = zoneOf(current);
            const container = zone ? zoneElement(document, zone) : document.body;
            const controls = focusableWithin(container);
            if (controls.length === 0) return app.say(speech.noItems);
            // From somewhere that is not one of them, start at the near end.
            let index = controls.indexOf(current);
            if (index < 0) {
                const after = controls.findIndex(control =>
                    current.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING);
                if (direction > 0) index = (after < 0 ? controls.length : after) - 1;
                else index = after < 0 ? controls.length : after;
            }
            const next = controls[index + direction];
            if (!next) return end;
            next.focus();
            const role = roleNames[roleOf(next)] ? app.say(roleNames[roleOf(next)]) : '';
            return app.say(speech.control, {name: accessibleName(next), role});
        },

        // Why an action cannot be used now, as a sentence, or null if it can.
        unavailable: action => {
            const available = action.available(app);
            return available === true ? null : app.say(speech[available]);
        },

        /**
         * Carry out an action.
         * @param {string} id Which action.
         * @param {object} [options] Options.
         * @param {boolean} [options.fromKey] A key that cannot act is left alone, without comment.
         * @returns {boolean} Whether the request was dealt with.
         */
        perform: (id, {fromKey = false} = {}) => {
            const action = findAction(id);
            const reason = app.unavailable(action);
            if (reason) {
                if (fromKey) return false;
                app.announce(reason);
                return true;
            }
            const result = action.run(app);
            if (result === false) return false;
            if (typeof result === 'string') app.announce(result);
            return true;
        },

        // Act on a key press if it is a shortcut of this scope.
        handleKey: (event, scope) => {
            // Keys that are held down are handled where holding is noticed.
            const found = ACTIONS.filter(action => action.scope === scope &&
                action.shortcuts.some(shortcut => !shortcut.hold && matches(shortcut, event)));
            return found.some(action => app.perform(action.id, {fromKey: true}));
        },

        actionNames: () => ACTIONS.map(action => ({id: action.id, name: app.say(action.name)})),

        // The actions usable now; `here` marks those belonging to the current place.
        availableActions: () => {
            const inTree = app.outlineIsShown() && zoneOf(document.activeElement) === 'scripts';
            return ACTIONS.filter(action => !app.unavailable(action)).map(action => {
                const here = action.scope === 'outline' && inTree;
                // A shortcut of the outline does nothing from elsewhere.
                const usable = action.scope === 'global' || here;
                return {
                    id: action.id,
                    name: app.say(action.name),
                    shortcut: (usable && action.shortcuts[0]?.label) || null,
                    here
                };
            });
        },

        snapshot: () => buildSnapshot({app, document, intl, actions: app.availableActions()})
    };
    return app;
};

const apps = new WeakMap();

// The one app of a virtual machine.
const getApp = vm => {
    if (!apps.has(vm)) apps.set(vm, createApp(vm));
    return apps.get(vm);
};

export {
    createApp,
    getApp
};
