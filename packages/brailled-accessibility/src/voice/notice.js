import voiceMessages from './messages.js';
import {readsRepliesOnline} from './speech-config.js';

/**
 * What leaves the computer, as one message: by voice, to the AI helper, or both.
 * @param {object} state What is in use.
 * @param {boolean} state.voice Whether voice is on.
 * @param {?string} state.aiEndpoint Where the AI helper is, if it is on.
 * @param {boolean} state.waking Whether the wake words are listened for.
 * @param {boolean} state.online Whether recordings go to an online service.
 * @param {?object} state.speech The speech settings from the configuration.
 * @returns {?object} The message, or null where nothing leaves the computer.
 */
const privacyNotice = ({voice, aiEndpoint, waking, online, speech}) => {
    let notice = voice ? voiceMessages.privacy : null;
    if (aiEndpoint) notice = voice ? voiceMessages.aiNoticeWithVoice : voiceMessages.aiNotice;
    if (waking) notice = aiEndpoint ? voiceMessages.wakeNoticeAi : voiceMessages.wakeNotice;
    if (online) notice = waking ? voiceMessages.onlineNoticeWake : voiceMessages.onlineNotice;
    else if (aiEndpoint && voice && readsRepliesOnline(speech)) {
        notice = waking ? voiceMessages.replyNoticeWake : voiceMessages.replyNotice;
    }
    return notice;
};

export {
    privacyNotice
};
