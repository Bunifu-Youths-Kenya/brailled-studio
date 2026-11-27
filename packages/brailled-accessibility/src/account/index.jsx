// The page for creating an account and signing in, `account.html`. It stands apart from the editor, which it opens
// in a new tab so that no project is lost.
import React from 'react';
import ReactDomClient from 'react-dom/client';
import {IntlProvider} from 'react-intl';

import {createAccountClient} from './client.js';
import {createAccount} from './controller.js';
import AccountPage from './page.jsx';
import {accountSettings, SETTINGS_URL} from './settings.js';

// Shown where the editor has no accounts, or their settings cannot be read.
const unavailable = () => {
    const state = {view: 'unavailable', busy: false, error: null, email: '', allowance: null};
    const nothing = () => {};
    return {getState: () => state,
        subscribe: () => nothing,
        emailAllowed: false,
        google: nothing,
        show: nothing,
        signOut: nothing,
        submit: nothing};
};

const open = async () => {
    const settings = await fetch(SETTINGS_URL, {cache: 'no-store'})
        .then(response => (response.ok ? response.json() : null))
        .then(accountSettings)
        .catch(() => null);
    const account = settings ?
        createAccount({client: createAccountClient(settings), settings, url: window.location.href}) :
        unavailable();
    const element = document.body.appendChild(document.createElement('div'));
    ReactDomClient.createRoot(element).render(
        <IntlProvider locale="en">
            <AccountPage account={account} />
        </IntlProvider>
    );
    account.start?.();
};

open();
