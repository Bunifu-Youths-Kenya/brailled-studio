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

const results = [];
const check = (name, ok, detail = '') => {
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  [${detail}]` : ''}`);
};

(async () => {
    const browser = await chromium.launch({executablePath});
    const errors = [];
    // Each group of checks starts from a fresh editor, so that one failure cannot cascade into the others.
    const group = async (title, fn) => {
        console.log(`--- ${title}`);
        const page = await browser.newPage({viewport: {width: 1366, height: 768}, acceptDownloads: true});
        page.setDefaultTimeout(15000);
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
            axe: async () => {
                await page.addScriptTag({path: path.join(repo, 'node_modules/axe-core/axe.min.js')});
                return page.evaluate(async () => (await window.axe.run('dialog')).violations
                    .map(v => `${v.id}: ${v.nodes.map(n => n.html.slice(0, 120)).join(' ')}`));
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

    check('no page, workspace or Brailled errors', errors.length === 0, errors.slice(0, 4).join(' || '));
    console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed; screenshots in ${out}`);
    await browser.close();
    if (!results.every(Boolean)) process.exitCode = 1;
})().catch(e => {
    console.error(e);
    process.exit(1);
});
