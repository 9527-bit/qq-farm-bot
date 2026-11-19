const protobuf = require('protobufjs');
const { getResourcePath } = require('../config/runtime-paths');
const aliases = require('../activity-data/adoption-proto-aliases.json');
const types = {};
let pending;
async function loadAdoptionProto() {
    if (!pending) pending = (async () => {
        const root = new protobuf.Root();
        await root.load(aliases.files.map(name => getResourcePath('proto', 'adoption', name)), { keepCase: true });
        root.resolveAll();
        for (const [alias, name] of Object.entries(aliases.types)) types[alias] = root.lookupType(name);
        for (const namespace of ['animalpb', 'homesteadpb', 'ranchpb']) {
            for (const type of root.lookup(`gamepb.${namespace}`).nestedArray) {
                if (type instanceof protobuf.Type) types[`Ranch${type.name}`] = type;
            }
        }
        return types;
    })().catch(error => { pending = null; throw error; });
    return pending;
}
module.exports = { types, loadAdoptionProto };
