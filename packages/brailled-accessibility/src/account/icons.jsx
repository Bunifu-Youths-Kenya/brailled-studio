import PropTypes from 'prop-types';
import React from 'react';

// A picture beside words, or on a link, that already say what it shows.
const Icon = ({children}) => (
    <svg
        aria-hidden="true"
        focusable="false"
        height="20"
        viewBox="0 0 24 24"
        width="20"
    >
        {children}
    </svg>
);

Icon.propTypes = {
    children: PropTypes.node.isRequired
};

const Google = () => (
    <Icon>
        <path
            d="M22.6 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.4-4.7 3.4-8z"
            fill="#4285f4"
        />
        <path
            d={'M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 ' +
                '11 0 0 0 12 23z'}
            fill="#34a853"
        />
        <path
            d="M5.8 14.2a6.6 6.6 0 0 1 0-4.4V7H2.2a11 11 0 0 0 0 10z"
            fill="#fbbc05"
        />
        <path
            d="M12 5.3c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.2 7l3.6 2.8C6.7 7.2 9.1 5.3 12 5.3z"
            fill="#ea4335"
        />
    </Icon>
);

const Facebook = () => (
    <Icon>
        <path
            d={'M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.6-4.7 1.3 0 2.7.3 ' +
                '2.7.3v2.9H15.9c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z'}
            fill="currentColor"
        />
    </Icon>
);

const Instagram = () => (
    <Icon>
        <g
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
        >
            <rect
                height="20"
                rx="5"
                width="20"
                x="2"
                y="2"
            />
            <circle
                cx="12"
                cy="12"
                r="4.5"
            />
            <path d="M17.5 6.5h.01" />
        </g>
    </Icon>
);

const LinkedIn = () => (
    <Icon>
        <path
            d={'M20.4 2H3.6C2.7 2 2 2.7 2 3.6v16.8c0 .9.7 1.6 1.6 1.6h16.8c.9 0 1.6-.7 ' +
                '1.6-1.6V3.6c0-.9-.7-1.6-1.6-1.6zM8 19H5V9.5h3zM6.5 8.2a1.7 1.7 0 1 1 0-3.5 1.7 1.7 0 0 1 ' +
                '0 3.5zM19 19h-3v-4.6c0-1.1 0-2.5-1.5-2.5s-1.8 1.2-1.8 2.4V19h-3V9.5h2.9v1.3a3.2 3.2 0 0 1 ' +
                '2.9-1.6c3.1 0 3.6 2 3.6 4.7z'}
            fill="currentColor"
        />
    </Icon>
);

export {
    Facebook,
    Google,
    Instagram,
    LinkedIn
};
