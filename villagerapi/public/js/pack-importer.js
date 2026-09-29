// Loads an existing villager pack (zip, mod jar or folder) into the generator so it can be edited.
const CUBE_FACES = { north: 'front', south: 'back', east: 'left', west: 'right', up: 'top', down: 'bottom' };

async function loadZipLib() {
    if (window.JSZip) return window.JSZip;
    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
    return window.JSZip;
}

const toDataUrl = blob => new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(blob); });

// A reader exposes the pack's files relative to the folder that holds villagerapi_config.json.
async function zipReader(file) {
    const JSZip = await loadZipLib();
    let zip = await JSZip.loadAsync(file);
    let config = Object.keys(zip.files).find(p => p.endsWith('villagerapi_config.json'));
    if (!config) {
        for (const inner of Object.keys(zip.files).filter(p => /\.(zip|jar)$/i.test(p))) {
            const nested = await JSZip.loadAsync(await zip.file(inner).async('blob'));
            if (Object.keys(nested.files).some(p => p.endsWith('villagerapi_config.json'))) { zip = nested; break; }
        }
        config = Object.keys(zip.files).find(p => p.endsWith('villagerapi_config.json'));
    }
    if (!config) return null;
    const prefix = config.slice(0, -'villagerapi_config.json'.length);
    const paths = Object.keys(zip.files).filter(p => p.startsWith(prefix) && !zip.files[p].dir).map(p => p.slice(prefix.length));
    return { paths, blob: p => zip.file(prefix + p)?.async('blob'), text: p => zip.file(prefix + p)?.async('string') };
}

function folderReader(files) {
    const all = [...files];
    const config = all.find(f => f.webkitRelativePath.endsWith('villagerapi_config.json'));
    if (!config) return null;
    const prefix = config.webkitRelativePath.slice(0, -'villagerapi_config.json'.length);
    const map = new Map(all.filter(f => f.webkitRelativePath.startsWith(prefix)).map(f => [f.webkitRelativePath.slice(prefix.length), f]));
    return { paths: [...map.keys()], blob: async p => map.get(p), text: async p => (map.get(p) ? map.get(p).text() : undefined) };
}

async function json(reader, path) {
    try { const t = await reader.text(path); return t === undefined || t === null ? null : JSON.parse(t); } catch (error) { return null; }
}
async function image(reader, path) {
    if (!reader.paths.includes(path)) return null;
    const blob = await reader.blob(path);
    return blob ? toDataUrl(blob.type ? blob : new Blob([blob], { type: 'image/png' })) : null;
}
const baseName = path => path.split('/').pop().replace(/\.json$/, '');
const inDir = (reader, dir) => reader.paths.filter(p => p.startsWith(dir) && p.endsWith('.json'));
const splitId = (id, ns) => (String(id).includes(':') ? String(id).split(':') : [ns, String(id)]);

function setField(entry, name, value) {
    const input = entry.querySelector(`[data-field="${name}"]`);
    if (!input || value === undefined || value === null) return;
    if (input.tagName === 'SELECT' && ![...input.options].some(o => o.value === String(value))) return false;
    input.value = Array.isArray(value) ? value.join('\n') : String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function setJson(entry, name, value) {
    const area = entry.querySelector(`textarea[data-field="${name}"]`);
    if (!area || !value) return;
    const toggle = entry.querySelector(`[data-manual="${name}"]`);
    if (toggle) { toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true })); }
    area.value = JSON.stringify(value, null, 2);
    if (toggle) { toggle.checked = false; toggle.dispatchEvent(new Event('change', { bubbles: true })); }
}

function setTexture(gen, entry, name, url) {
    if (!url) return;
    (gen.textures[entry.id] ||= {})[name] = url;
    const zone = entry.querySelector(`[data-texture="${name}"]`)?.closest('.drop');
    if (zone) { zone.classList.add('filled'); zone.querySelector('img').src = url; }
}

function add(gen, type) {
    const before = document.querySelectorAll(`[data-list="${type}"] > .entry`).length;
    const entry = gen.addEntry(type);
    return entry || document.querySelectorAll(`[data-list="${type}"] > .entry`)[before];
}

async function importPack(reader) {
    const gen = window.villagerGen;
    const notes = [];
    const config = await json(reader, 'villagerapi_config.json') || {};
    const meta = await json(reader, 'pack.mcmeta') || {};
    const ns = config.namespace || 'my_villagers';

    // Start from a clean generator.
    document.querySelectorAll('[data-list] > .entry').forEach(e => e.remove());
    gen.textures = {};

    const legacy = !(meta.pack && (meta.pack.min_format !== undefined || meta.pack.max_format !== undefined));
    const radio = document.querySelector(`input[name="mc-version"][value="${legacy ? '1.21.1' : '26.3'}"]`);
    if (radio && !radio.checked) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
    const setPack = (id, value) => { const el = document.getElementById(id); if (el && value !== undefined) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); } };
    setPack('pack-namespace', ns); setPack('pack-display-name', config.display_name); setPack('pack-description', config.description);
    setPack('pack-version', config.version); setPack('pack-author', config.author); setPack('pack-creative-icon', config.creative_tab_icon);
    const icon = await image(reader, 'pack.png');
    if (icon) {
        gen.packIcon = icon;
        const zone = document.getElementById('pack-icon-upload')?.closest('.drop');
        if (zone) { zone.classList.add('filled'); zone.querySelector('img').src = icon; }
    }

    for (const path of inDir(reader, 'villagers/poi_types/')) {
        const data = await json(reader, path); if (!data) continue;
        const e = add(gen, 'poi');
        setField(e, 'name', baseName(path)); setField(e, 'namespace', data.namespace || ns); setField(e, 'block', data.block); setField(e, 'tickets', data.tickets || 1);
    }

    for (const path of inDir(reader, 'villagers/types/')) {
        const data = await json(reader, path) || {};
        const name = data.name || baseName(path), tns = data.namespace || ns, base = `assets/${tns}/textures/entity`;
        const e = add(gen, 'type');
        setField(e, 'name', name); setField(e, 'namespace', tns);
        setTexture(gen, e, 'texture', await image(reader, `${base}/villager/type/${name}.png`));
        setTexture(gen, e, 'zombieTexture', await image(reader, `${base}/zombie_villager/type/${name}.png`));
        setTexture(gen, e, 'babyTexture', await image(reader, `${base}/villager/baby/${name}.png`));
        setTexture(gen, e, 'babyZombieTexture', await image(reader, `${base}/zombie_villager/baby/${name}.png`));
    }

    for (const path of inDir(reader, 'villagers/professions/')) {
        const data = await json(reader, path) || {};
        const name = baseName(path), pns = data.namespace || ns, base = `assets/${pns}/textures/entity`;
        const e = add(gen, 'profession');
        setField(e, 'name', name); setField(e, 'namespace', pns); setField(e, 'poiType', data.poi_type || name);
        if (data.work_sound && !setField(e, 'workSound', data.work_sound)) notes.push(`${name}: its work sound ${data.work_sound} isn't in the list, so the default was used`);
        setTexture(gen, e, 'texture', await image(reader, `${base}/villager/profession/${name}.png`));
        setTexture(gen, e, 'zombieTexture', await image(reader, `${base}/zombie_villager/profession/${name}.png`));
    }

    for (const path of inDir(reader, 'villagers/workstations/')) {
        const data = await json(reader, path) || {};
        const name = data.name || baseName(path), wns = data.namespace || ns;
        const e = add(gen, 'workstation');
        setField(e, 'name', name); setField(e, 'namespace', wns);
        const model = await json(reader, `assets/${wns}/models/block/${name}.json`);
        const textures = (model && model.textures) || {};
        const texturePath = ref => { const [tns, tpath] = splitId(ref, 'minecraft'); return `assets/${tns}/textures/${tpath}.png`; };
        const plainCube = model && !model.elements && /(^|:)block\/cube$/.test(model.parent || '');
        if (plainCube) {
            for (const [dir, face] of Object.entries(CUBE_FACES)) {
                if (textures[dir] && !String(textures[dir]).startsWith('#')) setTexture(gen, e, 'texture' + face[0].toUpperCase() + face.slice(1), await image(reader, texturePath(textures[dir])));
            }
        } else if (model) {
            const store = (gen.textures[e.id] ||= {});
            store.__model = JSON.stringify(model);
            for (const [key, ref] of Object.entries(textures)) {
                if (String(ref).startsWith('#') || key === 'particle') continue;
                const url = await image(reader, texturePath(ref));
                if (url) store['model:' + key] = url;
            }
        }
        const recipe = await json(reader, `data/${wns}/recipe/${name}.json`);
        if (recipe) setJson(e, 'recipeJson', recipe);
    }

    for (const path of inDir(reader, 'villagers/structure_tags/')) {
        const data = await json(reader, path); if (!data) continue;
        const tns = data.namespace || ns, e = add(gen, 'structureTag');
        setField(e, 'tag', data.tag || baseName(path)); setField(e, 'namespace', tns);
        const [dns, dpath] = splitId(data.map_decoration || '', tns);
        setField(e, 'mapDecoration', data.map_decoration && !String(data.map_decoration).includes(':') ? data.map_decoration : `${dns}:${dpath}`);
        if (data.map_color) { setField(e, 'mapColor', data.map_color); const c = e.querySelector('[data-color-for="mapColor"]'); if (c) c.value = data.map_color; }
        setTexture(gen, e, 'decorationTexture', await image(reader, `assets/${dns}/textures/map/decorations/${dpath}.png`));
        const tag = await json(reader, `data/${tns}/tags/worldgen/structure/${data.tag || baseName(path)}.json`);
        if (tag) setJson(e, 'structuresJson', tag);
    }

    for (const path of inDir(reader, 'villagers/trades/')) {
        const data = await json(reader, path); if (!data) continue;
        const { profession, ...rest } = data;
        const e = add(gen, 'trade'); setField(e, 'profession', profession || `${ns}:${baseName(path)}`); setJson(e, 'tradesJson', rest);
    }
    for (const path of inDir(reader, 'villagers/biome_trades/')) {
        const data = await json(reader, path); if (!data) continue;
        const { profession, ...rest } = data;
        const e = add(gen, 'biomeTrade'); setField(e, 'profession', profession || `${ns}:${baseName(path)}`); setJson(e, 'biomeJson', rest);
    }
    for (const path of inDir(reader, 'villagers/gifts/')) {
        const data = await json(reader, path); if (!data) continue;
        const e = add(gen, 'gift');
        setField(e, 'profession', data.profession || baseName(path)); setField(e, 'lootTable', String(data.loot_table || '').replace(/^[^:]+:/, ''));
    }
    for (const path of reader.paths.filter(p => new RegExp(`^data/${ns}/loot_table/gameplay/hero_of_the_village/[^/]+\\.json$`).test(p))) {
        const data = await json(reader, path); if (!data) continue;
        const e = add(gen, 'lootTable'); setField(e, 'name', baseName(path)); setJson(e, 'lootJson', data);
    }

    for (const path of inDir(reader, 'villagers/biome_mappings/')) {
        const data = await json(reader, path); if (!data) continue;
        const e = add(gen, 'biomeMapping');
        setField(e, 'name', baseName(path));
        e.querySelectorAll('[data-rows] > *').forEach(row => row.remove());
        const rows = Array.isArray(data.biomes) ? data.biomes : Object.entries(data.biomes || {}).map(([biome, type]) => ({ biome, villager_type: type, replace: true }));
        for (const row of rows) gen.addRow(e, 'mapping', { biome: row.biome, villagerType: String(row.villager_type || row.type || '').replace(`${ns}:`, ''), weight: row.weight || 1, replace: !!row.replace });
    }

    const villageFiles = reader.paths.filter(p => /^villagers\/village_types\/[^/]+\/[^/]+\.json$/.test(p));
    for (const path of villageFiles) {
        const data = await json(reader, path); if (!data) continue;
        const e = add(gen, 'villageType');
        setField(e, 'name', data.name || baseName(path)); setField(e, 'namespace', data.namespace || ns);
        setField(e, 'folder', path.split('/')[2]); setField(e, 'weight', data.weight || 1); setField(e, 'biomes', data.biomes || []);
        if (!setField(e, 'copyFrom', data.copy_from)) { setField(e, 'copyFrom', 'custom'); setField(e, 'copyFromCustom', data.copy_from); }
    }
    if (reader.paths.some(p => p.startsWith('villagers/village_structures/') || /^villagers\/village_types\/[^/]+\/[^/]+\//.test(p))) {
        notes.push('Village structure .nbt files are not loaded. Add them again under Village Structures and Village Types if you need to change them.');
    }

    gen.refresh && gen.refresh();
    return { name: config.display_name || ns, notes };
}

async function run(reader, label) {
    const gen = window.villagerGen;
    if (!reader) { gen.notify(`${label} is not a villager pack: no villagerapi_config.json was found`, 'error'); return; }
    const existing = document.querySelectorAll('[data-list] > .entry').length;
    if (existing && !confirm('Loading a pack replaces everything currently in the generator. Continue?')) return;
    try {
        const result = await importPack(reader);
        gen.notify(`Loaded ${result.name}. Edit anything and download it again.`);
        result.notes.forEach(note => gen.notify(note));
    } catch (error) {
        console.error(error);
        gen.notify(`${label} could not be loaded: ${error.message}`, 'error');
    }
}

const fileInput = document.querySelector('[data-load-pack="file"]');
const folderInput = document.querySelector('[data-load-pack="folder"]');
fileInput?.addEventListener('change', async () => { const f = fileInput.files[0]; fileInput.value = ''; if (f) run(await zipReader(f).catch(() => null), f.name); });
folderInput?.addEventListener('change', () => { const files = folderInput.files; const label = files[0]?.webkitRelativePath.split('/')[0] || 'Folder'; run(folderReader(files), label); folderInput.value = ''; });

window.PackImporter = { importPack, zipReader, folderReader };
