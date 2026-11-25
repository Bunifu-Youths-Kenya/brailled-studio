import {useEffect, useState} from 'react';

const kept = new WeakMap();

/**
 * Like `useState`, but the value survives the component being replaced. The editor rebuilds its whole
 * interface when the language changes, and the user's view and place must outlast that.
 * @param {object} owner Whatever the value belongs to, such as the VM.
 * @param {string} name Distinguishes the values kept for one owner.
 * @param {*} initial Value to use the first time.
 * @returns {Array} The value and its setter.
 */
const useKeptState = (owner, name, initial) => {
    const [value, setValue] = useState(() => kept.get(owner)?.[name] ?? initial);
    useEffect(() => {
        kept.set(owner, {...kept.get(owner), [name]: value});
    }, [owner, name, value]);
    return [value, setValue];
};

export default useKeptState;
