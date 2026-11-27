/*
 * Reads text with an online voice, a sentence at a time and in order. A sentence whose sound ships with the editor
 * is played from there, offline or not. The sound of a few short sentences prepared ahead is held in memory until the
 * page closes. Nothing else is kept: neither the words nor the sound.
 */
import {encodePcmWav} from '../voice/audio.js';
import {phraseKey, sentences} from './phrases.js';

const FOLDER = 'static/brailled-voice/';
// The rate of the sound the speech service gives.
const SERVICE_RATE = 24000;
const TIMEOUT_MS = 15000;

/**
 * @param {object} options Options.
 * @param {object} options.scope The browser.
 * @param {function(): ?string} options.address The server's speech address, or null where there is none.
 * @param {function(): object} options.settings The school's voice settings.
 * @param {Function} options.onFail Given the words that were not read.
 * @returns {object} The speaker.
 */
const createOnlineSpeaker = ({scope, address, settings, onFail, authorised = (to, options) => options}) => {
    // The sentences whose sound ships with the editor, by name.
    let kept = new Map();
    let loading = null;
    let turn = 0;
    let playing = null;
    let fetching = [];
    let busy = false;
    // Sentences played from the shipped sound since the server was last told, for its record of costs.
    let hits = 0;
    // Sentences to have ready, by name, and the sound of those that have arrived.
    const wanted = new Set();
    const held = new Map();
    const takeHits = () => {
        const taken = hits;
        hits = 0;
        return taken;
    };

    const load = () => {
        loading = loading || Promise.resolve()
            .then(() => scope.fetch(`${FOLDER}manifest.json`))
            .then(response => (response.ok ? response.json() : null))
            .then(manifest => {
                kept = new Map((manifest?.phrases ?? []).map(item => [item.key, item.file]));
            })
            .catch(() => {
                // Without the list, every sentence is asked for.
            });
        return loading;
    };

    const keyOf = sentence => {
        const {ttsVoice, ttsModel} = settings();
        return phraseKey(sentence, ttsVoice, ttsModel);
    };
    const fileOf = sentence => kept.get(keyOf(sentence));

    // A WAV file of one sentence, as bytes. What is `ahead` of being read is not given up when reading stops.
    const soundOf = async (sentence, online, ahead = false) => {
        const key = keyOf(sentence);
        if (held.has(key)) return held.get(key);
        const controller = new scope.AbortController();
        if (!ahead) fetching.push(controller);
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const file = fileOf(sentence);
            if (file) {
                const response = await scope.fetch(`${FOLDER}${file}`, {signal: controller.signal});
                if (!response.ok) throw new Error(`no kept sound: ${response.status}`);
                hits += 1;
                return new Uint8Array(await response.arrayBuffer());
            }
            const {provider, ttsVoice, ttsModel} = settings();
            if (!online || !address()) throw new Error('offline');
            const to = address();
            const response = await scope.fetch(to, await authorised(to, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(
                    {text: sentence, model: ttsModel, voice: ttsVoice, provider, cacheHits: takeHits()}),
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                signal: controller.signal
            }));
            if (!response.ok) throw new Error(`the server answered ${response.status}`);
            const samples = new Uint8Array(await response.arrayBuffer());
            if (samples.length === 0) throw new Error('no sound');
            const sound = encodePcmWav(samples, SERVICE_RATE);
            if (wanted.has(key)) held.set(key, sound);
            return sound;
        } finally {
            clearTimeout(timer);
            fetching = fetching.filter(item => item !== controller);
        }
    };

    // Play to the end, at the school's speed without changing the pitch.
    const play = bytes => new Promise((resolve, reject) => {
        const source = scope.URL.createObjectURL(new scope.Blob([bytes], {type: 'audio/wav'}));
        const audio = new scope.Audio(source);
        const finish = outcome => {
            scope.URL.revokeObjectURL(source);
            if (playing?.audio === audio) playing = null;
            outcome();
        };
        playing = {audio, stop: () => finish(resolve)};
        audio.preservesPitch = true;
        audio.playbackRate = settings().speed;
        audio.onended = () => finish(resolve);
        audio.onerror = () => finish(() => reject(new Error('the sound could not be played')));
        Promise.resolve(audio.play()).catch(error => finish(() => reject(error)));
    });

    const stop = () => {
        turn += 1;
        busy = false;
        fetching.forEach(controller => controller.abort());
        fetching = [];
        if (playing) {
            const {audio, stop: end} = playing;
            audio.pause();
            end();
        }
    };

    const read = async (parts, online, mine) => {
        await load();
        const sounds = [];
        // Asked for one ahead, so that there is no wait between sentences.
        const ask = at => {
            if (at < parts.length && !sounds[at]) {
                sounds[at] = soundOf(parts[at], online);
                sounds[at].catch(() => {});
            }
        };
        for (let at = 0; at < parts.length; at++) {
            if (mine !== turn) return;
            ask(at);
            try {
                const sound = await sounds[at];
                if (mine !== turn) return;
                ask(at + 1);
                await play(sound);
            } catch (error) {
                if (mine !== turn) return;
                // eslint-disable-next-line no-console
                console.warn(`speaker: ${error.message}`);
                stop();
                onFail(parts.slice(at).join(' '));
                return;
            }
        }
        busy = false;
    };

    return {
        load,
        // Whether all of it can be read from the sound that ships with the editor.
        has: text => sentences(text).every(sentence => !!fileOf(sentence)),
        // Replaces whatever is being read. Without `online` only kept sound is used.
        speak: (text, {online = false} = {}) => {
            stop();
            busy = true;
            read(sentences(text), online, turn);
        },
        // Fetch the sound of short sentences that will be wanted at once, such as a greeting.
        prepare: text => load().then(() => Promise.all(sentences(text)
            .filter(sentence => !fileOf(sentence) && !held.has(keyOf(sentence)))
            .map(sentence => {
                wanted.add(keyOf(sentence));
                // If it cannot be had now, it is asked for when it is wanted.
                return soundOf(sentence, true, true).catch(() => {});
            }))),
        stop,
        speaking: () => busy,
        takeHits
    };
};

export {
    createOnlineSpeaker
};
