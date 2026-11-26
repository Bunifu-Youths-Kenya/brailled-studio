/*
 * Reads text aloud with a voice built into the device. Voices that work online are never used, as the text can
 * hold what a student wrote.
 */

// Some browsers cut a long utterance off, so each sentence is one of its own.
const sentences = text => text.split(/(?<=[.!?:])\s+/).filter(Boolean);

const createReader = scope => {
    // Browsers load the list of voices when it is first asked for.
    scope.speechSynthesis?.getVoices();

    // A voice for the language, or else for English, which untranslated messages are in.
    const pick = language => {
        const voices = (scope.speechSynthesis?.getVoices() || []).filter(voice => voice.localService);
        const wanted = language.toLowerCase();
        const speaks = (voice, prefix) => voice.lang.toLowerCase().replace('_', '-')
            .startsWith(prefix);
        return voices.find(voice => speaks(voice, wanted)) ||
            voices.find(voice => speaks(voice, wanted.split('-')[0])) ||
            voices.find(voice => speaks(voice, 'en')) ||
            null;
    };

    return {
        isAvailable: language => !!scope.SpeechSynthesisUtterance && !!pick(language),
        // Replaces whatever is being read. Returns false if there is no voice to read with.
        speak: (text, language) => {
            const voice = scope.SpeechSynthesisUtterance && pick(language);
            if (!voice) return false;
            scope.speechSynthesis.cancel();
            sentences(text).forEach(sentence => {
                const utterance = new scope.SpeechSynthesisUtterance(sentence);
                utterance.voice = voice;
                utterance.lang = voice.lang;
                scope.speechSynthesis.speak(utterance);
            });
            return true;
        },
        stop: () => scope.speechSynthesis?.cancel()
    };
};

export {
    createReader
};
