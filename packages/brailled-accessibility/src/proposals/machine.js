/*
 * The life of a proposal:
 *
 *   idle -> proposed -> approved -> executing -> done
 *
 * or it ends as rejected, revised or expired. Going step by step, executing returns to proposed for the next
 * step. Only a proposal that needs no approval may `proceed` from proposed to executing.
 */
const FINISHED = ['done', 'rejected', 'revised', 'expired'];

const TRANSITIONS = {
    idle: {propose: 'proposed'},
    proposed: {approve: 'approved', proceed: 'executing', reject: 'rejected', revise: 'revised', expire: 'expired'},
    approved: {execute: 'executing', expire: 'expired'},
    executing: {next: 'proposed', finish: 'done'},
    ...Object.fromEntries(FINISHED.map(state => [state, {propose: 'proposed'}]))
};

const createMachine = () => {
    let state = 'idle';
    let needsApproval = true;

    const allows = event => {
        if (!Object.hasOwn(TRANSITIONS[state], event)) return false;
        return event !== 'proceed' || !needsApproval;
    };

    return {
        state: () => state,
        allows,
        /**
         * Move on.
         * @param {string} event What happened.
         * @param {object} [details] For `propose`: whether it `needsApproval`, which it does unless told not.
         * @returns {string} The new state.
         * @throws {Error} If that cannot happen now.
         */
        send: (event, details = {}) => {
            if (!allows(event)) throw new Error(`A proposal that is ${state} cannot "${event}"`);
            if (event === 'propose') needsApproval = details.needsApproval !== false;
            state = TRANSITIONS[state][event];
            return state;
        }
    };
};

export {
    FINISHED,
    createMachine
};
