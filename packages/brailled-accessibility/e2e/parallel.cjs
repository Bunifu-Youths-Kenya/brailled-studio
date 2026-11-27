// Runs the groups of `editor.e2e.cjs` in several processes at once. Each worker is a run of that script with a
// browser, AI stand-in server and fake microphone file of its own, which runs the groups it is sent, one at a time.
// Groups that use speech or the microphone run one at a time across all the workers.
const {fork} = require('child_process');

/**
 * In a worker: run the groups asked for, until told to stop.
 *
 * @param {function(string): Promise<{lines: Array, results: Array, errors: Array}>} runGroup Runs the group named.
 * @returns {Promise} Resolves when there is nothing more to do.
 */
const serveGroups = runGroup => new Promise((resolve, reject) => {
    // Without the process that asks, there is nothing to report to.
    const orphaned = () => process.exit(1);
    process.on('disconnect', orphaned);
    process.on('message', async ({title}) => {
        if (title === null) {
            process.off('disconnect', orphaned);
            process.disconnect();
            resolve();
            return;
        }
        try {
            process.send({title, ...await runGroup(title)});
        } catch (e) {
            reject(e);
        }
    });
    process.send({title: null});
});

/**
 * @param {object} options What to run.
 * @param {string} options.script The script that serves groups.
 * @param {Array<string>} options.args Its arguments.
 * @param {object} options.env Its environment.
 * @param {Array<{title: string, speech: boolean}>} options.groups The groups, in the order they are written.
 * @param {number} options.workers How many to run at once.
 * @param {function(object)} options.report Given each group's outcome as it finishes.
 * @returns {Promise<Array<string>>} Resolves with the titles of any groups that no worker could run.
 */
const runInWorkers = ({script, args, env, groups, workers, report}) => new Promise(resolve => {
    const spoken = groups.filter(group => group.speech);
    const others = groups.filter(group => !group.speech);
    const idle = [];
    let speaking = false;
    let alive = 0;

    // The speech groups run in turn, so one starts whenever none is running: they take the longest in all.
    const next = () => {
        if (!speaking && spoken.length) {
            speaking = true;
            return spoken.shift();
        }
        return others.shift();
    };
    const dispatch = () => {
        for (let i = idle.length - 1; i >= 0; i--) {
            const worker = idle[i];
            const group = next();
            if (group) {
                idle.splice(i, 1);
                worker.group = group;
                worker.child.send({title: group.title});
            } else if (!spoken.length && !others.length) {
                idle.splice(i, 1);
                worker.child.send({title: null});
            }
        }
    };
    const start = () => {
        const worker = {child: fork(script, args, {env}), group: null, ready: false};
        alive += 1;
        worker.child.on('message', message => {
            if (worker.group) {
                if (worker.group.speech) speaking = false;
                worker.group = null;
                report(message);
            }
            worker.ready = true;
            idle.push(worker);
            dispatch();
        });
        worker.child.on('exit', code => {
            alive -= 1;
            const at = idle.indexOf(worker);
            if (at >= 0) idle.splice(at, 1);
            const lost = worker.group;
            if (lost) {
                if (lost.speech) speaking = false;
                report({
                    title: lost.title,
                    lines: [`--- ${lost.title}`, `FAIL ${lost.title} completed  [its worker stopped, code ${code}]`],
                    results: [false],
                    errors: []
                });
            }
            // A worker that never got going would only fail again.
            if (worker.ready && (spoken.length || others.length)) start();
            dispatch();
            if (!alive) resolve([...spoken, ...others].map(group => group.title));
        });
    };
    for (let i = 0; i < Math.min(workers, groups.length); i++) start();
});

module.exports = {runInWorkers, serveGroups};
