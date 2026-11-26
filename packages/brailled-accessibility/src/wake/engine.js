/*
 * What listens for the wake words, behind a small interface so that it can be swapped. A wake word engine is:
 *
 *   isSupported(): boolean
 *   start({language, phrases, onWake, onProblem})
 *   stop(): Promise
 *
 * `start` listens until `stop`. `phrases` is `{greetings, names}` (see `match.js`). `onWake({request, confidence})`
 * is called when the assistant is called, with anything asked in the same breath. `onProblem(reason)` is called when
 * it cannot go on listening: `denied`, `no-microphone`, `language`, `unavailable` or `failed`. The promise of
 * `stop` resolves when the microphone is free for something else.
 */
import {createBrowserWakeWord} from './browser-engine.js';
import {createDeviceWakeWord} from './device-engine.js';

const createWakeWord = (name, scope) => (name === 'on-device' ?
    createDeviceWakeWord() :
    createBrowserWakeWord(scope));

export {
    createWakeWord
};
