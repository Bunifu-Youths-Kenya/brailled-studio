// A suggestion waiting for the student's answer, in large type.
import PropTypes from 'prop-types';
import React, {useEffect, useRef, useSyncExternalStore} from 'react';
import {useIntl} from 'react-intl';

import Dialog from '../outline/dialog.jsx';
import proposalMessages, {timeLimit} from './messages.js';

import dialogStyles from '../outline/dialog.css';
import styles from './proposal-dialog.css';

// A press this soon after the question appears was meant for something else.
const ARM_MS = 700;

const Question = ({gate, name, proposal}) => {
    const intl = useIntl();
    const say = (message, values) => intl.formatMessage(message, {assistant: name, ...values});
    const {title, values, summary, steps, risk, mode, index, askingChange, note, seconds} = proposal;
    const shownAt = useRef(Date.now());
    const changeBox = useRef(null);
    const big = risk === 'big';
    const stepping = mode === 'steps';
    const many = steps.length > 1;

    useEffect(() => {
        if (askingChange) changeBox.current.focus();
    }, [askingChange]);

    // Only a deliberate press approves.
    const deliberate = task => () => {
        if (Date.now() - shownAt.current >= ARM_MS) task();
    };
    const handleYes = deliberate(() => gate.approve({all: !stepping}));
    const handleRest = deliberate(() => gate.approve({all: true}));
    const handleSteps = deliberate(gate.stepByStep);
    const handleNo = gate.reject;
    const handleChange = event => {
        event.preventDefault();
        const text = String(new FormData(event.target).get('change'))
            .trim();
        // "yes", "no" and "change it: ..." typed here mean what they mean aloud.
        if (text) gate.hear(gate.isAnswer(text) ? text : `change it: ${text}`);
    };
    // A key held down repeats; only a fresh press counts.
    const handleKeyDown = event => {
        if (event.repeat && event.key === 'Enter') event.preventDefault();
    };

    const sentence = (step, at) => (
        <li
            aria-current={stepping && at === index ? 'step' : null}
            className={stepping && at === index ? styles.current : null}
            key={at}
        >
            {step.sentence}
            {step.risk === 'big' ?
                <strong className={styles.risk}>{` (${say(proposalMessages.hardToUndo)})`}</strong> :
                null}
        </li>
    );

    let yes = proposalMessages.yes;
    if (stepping) yes = proposalMessages.yesStep;
    else if (many) yes = proposalMessages.yesAll;

    return (
        <Dialog
            describedBy="brailled-proposal"
            title={say(title, values)}
            onCancel={handleNo}
        >
            {/* Marks a dialog in which the talk key still works. */}
            <div
                className={styles.proposal}
                data-brailled-voice-dialog
                data-proposal-risk={risk}
                // eslint-disable-next-line react/jsx-no-bind
                onKeyDown={handleKeyDown}
            >
                <div id="brailled-proposal">
                    {big ? <p className={styles.warning}>{say(proposalMessages.warning)}</p> : null}
                    {summary ? <p>{say(proposalMessages.summary, {summary})}</p> : null}
                    {stepping ?
                        <p className={styles.now}>{steps[index].sentence}</p> :
                        <ol>{steps.map(sentence)}</ol>}
                    <p className={styles.hint}>
                        {say(stepping || !many ? proposalMessages.howToAnswer : proposalMessages.howToAnswerMany)}
                        {` ${say(...timeLimit(seconds))}`}
                    </p>
                </div>
                {stepping ? <ol className={styles.all}>{steps.map(sentence)}</ol> : null}
                <p
                    className={styles.note}
                    role="status"
                >
                    {note}
                </p>
                {/* Where it is hard to undo, "No" has focus, so that Enter alone cannot approve it. */}
                <button
                    className={dialogStyles.button}
                    data-autofocus={big ? null : true}
                    type="button"
                    onClick={handleYes}
                >
                    {say(yes)}
                </button>
                {stepping && index < steps.length - 1 ? (
                    <button
                        className={dialogStyles.button}
                        type="button"
                        onClick={handleRest}
                    >
                        {say(proposalMessages.yesRest)}
                    </button>
                ) : null}
                {many && !stepping ? (
                    <button
                        className={dialogStyles.button}
                        type="button"
                        onClick={handleSteps}
                    >
                        {say(proposalMessages.steps)}
                    </button>
                ) : null}
                <button
                    className={dialogStyles.button}
                    data-autofocus={big ? true : null}
                    type="button"
                    onClick={handleNo}
                >
                    {say(stepping ? proposalMessages.noStop : proposalMessages.no)}
                </button>
                <form
                    className={styles.change}
                    // eslint-disable-next-line react/jsx-no-bind
                    onSubmit={handleChange}
                >
                    <label
                        className={dialogStyles.label}
                        htmlFor="brailled-change"
                    >
                        {say(proposalMessages.changeLabel)}
                    </label>
                    <input
                        autoComplete="off"
                        className={dialogStyles.input}
                        id="brailled-change"
                        name="change"
                        ref={changeBox}
                        type="text"
                    />
                    <button
                        className={dialogStyles.button}
                        type="submit"
                    >
                        {say(proposalMessages.changeSend)}
                    </button>
                </form>
            </div>
        </Dialog>
    );
};

Question.propTypes = {
    gate: PropTypes.shape({
        approve: PropTypes.func.isRequired,
        hear: PropTypes.func.isRequired,
        isAnswer: PropTypes.func.isRequired,
        reject: PropTypes.func.isRequired,
        stepByStep: PropTypes.func.isRequired
    }).isRequired,
    // What the helper is called.
    name: PropTypes.string.isRequired,
    proposal: PropTypes.shape({
        title: PropTypes.shape({id: PropTypes.string}).isRequired,
        values: PropTypes.shape({number: PropTypes.number, count: PropTypes.number}).isRequired,
        summary: PropTypes.string,
        steps: PropTypes.arrayOf(PropTypes.shape({
            sentence: PropTypes.string.isRequired,
            risk: PropTypes.string.isRequired
        })).isRequired,
        risk: PropTypes.string.isRequired,
        mode: PropTypes.string,
        index: PropTypes.number.isRequired,
        askingChange: PropTypes.bool.isRequired,
        note: PropTypes.string,
        seconds: PropTypes.number.isRequired
    }).isRequired
};

const ProposalDialog = ({gate, name}) => {
    const {proposal} = useSyncExternalStore(gate.subscribe, gate.getState);
    // A new question gets a dialog of its own, so that it is read from the start.
    return proposal ? (
        <Question
            gate={gate}
            key={proposal.serial}
            name={name}
            proposal={proposal}
        />
    ) : null;
};

ProposalDialog.propTypes = {
    gate: PropTypes.shape({
        getState: PropTypes.func.isRequired,
        subscribe: PropTypes.func.isRequired
    }).isRequired,
    name: PropTypes.string.isRequired
};

export {
    ARM_MS
};
export default ProposalDialog;
