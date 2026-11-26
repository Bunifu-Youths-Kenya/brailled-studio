/*
 * What a proposal was made about: the project's programs and names, and where the student is working. If either
 * changes, the proposal is cancelled. Running a project, which moves sprites and changes values, changes neither.
 */
const POSITION = ['x', 'y'];

const programOf = target => Object.values(target.blocks?._blocks || {}).map(block => Object.fromEntries(
    Object.entries(block).filter(([key]) => !POSITION.includes(key))));

const fingerprint = app => {
    const {vm} = app;
    const targets = vm.runtime.targets.filter(target => target.isOriginal !== false).map(target => ({
        id: target.id,
        name: target.sprite?.name,
        blocks: programOf(target),
        items: Object.values(target.variables || {}).map(item => [item.id, item.name, item.type])
    }));
    const gui = app.gui();
    return JSON.stringify({
        targets,
        sprite: vm.editingTarget?.id,
        tab: gui?.tab,
        view: gui?.view,
        block: app.outline()?.currentBlock() ?? null
    });
};

export {
    fingerprint
};
