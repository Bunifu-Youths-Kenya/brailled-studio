// Short sounds marking when the microphone opens and closes. Speaking at those moments would be heard by it.
const createTone = scope => {
    let context = null;
    const beep = frequency => {
        const AudioContext = scope.AudioContext || scope.webkitAudioContext;
        if (!AudioContext) return;
        try {
            context = context || new AudioContext();
            context.resume();
            const oscillator = context.createOscillator();
            const volume = context.createGain();
            oscillator.frequency.value = frequency;
            volume.gain.setValueAtTime(0.15, context.currentTime);
            volume.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
            oscillator.connect(volume).connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.13);
        } catch {
            // Sound is a convenience; the status line says the same.
        }
    };
    return {
        opened: () => beep(880),
        closed: () => beep(440)
    };
};

export default createTone;
