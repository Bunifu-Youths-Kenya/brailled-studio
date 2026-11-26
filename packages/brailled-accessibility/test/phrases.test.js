// The assistant's fixed sentences, and the sound that ships with the editor for them.
/* global __dirname, process */
import fs from 'fs';
import path from 'path';
import {createIntl} from 'react-intl';
import aiMessages from '../src/ai/messages.js';
import {introductionText} from '../src/introduction.js';
import {ACTIONS} from '../src/actions/registry.js';
import proposalMessages, {timeLimit} from '../src/proposals/messages.js';
import fixed from '../src/speech/fixed-phrases.json';
import {PHRASE_VERSION, phraseKey, sentences} from '../src/speech/phrases.js';
import voiceMessages from '../src/voice/messages.js';
import {SPEECH_DEFAULTS} from '../src/voice/speech-config.js';

const intl = createIntl({locale: 'en', defaultLocale: 'en', onError: () => {}});
const say = (message, values) => intl.formatMessage(message, {assistant: 'Mboni', key: 'F2', ...values});

// What the assistant says in the same words every time, with the usual name and talk key.
const wanted = () => {
    const introductions = ['full', 'short'].flatMap(length => ['every', 'big'].map(approval => introductionText({
        say,
        locale: 'en',
        length,
        student: '',
        ai: true,
        approval,
        actions: ACTIONS.map(action => action.id),
        talkKey: 'F2',
        typeKey: 'Alt+Shift+K'
    })));
    const messages = [
        ...['sayAgain', 'tooLate', 'tooLong', 'couldNot', 'noPrivateService', 'onlineUnavailable', 'onlineLimit',
            'speakerFailed', 'cancelled', 'notDone', 'confirmHint', 'working', 'greeting', 'conversationEnded']
            .map(key => say(voiceMessages[key])),
        ...['thinking', 'busy', 'failed', 'unreachable', 'dismissed', 'tooMany', 'sayName']
            .map(key => say(aiMessages[key])),
        ...['title', 'howToAnswer', 'howToAnswerMany', 'rejected', 'expired', 'stale', 'sayChange', 'revising',
            'nothingWaiting', 'warning', 'done', 'sayInConversation', 'sayInConversationKey',
            'sayInConversationNoVoice', 'guideStart', 'guideWellDone', 'guideFinished', 'guideStopped']
            .map(key => say(proposalMessages[key])),
        say(...timeLimit(120))
    ];
    return Array.from(new Set([...introductions, ...messages].flatMap(sentences))).sort();
};

const folder = path.resolve(__dirname, '../../scratch-gui/static/brailled-voice');

describe('the fixed sentences', () => {
    test('are the ones listed (run with UPDATE_PHRASES=1 after changing what is said)', () => {
        if (process.env.UPDATE_PHRASES) {
            fs.writeFileSync(path.resolve(__dirname, '../src/speech/fixed-phrases.json'),
                `${JSON.stringify({sentences: wanted()}, null, 4)}\n`);
            return;
        }
        expect(fixed.sentences).toEqual(wanted());
    });

    test('hold no names but the assistant\'s', () => {
        expect(fixed.sentences.join(' ')).not.toMatch(/\{|\}/);
        expect(fixed.sentences.filter(sentence => /^Hello /.test(sentence))).toEqual([]);
    });

    test('are cut at the ends of sentences, and long ones into pieces', () => {
        expect(sentences('Hello. I am Mboni.  Hold F2: talk! Ready?'))
            .toEqual(['Hello.', 'I am Mboni.', 'Hold F2:', 'talk!', 'Ready?']);
        expect(sentences('word '.repeat(300)).every(piece => piece.length <= 600)).toBe(true);
        expect(sentences('word '.repeat(300)).join(' ')).toBe('word '.repeat(300).trim());
    });

    test('are named by their words, voice, model and version', () => {
        const key = phraseKey('Done.', 'Kore', 'a/b', 1);
        expect(key).toMatch(/^[0-9a-f]{16}$/);
        // The same as the server's script makes.
        expect(key).toBe(phraseKey('Done.', 'Kore', 'a/b', 1));
        for (const other of [['Done!', 'Kore', 'a/b', 1], ['Done.', 'Puck', 'a/b', 1], ['Done.', 'Kore', 'a/c', 1],
            ['Done.', 'Kore', 'a/b', 2]]) expect(phraseKey(...other)).not.toBe(key);
        expect(phraseKey('Done.', 'Kore', 'a/b')).toBe(phraseKey('Done.', 'Kore', 'a/b', PHRASE_VERSION));
    });

    test('have their sound shipped, for the usual voice', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
        const kept = new Map(manifest.phrases.map(item => [item.key, item.file]));
        for (const sentence of fixed.sentences) {
            const file = kept.get(phraseKey(sentence, SPEECH_DEFAULTS.ttsVoice, SPEECH_DEFAULTS.ttsModel));
            expect([sentence, !!file]).toEqual([sentence, true]);
            expect(fs.readFileSync(path.join(folder, file)).toString('latin1', 0, 4)).toBe('RIFF');
        }
        expect(manifest.phrases).toHaveLength(fixed.sentences.length);
    });
});
