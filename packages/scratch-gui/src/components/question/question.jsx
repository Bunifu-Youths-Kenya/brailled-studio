import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, useIntl} from 'react-intl';
import styles from './question.css';
import Input from '../forms/input.jsx';
import enterIcon from './icon--enter.svg';

const messages = defineMessages({
    answer: {
        defaultMessage: 'Your answer',
        description: 'Accessible name of the box for answering a question asked by the project',
        id: 'brailled.question.answer'
    },
    answerTo: {
        defaultMessage: 'Your answer to: {question}',
        description: 'Accessible name of the answer box when the question has text',
        id: 'brailled.question.answerTo'
    },
    submit: {
        defaultMessage: 'Send answer',
        description: 'Accessible name of the button that sends an answer',
        id: 'brailled.question.submit'
    }
});

const QuestionComponent = props => {
    const intl = useIntl();
    const {
        answer,
        className,
        question,
        onChange,
        onClick,
        onKeyPress
    } = props;
    return (
        <div className={className}>
            <div className={styles.questionContainer}>
                {question ? (
                    <div className={styles.questionLabel}>{question}</div>
                ) : null}
                <div className={styles.questionInput}>
                    <Input
                        aria-label={question ?
                            intl.formatMessage(messages.answerTo, {question}) :
                            intl.formatMessage(messages.answer)}
                        autoFocus
                        value={answer}
                        onChange={onChange}
                        onKeyPress={onKeyPress}
                    />
                    <button
                        aria-label={intl.formatMessage(messages.submit)}
                        className={styles.questionSubmitButton}
                        onClick={onClick}
                    >
                        <img
                            className={styles.questionSubmitButtonIcon}
                            draggable={false}
                            src={enterIcon}
                        />
                    </button>
                </div>
            </div>
        </div>
    );
};

QuestionComponent.propTypes = {
    answer: PropTypes.string,
    className: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    onClick: PropTypes.func.isRequired,
    onKeyPress: PropTypes.func.isRequired,
    question: PropTypes.string
};

export default QuestionComponent;
