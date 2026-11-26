// What actions act on: the VM, the editing engine, and the parts of the interface that register themselves.
import {createIntl} from 'react-intl';

import {getEditor} from '../commands/editor.js';
import {createConfig, fetchConfig} from '../config.js';
import {createIntroduction, introductionText} from '../introduction.js';
import {createLibrary} from '../library.js';
import {createMemory} from '../memory.js';
import {DEFAULT_ASSISTANT_NAME} from '../names.js';
import {createSettings, storageOf} from '../settings.js';
import {createReader} from '../speech/read-aloud.js';
import {SCRIPTS_VIEWS} from '../views.js';
import {createOnlineVoice} from '../voice/online.js';
import {SWAHILI} from '../proposals/answers.js';
import {accessibleName, focusableWithin, roleOf, zoneElement, zoneOf} from './dom.js';
import {roleNames, speech} from './messages.js';
import {ACTIONS, findAction} from './registry.js';
import {matches, TALK_KEYS} from './shortcuts.js';
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

// The browser's storage for one session, which can be switched off.
const sessionOf = scope => {
    try {
        return scope.sessionStorage || null;
    } catch {
        return null;
    }
};

const createApp = (vm, {
    config = createConfig(),
    settings = createSettings(storageOf(globalThis)),
    reader = createReader(globalThis),
    session = sessionOf(globalThis)
} = {}) => {
    // Each part of the interface registers an object of its own under a name.
    const parts = new Map();
    const listeners = new Set();
    let intl = createIntl({locale: 'en', defaultLocale: 'en', onError: () => {}});
    let announceTimer = null;
    const memory = createMemory();
    // The mode the student chose, or null for the configured one.
    let chosenMode = null;
    const modeListeners = new Set();
    const modeChanged = () => modeListeners.forEach(listener => listener());
    let preface = null;
    let prefaceTimer = null;

    const assistantName = () => config.get().assistantName || DEFAULT_ASSISTANT_NAME;
    const app = {
        vm,
        assistantName,
        editor: getEditor(vm),
        config,
        settings,
        // The recent conversation with the AI helper.
        memory,
        // `build`: the helper suggests changes. `guide`: it teaches the student to make them.
        mode: () => chosenMode ?? config.get().assistantMode,
        setMode: mode => {
            chosenMode = mode;
            modeChanged();
        },
        subscribeMode: listener => {
            modeListeners.add(listener);
            const configured = config.subscribe(listener);
            return () => {
                modeListeners.delete(listener);
                configured();
            };
        },
        // Whose service hears and speaks.
        online: createOnlineVoice(config),
        // Words besides the English ones that answer a question.
        answerWords: () => config.get().speech?.answers ?? SWAHILI,
        // Nothing of one student stays for the next.
        forgetStudent: () => {
            memory.clear();
            chosenMode = null;
            modeChanged();
            app.introduction.forget();
            parts.get('wake')?.stop({quietly: true});
            settings.reset();
        },

        // Read text aloud, if that is wanted and the microphone would not hear it.
        speak: text => {
            const listening = !!parts.get('voice') && parts.get('voice').getState().phase !== 'idle';
            if (config.get().voice && settings.get().readAloud && !listening) reader.speak(text, intl.locale);
        },
        silence: () => reader.stop(),
        reading: () => !!reader.speaking?.(),
        canReadAloud: () => reader.isAvailable(intl.locale),
        intl: () => intl,
        setIntl: next => {
            intl = next;
        },
        // Any message may name the assistant.
        say: (message, values) => intl.formatMessage(message, {assistant: assistantName(), ...values}),

        register: (name, part) => {
            parts.set(name, part);
            return () => {
                if (parts.get(name) === part) parts.delete(name);
            };
        },
        // `{tab, view, setView, setTab, openCommandBox, openSettings}`
        gui: () => parts.get('gui') || null,
        outline: () => parts.get('outline') || null,
        // `{openLibrary, closeLibrary, add, items}`
        sprites: () => parts.get('sprites') || null,
        // The sprite library, see `library.js`.
        library: () => (parts.get('sprites')?.items ? createLibrary(parts.get('sprites').items) : null),
        // The voice controller, see `voice/controller.js`.
        voice: () => parts.get('voice') || null,
        // Listening for the wake words, see `wake/control.js`.
        wake: () => parts.get('wake') || null,
        // The approval gate, see `proposals/gate.js`: takes the student's answer to a suggestion.
        gate: () => parts.get('gate') || null,
        // The AI helper, see `ai/assistant.js`: takes what is not a local command.
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
                app.introduction.heard(full);
                listeners.forEach(listener => listener(full));
                app.speak(full);
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
                focusWhenReady(() => document.querySelector('[data-voice-talk]'),
                    arrive);
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
                action.shortcuts.some(shortcut => !shortcut.hold && !shortcut.elsewhere &&
                    matches(shortcut, event)));
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
                    shortcut: (usable && (action.shortcutsFor?.(app) || action.shortcuts)[0]?.label) || null,
                    here
                };
            });
        },

        // The actions the AI helper may propose now.
        proposableActions: () => ACTIONS
            .filter(action => action.proposable !== false && !app.unavailable(action))
            .map(action => ({
                id: action.id,
                name: app.say(action.name),
                description: app.say(action.description)
            })),

        snapshot: () => buildSnapshot({app, document, intl, actions: app.availableActions()})
    };
    // Added once the app it speaks through exists.
    app.introduction = createIntroduction({
        compose: ({length}) => {
            const {voice, ai, approval} = config.get();
            const {studentName, talkKey} = settings.get();
            const canTalk = voice && !!parts.get('voice')?.isSupported();
            return introductionText({
                say: (message, values) => app.say(message, values),
                locale: intl.locale,
                length,
                student: studentName,
                ai: !!ai,
                approval,
                actions: ACTIONS.map(action => action.id),
                talkKey: canTalk ? TALK_KEYS[talkKey].name : null,
                typeKey: findAction('help.commandBox').shortcuts[0].label
            });
        },
        preference: () => settings.get().introduction,
        announce: text => app.announce(text),
        silence: () => app.silence(),
        session
    });
    return app;
};

const apps = new WeakMap();

// The one app of a virtual machine.
const getApp = vm => {
    if (!apps.has(vm)) apps.set(vm, createApp(vm, {config: createConfig(fetchConfig(globalThis))}));
    return apps.get(vm);
};

export {
    createApp,
    getApp
};
