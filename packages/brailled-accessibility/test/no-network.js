// No test may reach a real AI, or anything else on the network. Tests that need a reply supply their own.
globalThis.fetch = url => {
    throw new Error(`A test tried to reach the network: ${url}`);
};
