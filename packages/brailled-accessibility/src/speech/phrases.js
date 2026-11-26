/*
 * Sentences, and the names under which their sound is kept. The sound of each fixed sentence of the assistant is
 * made once (`npm run voice:phrases` in the AI server) and shipped with the editor, so that it plays offline.
 */

// Raised when kept sound must be made again.
const PHRASE_VERSION = 1;
// The longest piece the server reads at once.
const MOST_CHARACTERS = 600;

// A reply is read a sentence at a time, so that it starts soon.
const sentences = text => text.split(/(?<=[.!?:])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
    .flatMap(sentence => sentence.match(new RegExp(`.{1,${MOST_CHARACTERS}}(?:\\s|$)|.{1,${MOST_CHARACTERS}}`,
        'g')).map(piece => piece.trim()));

// FNV-1a, 64 bits: a short name that changes with any of what makes the sound.
const phraseKey = (text, voice, model, version = PHRASE_VERSION) => {
    const bytes = new TextEncoder().encode(JSON.stringify([text, voice, model, version]));
    const hash = bytes.reduce((value, byte) => BigInt.asUintN(64, (value ^ BigInt(byte)) * 0x100000001b3n),
        0xcbf29ce484222325n);
    return hash.toString(16).padStart(16, '0');
};

export {
    MOST_CHARACTERS,
    PHRASE_VERSION,
    phraseKey,
    sentences
};
