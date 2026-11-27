// Which notice says what leaves the computer.
import voiceMessages from '../src/voice/messages.js';
import {privacyNotice} from '../src/voice/notice.js';

const ai = '/api/assistant';

describe('the privacy notice', () => {
    test.each([
        ['voice alone', {voice: true}, voiceMessages.privacy],
        ['the AI helper with voice', {voice: true, aiEndpoint: ai}, voiceMessages.aiNoticeWithVoice],
        ['online recordings', {voice: true, aiEndpoint: ai, online: true, speech: {provider: 'gemini-pair'}},
            voiceMessages.onlineNotice],
        ['the live voice', {voice: true, aiEndpoint: ai, online: true, speech: {provider: 'openai-live'}},
            voiceMessages.liveNotice],
        ['replies read online', {voice: true, aiEndpoint: ai, speech: {provider: 'browser', readReplies: 'online'}},
            voiceMessages.replyNotice]
    ])('names what goes where with %s', (_, state, message) => {
        expect(privacyNotice({voice: false, aiEndpoint: null, waking: false, online: false, speech: null, ...state}))
            .toBe(message);
    });
});
