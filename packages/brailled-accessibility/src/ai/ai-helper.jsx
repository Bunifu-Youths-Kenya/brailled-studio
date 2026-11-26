// Connects the AI helper, where one is configured, and shows its replies.
import PropTypes from 'prop-types';
import React, {useEffect, useState, useSyncExternalStore} from 'react';
import {useIntl} from 'react-intl';

import {TALK_KEYS} from '../actions/shortcuts.js';
import Dialog from '../outline/dialog.jsx';
import {createAssistant} from './assistant.js';
import aiMessages from './messages.js';

import dialogStyles from '../outline/dialog.css';

const Reply = ({assistant, reply, talkKey}) => {
    const intl = useIntl();
    const say = (message, values) => intl.formatMessage(message, values);
    const handleAnswer = event => {
        event.preventDefault();
        const text = String(new FormData(event.target).get('answer'))
            .trim();
        if (text) assistant.answer(text);
    };
    const handleChoice = event => assistant.answer(event.currentTarget.value);
    const handleDismiss = assistant.dismiss;
    const title = {
        proposal: aiMessages.proposalTitle,
        question: aiMessages.questionTitle,
        explanation: aiMessages.explanationTitle
    }[reply.type];
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
                    {reply.type === 'proposal' ? (
                        <React.Fragment>
                            <p className={dialogStyles.field}>{say(aiMessages.summary, {summary: reply.summary})}</p>
                            <p className={dialogStyles.label}>{say(aiMessages.stepsHeading)}</p>
                            <ol className={dialogStyles.field}>
                                {reply.steps.map((step, index) => (
                                    <li key={index}>{step.sentence}</li>
                                ))}
                            </ol>
                            <p className={dialogStyles.field}>{say(aiMessages.cannotApprove)}</p>
                        </React.Fragment>
                    ) : null}
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
                            {say(aiMessages.answerHint, {key: talkKey})}
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
    reply: PropTypes.shape({
        type: PropTypes.oneOf(['proposal', 'question', 'explanation']).isRequired,
        summary: PropTypes.string,
        steps: PropTypes.arrayOf(PropTypes.shape({sentence: PropTypes.string.isRequired})),
        question: PropTypes.string,
        choices: PropTypes.arrayOf(PropTypes.string),
        text: PropTypes.string
    }).isRequired,
    talkKey: PropTypes.string.isRequired
};

const none = () => () => {};
const nothing = () => null;

const Replies = ({assistant, talkKey}) => {
    const reply = useSyncExternalStore(
        assistant ? assistant.subscribe : none,
        assistant ? () => assistant.getState().reply : nothing);
    return reply ? (
        <Reply
            assistant={assistant}
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
    talkKey: PropTypes.string.isRequired
};

const AiHelper = ({app}) => {
    const {aiEndpoint} = useSyncExternalStore(app.config.subscribe, app.config.get);
    const {talkKey} = useSyncExternalStore(app.settings.subscribe, app.settings.get);
    const [assistant, setAssistant] = useState(null);

    useEffect(() => {
        if (!aiEndpoint) return;
        const created = createAssistant({app, endpoint: aiEndpoint, fetch: window.fetch.bind(window)});
        const leave = app.register('assistant', created);
        setAssistant(created);
        return () => {
            leave();
            created.dispose();
            setAssistant(null);
        };
    }, [app, aiEndpoint]);

    return (
        <Replies
            assistant={assistant}
            talkKey={TALK_KEYS[talkKey].name}
        />
    );
};

AiHelper.propTypes = {
    app: PropTypes.shape({
        config: PropTypes.shape({get: PropTypes.func.isRequired, subscribe: PropTypes.func.isRequired}).isRequired,
        register: PropTypes.func.isRequired,
        settings: PropTypes.shape({
            get: PropTypes.func.isRequired,
            subscribe: PropTypes.func.isRequired
        }).isRequired
    }).isRequired
};

export default AiHelper;
