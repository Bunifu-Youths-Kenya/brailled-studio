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
import {createLiveSession} from '../live/session.js';
import {createGuide} from './guide.js';
import {createHighlighter} from './highlight.js';
import ProposalDialog from './proposal-dialog.jsx';
import {createProposalQueue} from './queue.js';


import voiceStyles from '../voice/voice-bar.css';
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
        // In an editor with accounts: with the login token, and not at all without one.
        fetch: app.account().fetcher(window.fetch.bind(window))
    });
    const guide = createGuide(app);
    const live = createLiveSession({app, assistant, endpoint, scope: window});
    const leave = [queue.connect(gate.take), app.register('gate', gate), app.register('assistant', assistant),
        app.register('guide', guide), app.register('live', live)];
    return {
        assistant,
        gate,
        live,
        dispose: () => {
            leave.forEach(task => task());
            assistant.dispose();
            gate.dispose();
            guide.stop({quietly: true});
            live.dispose();
            highlighter.clear();
        }
    };
};

// The microphone sign while the live voice is on, the same as voice input's.
const LiveSign = ({live}) => {
    const {phase} = useSyncExternalStore(live.subscribe, live.getState);
    return phase === 'on' ? (
        <span
            aria-hidden="true"
            className={voiceStyles.mic}
            data-voice-mic
        />
    ) : null;
};

LiveSign.propTypes = {
    live: PropTypes.shape({getState: PropTypes.func.isRequired, subscribe: PropTypes.func.isRequired}).isRequired
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
                docked={app.voiceFirst()}
                name={name}
                talkKey={voice ? TALK_KEYS[talkKey].name : null}
            />
            <ProposalDialog
                gate={helper.gate}
                name={name}
            />
            <LiveSign live={helper.live} />
        </React.Fragment>
    ) : null;
};

AssistantHost.propTypes = {
    app: PropTypes.shape({
        assistantName: PropTypes.func.isRequired,
        config: PropTypes.shape({get: PropTypes.func.isRequired, subscribe: PropTypes.func.isRequired}).isRequired,
        register: PropTypes.func.isRequired,
        voiceFirst: PropTypes.func.isRequired,
        settings: PropTypes.shape({
            get: PropTypes.func.isRequired,
            subscribe: PropTypes.func.isRequired
        }).isRequired
    }).isRequired
};

export default AssistantHost;
