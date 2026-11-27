// The Supabase client for the account page and, with the same stored sign-in, the editor.
import {createClient} from '@supabase/supabase-js';

// Where the browser keeps the sign-in, which pages of this site share.
const STORAGE_KEY = 'brailled.account';

// The editor leaves what Google sends back, in the address, to the account page.
const createAccountClient = ({supabaseUrl, publishableKey}, {inEditor = false} = {}) =>
    createClient(supabaseUrl, publishableKey, {
        auth: {
            flowType: 'pkce',
            storageKey: STORAGE_KEY,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: !inEditor
        }
    });

export {
    STORAGE_KEY,
    createAccountClient
};
