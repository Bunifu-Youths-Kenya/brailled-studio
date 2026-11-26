/*
 * Speech to text, behind a small interface so that the service can be swapped. A provider is:
 *
 *   isSupported(): boolean
 *   listen({language, onReady, onHear, onEnd}): {stop(), cancel()}
 *
 * A provider whose service listens to the sound itself (see `recorder.js`) also has `records(): true`, ends with
 * `{audio: {data, format, seconds}}` in place of words, and ends by itself after a pause. Its `listen` is also
 * given `held()`, true while the talk key is held down, when a pause ends nothing.
 *
 * `listen` opens the microphone until `stop` or `cancel`. `onReady()` means it is open. `onHear({text, final})`
 * reports the words so far; `final` marks the end of a phrase. `onEnd` is called once, with `{text, confidence}`
 * or `{error}`, but not after `cancel`. `confidence` is from 0 to 1, or null if the service gives none. Errors
 * are `denied`, `no-microphone`, `no-speech`, `network`, `language` or `failed`.
 */

const ERRORS = {
    'not-allowed': 'denied',
    'service-not-allowed': 'denied',
    'audio-capture': 'no-microphone',
    'no-speech': 'no-speech',
    'network': 'network',
    'language-not-supported': 'language'
};

const join = parts => parts.join(' ').replace(/\s+/g, ' ')
    .trim();

// The Web Speech API built into some browsers. Chrome sends the audio to Google's servers.
const createWebSpeechProvider = scope => {
    const Recognition = scope.SpeechRecognition || scope.webkitSpeechRecognition;
    return {
        isSupported: () => !!Recognition,
        listen: ({language, onReady, onHear, onEnd}) => {
            let finished = false;
            let error = null;
            let phrases = [];
            const finish = outcome => {
                if (finished) return;
                finished = true;
                onEnd(outcome);
            };
            let recognition = null;
            try {
                recognition = new Recognition();
                recognition.lang = language;
                // Only until `stop`: the caller closes the microphone when the key is let go.
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.maxAlternatives = 1;
                recognition.onaudiostart = () => {
                    if (!finished) onReady();
                };
                recognition.onresult = event => {
                    if (finished) return;
                    const results = Array.from(event.results);
                    phrases = results.filter(result => result.isFinal).map(result => result[0]);
                    onHear({
                        text: join(results.map(result => result[0].transcript)),
                        final: results.every(result => result.isFinal)
                    });
                };
                recognition.onerror = event => {
                    if (event.error !== 'aborted') error = ERRORS[event.error] || 'failed';
                };
                recognition.onend = () => {
                    const text = join(phrases.map(phrase => phrase.transcript));
                    if (!text) {
                        finish({error: error || 'no-speech'});
                        return;
                    }
                    // One doubtful phrase makes the whole doubtful. Zero means "not measured".
                    const scores = phrases.map(phrase => phrase.confidence);
                    finish({text, confidence: scores.every(score => score > 0) ? Math.min(...scores) : null});
                };
                recognition.start();
            } catch {
                // Reported after returning, like every other outcome.
                setTimeout(() => finish({error: 'failed'}), 0);
            }
            return {
                stop: () => recognition?.stop(),
                cancel: () => {
                    finished = true;
                    recognition?.abort();
                }
            };
        }
    };
};

// The provider the editor uses. Replace this to use another service.
const createSpeechProvider = scope => createWebSpeechProvider(scope);

// The language to listen for, from the editor's language and the browser's.
const speechLanguage = (locale, browserLanguage = '') => {
    if (!locale.toLowerCase().startsWith('en')) return locale;
    return browserLanguage.toLowerCase().startsWith('en') ? browserLanguage : 'en-US';
};

export {
    createSpeechProvider,
    createWebSpeechProvider,
    speechLanguage
};
