/*
 * A voice provider (see `provider.js`) that records the microphone itself, for services that listen to the sound.
 * It ends with `{audio: {data, format, seconds}}` in place of words. The sound is held in memory until it has
 * been handed over, and is never stored.
 */
import {toRecording} from './audio.js';
import {createEndpointer} from './endpointer.js';

// How often the loudness is measured.
const LEVEL_MS = 100;
const SAMPLES = 2048;

const ERRORS = {
    NotAllowedError: 'denied',
    SecurityError: 'denied',
    NotFoundError: 'no-microphone',
    NotReadableError: 'no-microphone'
};

// Whether what was heard ends in "done".
const DONE = /(?:^|\s)done[.!]?\s*$/i;

// The browser's speech recognition, run beside the recording only to hear "done". It sends the sound to the
// browser's service too, so it runs only where the school asks for it.
const listenForDone = (scope, language, onDone) => {
    const Recognition = scope.SpeechRecognition || scope.webkitSpeechRecognition;
    if (!Recognition) return () => {};
    try {
        const recognition = new Recognition();
        recognition.lang = language;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = event => {
            const last = event.results[event.results.length - 1];
            if (last && DONE.test(last[0].transcript)) onDone();
        };
        recognition.start();
        return () => {
            recognition.onresult = null;
            recognition.abort();
        };
    } catch {
        // The pause ends the recording instead.
        return () => {};
    }
};

/**
 * @param {object} scope The browser.
 * @param {function(): object} settings The school's voice settings (see `speech-config.js`).
 * @returns {object} The provider.
 */
const createRecorderProvider = (scope, settings) => {
    const AudioContext = () => scope.AudioContext || scope.webkitAudioContext;
    return {
        isSupported: () => !!(scope.navigator?.mediaDevices?.getUserMedia && scope.MediaRecorder && AudioContext()),
        records: () => true,
        listen: ({language, onReady, onEnd, held = () => false}) => {
            const {silenceSeconds, maxRecordSeconds, doneWord} = settings();
            let finished = false;
            let cancelled = false;
            let stream = null;
            let context = null;
            let recorder = null;
            let timer = null;
            let stopDone = () => {};

            const release = () => {
                clearInterval(timer);
                stopDone();
                stream?.getTracks().forEach(track => track.stop());
                context?.close().catch(() => {});
                stream = null;
                context = null;
            };
            const end = outcome => {
                if (finished || cancelled) return;
                finished = true;
                release();
                onEnd(outcome);
            };

            let stopping = false;
            let spoke = () => false;
            // Close the microphone and hand over what was said.
            const stop = () => {
                if (finished || cancelled || stopping) return;
                stopping = true;
                clearInterval(timer);
                // Not open yet: there is nothing to hand over.
                if (recorder) recorder.stop();
                else end({error: 'no-speech'});
            };

            const record = async () => {
                stream = await scope.navigator.mediaDevices.getUserMedia(
                    {audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true}});
                if (cancelled || finished) {
                    release();
                    return;
                }
                const Context = AudioContext();
                context = new Context();
                await context.resume();
                const analyser = context.createAnalyser();
                analyser.fftSize = SAMPLES;
                context.createMediaStreamSource(stream).connect(analyser);
                const parts = [];
                const media = new scope.MediaRecorder(stream);
                const finish = async () => {
                    if (cancelled) return;
                    // Silence is not sent anywhere.
                    if (!spoke()) {
                        end({error: 'no-speech'});
                        return;
                    }
                    try {
                        const sound = await new scope.Blob(parts, {type: media.mimeType}).arrayBuffer();
                        end({audio: toRecording(await context.decodeAudioData(sound))});
                    } catch {
                        end({error: 'failed'});
                    }
                };
                Object.assign(media, {
                    ondataavailable: event => parts.push(event.data),
                    onstop: finish,
                    onerror: () => end({error: 'failed'})
                });
                const endpointer = createEndpointer({silenceSeconds, maxSeconds: maxRecordSeconds});
                spoke = endpointer.spoke;
                const samples = new Float32Array(SAMPLES);
                const started = Date.now();
                media.start();
                recorder = media;
                if (doneWord) stopDone = listenForDone(scope, language, stop);
                timer = setInterval(() => {
                    analyser.getFloatTimeDomainData(samples);
                    const level = Math.sqrt(samples.reduce((sum, sample) => sum + (sample * sample), 0) / SAMPLES);
                    if (endpointer.add(level, (Date.now() - started) / 1000, held())) stop();
                }, LEVEL_MS);
                onReady();
            };
            record().catch(error => end({error: ERRORS[error?.name] || 'failed'}));

            return {
                stop,
                cancel: () => {
                    cancelled = true;
                    if (recorder && recorder.state !== 'inactive') recorder.stop();
                    release();
                }
            };
        }
    };
};

export {
    LEVEL_MS,
    createRecorderProvider
};
