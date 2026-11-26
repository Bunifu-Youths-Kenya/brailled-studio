/*
 * Demo mode: the browser's own speech recognition, left running. The browser's service hears everything said while
 * it runs (Chrome sends it to Google). Phrases that do not call the assistant are dropped here, unread and unkept.
 */
import {matchWake} from './match.js';

// Errors that trying again will not mend.
const LASTING = {
    'not-allowed': 'denied',
    'service-not-allowed': 'denied',
    'audio-capture': 'no-microphone',
    'language-not-supported': 'language'
};
// The browser ends recognition now and then, and it is started again. One that keeps ending at once is given up.
const SHORT_MS = 1000;
const MOST_FAILURES = 6;
const DELAY_MS = 250;
const MOST_DELAY_MS = 8000;
// How long to wait for the browser to say that it has let go of the microphone.
const RELEASE_MS = 1000;

const createBrowserWakeWord = scope => {
    const Recognition = scope.SpeechRecognition || scope.webkitSpeechRecognition;
    let options = null;
    let recognition = null;
    let timer = null;
    let failures = 0;
    let released = [];

    const free = () => {
        recognition = null;
        released.forEach(done => done());
        released = [];
    };

    const giveUp = reason => {
        const {onProblem} = options;
        options = null;
        onProblem(reason);
    };

    const open = () => {
        const wanted = options;
        if (!wanted || recognition) return;
        const started = Date.now();
        let failed = false;
        const ended = () => {
            free();
            // Stopped, or started afresh meanwhile.
            if (options !== wanted) {
                open();
                return;
            }
            failures = failed || Date.now() - started < SHORT_MS ? failures + 1 : 0;
            if (failures >= MOST_FAILURES) {
                giveUp('failed');
                return;
            }
            timer = setTimeout(open, Math.min(DELAY_MS * (2 ** failures), MOST_DELAY_MS));
        };
        try {
            recognition = new Recognition();
            recognition.lang = wanted.language;
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
            recognition.onresult = event => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (options !== wanted) return;
                    const result = event.results[i];
                    if (!result.isFinal) continue;
                    const called = matchWake(result[0].transcript, wanted.phrases);
                    // Zero means "not measured".
                    if (called) wanted.onWake({...called, confidence: result[0].confidence || null});
                }
            };
            recognition.onerror = event => {
                if (options !== wanted) return;
                if (LASTING[event.error]) giveUp(LASTING[event.error]);
                else if (event.error === 'network') failed = true;
            };
            recognition.onend = ended;
            recognition.start();
        } catch {
            failed = true;
            ended();
        }
    };

    return {
        isSupported: () => !!Recognition,
        start: wanted => {
            clearTimeout(timer);
            options = wanted;
            failures = 0;
            // One that is still letting go starts this when it ends.
            open();
        },
        stop: () => {
            clearTimeout(timer);
            options = null;
            if (!recognition) return Promise.resolve();
            const stopping = recognition;
            const done = new Promise(resolve => {
                released.push(resolve);
                setTimeout(() => {
                    if (recognition === stopping) free();
                }, RELEASE_MS);
            });
            stopping.abort();
            return done;
        }
    };
};

export {
    MOST_FAILURES,
    createBrowserWakeWord
};
