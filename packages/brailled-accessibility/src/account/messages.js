import {defineMessages} from 'react-intl';

// The account page's words.
const accountMessages = defineMessages({
    photo: {
        id: 'brailled.account.photo',
        defaultMessage: 'Two workshop participants at a table, one smiling while exploring a coding kit',
        description: 'On the page for signing in'
    },
    loading: {
        id: 'brailled.account.loading',
        defaultMessage: 'Loading…',
        description: 'On the page for signing in'
    },
    unavailable: {
        id: 'brailled.account.unavailable',
        defaultMessage: 'Accounts are not set up for this editor. You can still build, run and save without one.',
        description: 'On the page for signing in'
    },
    createTitle: {
        id: 'brailled.account.createTitle',
        defaultMessage: 'Create an account',
        description: 'On the page for signing in'
    },
    loginTitle: {
        id: 'brailled.account.loginTitle',
        defaultMessage: 'Log in',
        description: 'On the page for signing in'
    },
    intro: {
        id: 'brailled.account.intro',
        defaultMessage: 'An account lets you ask Mboni for help. Building, running and saving never need one.',
        description: 'On the page for signing in'
    },
    googleCreate: {
        id: 'brailled.account.googleCreate',
        defaultMessage: 'Create account with Google',
        description: 'On the page for signing in'
    },
    googleLogin: {
        id: 'brailled.account.googleLogin',
        defaultMessage: 'Continue with Google',
        description: 'On the page for signing in'
    },
    or: {
        id: 'brailled.account.or',
        defaultMessage: 'Or',
        description: 'On the page for signing in'
    },
    email: {
        id: 'brailled.account.email',
        defaultMessage: 'Email address',
        description: 'On the page for signing in'
    },
    emailHint: {
        id: 'brailled.account.emailHint',
        defaultMessage: 'Enter your email address',
        description: 'On the page for signing in'
    },
    name: {
        id: 'brailled.account.name',
        defaultMessage: 'Full name',
        description: 'On the page for signing in'
    },
    nameHint: {
        id: 'brailled.account.nameHint',
        defaultMessage: 'Enter your full name',
        description: 'On the page for signing in'
    },
    password: {
        id: 'brailled.account.password',
        defaultMessage: 'Password',
        description: 'On the page for signing in'
    },
    passwordCreate: {
        id: 'brailled.account.passwordCreate',
        defaultMessage: 'Create your password, at least {count} characters',
        description: 'On the page for signing in'
    },
    passwordEnter: {
        id: 'brailled.account.passwordEnter',
        defaultMessage: 'Enter your password',
        description: 'On the page for signing in'
    },
    showPassword: {
        id: 'brailled.account.showPassword',
        defaultMessage: 'Show password',
        description: 'On the page for signing in'
    },
    create: {
        id: 'brailled.account.create',
        defaultMessage: 'Create an account',
        description: 'On the page for signing in'
    },
    login: {
        id: 'brailled.account.login',
        defaultMessage: 'Log in',
        description: 'On the page for signing in'
    },
    haveAccount: {
        id: 'brailled.account.haveAccount',
        defaultMessage: 'Already have an account?',
        description: 'On the page for signing in'
    },
    noAccount: {
        id: 'brailled.account.noAccount',
        defaultMessage: 'New to Brailled?',
        description: 'On the page for signing in'
    },
    toLogin: {
        id: 'brailled.account.toLogin',
        defaultMessage: 'Log in',
        description: 'On the page for signing in'
    },
    toCreate: {
        id: 'brailled.account.toCreate',
        defaultMessage: 'Create an account',
        description: 'On the page for signing in'
    },
    checkTitle: {
        id: 'brailled.account.checkTitle',
        defaultMessage: 'Check your email',
        description: 'On the page for signing in'
    },
    check: {
        id: 'brailled.account.check',
        defaultMessage: 'We sent a link to {email}. Open it to finish creating your account.',
        description: 'On the page for signing in'
    },
    back: {
        id: 'brailled.account.back',
        defaultMessage: 'Back to log in',
        description: 'On the page for signing in'
    },
    signedTitle: {
        id: 'brailled.account.signedTitle',
        defaultMessage: 'You are signed in',
        description: 'On the page for signing in'
    },
    hello: {
        id: 'brailled.account.hello',
        defaultMessage: 'Hello {name}.',
        description: 'On the page for signing in'
    },
    close: {
        id: 'brailled.account.close',
        defaultMessage: 'You can close this tab and go back to your project.',
        description: 'On the page for signing in'
    },
    privacy: {
        id: 'brailled.account.privacy',
        defaultMessage: 'What is kept and sent (privacy)',
        description: 'On the page for signing in, a link to the privacy page'
    },
    openEditor: {
        id: 'brailled.account.openEditor',
        defaultMessage: 'Open the editor',
        description: 'On the page for signing in'
    },
    requests: {
        id: 'brailled.account.requests',
        defaultMessage: 'Today you have used {used} of {limit} requests to Mboni.',
        description: 'On the page for signing in'
    },
    live: {
        id: 'brailled.account.live',
        defaultMessage: 'You have used {used} of {limit} live voice sessions.',
        description: 'On the page for signing in'
    },
    unlimited: {
        id: 'brailled.account.unlimited',
        defaultMessage: 'Your account has no daily limit.',
        description: 'On the page for signing in'
    },
    blocked: {
        id: 'brailled.account.blocked',
        defaultMessage: 'This account cannot use Mboni. Ask whoever runs Brailled.',
        description: 'On the page for signing in'
    },
    aiOff: {
        id: 'brailled.account.aiOff',
        defaultMessage: 'Mboni is switched off for now.',
        description: 'On the page for signing in'
    },
    signOut: {
        id: 'brailled.account.signOut',
        defaultMessage: 'Sign out',
        description: 'On the page for signing in'
    },
    kept: {
        id: 'brailled.account.kept',
        defaultMessage: 'We keep your name, your email address and how much you use Mboni, not what you say or ' +
            'build.',
        description: 'On the page for signing in'
    },
    social: {
        id: 'brailled.account.social',
        defaultMessage: 'Brailled elsewhere',
        description: 'On the page for signing in'
    },
    on: {
        id: 'brailled.account.on',
        defaultMessage: 'Brailled on {place}',
        description: 'On the page for signing in'
    },
    errorGoogle: {
        id: 'brailled.account.errorGoogle',
        defaultMessage: 'Signing in with Google did not work. Please try again.',
        description: 'On the page for signing in'
    },
    errorEmail: {
        id: 'brailled.account.errorEmail',
        defaultMessage: 'Enter a complete email address.',
        description: 'On the page for signing in'
    },
    errorName: {
        id: 'brailled.account.errorName',
        defaultMessage: 'Enter your name.',
        description: 'On the page for signing in'
    },
    errorPassword: {
        id: 'brailled.account.errorPassword',
        defaultMessage: 'The password is too short.',
        description: 'On the page for signing in'
    },
    errorCredentials: {
        id: 'brailled.account.errorCredentials',
        defaultMessage: 'That email address and password do not match.',
        description: 'On the page for signing in'
    },
    errorUnconfirmed: {
        id: 'brailled.account.errorUnconfirmed',
        defaultMessage: 'Open the link we emailed you first.',
        description: 'On the page for signing in'
    },
    errorTaken: {
        id: 'brailled.account.errorTaken',
        defaultMessage: 'There is already an account for that email address. Log in instead.',
        description: 'On the page for signing in'
    },
    errorWait: {
        id: 'brailled.account.errorWait',
        defaultMessage: 'Too many tries. Wait a few minutes, then try again.',
        description: 'On the page for signing in'
    },
    errorAllowance: {
        id: 'brailled.account.errorAllowance',
        defaultMessage: 'How much you have used cannot be shown just now.',
        description: 'On the page for signing in'
    },
    errorFailed: {
        id: 'brailled.account.errorFailed',
        defaultMessage: 'That did not work. Please try again.',
        description: 'On the page for signing in'
    }
});

export default accountMessages;
