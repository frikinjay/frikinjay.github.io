// Registry suggestions: vanilla IDs for the selected version plus IDs found in uploaded mod jars, datapacks and villager packs.
const REGISTRIES = ['item', 'block', 'worldgen/structure', 'worldgen/biome', 'enchantment', 'potion', 'mob_effect', 'instrument', 'jukebox_song',
    'trim_material', 'trim_pattern', 'villager_type', 'villager_profession', 'point_of_interest_type', 'banner_pattern'];
const TAGS = ['worldgen/structure', 'worldgen/biome', 'item', 'block'];
const vanilla = new Map();
const modded = Object.fromEntries([...REGISTRIES, ...TAGS.map(t => 'tag/' + t)].map(key => [key, new Set()]));
const sources = [];
let version = null;

const listId = key => 'reg-' + key.replace(/[^a-z]+/g, '-');

async function loadVanilla(ver) {
    if (vanilla.has(ver)) return vanilla.get(ver);
    const branch = `${ver}-summary`;
    const base = `https://raw.githubusercontent.com/misode/mcmeta/${branch}`;
    const promise = (async () => {
        const out = {};
        try {
            const data = await (await fetch(`${base}/registries/data.json`)).json();
            for (const key of REGISTRIES) out[key] = (data[key] || []).map(id => 'minecraft:' + id);
        } catch (error) { /* offline: mod entries still work */ }
        await Promise.all(TAGS.map(async tag => {
            try {
                const data = await (await fetch(`${base}/data/tag/${tag}/data.json`)).json();
                out['tag/' + tag] = (Array.isArray(data) ? data : Object.keys(data)).map(id => '#minecraft:' + id);
            } catch (error) { out['tag/' + tag] = []; }
        }));
        return out;
    })();
    vanilla.set(ver, promise);
    return promise;
}

function render(data) {
    for (const key of Object.keys(modded)) {
        let list = document.getElementById(listId(key));
        if (!list) { list = document.createElement('datalist'); list.id = listId(key); document.body.appendChild(list); }
        const values = [...new Set([...modded[key], ...(data[key] || [])])].sort();
        list.innerHTML = values.map(v => `<option value="${v}"></option>`).join('');
    }
}

async function refresh() {
    const current = (document.querySelector('input[name="mc-version"]:checked') || {}).value || '26.3';
    version = current;
    render(await loadVanilla(current));
}

async function addArchive(file) {
    const JSZip = window.JSZip || await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => resolve(window.JSZip); script.onerror = reject; document.head.appendChild(script);
    });
    const zip = await JSZip.loadAsync(file);
    let packNamespace = null;
    const config = zip.file('villagerapi_config.json');
    if (config) { try { packNamespace = JSON.parse(await config.async('string')).namespace; } catch (error) { /* ignore */ } }
    let count = 0;
    const add = (key, id) => { if (!modded[key].has(id)) { modded[key].add(id); count++; } };
    const rules = [
        [/^assets\/([^/]+)\/(?:models\/item|items)\/(.+)\.json$/, 'item'],
        [/^assets\/([^/]+)\/blockstates\/(.+)\.json$/, 'block'],
        [/^data\/([^/]+)\/worldgen\/structure\/(.+)\.json$/, 'worldgen/structure'],
        [/^data\/([^/]+)\/worldgen\/biome\/(.+)\.json$/, 'worldgen/biome'],
        [/^data\/([^/]+)\/enchantment\/(.+)\.json$/, 'enchantment'],
        [/^data\/([^/]+)\/trim_material\/(.+)\.json$/, 'trim_material'],
        [/^data\/([^/]+)\/trim_pattern\/(.+)\.json$/, 'trim_pattern'],
        [/^data\/([^/]+)\/jukebox_song\/(.+)\.json$/, 'jukebox_song'],
        [/^data\/([^/]+)\/instrument\/(.+)\.json$/, 'instrument'],
        [/^data\/([^/]+)\/banner_pattern\/(.+)\.json$/, 'banner_pattern'],
        [/^data\/([^/]+)\/tags\/worldgen\/structure\/(.+)\.json$/, 'tag/worldgen/structure', '#'],
        [/^data\/([^/]+)\/tags\/worldgen\/biome\/(.+)\.json$/, 'tag/worldgen/biome', '#'],
        [/^data\/([^/]+)\/tags\/items?\/(.+)\.json$/, 'tag/item', '#'],
        [/^data\/([^/]+)\/tags\/blocks?\/(.+)\.json$/, 'tag/block', '#']
    ];
    for (const path of Object.keys(zip.files)) {
        for (const [pattern, key, prefix = ''] of rules) {
            const m = path.match(pattern);
            if (m && !m[2].includes('/') || (m && key.startsWith('tag/'))) { add(key, `${prefix}${m[1]}:${m[2]}`); break; }
        }
        const pack = path.match(/^villagers\/(types|professions|poi_types)\/(.+)\.json$/);
        if (pack) {
            const ns = packNamespace || 'custom';
            const name = pack[2].split('/').pop();
            add(pack[1] === 'types' ? 'villager_type' : pack[1] === 'professions' ? 'villager_profession' : 'point_of_interest_type', `${ns}:${name}`);
        }
    }
    sources.push({ name: file.name, count });
    render(await loadVanilla(version || '26.3'));
    return count;
}

// Which list each input should use, by its field name or editor path.
const FIELD_LISTS = {
    block: 'block', profession: 'villager_profession', poiType: 'point_of_interest_type', villageType: 'worldgen/structure', copyFromCustom: 'worldgen/structure'
};
function listFor(input) {
    const field = input.dataset.field, path = input.dataset.path || '';
    if (field && FIELD_LISTS[field]) return FIELD_LISTS[field];
    if (/\.(wants|extra|gives)\.id$/.test(path) || /\.entries\.\d+\.item$/.test(path)) return 'item';
    if (/^values\.\d+$/.test(path)) return 'worldgen/structure';
    if (/\.potion$/.test(path)) return 'potion';
    if (/\.song$/.test(path)) return 'jukebox_song';
    if (/props\.\d+\.id$/.test(path)) return 'instrument';
    if (/\.material$/.test(path)) return 'trim_material';
    if (/\.pattern$/.test(path)) return 'trim_pattern';
    if (/\.options$/.test(path)) return 'tag/item';
    return null;
}
function attach(root) {
    root.querySelectorAll('input[type="text"], input:not([type])').forEach(input => {
        const current = input.getAttribute('list');
        if (current && current !== 'je-items') return;
        const key = listFor(input);
        if (key) input.setAttribute('list', listId(key));
    });
}

new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(n => n.nodeType === 1 && attach(n)))).observe(document.body, { childList: true, subtree: true });
document.addEventListener('change', e => { if (e.target.name === 'mc-version') refresh(); });

function mountUpload() {
    const host = document.getElementById('mod-sources');
    if (!host) return;
    const input = host.querySelector('input[type="file"]'), list = host.querySelector('[data-mod-list]');
    input.addEventListener('change', async () => {
        for (const file of input.files) {
            try {
                const count = await addArchive(file);
                if (window.Site) window.Site.toast(`${file.name}: ${count} IDs added to suggestions`);
            } catch (error) {
                if (window.Site) window.Site.toast(`${file.name} could not be read`, 'error');
            }
        }
        input.value = '';
        list.innerHTML = sources.map(s => `<li>${s.name.replace(/[<>&]/g, '')} <span>${s.count} IDs</span></li>`).join('');
    });
}

attach(document.body);
mountUpload();
refresh();
window.Registry = { addArchive, refresh, lists: () => modded };
