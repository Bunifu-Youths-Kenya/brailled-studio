/*
 * Decides when a student has finished speaking, from how loud the microphone is. It is patient: pauses shorter
 * than the chosen silence do not end the recording, and the noise of the room is allowed for.
 */

// Quieter than this is never speech.
const LEAST_SPEECH = 0.012;
// Speech is this many times louder than the quietest the room has recently been.
const ABOVE_NOISE = 2.5;
// A room noisier than this is not allowed for further, or speech itself would be taken for noise.
const MOST_NOISE = 0.04;
// How far back to look for the quietest moment, in seconds.
const NOISE_SECONDS = 5;
// Sound shorter than this, such as a click, does not start the student's turn.
const SPEECH_SECONDS = 0.15;
// How long to wait for speech to start before giving up, at least.
const WAIT_SECONDS = 8;

/**
 * @param {object} options Options.
 * @param {number} options.silenceSeconds How long a pause ends the turn.
 * @param {number} options.maxSeconds The longest a recording may be.
 * @returns {object} `add(level, seconds, held)` takes the loudness (root mean square, 0 to 1) at a time since the
 * start, and returns null, or why to stop: `silence`, `max` or `nothing` (nobody spoke). While the talk key is
 * held, only `max` stops it. `spoke()` says whether any speech was heard.
 */
const createEndpointer = ({silenceSeconds, maxSeconds}) => {
    let recent = [];
    let loudSince = null;
    let lastSpeech = null;
    return {
        add: (level, seconds, held = false) => {
            recent = [...recent.filter(item => item.seconds > seconds - NOISE_SECONDS), {level, seconds}];
            const noise = Math.min(MOST_NOISE, ...recent.map(item => item.level));
            if (level > Math.max(LEAST_SPEECH, noise * ABOVE_NOISE)) {
                loudSince = loudSince ?? seconds;
                if (seconds - loudSince >= SPEECH_SECONDS) lastSpeech = seconds;
            } else {
                loudSince = null;
            }
            if (seconds >= maxSeconds) return 'max';
            if (held) return null;
            if (lastSpeech === null) {
                return seconds >= Math.max(WAIT_SECONDS, silenceSeconds * 3) ? 'nothing' : null;
            }
            // Not while there is sound that may be the student going on.
            return loudSince === null && seconds - lastSpeech >= silenceSeconds ? 'silence' : null;
        },
        spoke: () => lastSpeech !== null
    };
};

export {
    WAIT_SECONDS,
    createEndpointer
};
