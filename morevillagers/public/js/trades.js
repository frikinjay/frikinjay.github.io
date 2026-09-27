import { configure, fetchJson, renderIcon, renderMapIcon, glintUrl, splitId, assetUrl } from './mc-assets.js';

const LEVEL_NAMES = { 1: 'Novice', 2: 'Apprentice', 3: 'Journeyman', 4: 'Expert', 5: 'Master' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const LANG_CACHE = 'mclang:v1:';

const root = document.querySelector('[data-pack]');
const packPath = root.dataset.pack.replace(/\/$/, '');
const version = root.dataset.version || '26.3';
const professions = root.dataset.professions.split(',').map(value => value.trim()).filter(Boolean);
const packNamespace = root.dataset.namespace || 'morevillagers';

configure({ version, local: { [packNamespace]: `${packPath}/assets`, villagerapi: `${packPath}/assets` } });
document.documentElement.style.setProperty('--glint', `url("${glintUrl()}")`);

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const titleCase = value => value.split(/[_/]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

async function loadVanillaLang() {
    const key = LANG_CACHE + version;
    try {
        const cached = localStorage.getItem(key);
        if (cached) return JSON.parse(cached);
    } catch (error) { /* unavailable */ }

    const full = await fetchJson(assetUrl('minecraft', 'lang/en_us.json')) || {};
    const trimmed = {};
    for (const [name, value] of Object.entries(full)) {
        if (name.startsWith('item.minecraft.') || name.startsWith('block.minecraft.') || name.startsWith('enchantment.minecraft.')) {
            trimmed[name] = value;
        }
    }
    try { localStorage.setItem(key, JSON.stringify(trimmed)); } catch (error) { /* storage full */ }
    return trimmed;
}

function number(value, fallback = 1) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function createNamer(lang) {
    return {
        item(id) {
            const { ns, path } = splitId(id);
            return lang[`item.${ns}.${path}`] || lang[`block.${ns}.${path}`] || titleCase(path);
        },
        block(id) {
            const { ns, path } = splitId(id);
            return lang[`block.${ns}.${path}`] || lang[`item.${ns}.${path}`] || titleCase(path);
        },
        enchantment(id, level) {
            const { ns, path } = splitId(id);
            const name = lang[`enchantment.${ns}.${path}`] || titleCase(path);
            return level > 1 ? `${name} ${ROMAN[level] || level}` : name;
        },
        text(key, fallback) {
            return lang[key] || fallback;
        }
    };
}

function tradeLists(levelValue) {
    if (Array.isArray(levelValue)) return levelValue;
    if (levelValue && Array.isArray(levelValue.trades)) return levelValue.trades;
    return [];
}

function modifierType(modifier) {
    return String(modifier.function || modifier.type || '').replace('minecraft:', '');
}

async function mapSpec(modifier) {
    const destination = String(modifier.destination || '').replace(/^#/, '');
    if (!destination) return null;
    const { ns, path } = splitId(destination, packNamespace);
    const config = await fetchJson(`${packPath}/villagers/structure_tags/${path}.json`);
    if (!config || !config.map_decoration) return null;

    const configNamespace = config.namespace || ns;
    const decoration = splitId(config.map_decoration, configNamespace);
    return {
        key: `${configNamespace}:${path}`,
        base: assetUrl('villagerapi', 'textures/map/map_base.png'),
        decoration: assetUrl(decoration.ns, `textures/map/decorations/${decoration.path}.png`),
        color: config.map_color || ''
    };
}

async function describeTrade(trade, names) {
    const cost = [trade.wants, trade.additional_wants].filter(Boolean).map(stack => ({
        id: stack.id, count: number(stack.count), name: names.item(stack.id)
    }));

    const gives = trade.gives || {};
    const components = gives.components || {};
    const result = { id: gives.id, count: number(gives.count), name: names.item(gives.id), enchanted: false };
    const modifiers = trade.given_item_modifiers || trade.given_item_modifier || [];
    const list = Array.isArray(modifiers) ? modifiers : [modifiers];

    const exploration = list.find(modifier => modifierType(modifier) === 'exploration_map');
    if (exploration) {
        result.id = 'minecraft:filled_map';
        const naming = list.find(modifier => modifierType(modifier) === 'set_name');
        const key = naming && naming.name && naming.name.translate;
        result.name = key ? names.text(key, 'Explorer Map') : 'Explorer Map';
        result.map = await mapSpec(exploration);
    }

    const enchantments = components['minecraft:enchantments'] || components['minecraft:stored_enchantments'];
    if (enchantments) {
        const levels = enchantments.levels || enchantments;
        result.detail = Object.entries(levels).map(([id, level]) => names.enchantment(id, number(level))).join(', ');
    }
    result.enchanted = components['minecraft:enchantment_glint_override'] !== undefined
        ? !!components['minecraft:enchantment_glint_override']
        : !!enchantments || /(^|:)enchanted_book$/.test(String(result.id));

    return {
        cost,
        result,
        weight: trade.trade_list_weight === undefined ? 1 : number(trade.trade_list_weight),
        uses: number(trade.max_uses, 12),
        xp: number(trade.xp, 1)
    };
}

function inclusionChances(weights, picks) {
    const n = weights.length;
    const chances = new Array(n).fill(0);
    if (picks >= n) return chances.fill(1);
    if (picks <= 0) return chances;

    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let states = new Map([[0, { probability: 1, used: 0 }]]);
    for (let step = 0; step < picks; step++) {
        const next = new Map();
        for (const [mask, state] of states) {
            const remaining = total - state.used;
            if (remaining <= 0) continue;
            for (let i = 0; i < n; i++) {
                if (mask & (1 << i)) continue;
                const probability = state.probability * weights[i] / remaining;
                chances[i] += probability;
                const key = mask | (1 << i);
                const entry = next.get(key);
                if (entry) entry.probability += probability;
                else next.set(key, { probability, used: state.used + weights[i] });
            }
        }
        states = next;
    }
    return chances;
}

function levelOffer(levelValue, trades) {
    const offered = trades.filter(trade => trade.weight > 0);
    const options = Array.isArray(levelValue) ? {} : (levelValue || {});
    let picks = offered.length;

    if (options.trade_list_amount !== undefined) picks = Math.max(0, Math.min(picks, number(options.trade_list_amount, picks)));
    const max = options.trade_list_max && options.trade_list_max.size !== undefined ? number(options.trade_list_max.size, picks) : null;
    if (max !== null && max > 0) picks = Math.min(picks, max);

    const chances = picks < offered.length && offered.length <= 20
        ? inclusionChances(offered.map(trade => trade.weight), picks)
        : offered.map(() => (picks >= offered.length ? 1 : picks / offered.length));
    offered.forEach((trade, index) => { trade.chance = chances[index]; });

    return { trades: offered, picks, total: offered.length };
}

function slot(stack, extraClass = '') {
    const count = stack.count > 1 ? `<b>${stack.count}</b>` : '';
    const map = stack.map ? ` data-map="${escape(JSON.stringify(stack.map))}"` : '';
    return `<span class="slot${stack.enchanted ? ' enchanted' : ''}${extraClass}" data-item="${escape(stack.id)}"${map} title="${escape(stack.name)}" role="img" aria-label="${escape(stack.name)}">${count}</span>`;
}

function percent(chance) {
    const value = chance * 100;
    if (value >= 99.95) return '100%';
    if (value < 1) return '<1%';
    return (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10) + '%';
}

function tradeRow(trade) {
    const costText = trade.cost.map(stack => (stack.count > 1 ? `${stack.count} ${stack.name}` : stack.name)).join(' + ');
    const search = [...trade.cost.map(stack => stack.name), trade.result.name, trade.result.detail || ''].join(' ').toLowerCase();
    const uses = `${trade.uses} ${trade.uses === 1 ? 'use' : 'uses'}`;
    const chance = trade.chance !== undefined && trade.chance < 1 ? ` · ${percent(trade.chance)} chance` : '';
    return `<li class="trade" data-search="${escape(search)}">`
        + `<span class="side">${trade.cost.map(stack => slot(stack)).join('')}</span>`
        + `<span class="arrow" aria-hidden="true">&rarr;</span>`
        + `<span class="side">${slot(trade.result)}</span>`
        + `<span class="trade-text"><strong>${escape(trade.result.name)}</strong>`
        + (trade.result.detail ? `<span>${escape(trade.result.detail)}</span>` : '')
        + `<span>for ${escape(costText)}</span><span>${uses} · ${trade.xp} XP${chance}</span></span></li>`;
}

async function loadProfession(id, names) {
    const [trades, poi] = await Promise.all([
        fetchJson(`${packPath}/villagers/trades/${id}.json`),
        fetchJson(`${packPath}/villagers/poi_types/${id}.json`)
    ]);
    if (!trades) return null;

    const professionId = trades.profession || `${packNamespace}:${id}`;
    const { ns, path } = splitId(professionId, packNamespace);
    const name = names.text(`entity.minecraft.villager.${ns}.${path}`, titleCase(path));
    const workstation = poi && poi.block ? { id: poi.block, name: names.block(poi.block) } : null;

    const levelKeys = Object.keys(trades.levels || {}).sort((a, b) => number(a) - number(b));
    const levels = (await Promise.all(levelKeys.map(async key => {
        const value = trades.levels[key];
        const described = await Promise.all(tradeLists(value).map(trade => describeTrade(trade, names)));
        return { level: number(key), ...levelOffer(value, described) };
    }))).filter(level => level.trades.length);

    return { id, name, workstation, levels };
}

function renderProfession(profession, active) {
    const workstation = profession.workstation
        ? `<span class="workstation">${escape(profession.workstation.name)}${slot({ id: profession.workstation.id, count: 1, name: profession.workstation.name }, ' slot-small')}</span>`
        : '';
    const levels = profession.levels.map(level =>
        `<div class="level"><p class="level-name">${LEVEL_NAMES[level.level] || 'Level ' + level.level}${level.picks < level.total ? `<span>${level.picks} of ${level.total} offered</span>` : ''}</p><ul class="rows">${level.trades.map(tradeRow).join('')}</ul></div>`
    ).join('');

    return `<section class="profession" id="${escape(profession.id)}" role="tabpanel" aria-labelledby="tab-${escape(profession.id)}" data-name="${escape(profession.name.toLowerCase())}"${active ? '' : ' hidden'}>`
        + `<div class="profession-title"><h2>${escape(profession.name)}</h2>${workstation}</div>${levels}</section>`;
}

const iconObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                iconObserver.unobserve(entry.target);
                paint(entry.target);
            }
        }
    }, { rootMargin: '300px 0px' })
    : null;

function paint(element) {
    if (element.dataset.painted) return element._painting || Promise.resolve();
    element.dataset.painted = '1';
    const icon = element.dataset.map
        ? renderMapIcon(JSON.parse(element.dataset.map).key, JSON.parse(element.dataset.map)).then(url => url || renderIcon(element.dataset.item))
        : renderIcon(element.dataset.item);
    element._painting = icon.then(url => {
        if (url) {
            const image = new Image();
            image.alt = '';
            image.decoding = 'async';
            image.src = url;
            element.prepend(image);
            if (element.classList.contains('enchanted')) {
                const glint = document.createElement('span');
                glint.className = 'glint';
                glint.setAttribute('aria-hidden', 'true');
                glint.style.setProperty('--icon', `url("${url}")`);
                image.after(glint);
            }
        } else {
            element.classList.add('missing');
            element.insertAdjacentHTML('afterbegin', `<i>${escape((element.title || '?').charAt(0))}</i>`);
        }
    });
    return element._painting;
}

function watchIcons(scope) {
    scope.querySelectorAll('.slot[data-item]:not([data-painted])').forEach(element => {
        if (iconObserver) iconObserver.observe(element);
        else paint(element);
    });
}

function reveal(tab) {
    const host = tab.parentElement;
    if (host.scrollWidth <= host.clientWidth) return;
    const left = tab.offsetLeft - host.offsetLeft;
    if (left < host.scrollLeft || left + tab.offsetWidth > host.scrollLeft + host.clientWidth) {
        host.scrollTo({ left: Math.max(0, left - 16) });
    }
}

function setupInteraction(tabs, panels) {
    const search = document.getElementById('search');
    const list = document.getElementById('professions');
    const empty = document.getElementById('no-results');
    let current = panels[0] ? panels[0].id : null;
    let timer = 0;

    function render() {
        const query = search.value.trim().toLowerCase();
        list.classList.toggle('searching', !!query);
        let found = 0;

        panels.forEach(panel => {
            if (!query) {
                panel.hidden = panel.id !== current;
                panel.querySelectorAll('.trade, .level').forEach(element => { element.hidden = false; });
                return;
            }
            const nameMatch = panel.dataset.name.includes(query);
            let inPanel = 0;
            panel.querySelectorAll('.level').forEach(level => {
                let inLevel = 0;
                level.querySelectorAll('.trade').forEach(trade => {
                    const match = nameMatch || trade.dataset.search.includes(query);
                    trade.hidden = !match;
                    if (match) inLevel++;
                });
                level.hidden = inLevel === 0;
                inPanel += inLevel;
            });
            panel.hidden = inPanel === 0;
            found += inPanel;
        });

        empty.hidden = !query || found > 0;
    }

    function select(id, focus) {
        current = id;
        tabs.forEach(tab => {
            const active = tab.getAttribute('aria-controls') === id;
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
            tab.tabIndex = active ? 0 : -1;
            if (active) reveal(tab);
            if (active && focus) tab.focus({ preventScroll: true });
        });
        search.value = '';
        render();
        history.replaceState(null, '', '#' + id);
    }

    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => select(tab.getAttribute('aria-controls')));
        tab.addEventListener('keydown', event => {
            let next = null;
            if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
            if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
            if (next) {
                event.preventDefault();
                select(next.getAttribute('aria-controls'), true);
            }
        });
    });

    search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(render, 80);
    });

    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash && panels.some(panel => panel.id === hash)) current = hash;
    if (current) {
        tabs.forEach(tab => {
            const active = tab.getAttribute('aria-controls') === current;
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
            tab.tabIndex = active ? 0 : -1;
            if (active) requestAnimationFrame(() => reveal(tab));
        });
        render();
    }
    return current;
}

async function init() {
    const tabHost = document.querySelector('[role="tablist"]');
    const list = document.getElementById('professions');

    const [vanillaLang, packLang] = await Promise.all([
        loadVanillaLang(),
        fetchJson(`${packPath}/assets/${packNamespace}/lang/en_us.json`)
    ]);
    const names = createNamer({ ...vanillaLang, ...(packLang || {}) });

    const loaded = (await Promise.all(professions.map(id => loadProfession(id, names).catch(() => null)))).filter(Boolean);
    if (!loaded.length) {
        list.innerHTML = '<p class="no-results">Trades could not be loaded.</p>';
        return;
    }

    tabHost.innerHTML = loaded.map((profession, index) =>
        `<button class="tab" role="tab" id="tab-${escape(profession.id)}" aria-controls="${escape(profession.id)}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${escape(profession.name)}</button>`
    ).join('');
    list.insertAdjacentHTML('afterbegin', loaded.map((profession, index) => renderProfession(profession, index === 0)).join(''));

    const tabs = [...tabHost.querySelectorAll('[role="tab"]')];
    const panels = [...list.querySelectorAll('[role="tabpanel"]')];
    const current = setupInteraction(tabs, panels);

    const visible = document.getElementById(current);
    const first = visible ? [...visible.querySelectorAll('.slot[data-item]')] : [];
    watchIcons(list);
    await Promise.all(first.slice(0, 40).map(paint));
}

window.Site.ready(init());
