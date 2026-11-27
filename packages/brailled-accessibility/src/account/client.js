// The Supabase client for the account page and, with the same stored sign-in, the editor.
import {createClient} from '@supabase/supabase-js';

// Where the browser keeps the sign-in, which pages of this site share.
const STORAGE_KEY = 'brailled.account';

const createAccountClient = ({supabaseUrl, publishableKey}) => createClient(supabaseUrl, publishableKey, {
    auth: {
        flowType: 'pkce',
        storageKey: STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

export {
    STORAGE_KEY,
    createAccountClient
};
