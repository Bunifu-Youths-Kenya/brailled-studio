/*
 * Earcons: short sounds that mark what happened in the editor, made with the Web Audio API (no files, no
 * network). They come before the words that say the same thing, never in place of them, and are quiet unless the
 * school or the student turns them up. Browsers let a page make sound only after the student has done something,
 * so nothing is made, and no audio context created, before the first key press or click.
 */

// Each sound, as notes: a wave, a pitch that may glide (`to`), when it starts and how long it lasts in
// milliseconds, and how loud it is beside the others.
const CUES = Object.freeze({
    // Rising: something was added.
    blockAdded: [{wave: 'sine', from: 523, to: 784, at: 0, length: 150}],
    // Falling: something was taken away.
    blockRemoved: [{wave: 'sine', from: 784, to: 523, at: 0, length: 150}],
    // A short slide: something went somewhere else.
    blockMoved: [{wave: 'triangle', from: 587, to: 698, at: 0, length: 110}],
    // Up a step, and down one: into a loop or condition, and out of it.
    enterNesting: [{wave: 'sine', from: 659, at: 0, length: 60}, {wave: 'sine', from: 880, at: 70, length: 70}],
    exitNesting: [{wave: 'sine', from: 880, at: 0, length: 60}, {wave: 'sine', from: 659, at: 70, length: 70}],
    // A low buzz, softer than the rest, as it is harsher.
    error: [{wave: 'square', from: 147, at: 0, length: 250, loudness: 0.5}],
    // A chime: two notes together, fading.
    success: [
        {wave: 'sine', from: 1047, at: 0, length: 280},
        {wave: 'sine', from: 1319, at: 0, length: 280, loudness: 0.6}
    ],
    // A gentle question: two notes, the second higher.
    approvalNeeded: [{wave: 'sine', from: 523, at: 0, length: 110, loudness: 0.8},
        {wave: 'sine', from: 659, at: 140, length: 110, loudness: 0.8}]
});

const EVENTS = Object.freeze(Object.keys(CUES));

// What a sound for a block is pitched by, from the start of its opcode: so that adding a looks block sounds a
// little higher than adding a motion block.
const CATEGORY_PITCH = Object.freeze({
    motion: 1,
    looks: 1.12,
    sound: 1.19,
    event: 0.89,
    control: 0.84,
    sensing: 1.26,
    operator: 1.33,
    data: 0.79,
    procedures: 0.75,
    pen: 1.06,
    music: 1.41
});

const USUAL_VOLUME = 0.15;

const volumeFrom = (value, fallback) => (Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : fallback);

/**
 * The school's choices for earcons, from `brailled-config.json`. Off unless `enabled` is a plain `true`.
 * @param {?object} value `{enabled, volume, pitchByCategory, events: {name: {enabled, volume}}}`.
 * @returns {object} The choices, with every event's.
 */
const earconsFrom = value => {
    const volume = volumeFrom(value?.volume, USUAL_VOLUME);
    const given = value?.events && typeof value.events === 'object' ? value.events : {};
    return Object.freeze({
        enabled: value?.enabled === true,
        volume,
        pitchByCategory: value?.pitchByCategory !== false,
        events: Object.freeze(Object.fromEntries(EVENTS.map(name => [name, Object.freeze({
            enabled: given[name]?.enabled !== false,
            volume: volumeFrom(given[name]?.volume, volume)
        })])))
    });
};

// How long a sound lasts, in milliseconds.
const lengthOf = name => Math.max(...CUES[name].map(note => note.at + note.length));

/**
 * @param {object} options Options.
 * @param {object} options.scope Where `AudioContext` and the document come from.
 * @param {function(): object} options.choices The choices now: `earconsFrom` with `enabled` for this student.
 * @param {function(): boolean} options.busy Whether something is being said that a sound would cover.
 * @returns {object} The earcons.
 */
const createEarcons = ({scope, choices, busy = () => false}) => {
    let context = null;
    let allowed = false;
    let playing = [];

    // The first key press or click lets the page make sound.
    const allow = () => {
        allowed = true;
    };
    scope.document?.addEventListener('keydown', allow, {capture: true, once: true});
    scope.document?.addEventListener('pointerdown', allow, {capture: true, once: true});

    const stop = () => {
        playing.forEach(oscillator => {
            try {
                oscillator.stop();
            } catch {
                // It had already stopped.
            }
        });
        playing = [];
    };

    /**
     * Play a sound, if it is wanted and may be made now.
     * @param {string} name One of `EVENTS`.
     * @param {object} [options] Options.
     * @param {?string} [options.opcode] The block it is about, to pitch it by its category.
     * @returns {number} How long it lasts, in milliseconds, or 0 if none is played.
     */
    const play = (name, {opcode = null} = {}) => {
        const chosen = choices();
        const event = chosen.events[name];
        if (!CUES[name] || !chosen.enabled || !event?.enabled || event.volume <= 0 || !allowed || busy()) return 0;
        const AudioContext = scope.AudioContext || scope.webkitAudioContext;
        if (!AudioContext) return 0;
        try {
            context = context || new AudioContext();
            context.resume?.();
            stop();
            const pitch = chosen.pitchByCategory && opcode ? CATEGORY_PITCH[opcode.split('_')[0]] ?? 1 : 1;
            const start = context.currentTime;
            for (const note of CUES[name]) {
                const oscillator = context.createOscillator();
                const volume = context.createGain();
                const begins = start + (note.at / 1000);
                const ends = begins + (note.length / 1000);
                oscillator.type = note.wave;
                oscillator.frequency.setValueAtTime(note.from * pitch, begins);
                if (note.to) oscillator.frequency.linearRampToValueAtTime(note.to * pitch, ends);
                // A soft start and a fade, so that it does not click.
                volume.gain.setValueAtTime(0.0001, begins);
                volume.gain.exponentialRampToValueAtTime(event.volume * (note.loudness ?? 1), begins + 0.01);
                volume.gain.exponentialRampToValueAtTime(0.0001, ends);
                oscillator.connect(volume).connect(context.destination);
                oscillator.start(begins);
                oscillator.stop(ends + 0.02);
                playing.push(oscillator);
            }
            return lengthOf(name);
        } catch {
            // Sound is a help, never needed: the words say the same.
            return 0;
        }
    };

    return {
        play,
        stop,
        // Whether the page may make sound yet.
        allowed: () => allowed
    };
};

export {
    CATEGORY_PITCH,
    CUES,
    EVENTS,
    createEarcons,
    earconsFrom,
    lengthOf
};
