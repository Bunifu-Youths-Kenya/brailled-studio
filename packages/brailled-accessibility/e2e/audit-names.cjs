// Finds controls with no accessible name, using Chrome's own accessibility tree, across the editor's screens.
// Usage, with the dev server running: npm run audit:names -- [url]
const path = require('path');
const {chromium} = require('playwright-chromium');

const url = process.argv[2] || 'http://localhost:8601/';
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';

// Roles that people operate, which each need a name. Anything else that takes focus needs one too.
const CONTROLS = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio',
    'slider', 'spinbutton', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
    'treeitem', 'dialog']);

// What cannot be named from this repository; see README. Anything else is a failure.
const EXPECTED = [
    // Invisible guards that keep focus inside a menu or dialog.
    'data-radix-focus-guard',
    'data-react-modal-body-trap',
    // The block library's own containers and block shapes.
    'blocklyWidgetDiv',
    'class="blocklyPath'
];

const unnamed = new Map();
const mouseOnly = new Map();
const visited = [];

// Generated class names end in a hash.
const describeNode = html => html.replace(/_[A-Za-z0-9+/-]{5}(?=["\s])/g, '');

(async () => {
    const browser = await chromium.launch({executablePath});
    const page = await browser.newPage({viewport: {width: 1366, height: 768}});
    page.setDefaultTimeout(8000);
    // Leaving the page is allowed, as it is reloaded below; other prompts are turned down.
    page.on('dialog', d => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()));
    const cdp = await page.context().newCDPSession(page);
    const pause = (ms = 800) => page.waitForTimeout(ms);

    const audit = async screen => {
        visited.push(screen);
        await cdp.send('DOM.getDocument', {depth: -1});
        const {nodes} = await cdp.send('Accessibility.getFullAXTree');
        for (const node of nodes) {
            const role = node.role?.value;
            const focusable = node.properties?.some(p => p.name === 'focusable' && p.value.value);
            const interesting = CONTROLS.has(role) || (focusable && role !== 'RootWebArea');
            if (node.ignored || !interesting || (node.name?.value || '').trim()) continue;
            if (!node.backendDOMNodeId) continue;
            let html;
            try {
                const {object} = await cdp.send('DOM.resolveNode', {backendNodeId: node.backendDOMNodeId});
                const result = await cdp.send('Runtime.callFunctionOn', {
                    objectId: object.objectId,
                    // Skip what is not on screen.
                    functionDeclaration: `function () {
                        const el = this.nodeType === 1 ? this : this.parentElement;
                        if (!el.getClientRects().length) return null;
                        return el.outerHTML.replace(/="data:[^"]*"/g, '="data:…"').slice(0, 400);
                    }`,
                    returnByValue: true
                });
                html = result.result.value;
            } catch {
                continue;
            }
            if (!html) continue;
            const key = `${role} ${describeNode(html).slice(0, 170)}`;
            if (!unnamed.has(key)) unnamed.set(key, screen);
        }
        // Things that look clickable but that a keyboard or screen reader cannot find.
        const found = await page.evaluate(() => {
            const operable = 'a[href],button,input,select,textarea,label,summary,[role],[tabindex]';
            return Array.from(document.querySelectorAll('body *')).filter(el => {
                if (el.closest(operable) && !el.closest('main, aside, header, [role="dialog"], dialog')
                    ?.isSameNode(el.closest(operable))) return false;
                if (el.querySelector(operable) || !el.getClientRects().length) return false;
                const style = getComputedStyle(el);
                if (style.visibility === 'hidden' || style.cursor !== 'pointer') return false;
                if (el.closest('svg.blocklySvg, svg.blocklyFlyout, .blocklyToolbox')) return false;
                const parent = el.parentElement;
                return getComputedStyle(parent).cursor !== 'pointer';
            }).map(el => el.outerHTML.replace(/="data:[^"]*"/g, '="data:…"').slice(0, 300));
        });
        for (const html of found) {
            const key = describeNode(html).slice(0, 170);
            if (!mouseOnly.has(key)) mouseOnly.set(key, screen);
        }
    };

    const screen = async (name, open, close) => {
        try {
            await open();
            await pause();
            await audit(name);
            if (close) await close();
            await pause(300);
        } catch (e) {
            console.log(`could not visit "${name}": ${e.message.split('\n')[0]}`);
            await page.keyboard.press('Escape');
            await pause(300);
        }
    };

    await page.goto(url, {waitUntil: 'load', timeout: 200000});
    await page.waitForFunction(() => window.vm && window.vm.editingTarget && window.brailled, null,
        {timeout: 150000});
    await page.waitForSelector('[data-brailled-workspace] .blocklyToolbox');
    await pause(2000);
    const button = name => page.getByRole('button', {name, exact: true}).first();

    // A new browser is asked whether a screen reader is used.
    await screen('first question', async () => {}, () => button('Yes, I use a screen reader').click());
    const escape = () => page.keyboard.press('Escape');
    const closeModal = async () => {
        await escape();
        await page.waitForSelector('.ReactModal__Content', {state: 'detached'});
    };

    await screen('code tab, blocks', async () => {});
    for (const menu of ['File menu', 'Edit menu', 'Settings menu']) {
        await screen(menu, () => button(menu).click(), async () => {
            await escape();
            await page.mouse.click(900, 600);
        });
    }
    await screen('sprite add menu', () => page.getByRole('button', {name: 'Choose a Sprite'}).first().hover(),
        () => page.mouse.move(700, 400));
    await screen('sprite context menu', () => page.locator('aside').getByRole('button', {name: /Sprite1/}).first()
        .click({button: 'right'}), () => page.mouse.click(900, 600));
    await screen('sprite library', () => page.getByRole('button', {name: 'Choose a Sprite'}).first().click(),
        closeModal);
    await screen('background tab', () => page.getByRole('tab', {name: 'Background'}).click());
    await screen('backdrop library', () => page.getByRole('button', {name: 'Choose a Backdrop'}).first().click(),
        closeModal);
    await screen('devices tab', () => page.getByRole('tab', {name: 'Devices'}).click(),
        () => page.getByRole('tab', {name: 'Sprites'}).click());
    await screen('extension library', () => button('Add Extension').click(), closeModal);
    await screen('examples library', () => button('Examples').click(), closeModal);
    await screen('make a variable', async () => {
        await page.locator('.blocklyToolboxCategoryContainer#variables').click();
        await pause();
        await page.locator('.blocklyFlyout').getByText('Make a Variable').click();
    }, closeModal);
    await screen('make a block', async () => {
        await page.locator('.blocklyToolboxCategoryContainer#myBlocks').click();
        await pause();
        await page.locator('.blocklyFlyout').getByText('Make a Block').click();
    }, async () => {
        await page.locator('.ReactModal__Content').getByRole('button', {name: 'Cancel'}).click();
    });
    await screen('question from the project', () => page.evaluate(
        () => window.vm.runtime.emit('QUESTION', 'Name?')),
    () => page.evaluate(() => window.vm.runtime.emit('QUESTION', null)));
    await screen('stage monitor', async () => {
        await page.locator('.blocklyToolboxCategoryContainer#variables').click();
        await pause(1200);
        const checkbox = page.locator('.blocklyFlyout .blocklyFlyoutCheckbox');
        const flyout = await page.locator('.blocklyFlyout').boundingBox();
        await page.mouse.move(flyout.x + 100, flyout.y + 200);
        // Scroll the palette until a variable's checkbox is on screen.
        for (let i = 0; i < 20; i++) {
            const boxes = await checkbox.evaluateAll(elements => elements
                .map(el => el.getBoundingClientRect().toJSON())
                .filter(r => r.y > 150 && r.bottom < 700));
            if (boxes.length > 0) {
                await page.mouse.click(boxes[0].x + 6, boxes[0].y + 6);
                break;
            }
            await page.mouse.wheel(0, 200);
            await pause(200);
        }
        await page.waitForSelector('[class*="monitor_monitor-container"]');
    });
    await screen('monitor menu', () => page.locator('[class*="monitor_monitor-container"]').first()
        .click({button: 'right'}), () => page.mouse.click(900, 600));
    await screen('number field on a block', async () => {
        await page.evaluate(() => window.brailled.run({op: 'insert', block: 'motion_movesteps'}));
        await pause();
        await page.locator('.blocklySvg .blocklyBlockCanvas').getByText('10', {exact: true}).first().click();
    }, escape);
    await screen('connection dialog', async () => {
        await button('Add Extension').click();
        await page.locator('.ReactModal__Content').getByText('micro:bit', {exact: true}).first().click();
        await pause(1500);
    }, async () => {
        await page.locator('.ReactModal__Content button[aria-label="Close"], .ReactModal__Content [class*="close-button"]')
            .first().click();
    });
    await screen('full screen stage', () => button('Enter full screen mode').click(),
        () => page.getByRole('button', {name: /exit full screen/i}).click());
    await screen('costumes tab (vector)', () => page.getByRole('tab', {name: 'Costumes'}).click());
    await screen('costumes tab (bitmap)', () => page.getByText('Convert to Bitmap').click());
    await screen('costume library', () => page.getByRole('button', {name: 'Choose a Costume'}).first().click(),
        closeModal);
    await screen('sounds tab', () => page.getByRole('tab', {name: 'Sounds'}).click());
    await screen('sound library', () => page.getByRole('button', {name: 'Choose a Sound'}).first().click(),
        closeModal);
    await screen('sound recorder', async () => {
        await page.getByRole('button', {name: 'Choose a Sound'}).first().hover();
        await page.getByRole('button', {name: 'Record'}).click();
    }, closeModal);
    await screen('outline', async () => {
        await page.getByRole('tab', {name: 'Code'}).click();
        await pause();
        await page.evaluate(() => window.brailled.run({op: 'insert', block: 'motion_movesteps'}));
        await page.getByRole('button', {name: 'Outline', exact: true}).click();
    });
    const focusItem = () => page.locator('[data-brailled-outline] [tabindex="0"]').focus();
    for (const [name, keys] of [['block list', ['i']], ['value editor', ['End', 'Enter']],
        ['new data form', ['v']], ['rename form', ['Shift+V']], ['command box', ['Alt+Shift+KeyK']]]) {
        await screen(name, async () => {
            await focusItem();
            for (const k of keys) await page.keyboard.press(k);
        }, escape);
    }

    await screen('voice settings', () => button('Voice settings').click(), escape);

    // The AI helper, switched on, with replies supplied here.
    let reply = null;
    await page.route('**/brailled-config.json', route => route.fulfill(
        {json: {voice: true, ai: true, aiEndpoint: '/audit-assistant'}}));
    await page.route('**/audit-assistant', route => route.fulfill({json: {reply}}));
    await page.reload({waitUntil: 'load', timeout: 200000});
    await page.waitForFunction(() => window.vm && window.vm.editingTarget && window.brailled, null,
        {timeout: 150000});
    await page.waitForSelector('[data-brailled-workspace] .blocklyToolbox');
    await pause(2000);
    const ask = async value => {
        reply = value;
        await page.keyboard.press('Alt+Shift+KeyK');
        await pause(500);
        await page.keyboard.type('tell me about loops');
        await page.keyboard.press('Enter');
        await page.waitForSelector('dialog [data-brailled-voice-dialog]');
        await pause(900);
    };
    await screen('AI notice', async () => {});
    await screen('AI question', () => ask({type: 'question', question: 'Which?', choices: ['One', 'Two']}), escape);
    await screen('AI explanation', () => ask({type: 'explanation', text: 'A loop repeats.'}), escape);
    const steps = [{command: {op: 'insert', block: 'motion_movesteps'}},
        {command: {op: 'insert', block: 'motion_turnright'}}];
    await screen('AI suggestion', () => ask({type: 'proposal', summary: 'Add two blocks.', steps}));
    await screen('AI suggestion, one step', () => button('One step at a time').click(), escape);
    await screen('settings with the AI helper on', () => button('Voice settings').click(), escape);

    console.log(`Screens visited (${visited.length}): ${visited.join(', ')}`);
    console.log(`\nControls with no accessible name: ${unnamed.size}`);
    for (const [key, where] of unnamed) console.log(`- [${where}] ${key}`);
    const unexpected = Array.from(unnamed.keys()).filter(key => !EXPECTED.some(known => key.includes(known)));
    console.log(`\nUnexpected: ${unexpected.length}`);
    unexpected.forEach(key => console.log(`- ${key}`));
    if (unexpected.length > 0 || visited.length < 40) process.exitCode = 1;
    console.log(`\nClickable elements with no role or keyboard access: ${mouseOnly.size}`);
    for (const [key, where] of mouseOnly) console.log(`- [${where}] ${key}`);
    await browser.close();
})().catch(e => {
    console.error(e);
    process.exit(1);
});
