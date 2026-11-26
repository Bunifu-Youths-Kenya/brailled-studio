import {useEffect} from 'react';

import './theme.css';

/**
 * Give Brailled's panels the colours of the editor's colour mode, on the page itself so that dialogs have them too.
 * @param {string} colorMode The editor's colour mode: `default`, `dark` or `high-contrast`.
 */
const useColorMode = colorMode => {
    useEffect(() => {
        document.documentElement.dataset.brailledColorMode = colorMode;
    }, [colorMode]);
};

export default useColorMode;
