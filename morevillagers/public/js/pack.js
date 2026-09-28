import { fetchJson, splitId, assetUrl, renderEntity, villagerElements, composeTextures, registerCanvasTexture, iconElement, textureMeta } from './mc-assets.js';
import { setupPack, loadNames, initTrades, describeStack, slot, watchIcons } from './trades.js';

const MCMETA = 'https://raw.githubusercontent.com/misode/mcmeta/data/data';
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

async function resolveItems(ingredient) {
    if (Array.isArray(ingredient)) return (await Promise.all(ingredient.map(resolveItems))).flat();
    if (ingredient && typeof ingredient === 'object') return resolveItems(ingredient.item || (ingredient.tag ? '#' + ingredient.tag : null));
    if (typeof ingredient !== 'string') return [];
    if (!ingredient.startsWith('#')) return [ingredient];
    const { ns, path } = splitId(ingredient.slice(1));
    const tag = await fetchJson(ns === 'minecraft' ? `${MCMETA}/minecraft/tags/item/${path}.json` : `${pack.path}/data/${ns}/tags/item/${path}.json`);
    const values = (tag && tag.values || []).map(value => (typeof value === 'object' ? value.id : value));
    return (await Promise.all(values.slice(0, 12).map(resolveItems))).flat();
}

let cycleTimer = 0;

async function openRecipe(itemId) {
    const { ns, path } = splitId(itemId);
    const recipe = await fetchJson(ns === pack.namespace ? `${pack.path}/data/${ns}/recipe/${path}.json` : `${MCMETA}/${ns}/recipe/${path}.json`);
    const dialog = document.getElementById('recipe-dialog');
    const grid = dialog.querySelector('.crafting-grid');
    const result = dialog.querySelector('.crafting-result');
    dialog.querySelector('h2').textContent = names.item(itemId);

    const cells = new Array(9).fill(null);
    if (recipe && recipe.pattern) {
        const rows = recipe.pattern;
        const offsetY = rows.length < 3 ? 0 : 0;
        for (let y = 0; y < rows.length; y++) {
            for (let x = 0; x < rows[y].length; x++) {
                const key = rows[y][x];
                if (key !== ' ') cells[(y + offsetY) * 3 + x] = await resolveItems(recipe.key[key]);
            }
        }
    } else if (recipe && recipe.ingredients) {
        for (let i = 0; i < Math.min(9, recipe.ingredients.length); i++) cells[i] = await resolveItems(recipe.ingredients[i]);
    }

    const stack = id => describeStack({ id, count: 1 }, names);
    grid.innerHTML = cells.map((options, index) => (options && options.length
        ? `<span class="cell" data-options="${escape(JSON.stringify(options))}" data-index="0">${slot(stack(options[0]))}</span>`
        : '<span class="cell"><span class="slot"></span></span>')).join('');
    const out = recipe && recipe.result ? recipe.result : { id: itemId, count: 1 };
    result.innerHTML = slot({ ...stack(out.id || out.item || itemId), count: out.count || 1 });
    dialog.querySelector('.recipe-missing').hidden = !!recipe;
    watchIcons(dialog);

    clearInterval(cycleTimer);
    cycleTimer = setInterval(() => {
        dialog.querySelectorAll('.cell[data-options]').forEach(cell => {
            const options = JSON.parse(cell.dataset.options);
            if (options.length < 2) return;
            const index = (Number(cell.dataset.index) + 1) % options.length;
            cell.dataset.index = index;
            cell.innerHTML = slot(stack(options[index]));
            watchIcons(cell);
        });
    }, 1200);

    dialog.showModal();
}

function showTab(tab) {
    document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-selected', button.dataset.tab === tab ? 'true' : 'false'));
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
    history.replaceState(null, '', `?id=${encodeURIComponent(pack.id)}#${tab}`);
    if (loadedTabs.has(tab)) return Promise.resolve();
    loadedTabs.add(tab);
    if (tab === 'types') return renderTypes();
    if (tab === 'professions') return renderProfessions();
    return initTrades();
}

async function init() {
    const id = new URLSearchParams(location.search).get('id');
    const index = await fetchJson('./packs/index.json');
    pack = index && index.packs.find(entry => entry.id === id);
    if (!pack) {
        document.getElementById('pack-header').innerHTML = '<h1>Pack not found</h1><p><a class="chevron" href="./">All villager packs</a></p>';
        document.querySelector('.pack-tabs').hidden = true;
        return;
    }

    document.title = `${pack.name} · Villager Packs`;
    document.getElementById('pack-header').innerHTML = `
        ${pack.icon ? `<img class="pack-icon-large" src="./${escape(pack.icon)}" alt="" width="96" height="96">` : ''}
        <div><h1>${escape(pack.name)}</h1><p>${escape(pack.description)}</p>
        <small>${[pack.version && 'v' + pack.version, pack.author && 'by ' + pack.author, pack.namespace].filter(Boolean).map(escape).join(' · ')}</small></div>`;

    setupPack({ packPath: './' + pack.path, namespace: pack.namespace, version: '26.3', professions: pack.professions });
    names = await loadNames();

    document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.tab)));
    document.addEventListener('click', event => {
        const target = event.target.closest('.workstation .slot[data-item]');
        if (target) openRecipe(target.dataset.item);
    });
    const dialog = document.getElementById('recipe-dialog');
    dialog.addEventListener('click', event => { if (event.target === dialog || event.target.closest('.dialog-close')) dialog.close(); });
    dialog.addEventListener('close', () => clearInterval(cycleTimer));

    const tab = ['types', 'professions', 'trades'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'types';
    await showTab(tab);
}

window.Site.ready(init());
