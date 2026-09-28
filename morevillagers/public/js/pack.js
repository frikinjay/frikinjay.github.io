import { fetchJson, renderIcon, splitId, assetUrl, renderEntity, villagerElements, composeTextures, registerCanvasTexture, iconElement, textureMeta } from './mc-assets.js';
import { setupPack, loadNames, initTrades, describeStack, slot, watchIcons, paint } from './trades.js';

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

const tagCache = new Map();

function resolveItems(ingredient) {
    if (Array.isArray(ingredient)) return Promise.all(ingredient.map(resolveItems)).then(lists => [...new Set(lists.flat())]);
    if (ingredient && typeof ingredient === 'object') return resolveItems(ingredient.item || (ingredient.tag ? '#' + ingredient.tag : null));
    if (typeof ingredient !== 'string') return Promise.resolve([]);
    if (!ingredient.startsWith('#')) return Promise.resolve([ingredient]);
    if (!tagCache.has(ingredient)) {
        const { ns, path } = splitId(ingredient.slice(1));
        tagCache.set(ingredient, fetchJson(ns === 'minecraft' ? `${MCMETA}/minecraft/tags/item/${path}.json` : `${pack.path}/data/${ns}/tags/item/${path}.json`)
            .then(tag => Promise.all((tag && tag.values || []).map(value => resolveItems(typeof value === 'object' ? value.id : value))))
            .then(lists => [...new Set(lists.flat())].slice(0, 24)));
    }
    return tagCache.get(ingredient);
}

async function findRecipe(itemId) {
    const { ns, path } = splitId(itemId);
    const base = ns === pack.namespace ? `${pack.path}/data/${ns}/recipe/` : `${MCMETA}/${ns}/recipe/`;
    const recipe = await fetchJson(`${base}${path}.json`);
    if (recipe) return recipe;
    return fetchJson(`${base}${path}_simple.json`);
}

function recipeCells(recipe) {
    const cells = new Array(9).fill(null);
    const type = String(recipe.type || '').replace('minecraft:', '');
    if (type === 'crafting_decorated_pot') {
        [['back', 1], ['left', 3], ['right', 5], ['front', 7]].forEach(([side, index]) => { cells[index] = recipe[side]; });
    } else if (recipe.pattern) {
        recipe.pattern.forEach((row, y) => [...row].forEach((key, x) => {
            if (key !== ' ' && x < 3 && y < 3) cells[y * 3 + x] = recipe.key[key];
        }));
    } else if (recipe.ingredients) {
        recipe.ingredients.slice(0, 9).forEach((ingredient, index) => { cells[index] = ingredient; });
    }
    return Promise.all(cells.map(cell => (cell ? resolveItems(cell) : null)));
}

let cycleTimer = 0;
const readyIcons = new Set();

function makeSlot(id) {
    const holder = document.createElement('span');
    holder.innerHTML = slot(describeStack({ id, count: 1 }, names));
    return holder.firstElementChild;
}

async function openRecipe(itemId) {
    const dialog = document.getElementById('recipe-dialog');
    const grid = dialog.querySelector('.crafting-grid');
    const result = dialog.querySelector('.crafting-result');
    dialog.querySelector('h2').textContent = names.item(itemId);
    grid.innerHTML = '<span class="cell"><span class="slot"></span></span>'.repeat(9);
    result.innerHTML = '<span class="slot"></span>';
    dialog.querySelector('.recipe-missing').hidden = true;
    clearInterval(cycleTimer);
    if (!dialog.open) dialog.showModal();

    const recipe = await findRecipe(itemId);
    if (!recipe) {
        dialog.querySelector('.recipe-missing').hidden = false;
        result.replaceChildren(makeSlot(itemId));
        paint(result.firstElementChild);
        return;
    }

    const cells = await recipeCells(recipe);
    const out = recipe.result || { id: itemId };
    const resultSlot = makeSlot(out.id || out.item || itemId);
    const count = Number(out.count || 1);
    if (count > 1) resultSlot.insertAdjacentHTML('beforeend', `<b>${count}</b>`);
    result.replaceChildren(resultSlot);
    paint(resultSlot);

    const cellElements = [...grid.children];
    const states = cells.map((options, index) => {
        if (!options || !options.length) return null;
        const first = makeSlot(options[0]);
        cellElements[index].replaceChildren(first);
        paint(first).then(() => readyIcons.add(options[0]));
        return { options, index: 0, element: cellElements[index] };
    });

    const pending = [...new Set(cells.filter(Boolean).flatMap(options => options.slice(1)))].filter(id => !readyIcons.has(id));
    pending.forEach(id => renderIcon(id).then(() => readyIcons.add(id)));

    cycleTimer = setInterval(() => {
        for (const state of states) {
            if (!state || state.options.length < 2) continue;
            for (let step = 1; step < state.options.length; step++) {
                const next = (state.index + step) % state.options.length;
                if (!readyIcons.has(state.options[next])) continue;
                const element = makeSlot(state.options[next]);
                state.index = next;
                paint(element).then(() => { if (dialog.open) state.element.replaceChildren(element); });
                break;
            }
        }
    }, 1500);
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
    const prefetched = new Set();
    const prefetch = event => {
        const target = event.target.closest && event.target.closest('.workstation .slot[data-item]');
        if (!target || prefetched.has(target.dataset.item)) return;
        prefetched.add(target.dataset.item);
        findRecipe(target.dataset.item).then(recipe => recipe && recipeCells(recipe)).then(cells => {
            (cells || []).forEach(options => options && options[0] && renderIcon(options[0]));
        });
    };
    document.addEventListener('pointerover', prefetch, { passive: true });
    document.addEventListener('pointerdown', prefetch, { passive: true });
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
