import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, useIntl} from 'react-intl';

import Input from './forms/input.jsx';
import InputGroup from './input-group/input-group.jsx';
import LiveInputHOC from './forms/live-input-hoc.jsx';

import {MAX_STROKE_WIDTH} from '../reducers/stroke-width';

const messages = defineMessages({
    outlineWidth: {
        defaultMessage: 'Outline width',
        description: 'Accessible name of the number input for the outline width',
        id: 'brailled.paint.outlineWidth'
    }
});

const LiveInput = LiveInputHOC(Input);
const StrokeWidthIndicatorComponent = props => {
    const intl = useIntl();
    return (
        <InputGroup disabled={props.disabled}>
            <LiveInput
                aria-label={intl.formatMessage(messages.outlineWidth)}
                range
                small
                disabled={props.disabled}
                max={MAX_STROKE_WIDTH}
                min="0"
                type="number"
                value={props.strokeWidth ? props.strokeWidth : 0}
                onSubmit={props.onChangeStrokeWidth}
            />
        </InputGroup>
    );
};

StrokeWidthIndicatorComponent.propTypes = {
    disabled: PropTypes.bool.isRequired,
    onChangeStrokeWidth: PropTypes.func.isRequired,
    strokeWidth: PropTypes.number
};

export default StrokeWidthIndicatorComponent;
