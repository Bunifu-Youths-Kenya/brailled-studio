// End-to-end checks of the Brailled editor in the system's Chrome, against the running dev server.
// Usage, with `npm start` running at the repository root: npm run test:e2e -- [url]
// CHROME_PATH names the browser to use. Screenshots are written to a temporary folder.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {chromium} = require('playwright-chromium');

const repo = path.resolve(__dirname, '../../..');
const url = process.argv[2] || 'http://localhost:8601/';
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'brailled-e2e-'));

// Stands in for the browser's speech recognition, so that no microphone or online service is needed.
// `window.speech.say` is what the next request "hears"; `window.speech.error` makes it fail.
const fakeSpeech = () => {
    window.speech = {requests: [], say: null, error: null};
    const result = (transcript, confidence) => ({results: [Object.assign([{transcript, confidence}], {isFinal: true})]});
    class Recognition {
        start () {
            window.speech.requests.push(this);
            const {error} = window.speech;
            setTimeout(() => {
                if (!error) return this.onaudiostart();
                this.onerror({error});
                return this.onend();
            }, 50);
        }
        // A finished phrase, while the microphone is still open.
        phrase () {
            this.onresult(result(...window.speech.say));
        }
        stop () {
            this.stopped = true;
            setTimeout(() => {
                if (window.speech.say) this.phrase();
                this.onend();
            }, 50);
        }
        abort () {
            this.aborted = true;
        }
    }
    window.SpeechRecognition = Recognition;
    window.webkitSpeechRecognition = Recognition;
};

const noSpeech = () => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
};

const results = [];
const check = (name, ok, detail = '') => {
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  [${detail}]` : ''}`);
};

(async () => {
    const browser = await chromium.launch({executablePath});
    const errors = [];
    // Each group of checks starts from a fresh editor, so that one failure cannot cascade into the others.
    const group = async (title, fn, {init} = {}) => {
        console.log(`--- ${title}`);
        const page = await browser.newPage({viewport: {width: 1366, height: 768}, acceptDownloads: true});
        page.setDefaultTimeout(15000);
        if (init) await page.addInitScript(init);
        page.on('pageerror', e => errors.push(`${title}: ${e.message}`));
        page.on('console', m => {
            const text = m.text();
            if (/Workspace Update Error/.test(text) ||
                (m.type() === 'error' && /brailled|Outline|Dialog|BlockPicker|ValueEditor|DataDialog/i.test(text) &&
                !/MISSING_TRANSLATION/.test(text))) errors.push(`${title}: ${text.slice(0, 300)}`);
        });
        const pause = (ms = 700) => page.waitForTimeout(ms);
        const t = {
            page,
            pause,
            key: async (k, ms) => {
                await page.keyboard.press(k);
                await pause(ms);
            },
            type: async text => {
                await page.keyboard.type(text);
                await pause(250);
            },
            said: () => page.$eval('[data-brailled-announcer]', e => e.textContent),
            focused: () => page.evaluate(() => {
                const e = document.activeElement;
                const labelled = e.getAttribute('aria-labelledby') &&
                    document.getElementById(e.getAttribute('aria-labelledby'))?.textContent;
                return {tag: e.tagName.toLowerCase(), role: e.getAttribute('role'), id: e.dataset.nodeId,
                    text: labelled || e.labels?.[0]?.textContent || e.getAttribute('aria-label') ||
                        e.textContent.slice(0, 80), value: e.value};
            }),
            items: () => page.$$eval('[data-brailled-outline] [role="treeitem"]', els => els.map(e =>
                `${'  '.repeat(e.getAttribute('aria-level') - 1)}${
                    document.getElementById(e.getAttribute('aria-labelledby')).textContent}`)),
            // Move to the outline item with exactly this text, using the keyboard.
            goTo: async text => {
                await t.key('Home', 80);
                for (let i = 0; i < 60; i++) {
                    if ((await t.focused()).text === text) return;
                    await t.key('ArrowDown', 60);
                }
                throw new Error(`no outline item "${text}"`);
            },
            data: () => page.evaluate(() => JSON.stringify(
                window.vm.runtime.targets.map(target => [target.blocks._blocks, target.variables]),
                (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ?
                    Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v))),
            drawn: () => page.evaluate(() => Array.from(document.querySelectorAll(
                '.blocklySvg .blocklyBlockCanvas g.blocklyDraggable[data-id]'), g => g.dataset.id).length),
            instructions: () => page.evaluate(() => Object.values(window.vm.editingTarget.blocks._blocks)
                .filter(b => !b.shadow).length),
            run: async command => {
                const result = await page.evaluate(c => window.brailled.run(c), command);
                await pause(600);
                return result;
            },
            // A program: when green flag clicked; move 10 steps; wait 1 second; say Hello!
            sample: async () => {
                await page.evaluate(() => {
                    let at = window.brailled.run({op: 'insert', block: 'event_whenflagclicked'}).focusId;
                    for (const block of ['motion_movesteps', 'control_wait', 'looks_say']) {
                        at = window.brailled.run({op: 'insert', block, after: at}).focusId;
                    }
                });
                await pause(900);
            },
            axe: async (selector = 'dialog') => {
                await page.addScriptTag({path: path.join(repo, 'node_modules/axe-core/axe.min.js')});
                return page.evaluate(async within => (await window.axe.run(within)).violations
                    .map(v => `${v.id}: ${v.nodes.map(n => n.html.slice(0, 120)).join(' ')}`), selector);
            }
        };
        try {
            await page.goto(url, {waitUntil: 'load', timeout: 200000});
            await page.waitForFunction(() => window.vm && window.vm.editingTarget && window.brailled, null,
                {timeout: 150000});
            await page.waitForSelector('[data-brailled-workspace] .blocklyToolbox');
            await pause(2000);
            await fn(t);
        } catch (e) {
            check(`${title} completed`, false, e.message.split('\n').slice(0, 4).join(' | '));
        }
        await page.close();
    };

    await group('layout', async ({page, key}) => {
        const rect = sel => page.$eval(sel, el => el.getBoundingClientRect().toJSON());
        const [aside, main] = [await rect('aside'), await rect('main')];
        check('stage column is left of the scripts area', aside.right <= main.x + 1);
        const header = await page.$eval('header', h => h.innerText);
        check('menu bar names Brailled', /Brailled/.test(header) && /Save/.test(header));
        const marks = await page.$$eval('header,nav,main,aside,[role="navigation"]',
            els => els.map(e => e.getAttribute('aria-label')));
        check('landmarks', ['Skip to', 'Menu topbar', 'Stage and target', 'Editor', 'Block categories']
            .every(label => marks.includes(label)), marks.join(', '));
        await page.locator('.blocklyToolboxCategoryContainer#motion').focus();
        await key('ArrowDown', 500);
        check('arrow keys move between block categories',
            await page.evaluate(() => document.activeElement.id) === 'looks');
        await page.screenshot({path: path.join(out, 'layout.png')});
    });

    await group('outline and editing', async t => {
        const {page, key, type, said, focused, data, drawn, instructions} = t;
        await key('Alt+Shift+KeyO', 600);
        check('shortcut opens the outline', /has no blocks yet/.test((await focused()).text));
        await key('i');
        await type('flag');
        await key('Enter', 900);
        check('add a hat', await said() === 'Added a new script: when green flag clicked', await said());
        await key('i');
        await type('repeat 10');
        await key('Enter', 900);
        await key('ArrowRight', 200);
        await key('i');
        await type('move steps');
        await key('Enter', 900);
        check('add inside a loop', await said() === 'Added: move 10 steps, inside repeat 10', await said());
        await key('i');
        await type('wait seconds');
        await key('Enter', 900);
        check('add after the current block', await said() === 'Added: wait 1 second, after move 10 steps', await said());
        check('canvas redrawn', await drawn() === await instructions());
        await key('d');
        check('describe',
            await said() === 'When green flag clicked: repeat 10: move 10 steps, wait 1 second.', await said());
        await key('Enter', 500);
        await page.locator('dialog input').fill('3');
        await key('Enter', 900);
        check('edit a value', await said() === 'Changed: wait 3 seconds. Was: wait 1 second', await said());
        const before = await data();
        await key('Delete', 900);
        check('delete', await said() === 'Deleted: wait 3 seconds', await said());
        const deleted = await data();
        await key('Control+z', 1500);
        check('undo restores the data exactly', await data() === before, await said());
        await key('Control+y', 1500);
        check('redo matches', await data() === deleted);
        await key('Space', 200);
        await key('i');
        check('axe: block list', (await t.axe()).length === 0, (await t.axe()).join('; '));
        await key('Escape', 400);
        check('focus returns after Escape', (await focused()).role === 'treeitem');
        await page.screenshot({path: path.join(out, 'outline.png')});
    });

    await group('every block, save and reload', async ({page, pause}) => {
        const report = await page.evaluate(async () => {
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            const vm = window.vm;
            window.brailled.run({op: 'create', kind: 'list', name: 'fruit'});
            const failed = [];
            let at = null;
            let created = 0;
            for (const {opcode} of window.brailled.listBlocks('instruction')) {
                const result = window.brailled.run({op: 'insert', block: opcode});
                if (!result.ok) failed.push(`${opcode}: ${result.message}`);
                else created++;
                at = result.focusId || at;
            }
            await wait(1500);
            const drawn = document.querySelectorAll('.blocklySvg .blocklyBlockCanvas g.blocklyDraggable[data-id]').length;
            const total = Object.values(vm.editingTarget.blocks._blocks).filter(b => !b.shadow).length;
            const described = window.brailled.run({op: 'describe'}).message;
            await vm.loadProject(await (await vm.saveProjectSb3()).arrayBuffer());
            await wait(2500);
            return {failed, created, drawn, total, same: window.brailled.run({op: 'describe'}).message === described};
        });
        await pause(500);
        check('every instruction block can be created', report.failed.length === 0 && report.created > 60,
            `${report.created}; ${report.failed.join(' | ')}`);
        check('the workspace draws them all', report.drawn === report.total, `${report.drawn}/${report.total}`);
        check('the program survives save and reload', report.same);
    });

    await group('dragging and language', async ({page, key, pause, said, focused}) => {
        await page.evaluate(() => {
            window.brailled.run({op: 'insert', block: 'event_whenflagclicked'});
        });
        await pause(1200);
        await page.evaluate(() => {
            window.heard = [];
            const a = document.querySelector('[data-brailled-announcer]');
            new MutationObserver(() => window.heard.push(a.textContent))
                .observe(a, {childList: true, subtree: true});
        });
        await page.locator('.blocklyToolboxCategoryContainer#motion').click();
        await pause(1200);
        const from = await page.evaluate(() => {
            const r = Array.from(document.querySelectorAll('.blocklyFlyout g.blocklyDraggable[data-id]'))
                .find(e => e.getBoundingClientRect().y > 90 && e.getBoundingClientRect().bottom < 700 &&
                    /move/.test(e.textContent)).getBoundingClientRect();
            return {x: r.x, y: r.y, height: r.height};
        });
        await page.mouse.move(from.x + 20, from.y + (from.height / 2));
        await page.mouse.down();
        await page.mouse.move(1100, 560, {steps: 25});
        await page.mouse.up();
        await pause(1800);
        const heard = await page.evaluate(() => window.heard);
        check('a dragged block is announced once, as added',
            JSON.stringify(heard) === JSON.stringify(['Block added: move 10 steps']), heard.join(' / '));
        await key('Alt+Shift+KeyO', 600);
        await key('End', 300);
        const place = (await focused()).id;
        await page.locator('header select').selectOption('es');
        await pause(3500);
        check('outline and place survive a language change',
            await page.locator('[data-brailled-outline]').isVisible() &&
            await page.$eval('[data-brailled-outline] [role="treeitem"][tabindex="0"]', e => e.dataset.nodeId) === place);
        check('a language change is not announced as edits', await said() === '', await said());
    });

    await group('move', async t => {
        const {key, said, focused, items, data} = t;
        await t.sample();
        await key('Alt+Shift+KeyO', 600);
        const before = await data();
        await t.goTo('say Hello!');
        await key('m', 500);
        check('M picks a block up', /^Moving say Hello!\./.test(await said()), await said());
        check('the picked block is marked', (await focused()).text === 'say Hello! (being moved)', (await focused()).text);
        await t.goTo('move 10 steps');
        await key('Shift+M', 900);
        check('Shift+M puts it before', await said() === 'Moved: say Hello!, before move 10 steps', await said());
        check('focus follows the moved block', (await focused()).text === 'say Hello!', (await focused()).text);
        await t.goTo('wait 1 second');
        await key('m', 500);
        await t.goTo('say Hello!');
        await key('m', 900);
        check('M puts it after', await said() === 'Moved: wait 1 second, after say Hello!', await said());
        await key('m', 500);
        await key('n', 900);
        check('N moves it to a new script', await said() === 'Moved: wait 1 second, to a new script', await said());
        check('two scripts', (await items()).filter(i => i.startsWith('Script')).length === 2);
        await key('m', 500);
        await key('Escape', 500);
        check('Escape cancels', await said() === 'Move cancelled.', await said());
        await key('m', 500);
        await key('m', 500);
        check('M on the picked block cancels', await said() === 'Move cancelled.', await said());
        await t.goTo('when green flag clicked');
        await key('m', 500);
        await t.goTo('move 10 steps');
        await key('m', 900);
        check('a refused move gives the reason', /^Not done\. "when green flag clicked" starts a script/.test(await said()),
            await said());
        await key('Escape', 500);
        for (let i = 0; i < 3; i++) await key('Control+z', 800);
        await t.pause(800);
        check('undo reverses all the moves', await data() === before);
        // A whole script moves from its heading.
        await t.run({op: 'insert', block: 'control_forever'});
        await t.goTo('Script 1 of 2: when green flag clicked');
        await key('m', 500);
        await t.goTo('no blocks inside');
        await key('m', 900);
        check('a script cannot go where a hat is not allowed', /^Not done/.test(await said()), await said());
        await key('Escape', 400);
    });

    await group('wrap', async t => {
        const {page, key, type, said, items, data} = t;
        await t.sample();
        await key('Alt+Shift+KeyO', 600);
        const before = await data();
        await t.goTo('wait 1 second');
        await key('w', 600);
        const options = await page.$$eval('dialog [role="option"]', els => els.map(e => e.textContent));
        check('W lists the loops and conditions, each named differently',
            options.length === 5 && new Set(options).size === 5, options.join(' / '));
        check('axe: wrap list', (await t.axe()).length === 0, (await t.axe()).join('; '));
        await type('repeat 10');
        await key('Enter', 900);
        check('W wraps one block', await said() === 'Put wait 1 second inside repeat 10', await said());
        await key('Control+z', 1200);
        await t.goTo('move 10 steps');
        await key('Shift+W', 600);
        await type('forever');
        await key('Enter', 900);
        check('Shift+W wraps the rest of the stack',
            await said() === 'Put 3 blocks, starting with move 10 steps, inside forever', await said());
        console.log((await items()).map(i => `       ${i}`).join('\n'));
        await key('Control+z', 1200);
        await t.goTo('Script 1 of 1: when green flag clicked');
        await key('w', 600);
        await type('if then');
        await key('Enter', 900);
        check('W on a script wraps all but its first block',
            /^Put 3 blocks, starting with move 10 steps, inside if empty then$/.test(await said()), await said());
        await key('Control+z', 1500);
        check('undo restores the data exactly', await data() === before);
    });

    await group('variables, lists and messages', async t => {
        const {page, key, type, said, focused, data, pause} = t;
        await t.sample();
        await key('Alt+Shift+KeyO', 600);
        const make = async (name, kind, scope) => {
            await key('v', 600);
            await type(name);
            await page.locator('dialog select[name="kind"]').selectOption(kind);
            if (scope) await page.locator('dialog select[name="scope"]').selectOption(scope);
            await page.locator('dialog button[type="submit"]').click();
            await pause(900);
        };
        await key('v', 600);
        check('V opens a labelled form', (await focused()).text === 'Name', JSON.stringify(await focused()));
        check('axe: new data form', (await t.axe()).length === 0, (await t.axe()).join('; '));
        await key('Enter', 500);
        check('an empty name is explained',
            /needs a name/.test(await page.locator('dialog [role="alert"]').textContent()));
        await key('Escape', 400);
        await make('score', 'variable');
        check('create a variable', await said() === 'Created variable score, for all sprites', await said());
        await make('Score', 'variable');
        check('a taken name is refused in the form',
            /already a variable called "Score"/.test(await page.locator('dialog [role="alert"]').textContent()));
        await key('Escape', 400);
        await make('lives', 'variable', 'sprite');
        check('create a variable for one sprite',
            await said() === 'Created variable lives, for this sprite only', await said());
        await make('fruit', 'list');
        check('create a list', await said() === 'Created list fruit, for all sprites', await said());
        await make('game over', 'message');
        check('create a message', /^Created message game over\./.test(await said()), await said());
        // The new names can be used, from the keyboard.
        await t.goTo('say Hello!');
        await key('i');
        await type('broadcast');
        await key('Enter', 900);
        await key('Enter', 600);
        const messages = await page.$$eval('dialog select option', els => els.map(e => e.textContent));
        check('the new message is offered', messages.includes('game over'), messages.join(' / '));
        await key('Escape', 400);
        check('use the new message', (await t.items()).some(i => /broadcast game over/.test(i)));
        // The value editor can change which message a block uses.
        await make('start', 'message');
        await t.goTo('broadcast game over');
        await key('Enter', 600);
        await page.locator('dialog select').selectOption('start');
        await page.locator('dialog button[type="submit"]').click();
        await pause(900);
        check('choose another new message', /Changed: broadcast start/.test(await said()), await said());
        await key('Control+z', 900);
        await t.goTo('broadcast game over');
        await t.run({op: 'insert', block: 'data_setvariableto', args: {VARIABLE: 'score'},
            after: (await focused()).id});
        await t.run({op: 'insert', block: 'data_addtolist', args: {LIST: 'fruit'}, after: (await focused()).id});
        const rename = async (label, to) => {
            await key('Shift+V', 600);
            const value = await page.$eval('dialog select[name="item"]', (select, wanted) =>
                Array.from(select.options).find(o => o.textContent.startsWith(wanted))?.value, label);
            await page.locator('dialog select[name="item"]').selectOption(value);
            await page.locator('dialog input[name="to"]').fill(to);
            await page.locator('dialog button[type="submit"]').click();
            await pause(1200);
        };
        const before = await data();
        await rename('variable score', 'points');
        check('rename a variable', await said() === 'Renamed variable score to points', await said());
        check('blocks show the new name', (await t.items()).some(i => /set points to 0/.test(i)),
            (await t.items()).join(' / '));
        await rename('list fruit', 'food');
        await rename('message game over', 'the end');
        check('rename a message', await said() === 'Renamed message game over to the end', await said());
        check('blocks show the new message', (await t.items()).some(i => /broadcast the end/.test(i)));
        for (let i = 0; i < 3; i++) await key('Control+z', 1000);
        check('undo reverses the renames exactly', await data() === before, await said());
        for (let i = 0; i < 3; i++) await key('Control+y', 1000);
        check('redo applies them again', (await t.items()).some(i => /broadcast the end/.test(i)));
        // Blocks view: the flyout and the drawn blocks use the new names.
        await key('Alt+Shift+KeyO', 900);
        await page.locator('.blocklyToolboxCategoryContainer#variables').click();
        await pause(1500);
        const flyout = await page.$eval('.blocklyFlyout', e => e.textContent.replace(/ /g, ' '));
        check('the palette lists the variables', /points/.test(flyout) && /lives/.test(flyout) && /food/.test(flyout),
            flyout.slice(-260));
        await page.screenshot({path: path.join(out, 'variables.png')});
        const canvas = await page.$eval('.blocklySvg .blocklyBlockCanvas', e => e.textContent.replace(/ /g, ' '));
        check('the workspace shows the new names', /points/.test(canvas) && /the end/.test(canvas), canvas);
        // Saved with the project.
        const saved = await page.evaluate(async () => {
            await window.vm.loadProject(await (await window.vm.saveProjectSb3()).arrayBuffer());
            return window.vm.runtime.targets.flatMap(target => Object.values(target.variables).map(v => v.name));
        });
        check('names are saved with the project', ['points', 'lives', 'food', 'the end'].every(n => saved.includes(n)),
            saved.join(', '));
        await page.evaluate(() => window.vm.greenFlag());
        await pause(2500);
        check('the program runs after renaming', await page.evaluate(() => Object.values(
            window.vm.runtime.getTargetForStage().variables).find(v => v.name === 'food')?.value.length > 0));
    });

    await group('actions: where am I and what can I do', async t => {
        const {page, key, said, pause} = t;
        const heard = async () => {
            await pause(500);
            return said();
        };
        const command = async text => {
            await key('Alt+Shift+KeyK', 500);
            await t.type(text);
            await key('Enter', 900);
            return said();
        };
        await t.sample();
        await page.evaluate(() => document.activeElement.blur());
        await key('Alt+Shift+KeyW', 600);
        check('where am I, with nothing focused', /^Nothing has keyboard focus\. Sprite Sprite1 is selected\. Blocks view\./
            .test(await said()), await said());
        await page.locator('.blocklyToolboxCategoryContainer#motion').focus();
        await key('Alt+Shift+KeyW', 600);
        check('where am I, in the palette', /^You are in the block palette, on Motion, tree item\./.test(await said()),
            await said());
        await key('Alt+Shift+KeyO', 900);
        await t.goTo('move 10 steps');
        await key('Alt+Shift+KeyW', 600);
        check('where am I, in the outline',
            /^You are in the scripts area, on move 10 steps, tree item\..*Outline view\. In the outline: move 10 steps, level 2, 2 of 4, in script 1 of 1\. The project is stopped\./
                .test(await said()), await said());
        let answer = await command('where am I?');
        check('typed "where am I" reports where focus was', /on move 10 steps, tree item/.test(answer), answer);
        check('focus is back where it was', (await t.focused()).text === 'move 10 steps');

        answer = await command('what can I do here');
        check('what can I do here, in the outline', /^Here you can: .*add block \(I\).*Anywhere you can: .*where am I \(Alt\+Shift\+W\)/
            .test(answer), answer);
        await page.locator('header select').focus();
        await key('Alt+Shift+KeyH', 600);
        answer = await said();
        check('outline shortcuts are not offered from the menu',
            answer.startsWith('Anywhere you can:') && /add block,/.test(answer) && !/add block \(I\)/.test(answer), answer);
        await key('Alt+Shift+KeyW', 600);
        check('where am I, in the menu', /^You are in the menu bar, on Language, drop-down\./.test(await said()),
            await said());

        answer = await command('read program');
        check('read program', answer === 'When green flag clicked: move 10 steps, wait 1 second, say Hello!.', answer);

        await page.locator('[data-brailled-outline] [tabindex="0"]').focus();
        await t.goTo('move 10 steps');
        answer = await command('next');
        check('next in the outline', answer === 'wait 1 second. Level 2, 3 of 4.', answer);
        check('next moves focus', (await t.focused()).text === 'wait 1 second');
        answer = await command('previous');
        check('previous in the outline', answer === 'move 10 steps. Level 2, 2 of 4.', answer);

        await t.goTo('say Hello!');
        await key('Delete', 900);
        answer = await command('undo');
        check('typed undo', answer === 'Undone. Deleted: say Hello!', answer);
        answer = await command('redo');
        check('typed redo', answer === 'Redone. Deleted: say Hello!', answer);

        const zoneOf = () => page.evaluate(() => {
            const e = document.activeElement;
            return e.closest('[data-brailled-zone="palette"]') ? 'palette' :
                e.dataset.brailledStageTab || e.closest('header,aside,main')?.tagName.toLowerCase();
        });
        for (const [text, zone, spoken] of [
            ['go to menu', 'header', 'Menu bar.'],
            ['go to the stage', 'aside', 'Stage area.'],
            ['go to devices', 'devices', 'Devices tab.'],
            ['go to sprites', 'sprites', 'Sprites tab.'],
            ['go to background', 'background', 'Background tab.'],
            ['go to scripts', 'main', 'Scripts area.'],
            ['go to block palette', 'palette', 'Block categories.'],
            ['go to menu', 'header', 'Menu bar.'],
            ['go to block palette', 'palette', 'Block categories.'],
            ['show outline', 'main', 'Outline view.'],
            ['go to block palette', 'palette', 'Block categories.']
        ]) {
            answer = await command(text);
            check(text, await zoneOf() === zone && answer === spoken, `${await zoneOf()} / ${answer}`);
        }
        await command('go to devices');
        await key('Alt+Shift+KeyW', 600);
        check('where am I reports the device mode', /Live mode\. No device connected\./.test(await said()), await said());
        answer = await command('next');
        check('next outside the outline moves between controls', /, (tab|button|radio button|link|text field)\.$/
            .test(answer), answer);

        answer = await command('add block');
        check('an action that needs the outline says so', /^Switch to the Outline view first/.test(answer), answer);
        answer = await command('show python');
        check('Python is coming soon', answer === 'The Python view is coming soon.', answer);
        await command('show outline');
        check('show outline', await page.locator('[data-brailled-outline]').isVisible());

        await page.evaluate(() => {
            window.brailled.run({op: 'insert', block: 'control_forever'});
        });
        await pause(800);
        await page.locator('[data-brailled-outline] [tabindex="0"]').focus();
        await t.goTo('forever');
        answer = await command('run');
        const running = await page.evaluate(() => window.brailledApp.snapshot().project.running);
        check('typed run starts the project', answer === 'Project started.', answer);
        await page.evaluate(() => {
            const blocks = window.vm.editingTarget.blocks;
            const loop = Object.values(blocks._blocks).find(b => b.opcode === 'control_forever');
            window.brailled.run({op: 'insert', block: 'event_whenflagclicked'});
            window.brailled.run({op: 'move', block: loop.id,
                after: Object.values(blocks._blocks).filter(b => b.opcode === 'event_whenflagclicked').pop().id});
            window.vm.greenFlag();
        });
        await pause(800);
        check('the snapshot knows the project is running',
            await page.evaluate(() => window.brailledApp.snapshot().project.running), String(running));
        answer = await command('stop');
        check('typed stop', answer === 'Project stopped.' &&
            !await page.evaluate(() => window.brailledApp.snapshot().project.running), answer);

        const snapshot = await page.evaluate(() => ({data: window.brailledApp.snapshot(),
            text: window.brailledApp.snapshotText()}));
        check('snapshot data', snapshot.data.sprite.name === 'Sprite1' && snapshot.data.view.scripts === 'outline' &&
            snapshot.data.device.mode === 'live' && snapshot.data.actions.length > 20 && !!snapshot.data.outline);
        check('snapshot text is compact', snapshot.text.split('\n').length <= 10 && snapshot.text.length < 1500,
            `${snapshot.text.length} characters`);
        console.log(snapshot.text.split('\n').map(line => `       ${line}`).join('\n'));

        await key('Alt+Shift+KeyK', 500);
        check('axe: command box', (await t.axe()).length === 0, (await t.axe()).join('; '));
        await t.type('make me a sandwich');
        await key('Enter', 500);
        check('an unknown command is explained in the box',
            /I do not understand "make me a sandwich"/.test(await page.locator('dialog [role="alert"]').textContent()));
        await key('Escape', 500);

        await page.getByRole('tab', {name: 'Costumes'}).click();
        await pause(800);
        await page.getByRole('tab', {name: 'Costumes'}).focus();
        await key('Alt+Shift+KeyW', 600);
        check('answers are heard on the Costumes tab', /Costumes tab\./.test(await heard()) &&
            await page.locator('[data-brailled-announcer]').evaluate(el => !!el.offsetParent), await said());
        await command('open sprite library');
        check('open sprite library', await page.locator('.ReactModal__Content').count() === 1);
    });

    await group('voice input', async t => {
        const {page, key, pause} = t;
        const bar = page.locator('[data-brailled-zone="voice"]');
        const button = bar.locator('button');
        const phase = () => bar.getAttribute('data-voice-phase');
        const status = () => bar.locator('[data-voice-status]').textContent();
        const transcript = () => bar.locator('[data-voice-transcript]').textContent();
        const requests = () => page.evaluate(() => window.speech.requests.length);
        const will = (text, confidence = 0.95) => page.evaluate(say => {
            Object.assign(window.speech, {say, error: null});
        }, text === null ? null : [text, confidence]);
        // Hold F2, "say" the words, let go.
        const say = async (text, confidence) => {
            await will(text, confidence);
            await page.keyboard.down('F2');
            await pause(600);
            await page.keyboard.up('F2');
            await pause(1100);
            return t.said();
        };
        const onItem = async () => (await t.focused()).text;
        const toItem = async text => {
            await page.locator('[data-brailled-outline] [tabindex="0"]').focus();
            await t.goTo(text);
        };

        const boxes = await page.evaluate(() => ['header', 'main', 'aside', '[data-brailled-zone="voice"]']
            .map(selector => document.querySelector(selector).getBoundingClientRect().toJSON()));
        const [, main, aside, voice] = boxes;
        check('the voice bar is across the bottom, covering nothing', voice.bottom === 768 && voice.width === 1366 &&
            main.bottom <= voice.top + 0.5 && aside.bottom <= voice.top + 0.5, `${main.bottom} ${voice.top}`);
        check('it says how to talk, and where sound may go', /Hold F2, or this button.*online service/.test(await status()));
        check('the microphone is not opened on its own', await requests() === 0 && await phase() === 'idle');
        check('axe: voice bar', (await t.axe('[data-brailled-zone="voice"]')).length === 0,
            (await t.axe('[data-brailled-zone="voice"]')).join('; '));

        await t.sample();
        await key('Alt+Shift+KeyO', 900);
        await toItem('move 10 steps');
        await will('Where am I?');
        await page.keyboard.down('F2');
        await pause(600);
        check('holding F2 listens', await phase() === 'listening' &&
            await button.getAttribute('aria-pressed') === 'true' && /^Listening\. Let go/.test(await status()));
        await page.keyboard.up('F2');
        await pause(1100);
        check('letting go stops listening', await phase() === 'idle' &&
            await page.evaluate(() => window.speech.requests.at(-1).stopped));
        check('a spoken command is echoed and answered',
            /^I heard: Where am I\. You are in the scripts area, on move 10 steps/.test(await t.said()), await t.said());
        check('what was heard is shown large', await transcript() === 'I heard: Where am I.' &&
            await bar.locator('[data-voice-transcript]').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 24));
        check('the reply is shown', await status() === await t.said());

        await say('next');
        check('spoken "next" moves in the outline', await onItem() === 'wait 1 second', await onItem());
        await toItem('say Hello!');
        let answer = await say('delete block');
        check('spoken edit command', answer.startsWith('I heard: delete block. Deleted: say Hello!') &&
            !(await t.items()).some(item => item.includes('say Hello!')), answer);
        answer = await say('undo');
        check('spoken undo', /^I heard: undo\. Undone\./.test(answer) &&
            (await t.items()).some(item => item.includes('say Hello!')), answer);

        // The button, with a mouse.
        await toItem('move 10 steps');
        await will('next');
        await button.hover();
        await page.mouse.down();
        await pause(600);
        check('holding the button listens', await phase() === 'listening');
        check('pressing the button leaves focus where it was', await onItem() === 'move 10 steps');
        await page.mouse.up();
        await pause(1100);
        check('letting go of the button runs the command', await onItem() === 'wait 1 second', await onItem());

        await will('next');
        await button.click();
        await pause(500);
        check('a tap listens for one phrase', await phase() === 'listening' && /Speak now/.test(await status()));
        await page.evaluate(() => window.speech.requests.at(-1).phrase());
        await pause(1100);
        check('the phrase ends listening and runs', await phase() === 'idle' && await onItem() === 'say Hello!',
            await onItem());

        await button.evaluate(el => el.click());
        await pause(300);
        check('a click with no press, as screen readers send, listens', await phase() === 'listening');
        await key('Escape', 500);
        check('Escape stops listening', await phase() === 'idle' && /Stopped listening/.test(await status()) &&
            await page.evaluate(() => window.speech.requests.at(-1).aborted));

        // The button, with the keyboard: commands act where focus was before.
        await toItem('move 10 steps');
        await button.focus();
        await will('next');
        await page.keyboard.down('Space');
        await pause(600);
        check('holding Space on the button listens', await phase() === 'listening');
        await page.keyboard.up('Space');
        await pause(1100);
        check('and acts where focus was before', await onItem() === 'wait 1 second' && await phase() === 'idle',
            `${await onItem()} / ${await t.said()} / ${await page.evaluate(() => document.activeElement.tagName)}`);

        await toItem('say Hello!');
        await button.focus();
        await will('delete block');
        await page.keyboard.down('Space');
        await pause(600);
        await page.keyboard.up('Space');
        await pause(1100);
        check('after an edit from the button, focus is back in the outline',
            !(await t.items()).some(item => item.includes('say Hello!')) && await onItem() === 'wait 1 second',
            `${await onItem()} / ${await t.said()}`);
        await say('undo');

        const before = await requests();
        await will('next');
        await key('F2', 600);
        check('a short press of F2 explains holding', /Hold F2 down while you speak/.test(await t.said()) &&
            await requests() === before + 1, await t.said());

        // Doubtful words are confirmed first.
        await toItem('say Hello!');
        const program = await t.data();
        await say('delete block', 0.4);
        const dialog = page.locator('dialog');
        check('low confidence asks first', await dialog.count() === 1 &&
            /I heard: delete block\. I am not sure/.test(await dialog.locator('h2').textContent()));
        check('"No" has focus', (await t.focused()).text.trim() === 'No', (await t.focused()).text);
        check('nothing has changed while asking', await t.data() === program);
        check('axe: voice question', (await t.axe()).length === 0, (await t.axe()).join('; '));
        await key('Enter', 900);
        check('"No" does nothing and returns focus', await dialog.count() === 0 && await t.data() === program &&
            await onItem() === 'say Hello!' && await t.said() === 'Nothing was done.', await t.said());
        await say('delete block', 0);
        check('unmeasured confidence asks too', await dialog.count() === 1);
        await will('maybe', 0.9);
        await page.keyboard.down('F2');
        await pause(600);
        check('nothing in the question is announced while listening',
            await dialog.locator('[role="status"]').textContent() === '');
        await page.keyboard.up('F2');
        await pause(900);
        await say('maybe', 0.9);
        check('other words keep the question', await dialog.count() === 1 &&
            /Say yes or no/.test(await dialog.locator('[role="status"]').textContent()) && await t.data() === program);
        await say('yes', 0.95);
        await pause(500);
        check('a spoken "yes" carries it out', await dialog.count() === 0 &&
            !(await t.items()).some(item => item.includes('say Hello!')), await t.said());
        await say('undo', 0.5);
        await dialog.getByRole('button', {name: 'Yes, go ahead'}).click();
        await pause(1100);
        check('the "Yes" button carries it out', (await t.items()).some(item => item.includes('say Hello!')));
        await say('delete block', 0.5);
        await key('Escape', 900);
        check('Escape answers no', await dialog.count() === 0 && await t.data() === program);

        answer = await say('make me a sandwich');
        check('other words get an answer and change nothing', /not a command I know.*AI helper is not available/
            .test(answer) && await t.data() === program, answer);

        for (const [error, message] of [
            ['not-allowed', /The microphone is blocked.*Alt\+Shift\+K/],
            ['audio-capture', /No microphone was found/],
            ['no-speech', /I did not hear anything/],
            ['network', /speech service cannot be reached/]
        ]) {
            await page.evaluate(value => {
                window.speech.error = value;
            }, error);
            await page.keyboard.down('F2');
            await pause(600);
            await page.keyboard.up('F2');
            await pause(500);
            check(`${error} is explained, aloud and on screen`, message.test(await status()) &&
                message.test(await t.said()) && await phase() === 'idle', await status());
        }
        await page.evaluate(() => {
            window.speech.error = null;
        });

        const count = await requests();
        await key('Alt+Shift+KeyK', 500);
        await key('F2', 400);
        check('F2 does nothing while another dialog is open', await requests() === count);
        await t.type('go to voice bar');
        await key('Enter', 900);
        check('go to voice bar', await button.evaluate(el => el === document.activeElement) &&
            await t.said() === 'Voice bar.', await t.said());
        await key('Alt+Shift+KeyH', 600);
        check('what can I do here lists talking', /talk \(hold F2\)/.test(await t.said()), await t.said());

        await will(null);
        await page.keyboard.down('F2');
        await pause(500);
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await pause(500);
        check('leaving the window stops listening', await phase() === 'idle' &&
            /left the window/.test(await status()));
        await page.keyboard.up('F2');

        await toItem('move 10 steps');
        answer = await say('run');
        check('spoken "run"', answer === 'I heard: run. Project started.', answer);
    }, {init: fakeSpeech});

    await group('voice unavailable', async t => {
        const {page, key} = t;
        const bar = page.locator('[data-brailled-zone="voice"]');
        const status = () => bar.locator('[data-voice-status]').textContent();
        check('an unsupported browser is told at once', /cannot turn speech into text.*Alt\+Shift\+K/
            .test(await status()) && await bar.locator('button').getAttribute('aria-disabled') === 'true');
        await key('F2', 700);
        check('pressing F2 says so aloud', /cannot turn speech into text/.test(await t.said()), await t.said());
        await bar.locator('button').click({force: true});
        await t.pause(500);
        check('pressing the button listens to nothing', await bar.getAttribute('data-voice-phase') === 'idle');
        await key('Alt+Shift+KeyK', 500);
        await t.type('go to menu');
        await key('Enter', 900);
        check('typed commands still work', await t.said() === 'Menu bar.', await t.said());
    }, {init: noSpeech});

    check('no page, workspace or Brailled errors', errors.length === 0, errors.slice(0, 4).join(' || '));
    console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed; screenshots in ${out}`);
    await browser.close();
    if (!results.every(Boolean)) process.exitCode = 1;
})().catch(e => {
    console.error(e);
    process.exit(1);
});
