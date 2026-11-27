// Why the AI server of an editor with accounts refuses someone, by its word for it.
import aiMessages from './messages.js';

const REFUSALS = {
    sign_in_required: 'signInNeeded',
    daily_limit: 'dailyLimit',
    blocked: 'blocked',
    ai_off: 'switchedOff'
};

const refusalMessage = error => (Object.hasOwn(REFUSALS, error) ? aiMessages[REFUSALS[error]] : null);

export {
    refusalMessage
};
