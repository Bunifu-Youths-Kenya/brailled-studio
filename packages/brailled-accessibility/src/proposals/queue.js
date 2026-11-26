/*
 * The only way from the AI helper to the editor. The helper is given `submit` and nothing else: it can ask for
 * steps to be considered, but cannot approve or carry them out. The approval gate takes what is submitted.
 */
const createProposalQueue = () => {
    let gate = null;
    return {
        // What the AI side gets.
        submitter: Object.freeze({
            // A copy is taken, so that nothing can be changed after it has been checked.
            submit: proposal => (gate ?
                gate(JSON.parse(JSON.stringify(proposal))) :
                Promise.resolve({accepted: false, reason: 'nothing is taking proposals'}))
        }),
        // For the gate.
        connect: take => {
            gate = take;
            return () => {
                if (gate === take) gate = null;
            };
        }
    };
};

export {
    createProposalQueue
};
