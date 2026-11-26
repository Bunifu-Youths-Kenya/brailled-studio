// The AI helper's questions and explanations. Suggestions are shown by the approval gate.
import PropTypes from 'prop-types';
import React, {useSyncExternalStore} from 'react';
import {useIntl} from 'react-intl';

import Dialog from '../outline/dialog.jsx';
import aiMessages from './messages.js';

import dialogStyles from '../outline/dialog.css';

const Reply = ({assistant, name, reply, talkKey}) => {
    const intl = useIntl();
    const say = (message, values) => intl.formatMessage(message, {assistant: name, ...values});
    const handleAnswer = event => {
        event.preventDefault();
        const text = String(new FormData(event.target).get('answer'))
            .trim();
        if (text) assistant.answer(text);
    };
    const handleChoice = event => assistant.answer(event.currentTarget.value);
    const handleDismiss = assistant.dismiss;
    const title = reply.type === 'question' ? aiMessages.questionTitle : aiMessages.explanationTitle;
    const question = reply.type === 'question';

    return (
        <Dialog
            describedBy="brailled-ai-reply"
            title={say(title)}
            onCancel={handleDismiss}
        >
            {/* Marks a dialog in which the talk key still works. */}
            <div data-brailled-voice-dialog>
                <div id="brailled-ai-reply">
                    {question ? <p className={dialogStyles.field}>{reply.question}</p> : null}
                    {question && reply.choices.length > 0 ? (
                        <ol className={dialogStyles.field}>
                            {reply.choices.map((choice, index) => (
                                <li key={index}>
                                    <button
                                        className={dialogStyles.button}
                                        type="button"
                                        value={choice}
                                        // eslint-disable-next-line react/jsx-no-bind
                                        onClick={handleChoice}
                                    >
                                        {choice}
                                    </button>
                                </li>
                            ))}
                        </ol>
                    ) : null}
                    {reply.spritesFrom ? <p className={dialogStyles.field}>{say(aiMessages.sayName)}</p> : null}
                    {reply.type === 'explanation' ? <p className={dialogStyles.field}>{reply.text}</p> : null}
                </div>
                {question ? (
                    <form
                        // eslint-disable-next-line react/jsx-no-bind
                        onSubmit={handleAnswer}
                    >
                        <label
                            className={dialogStyles.label}
                            htmlFor="brailled-ai-answer"
                        >
                            {say(aiMessages.answerLabel)}
                        </label>
                        <input
                            aria-describedby="brailled-ai-answer-hint"
                            autoComplete="off"
                            className={dialogStyles.input}
                            data-autofocus
                            id="brailled-ai-answer"
                            name="answer"
                            type="text"
                        />
                        <p
                            className={dialogStyles.count}
                            id="brailled-ai-answer-hint"
                        >
                            {say(talkKey ? aiMessages.answerHint : aiMessages.answerHintTyped, {key: talkKey})}
                        </p>
                        <button
                            className={dialogStyles.button}
                            type="submit"
                        >
                            {say(aiMessages.send)}
                        </button>
                    </form>
                ) : null}
                <button
                    className={dialogStyles.button}
                    data-autofocus={question ? null : true}
                    type="button"
                    onClick={handleDismiss}
                >
                    {say(aiMessages.close)}
                </button>
            </div>
        </Dialog>
    );
};

Reply.propTypes = {
    assistant: PropTypes.shape({
        answer: PropTypes.func.isRequired,
        dismiss: PropTypes.func.isRequired
    }).isRequired,
    // What the helper is called.
    name: PropTypes.string.isRequired,
    reply: PropTypes.shape({
        type: PropTypes.oneOf(['question', 'explanation']).isRequired,
        spritesFrom: PropTypes.string,
        question: PropTypes.string,
        choices: PropTypes.arrayOf(PropTypes.string),
        text: PropTypes.string
    }).isRequired,
    // Null where voice is off.
    talkKey: PropTypes.string
};

const none = () => () => {};
const nothing = () => null;

const Replies = ({assistant, name, talkKey}) => {
    const reply = useSyncExternalStore(
        assistant ? assistant.subscribe : none,
        assistant ? () => assistant.getState().reply : nothing);
    return reply ? (
        <Reply
            assistant={assistant}
            name={name}
            reply={reply}
            talkKey={talkKey}
        />
    ) : null;
};

Replies.propTypes = {
    assistant: PropTypes.shape({
        getState: PropTypes.func.isRequired,
        subscribe: PropTypes.func.isRequired
    }),
    name: PropTypes.string.isRequired,
    talkKey: PropTypes.string
};

export default Replies;
