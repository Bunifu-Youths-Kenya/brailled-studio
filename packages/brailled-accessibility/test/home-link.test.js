// The website's home page, which the logo in the menu bar leads to where the configuration gives its address.
import {createConfig} from '../src/config.js';

const homeFor = async homeUrl => {
    const config = createConfig(() => Promise.resolve({homeUrl}));
    await new Promise(resolve => setTimeout(resolve, 0));
    return config.get().homeUrl;
};

describe('the home page address', () => {
    test('may be a path on the same website', async () => {
        expect(await homeFor('/')).toBe('/');
        expect(await homeFor('/home/')).toBe('/home/');
    });

    test('may be an https address', async () => {
        expect(await homeFor('https://example.org/start')).toBe('https://example.org/start');
    });

    test.each([
        null, true, '', 'home', '//example.org', '/\\example.org', '/\t/example.org',
        'http://example.org', ['javascript', 'alert(1)'].join(':'), 'data:text/html,x'
    ])('is none for %p', async value => {
        expect(await homeFor(value)).toBeNull();
    });

    test('is none until the file has been read', () => {
        expect(createConfig(() => new Promise(() => {})).get().homeUrl).toBeNull();
    });
});
