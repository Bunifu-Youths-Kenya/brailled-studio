/*
 * Turns recorded sound into what the AI server takes: one channel of 16 bit PCM at 16 kHz in a WAV file, as base64.
 * Speech needs no more than that, and it keeps requests small.
 */
const RATE = 16000;
const HEADER_BYTES = 44;
const MOST_16_BIT = 0x7fff;
// How many bytes are turned into characters at once: more than this overflows the call stack.
const CHUNK = 0x8000;

// The channels averaged into one.
const toMono = channels => {
    if (channels.length === 1) return channels[0];
    return Float32Array.from(channels[0], (_, i) =>
        channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length);
};

// The samples at another rate. Going down, each new sample is the average of those it stands for.
const resample = (samples, from, to = RATE) => {
    if (from === to) return samples;
    const step = from / to;
    return Float32Array.from({length: Math.floor(samples.length / step)}, (_, i) => {
        const start = i * step;
        if (step < 1) {
            const before = Math.floor(start);
            const after = Math.min(before + 1, samples.length - 1);
            return samples[before] + ((samples[after] - samples[before]) * (start - before));
        }
        const end = Math.min(Math.floor((i + 1) * step), samples.length);
        let sum = 0;
        for (let at = Math.floor(start); at < end; at++) sum += samples[at];
        return sum / Math.max(end - Math.floor(start), 1);
    });
};

// A WAV file around 16 bit samples of one channel, given as bytes.
const encodePcmWav = (pcm, rate) => {
    const bytes = new Uint8Array(HEADER_BYTES + pcm.length);
    const view = new DataView(bytes.buffer);
    const word = (at, text) => Array.from(text).forEach((letter, i) => view.setUint8(at + i, letter.charCodeAt(0)));
    word(0, 'RIFF');
    view.setUint32(4, bytes.length - 8, true);
    word(8, 'WAVE');
    word(12, 'fmt ');
    view.setUint32(16, 16, true);
    // PCM, one channel.
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    word(36, 'data');
    view.setUint32(40, pcm.length, true);
    bytes.set(pcm, HEADER_BYTES);
    return bytes;
};

// A WAV file of one channel of 16 bit samples, from samples between -1 and 1.
const encodeWav = (samples, rate = RATE) => {
    const pcm = new Uint8Array(samples.length * 2);
    const view = new DataView(pcm.buffer);
    samples.forEach((sample, i) => view.setInt16(i * 2,
        Math.round(Math.max(-1, Math.min(1, sample)) * MOST_16_BIT), true));
    return encodePcmWav(pcm, rate);
};

const toBase64 = bytes => {
    let text = '';
    for (let at = 0; at < bytes.length; at += CHUNK) {
        text += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
    }
    return btoa(text);
};

/**
 * @param {object} buffer Decoded sound, like the browser's `AudioBuffer`.
 * @returns {{data: string, format: string, seconds: number}} The WAV file as base64, and its length.
 */
const toRecording = buffer => {
    const channels = Array.from({length: buffer.numberOfChannels}, (_, i) => buffer.getChannelData(i));
    const samples = resample(toMono(channels), buffer.sampleRate);
    return {data: toBase64(encodeWav(samples)), format: 'wav', seconds: samples.length / RATE};
};

export {
    HEADER_BYTES,
    RATE,
    encodePcmWav,
    encodeWav,
    resample,
    toBase64,
    toMono,
    toRecording
};
