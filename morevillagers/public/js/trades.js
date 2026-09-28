import { configure, fetchJson, renderIcon, renderMapIcon, glintUrl, splitId, assetUrl, iconElement, iconFirstFrame } from './mc-assets.js';

const LEVEL_NAMES = { 1: 'Novice', 2: 'Apprentice', 3: 'Journeyman', 4: 'Expert', 5: 'Master' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const LANG_CACHE = 'mclang:v2:';
const LANG_PREFIXES = ['item.minecraft.', 'block.minecraft.', 'enchantment.minecraft.', 'enchantment.level.', 'effect.minecraft.', 'instrument.minecraft.', 'trim_pattern.minecraft.'];

const RARITY = {
    uncommon: ['enchanted_book', 'dragon_breath', 'experience_bottle', 'heart_of_the_sea', 'totem_of_undying', 'nether_star', 'creeper_head',
        'zombie_head', 'skeleton_skull', 'wither_skeleton_skull', 'player_head', 'piglin_head', 'sniffer_egg', 'ominous_trial_key',
        'spire_armor_trim_smithing_template', 'netherite_upgrade_smithing_template', 'goat_horn'],
    rare: ['conduit', 'beacon', 'golden_apple', 'end_crystal'],
    epic: ['dragon_head', 'dragon_egg', 'enchanted_golden_apple', 'elytra', 'heavy_core', 'mace', 'trident']
};
const RARITY_COLOR = { common: 'white', uncommon: 'yellow', rare: 'aqua', epic: 'light_purple' };

const POTIONS = {
    water_breathing: ['water_breathing', 180, 0, 0x98dac0], long_water_breathing: ['water_breathing', 480, 0, 0x98dac0],
    fire_resistance: ['fire_resistance', 180, 0, 0xff9900], long_fire_resistance: ['fire_resistance', 480, 0, 0xff9900],
    night_vision: ['night_vision', 180, 0, 0xc2ff66], long_night_vision: ['night_vision', 480, 0, 0xc2ff66],
    swiftness: ['speed', 180, 0, 0x33ebff], long_swiftness: ['speed', 480, 0, 0x33ebff], strong_swiftness: ['speed', 90, 1, 0x33ebff],
    slow_falling: ['slow_falling', 90, 0, 0xf3cfb9], long_slow_falling: ['slow_falling', 240, 0, 0xf3cfb9],
    invisibility: ['invisibility', 180, 0, 0xf6f6f6], long_invisibility: ['invisibility', 480, 0, 0xf6f6f6],
    strength: ['strength', 180, 0, 0xffc700], long_strength: ['strength', 480, 0, 0xffc700], strong_strength: ['strength', 90, 1, 0xffc700],
    poison: ['poison', 45, 0, 0x87a363], long_poison: ['poison', 90, 0, 0x87a363], strong_poison: ['poison', 21, 1, 0x87a363],
    slowness: ['slowness', 90, 0, 0x8bafe0], long_slowness: ['slowness', 240, 0, 0x8bafe0], strong_slowness: ['slowness', 20, 3, 0x8bafe0],
    weakness: ['weakness', 90, 0, 0x484d48], long_weakness: ['weakness', 240, 0, 0x484d48],
    leaping: ['jump_boost', 180, 0, 0xfdff84], long_leaping: ['jump_boost', 480, 0, 0xfdff84], strong_leaping: ['jump_boost', 90, 1, 0xfdff84],
    regeneration: ['regeneration', 45, 0, 0xcd5cab], long_regeneration: ['regeneration', 90, 0, 0xcd5cab], strong_regeneration: ['regeneration', 22, 1, 0xcd5cab],
    healing: ['instant_health', 0, 0, 0xf82423], strong_healing: ['instant_health', 0, 1, 0xf82423],
    harming: ['instant_damage', 0, 0, 0xa9656a], strong_harming: ['instant_damage', 0, 1, 0xa9656a]
};
const POTION_ITEMS = ['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow'];

let packPath = '';
let version = '26.3';
let professions = [];
let packNamespace = 'morevillagers';

export function setupPack(options) {
    packPath = String(options.packPath).replace(/\/$/, '');
    version = options.version || '26.3';
    packNamespace = options.namespace || 'morevillagers';
    professions = options.professions || [];
    configure({ version, local: { [packNamespace]: `${packPath}/assets`, villagerapi: `${packPath}/assets` } });
    document.documentElement.style.setProperty('--glint', `url("${glintUrl()}")`);
}

export async function loadNames() {
    const [vanillaLang, packLang] = await Promise.all([
        loadVanillaLang(),
        fetchJson(`${packPath}/assets/${packNamespace}/lang/en_us.json`)
    ]);
    return createNamer({ ...vanillaLang, ...(packLang || {}) });
}

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
        if (LANG_PREFIXES.some(prefix => name.startsWith(prefix))) {
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
            return level > 1 ? `${name} ${lang['enchantment.level.' + level] || ROMAN[level] || level}` : name;
        },
        level(value) {
            return lang['enchantment.level.' + value] || ROMAN[value] || String(value);
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

function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function rarityOf(id) {
    const path = splitId(id).path;
    if (/^music_disc_/.test(path)) return 'rare';
    for (const [rarity, items] of Object.entries(RARITY)) {
        if (items.includes(path)) return rarity;
    }
    return 'common';
}

export function describeStack(stack, names) {
    const { ns, path } = splitId(stack.id);
    const components = stack.components || {};
    const tooltip = { name: names.item(stack.id), color: 'white', lines: [] };
    let rarity = rarityOf(stack.id);

    const potion = components['minecraft:potion_contents'];
    if (potion && POTION_ITEMS.includes(path)) {
        const potionId = splitId(potion.potion || 'minecraft:water').path;
        const base = potionId.replace(/^(long|strong)_/, '');
        tooltip.name = names.text(`item.${ns}.${path}.effect.${base}`, tooltip.name);
        const info = POTIONS[potionId];
        if (info) {
            const [effect, seconds, amplifier, color] = info;
            let line = names.text(`effect.minecraft.${effect}`, titleCase(effect));
            if (amplifier > 0) line += ' ' + names.level(amplifier + 1);
            const duration = path === 'tipped_arrow' ? seconds / 8 : path === 'lingering_potion' ? seconds / 4 : seconds;
            if (seconds > 0) line += ` (${formatDuration(duration)})`;
            tooltip.lines.push({ text: line, color: 'blue' });
            stack.tint = color;
        }
    }

    const enchantments = components['minecraft:enchantments'];
    const stored = components['minecraft:stored_enchantments'];
    for (const source of [enchantments, stored]) {
        if (!source) continue;
        const levels = source.levels || source;
        for (const [id, level] of Object.entries(levels)) {
            tooltip.lines.push({ text: names.enchantment(id, number(level)), color: 'gray' });
        }
    }
    if (enchantments && Object.keys(enchantments.levels || enchantments).length) {
        rarity = rarity === 'rare' || rarity === 'epic' ? 'epic' : 'rare';
    }

    const instrument = components['minecraft:instrument'];
    if (instrument) {
        const instrumentId = splitId(typeof instrument === 'string' ? instrument : 'minecraft:ponder_goat_horn');
        tooltip.lines.push({ text: names.text(`instrument.${instrumentId.ns}.${instrumentId.path}`, titleCase(instrumentId.path)), color: 'gray' });
    }

    const trim = path.match(/^(.+)_armor_trim_smithing_template$/);
    if (trim) {
        tooltip.lines.push({ text: names.text(`trim_pattern.minecraft.${trim[1]}`, titleCase(trim[1]) + ' Armor Trim'), color: 'gray' });
    }

    tooltip.color = RARITY_COLOR[rarity];
    stack.name = tooltip.name;
    stack.tooltip = tooltip;
    return stack;
}

async function describeTrade(trade, names) {
    const cost = [trade.wants, trade.additional_wants].filter(Boolean).map(stack => describeStack({
        id: stack.id, count: number(stack.count), components: stack.components
    }, names));

    const gives = trade.gives || {};
    const components = gives.components || {};
    const result = describeStack({ id: gives.id, count: number(gives.count), components, enchanted: false }, names);
    const modifiers = trade.given_item_modifiers || trade.given_item_modifier || [];
    const list = Array.isArray(modifiers) ? modifiers : [modifiers];

    const exploration = list.find(modifier => modifierType(modifier) === 'exploration_map');
    if (exploration) {
        result.id = 'minecraft:filled_map';
        const naming = list.find(modifier => modifierType(modifier) === 'set_name');
        const key = naming && naming.name && naming.name.translate;
        result.name = key ? names.text(key, 'Explorer Map') : 'Explorer Map';
        result.tooltip = { name: result.name, color: 'white', lines: [] };
        result.map = await mapSpec(exploration);
    }

    const enchantments = components['minecraft:enchantments'] || components['minecraft:stored_enchantments'];
    if (enchantments) {
        const levels = enchantments.levels || enchantments;
        result.detail = Object.entries(levels).map(([id, level]) => names.enchantment(id, number(level))).join(', ');
    } else if (result.tooltip && result.tooltip.lines.length && !result.map) {
        result.detail = result.tooltip.lines.map(line => line.text).join(', ');
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

export function slot(stack, extraClass = '') {
    const count = stack.count > 1 ? `<b>${stack.count}</b>` : '';
    const map = stack.map ? ` data-map="${escape(JSON.stringify(stack.map))}"` : '';
    const tint = typeof stack.tint === 'number' ? ` data-tint="${stack.tint}"` : '';
    const tooltip = stack.tooltip || { name: stack.name, color: 'white', lines: [] };
    const label = [tooltip.name, ...tooltip.lines.map(line => line.text)].join(', ');
    return `<span class="slot${stack.enchanted ? ' enchanted' : ''}${extraClass}" data-item="${escape(stack.id)}"${map}${tint} data-tip="${escape(JSON.stringify(tooltip))}" role="img" aria-label="${escape(label)}">${count}</span>`;
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

export function paint(element) {
    if (element.dataset.painted) return element._painting || Promise.resolve();
    element.dataset.painted = '1';
    const icon = element.dataset.map
        ? renderMapIcon(JSON.parse(element.dataset.map).key, JSON.parse(element.dataset.map)).then(url => url || renderIcon(element.dataset.item))
        : renderIcon(element.dataset.item, element.dataset.tint ? { tint: Number(element.dataset.tint) } : {});
    element._painting = icon.then(url => {
        if (url) {
            const image = iconElement(url);
            element.prepend(image);
            if (element.classList.contains('enchanted')) {
                const glint = document.createElement('span');
                glint.className = 'glint';
                glint.setAttribute('aria-hidden', 'true');
                glint.style.setProperty('--icon', `url("${iconFirstFrame(url)}")`);
                image.after(glint);
            }
        } else {
            element.classList.add('missing');
            element.insertAdjacentHTML('afterbegin', `<i>${escape((element.title || '?').charAt(0))}</i>`);
        }
    });
    return element._painting;
}

export function watchIcons(scope) {
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
    if (document.body.dataset.tradesReady) return;
    document.body.dataset.tradesReady = '1';
    const tabHost = document.querySelector('[role="tablist"]');
    const list = document.getElementById('professions');

    const names = await loadNames();

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

export const initTrades = init;
