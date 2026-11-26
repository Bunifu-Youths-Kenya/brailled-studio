// The sprites that can be added, found by name or by kind.

// The kinds offered, in order, where the library has them. Each is a tag that the library puts on sprites.
const CATEGORIES = ['animals', 'people', 'things', 'fantasy', 'food', 'sports', 'music', 'dance', 'fashion',
    'letters'];
// How many names are read at once.
const PAGE_SIZE = 5;

const createLibrary = items => {
    const inCategory = category => items.filter(item => item.tags?.includes(category));
    return {
        categories: () => CATEGORIES.filter(category => inCategory(category).length > 0),
        // The names on one page of a kind, starting from page 1.
        names: (category, page = 1) => inCategory(String(category).toLowerCase())
            .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
            .map(item => item.name),
        find: name => {
            const wanted = String(name).trim()
                .toLowerCase();
            return items.find(item => item.name.toLowerCase() === wanted) || null;
        }
    };
};

export {
    CATEGORIES,
    PAGE_SIZE,
    createLibrary
};
