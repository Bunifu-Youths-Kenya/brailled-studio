import {defineMessages} from 'react-intl';

// What the editor says about accounts.
const signInMessages = defineMessages({
    signedIn: {
        id: 'brailled.signIn.signedIn',
        defaultMessage: 'You are signed in. You can ask {assistant} now.',
        description: 'Said when signing in on the account page is noticed'
    },
    signedOut: {
        id: 'brailled.signIn.signedOut',
        defaultMessage: 'You are signed out.',
        description: 'Said after signing out'
    },
    opened: {
        id: 'brailled.signIn.opened',
        defaultMessage: 'The sign-in page is open in a new tab. Come back here when you have signed in.',
        description: 'Said when the account page is opened'
    },
    notOpened: {
        id: 'brailled.signIn.notOpened',
        defaultMessage: 'The browser did not let the page open. Press Alt+Shift+A.',
        description: 'Said when a spoken command could not open the account page'
    },
    liveLimit: {
        id: 'brailled.signIn.liveLimit',
        defaultMessage: 'You have used today’s live voice sessions. Use the talk key, or type.',
        description: 'Said when the day’s allowance of live voice sessions is used up'
    },
    button: {
        id: 'brailled.signIn.button',
        defaultMessage: 'Sign in',
        description: 'Menu bar button that opens the account page'
    },
    account: {
        id: 'brailled.signIn.account',
        defaultMessage: 'Account',
        description: 'Menu bar button that opens the account page, for someone signed in'
    },
    kept: {
        id: 'brailled.signIn.kept',
        defaultMessage: 'Signing in keeps your name, email address and how much you use {assistant} with ' +
            'Supabase.',
        description: 'Added to the privacy notice in an editor with accounts'
    }
});

export default signInMessages;
