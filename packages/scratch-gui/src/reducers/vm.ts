import VM from '@scratch/scratch-vm';
import {GUIConfig} from '../gui-config';

const SET_VM = 'scratch-gui/vm/SET_VM';

// webpack replaces `process.env.NODE_ENV` at build time; this package's tsconfig has no Node types.
declare const process: {env: {NODE_ENV?: string}};

const createVM = function (config: GUIConfig) {
    const defaultVM = new VM();
    defaultVM.attachStorage(config.storage.scratchStorage);
    // Development builds expose the VM for inspection from the browser console.
    if (process.env.NODE_ENV !== 'production') Object.assign(window, {vm: defaultVM});
    return defaultVM;
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = null;
    switch (action.type) {
    case SET_VM:
        return action.vm;
    default:
        return state;
    }
};
const setVM = function (vm) {
    return {
        type: SET_VM,
        vm: vm
    };
};

export {
    reducer as default,
    createVM as vmInitialState,
    setVM
};
