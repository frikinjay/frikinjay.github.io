import { fetchJson, splitId, renderEntity, villagerElements, composeTextures, registerCanvasTexture, iconElement, textureMeta } from './mc-assets.js';
import { setupPack, loadNames, initTrades, describeStack, slot, watchIcons } from './trades.js';
import { createRecipeViewer } from './recipe-gui.js';

let MCMETA = 'https://cdn.jsdelivr.net/gh/misode/mcmeta@data/data';
const VANILLA_TYPES = ['plains', 'desert', 'jungle', 'savanna', 'snow', 'swamp', 'taiga'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const title = value => value.split(/[_/]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

let pack;
let names;
const loadedTabs = new Set();

function villagerTexture(type, profession) {
    const typeId = splitId(type);
    const layers = ['minecraft:entity/villager/villager', `${typeId.ns}:entity/villager/type/${typeId.path}`];
    if (profession) layers.push(`${pack.namespace}:entity/villager/profession/${profession}`);
    return layers;
}

const HAT_AREAS = [[32, 0, 32, 18], [30, 47, 34, 17]];

async function hatOf(id) {
    const meta = await textureMeta(id);
    return (meta && meta.villager && meta.villager.hat) || 'none';
}

async function villagerImage(key, layers) {
    const clear = {};
    if (layers.length > 2) {
        const [typeHat, professionHat] = await Promise.all([hatOf(layers[1]), hatOf(layers[2])]);
        const typeHatVisible = professionHat === 'none' || (professionHat === 'partial' && typeHat !== 'full');
        if (!typeHatVisible) clear[1] = HAT_AREAS;
    }
    const canvas = await composeTextures(layers, clear);
    if (!canvas) return null;
    registerCanvasTexture('canvas:' + key, canvas);
    return renderEntity(key, { elements: villagerElements(), textures: { t: 'canvas:' + key } });
}

function villagerCard(key, layers, heading, body) {
    const card = document.createElement('article');
    card.className = 'villager-card';
    card.innerHTML = `<div class="villager-render" aria-hidden="true"></div><div class="villager-info"><h3>${escape(heading)}</h3>${body}</div>`;
    villagerImage(key, layers).then(result => {
        const element = iconElement(result);
        if (element) card.querySelector('.villager-render').replaceChildren(element);
    });
    return card;
}

async function typeBiomes() {
    const map = {};
    for (const file of pack.biomeMappings) {
        const data = await fetchJson(`${pack.path}/villagers/biome_mappings/${file}.json`);
        const biomes = data && data.biomes;
        const entries = Array.isArray(biomes)
            ? biomes.map(entry => [entry.biome, entry.villager_type || entry.type])
            : Object.entries(biomes || {});
        for (const [biome, type] of entries) {
            if (!biome || !type) continue;
            const typeId = splitId(type, pack.namespace);
            (map[`${typeId.ns}:${typeId.path}`] ||= []).push(biome);
        }
    }
    return map;
}

function biomeName(biome) {
    const tag = biome.startsWith('#');
    const { ns, path } = splitId(biome.replace('#', ''));
    const label = names.text(`biome.${ns}.${path}`, title(path));
    return `<li class="${tag ? 'is-tag' : ''}">${escape(tag ? '#' + ns + ':' + path : label)}</li>`;
}

async function renderTypes() {
    const host = document.getElementById('types-list');
    const biomes = await typeBiomes();
    if (!pack.types.length) {
        host.innerHTML = '<p class="no-results">This pack adds no villager types.</p>';
        return;
    }
    for (const type of pack.types) {
        const data = await fetchJson(`${pack.path}/villagers/types/${type}.json`) || {};
        const id = `${data.namespace || pack.namespace}:${data.name || type}`;
        const list = biomes[id] || [];
        const body = list.length ? `<p class="label">Biomes</p><ul class="biomes">${list.map(biomeName).join('')}</ul>` : '<p class="label">No biomes mapped</p>';
        host.appendChild(villagerCard('type-' + id, villagerTexture(id), names.text(`villager_type.${id.replace(':', '.')}`, title(splitId(id).path)), body));
    }
}

async function renderProfessions() {
    const select = document.getElementById('type-select');
    const host = document.getElementById('professions-list');
    const typeIds = [...VANILLA_TYPES.map(type => 'minecraft:' + type), ...pack.types.map(type => `${pack.namespace}:${type}`)];
    select.innerHTML = typeIds.map(id => `<option value="${escape(id)}"${id === 'minecraft:plains' ? ' selected' : ''}>${escape(title(splitId(id).path))}</option>`).join('');

    const poi = {};
    await Promise.all(pack.professions.map(async profession => {
        poi[profession] = await fetchJson(`${pack.path}/villagers/poi_types/${profession}.json`);
    }));

    const draw = () => {
        host.innerHTML = '';
        for (const profession of pack.professions) {
            const block = poi[profession] && poi[profession].block;
            const workstation = block ? describeStack({ id: block, count: 1 }, names) : null;
            const body = workstation
                ? `<p class="label">Workstation</p><div class="workstation">${slot(workstation, ' slot-small')}<span>${escape(workstation.name)}</span></div>`
                : '';
            host.appendChild(villagerCard(`${select.value}-${profession}`, villagerTexture(select.value, profession),
                names.text(`entity.minecraft.villager.${pack.namespace}.${profession}`, title(profession)), body));
        }
        watchIcons(host);
    };
    select.addEventListener('change', draw);
    draw();
}

const vanillaRecipes = new Map();

function vanillaRecipeIndex(version) {
    if (!vanillaRecipes.has(version)) vanillaRecipes.set(version, fetchJson(`./data/${version}/vanilla-recipes.json`).then(index => index || {}));
    return vanillaRecipes.get(version);
}

async function recipeSources(itemId) {
    const { ns, path } = splitId(itemId);
    const own = (pack.recipes || {})[itemId] || [];
    if (own.length) return own.map(file => () => fetchJson(`${pack.path}/${file}`));
    if (ns === 'minecraft') {
        const names = (await vanillaRecipeIndex(pack.minecraft || '26.3'))[itemId];
        if (names && names.length) return names.map(name => () => fetchJson(`${MCMETA}/minecraft/recipe/${name}.json`));
    }
    const base = ns === pack.namespace ? `${pack.path}/data/${ns}/recipe/` : `${MCMETA}/${ns}/recipe/`;
    const recipe = await fetchJson(`${base}${path}.json`);
    return recipe ? [() => Promise.resolve(recipe)] : [];
}

function showTab(tab) {
    document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-selected', button.dataset.tab === tab ? 'true' : 'false'));
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
    history.replaceState(null, '', `${location.pathname}${location.search}#${tab}`);
    if (loadedTabs.has(tab)) return Promise.resolve();
    loadedTabs.add(tab);
    if (tab === 'types') return renderTypes();
    if (tab === 'professions') return renderProfessions();
    return initTrades();
}

async function init() {
    const id = document.body.dataset.pack || new URLSearchParams(location.search).get('id');
    const index = await fetchJson('./packs/index.json');
    pack = index && index.packs.find(entry => entry.id === id);
    if (pack && !document.body.dataset.pack) {
        location.replace(`./pack/${encodeURIComponent(pack.id)}${location.hash}`);
        return;
    }
    if (!pack) {
        document.getElementById('pack-header').innerHTML = '<h1>Pack not found</h1><p><a class="chevron" href="./">All villager packs</a></p>';
        document.querySelector('.pack-tabs').hidden = true;
        return;
    }

    document.title = `${pack.name} · Villager Packs`;
    document.getElementById('pack-header').innerHTML = `
        ${pack.icon ? `<img class="pack-icon-large" src="./${escape(pack.icon)}" alt="" width="96" height="96">` : ''}
        <div><h1>${escape(pack.name)}</h1><p>${escape(pack.description)}</p>
        <small>${[pack.version && 'v' + pack.version, pack.author && 'by ' + pack.author, pack.namespace, 'Minecraft ' + (pack.minecraft || '26.3')].filter(Boolean).map(escape).join(' · ')}</small></div>`;

    const minecraft = pack.minecraft || '26.3';
    if (minecraft !== '26.3') MCMETA = `https://cdn.jsdelivr.net/gh/misode/mcmeta@${minecraft}-data/data`;
    setupPack({ packPath: './' + pack.path, namespace: pack.namespace, version: minecraft, professions: pack.professions });
    names = await loadNames();

    document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.tab)));
    const fuels = await fetchJson(`./data/${minecraft}/vanilla-fuels.json`) || [];
    const recipes = createRecipeViewer({ dialog: document.getElementById('recipe-dialog'), names, packPath: pack.path, mcmeta: MCMETA, fuels });
    const prefetched = new Set();
    const prefetch = event => {
        const target = event.target.closest && event.target.closest('.workstation .slot[data-item]');
        if (!target || prefetched.has(target.dataset.item)) return;
        prefetched.add(target.dataset.item);
        recipeSources(target.dataset.item).then(sources => sources[0] && sources[0]());
    };
    document.addEventListener('pointerover', prefetch, { passive: true });
    document.addEventListener('pointerdown', prefetch, { passive: true });
    document.addEventListener('click', event => {
        const target = event.target.closest('.workstation .slot[data-item]');
        if (target) recipeSources(target.dataset.item).then(sources => recipes.open(target.dataset.item, sources));
    });

    const tab = ['types', 'professions', 'trades'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'types';
    await showTab(tab);
}

window.Site.ready(init());
