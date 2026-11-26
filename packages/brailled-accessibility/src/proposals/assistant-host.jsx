/*
 * Puts the AI helper and the approval gate together. The gate gets the executor. The helper gets only its ports,
 * which hold the way into the proposal queue.
 */
import PropTypes from 'prop-types';
import React, {useEffect, useState, useSyncExternalStore} from 'react';

import {TALK_KEYS} from '../actions/shortcuts.js';
import {createAssistant} from '../ai/assistant.js';
import Replies from '../ai/replies.jsx';
import {createAiPorts} from './ai-ports.js';
import {createExecutor} from './executor.js';
import {createGate} from './gate.js';
import {createHighlighter} from './highlight.js';
import ProposalDialog from './proposal-dialog.jsx';
import {createProposalQueue} from './queue.js';

import './highlight.css';

const connect = (app, endpoint) => {
    const queue = createProposalQueue();
    const highlighter = createHighlighter(document);
    let assistant = null;
    const gate = createGate({
        app,
        executor: createExecutor(app),
        revise: request => assistant.revise(request),
        highlight: highlighter.show
    });
    assistant = createAssistant({
        ports: createAiPorts(app, queue.submitter),
        endpoint,
        fetch: window.fetch.bind(window)
    });
    const leave = [queue.connect(gate.take), app.register('gate', gate), app.register('assistant', assistant)];
    return {
        assistant,
        gate,
        dispose: () => {
            leave.forEach(task => task());
            assistant.dispose();
            gate.dispose();
            highlighter.clear();
        }
    };
};

const AssistantHost = ({app}) => {
    const {aiEndpoint, voice} = useSyncExternalStore(app.config.subscribe, app.config.get);
    const name = useSyncExternalStore(app.config.subscribe, app.assistantName);
    const {talkKey} = useSyncExternalStore(app.settings.subscribe, app.settings.get);
    const [helper, setHelper] = useState(null);

    useEffect(() => {
        if (!aiEndpoint) return;
        const connected = connect(app, aiEndpoint);
        setHelper(connected);
        return () => {
            connected.dispose();
            setHelper(null);
        };
    }, [app, aiEndpoint]);

    return helper ? (
        <React.Fragment>
            <Replies
                assistant={helper.assistant}
                name={name}
                talkKey={voice ? TALK_KEYS[talkKey].name : null}
            />
            <ProposalDialog
                gate={helper.gate}
                name={name}
            />
        </React.Fragment>
    ) : null;
};

AssistantHost.propTypes = {
    app: PropTypes.shape({
        assistantName: PropTypes.func.isRequired,
        config: PropTypes.shape({get: PropTypes.func.isRequired, subscribe: PropTypes.func.isRequired}).isRequired,
        register: PropTypes.func.isRequired,
        settings: PropTypes.shape({
            get: PropTypes.func.isRequired,
            subscribe: PropTypes.func.isRequired
        }).isRequired
    }).isRequired
};

export default AssistantHost;
