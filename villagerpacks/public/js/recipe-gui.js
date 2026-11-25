import { fetchJson, renderIcon, splitId } from './mc-assets.js';
import { describeStack, slot, paint } from './trades.js';

const FURNACE = (texture, title) => ({ texture, title, centred: true, inputs: [[56, 17]], fuel: [56, 53], result: [116, 35], flame: [56, 36], arrow: [79, 34] });
const SMITHING = { texture: 'smithing', title: 'Upgrade Gear', titleAt: [44, 15], inputs: [[8, 48], [26, 48], [44, 48]], result: [98, 48] };
const GUIS = {
    crafting: { texture: 'crafting_table', title: 'Crafting', titleAt: [29, 6], inputs: Array.from({ length: 9 }, (_, i) => [30 + (i % 3) * 18, 17 + Math.floor(i / 3) * 18]), result: [124, 35] },
    smelting: FURNACE('furnace', 'Furnace'),
    blasting: FURNACE('blast_furnace', 'Blast Furnace'),
    smoking: FURNACE('smoker', 'Smoker'),
    campfire_cooking: { ...FURNACE('furnace', 'Campfire'), fuel: null, flame: null },
    stonecutting: { texture: 'stonecutter', title: 'Stonecutter', titleAt: [8, 5], inputs: [[20, 33]], result: [143, 33], choice: [52, 14] },
    smithing_transform: SMITHING,
    smithing_trim: SMITHING,
    brewing: { texture: 'brewing_stand', title: 'Brewing Stand', centred: true, height: 84, inputs: [[79, 17], [56, 51], [79, 58], [102, 51]], fuel: [17, 17], result: [143, 35], framed: true, brew: [97, 16], bubbles: [63, 14], fuelBar: [60, 44] }
};
const COOKING = { smelting: 200, blasting: 100, smoking: 100, campfire_cooking: 600 };

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sprite = path => new URL(`../img/gui/${path}.png`, import.meta.url).href;
const at = ([x, y]) => `left:calc(${x}px * var(--s));top:calc(${y}px * var(--s))`;
const keyOf = stack => (stack.components ? JSON.stringify(stack) : stack.id);
const full = id => (String(id).includes(':') ? String(id) : 'minecraft:' + id);

function craftingCells(recipe, type) {
    const cells = new Array(9).fill(null);
    const place = list => list.forEach((value, index) => { if (value !== undefined && index < 9) cells[index] = value; });
    if (recipe.pattern) {
        recipe.pattern.forEach((row, y) => [...row].forEach((key, x) => {
            if (key !== ' ' && x < 3 && y < 3) cells[y * 3 + x] = recipe.key[key];
        }));
    } else if (recipe.ingredients) {
        place(recipe.ingredients);
    } else if (type === 'crafting_decorated_pot') {
        [['back', 1], ['left', 3], ['right', 5], ['front', 7]].forEach(([side, index]) => { cells[index] = recipe[side]; });
    } else if (type === 'crafting_imbue') {
        cells.fill(recipe.material);
        cells[4] = recipe.source;
    } else if (type === 'crafting_special_mapextending') {
        cells.fill(recipe.material);
        cells[4] = recipe.map;
    } else if (type === 'crafting_transmute') {
        place([recipe.input, ...Array(Math.max(1, Number(recipe.material_count && recipe.material_count.min) || 1)).fill(recipe.material)]);
    } else if (type === 'crafting_dye' || type === 'crafting_special_shielddecoration' || type === 'crafting_special_firework_star_fade') {
        place([recipe.target, recipe.dye || recipe.banner]);
    } else if (type === 'crafting_special_bannerduplicate') {
        place([recipe.banner, recipe.banner]);
    } else if (type === 'crafting_special_bookcloning') {
        place([recipe.source, recipe.material]);
    } else if (type === 'crafting_special_firework_rocket') {
        place([recipe.shell, recipe.fuel, recipe.star]);
    } else if (type === 'crafting_special_firework_star') {
        place([recipe.fuel, recipe.dye, Object.values(recipe.shapes || {}), recipe.trail, recipe.twinkle]);
    } else {
        const skip = new Set(['type', 'category', 'group', 'result', 'show_notification']);
        place(Object.entries(recipe).filter(([key, value]) => !skip.has(key) && (typeof value === 'string' || Array.isArray(value) || (value && (value.item || value.tag)))).map(([, value]) => value));
    }
    return cells;
}

const tagTitle = tag => tag.split(':').pop().split('/').pop().split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');

function ingredientRefs(recipe, type) {
    if (type.startsWith('smithing')) return [recipe.base, recipe.addition];
    if (recipe.pattern && recipe.key) return [...new Set(recipe.pattern.join('').replace(/ /g, ''))].map(key => recipe.key[key]);
    if (recipe.ingredients) return recipe.ingredients;
    if (recipe.ingredient) return [recipe.ingredient];
    if (recipe.reagent) return [recipe.reagent];
    return [];
}

function variantLabel(recipe, item, names) {
    const type = String(recipe.type || '').replace('minecraft:', '');
    if (type === 'crafting_decorated_pot') return 'With Sherds';
    if (full(item) === 'minecraft:decorated_pot') return 'Plain';
    const name = ref => {
        if (Array.isArray(ref)) return ref.length ? name(ref[0]) : null;
        if (ref && typeof ref === 'object') return name(ref.item || ref.id || (ref.tag ? '#' + ref.tag : null));
        if (typeof ref !== 'string') return null;
        return ref.startsWith('#') ? `Any ${tagTitle(ref.slice(1))}` : names.item(full(ref));
    };
    const parts = [...new Set(ingredientRefs(recipe, type).map(name).filter(Boolean))];
    if (!parts.length) return '';
    return 'From ' + (parts.length > 2 ? `${parts.slice(0, 2).join(', ')} and More` : parts.join(' and '));
}

function potionStack(entry) {
    if (!entry) return null;
    const contents = entry.potion_contents || (entry.components && entry.components['minecraft:potion_contents']);
    const raw = contents && (contents.potions ?? contents.potion);
    const potion = [].concat(raw || []).find(value => typeof value === 'string' && !value.startsWith('#'));
    const stack = { id: full(entry.item || entry.id) };
    if (potion) stack.components = { 'minecraft:potion_contents': { potion } };
    return stack;
}

export function createRecipeViewer({ dialog, names, packPath, mcmeta, fuels = [] }) {
    const host = dialog.querySelector('.mc-gui');
    const nav = dialog.querySelector('.recipe-nav');
    const page = nav && nav.querySelector('.recipe-page');
    const missing = dialog.querySelector('.recipe-missing');
    const tagCache = new Map();
    const ready = new Set();
    const broken = new Set();
    let timer = 0;
    let sources = [];
    let index = 0;
    let item = null;
    let token = 0;
    let states = [];
    let wheel = 0;
    let hovered = null;
    const touch = window.matchMedia('(hover: none)');

    function resolveItems(ingredient) {
        if (Array.isArray(ingredient)) return Promise.all(ingredient.map(resolveItems)).then(lists => [...new Set(lists.flat())]);
        if (ingredient && typeof ingredient === 'object') return resolveItems(ingredient.item || ingredient.id || (ingredient.tag ? '#' + ingredient.tag : null));
        if (typeof ingredient !== 'string') return Promise.resolve([]);
        if (!ingredient.startsWith('#')) return Promise.resolve([full(ingredient)]);
        if (!tagCache.has(ingredient)) {
            const { ns, path } = splitId(ingredient.slice(1));
            tagCache.set(ingredient, fetchJson(ns === 'minecraft' ? `${mcmeta}/minecraft/tags/item/${path}.json` : `${packPath}/data/${ns}/tags/item/${path}.json`)
                .then(tag => Promise.all((tag && tag.values || []).map(value => resolveItems(typeof value === 'object' ? value.id : value))))
                .then(lists => [...new Set(lists.flat())].slice(0, 512)));
        }
        return tagCache.get(ingredient);
    }

    const stacks = ingredient => (ingredient ? resolveItems(ingredient).then(ids => ids.map(id => ({ id }))) : Promise.resolve(null));

    async function layout(recipe) {
        const type = String(recipe.type || '').replace('minecraft:', '');
        const result = typeof recipe.result === 'string' ? { id: recipe.result } : recipe.result && (recipe.result.id || recipe.result.item) ? { ...recipe.result, id: recipe.result.id || recipe.result.item } : null;
        if (type === 'brewing') {
            const input = potionStack(recipe.input);
            return { type, gui: GUIS.brewing, cells: [await stacks(recipe.reagent), [input], [input], [input]], result: potionStack(recipe.output), fuel: [{ id: 'minecraft:blaze_powder' }] };
        }
        if (GUIS[type] && type !== 'crafting') {
            const gui = GUIS[type];
            const parts = type.startsWith('smithing') ? [recipe.template, recipe.base, recipe.addition] : [recipe.ingredient];
            const cells = await Promise.all(parts.map(stacks));
            const fallback = type === 'smithing_trim' ? cells[1] && cells[1][0] : null;
            return { type, gui, cells, result: result || fallback, fuel: gui.fuel ? fuels.map(id => ({ id })) : null, cook: recipe.cookingtime || COOKING[type], experience: recipe.experience };
        }
        if (type === 'crafting_special_repairitem') return null;
        const cells = await Promise.all(craftingCells(recipe, type).map(stacks));
        if (type === 'crafting_decorated_pot') {
            cells.forEach((options, i) => {
                if (!options || options.length < 2) return;
                const sherds = options.filter(stack => stack.id !== 'minecraft:brick');
                const shift = Math.floor(i / 2) % Math.max(1, sherds.length);
                cells[i] = [...sherds.slice(shift), ...sherds.slice(0, shift), ...options.filter(stack => stack.id === 'minecraft:brick')];
            });
        }
        return { type, gui: GUIS.crafting, cells, result };
    }

    function makeSlot(stack, count = 1) {
        const holder = document.createElement('span');
        holder.innerHTML = slot(describeStack({ ...stack, count: 1 }, names));
        const element = holder.firstElementChild;
        if (count > 1) element.insertAdjacentHTML('beforeend', `<b>${count}</b>`);
        return element;
    }

    function fill(target, stack, count) {
        const element = makeSlot(stack, count);
        target.replaceChildren(element);
        return paint(element);
    }

    function addTipLine(element, text) {
        let data;
        try { data = JSON.parse(element.getAttribute('data-tip')); } catch (error) { data = null; }
        if (!data) return;
        if (typeof data === 'string') data = { name: data, color: 'white', lines: [] };
        data.lines = [...(data.lines || []), { text, color: 'dark_gray' }];
        element.setAttribute('data-tip', JSON.stringify(data));
    }

    function showOption(state) {
        const stack = state.options[state.index];
        const promise = fill(state.element, stack);
        if (state.options.length > 1) addTipLine(state.element.firstElementChild, `${state.index + 1} of ${state.options.length} · ${touch.matches ? 'Tap' : 'Scroll'} to browse`);
        return promise.then(() => ready.add(keyOf(stack)));
    }

    function warm(stack) {
        const key = keyOf(stack);
        if (ready.has(key) || broken.has(key)) return;
        const promise = stack.components ? paint(makeSlot(stack)) : renderIcon(stack.id);
        promise.then(result => (result === null ? broken.add(key) : ready.add(key)), () => broken.add(key));
    }

    function draw(found) {
        const { gui, type } = found;
        host.style.setProperty('--gui', `url("${sprite(`container/${gui.texture}`)}")`);
        host.style.setProperty('--h', gui.height || 78);
        const cook = found.cook;
        host.innerHTML = `<span class="mc-gui-title"${gui.centred ? ' data-centred' : ` style="${at(gui.titleAt)}"`}>${escape(gui.title)}</span>`
            + gui.inputs.map((pos, i) => `<span class="mc-gui-slot" data-cell="${i}" style="${at(pos)}"></span>`).join('')
            + (gui.fuel ? `<span class="mc-gui-slot" data-fuel style="${at(gui.fuel)}"></span>` : '')
            + (gui.flame ? `<span class="mc-gui-flame" style="${at(gui.flame)};--img:url('${sprite('sprites/container/furnace/lit_progress')}')"></span>` : '')
            + (gui.arrow ? `<span class="mc-gui-arrow" style="${at(gui.arrow)};--img:url('${sprite('sprites/container/furnace/burn_progress')}');--cook:${cook / 20}s"></span>` : '')
            + (gui.brew ? `<span class="mc-gui-brew" style="${at(gui.brew)};--img:url('${sprite('sprites/container/brewing_stand/brew_progress')}')"></span>` : '')
            + (gui.bubbles ? `<span class="mc-gui-bubbles" style="${at(gui.bubbles)};--img:url('${sprite('sprites/container/brewing_stand/bubbles')}')"></span>` : '')
            + (gui.fuelBar ? `<span class="mc-gui-fuel-bar" style="${at(gui.fuelBar)};--img:url('${sprite('sprites/container/brewing_stand/fuel_length')}')"></span>` : '')
            + (gui.choice ? `<span class="mc-gui-choice" style="${at(gui.choice)};--img:url('${sprite('sprites/container/stonecutter/recipe_selected')}')"><span class="mc-gui-slot" data-choice style="left:0;top:calc(1px * var(--s))"></span></span>` : '')
            + `<span class="mc-gui-slot is-result${gui.framed ? ' is-framed' : ''}" data-result style="${at(gui.result)}"></span>`
            + (gui.arrow ? `<span class="mc-gui-note">${escape(`${cook / 20}s${found.experience ? ` · ${found.experience} XP` : ''}`)}</span>` : '')
            + (type === 'brewing' ? '<span class="mc-gui-note is-brewing">20s</span>' : '');
        const result = found.result || { id: item };
        fill(host.querySelector('[data-result]'), result, Number(result.count || 1));
        const choice = host.querySelector('[data-choice]');
        if (choice) fill(choice, result);
        states = found.cells.map((options, i) => {
            const target = host.querySelector(`[data-cell="${i}"]`);
            if (!target || !options || !options.length) return null;
            const state = { options, index: 0, element: target, lazy: options.length > 24 };
            showOption(state);
            return state;
        });
        const fuelSlot = host.querySelector('[data-fuel]');
        if (fuelSlot && found.fuel && found.fuel.length) {
            const state = { options: found.fuel, index: 0, element: fuelSlot, lazy: true };
            showOption(state);
            states.push(state);
        }
        const ahead = state => [1, 2, 3].forEach(step => warm(state.options[(state.index + step) % state.options.length]));
        states.forEach(state => { if (state && state.options.length > 1) state.lazy ? ahead(state) : state.options.slice(1).forEach(warm); });
        timer = setInterval(() => {
            for (const state of states) {
                if (!state || state.options.length < 2 || state.element === hovered) continue;
                let next = (state.index + 1) % state.options.length;
                while (broken.has(keyOf(state.options[next])) && next !== state.index) next = (next + 1) % state.options.length;
                if (!state.lazy) {
                    let step = 0;
                    while (!ready.has(keyOf(state.options[next])) && step++ < state.options.length) next = (next + 1) % state.options.length;
                }
                if (ready.has(keyOf(state.options[next])) && next !== state.index) {
                    state.index = next;
                    if (dialog.open) showOption(state);
                }
                if (state.lazy) ahead(state);
            }
        }, 1500);
    }

    async function show() {
        clearInterval(timer);
        const mine = ++token;
        if (nav) nav.hidden = sources.length < 2;
        const recipe = sources.length ? await sources[index]() : null;
        const found = recipe ? await layout(recipe) : null;
        if (mine !== token) return;
        if (page) {
            const label = recipe && sources.length > 1 ? variantLabel(recipe, item, names) : '';
            page.replaceChildren(...(label ? [Object.assign(document.createElement('b'), { textContent: label })] : []), Object.assign(document.createElement('small'), { textContent: `${index + 1} of ${sources.length}` }));
        }
        missing.hidden = !!found;
        draw(found || { gui: GUIS.crafting, cells: [], result: { id: item } });
    }

    dialog.addEventListener('click', event => {
        if (event.target === dialog || event.target.closest('.dialog-close')) { dialog.close(); return; }
        const step = event.target.closest('[data-step]');
        if (step && sources.length > 1) {
            index = (index + Number(step.dataset.step) + sources.length) % sources.length;
            show();
        }
    });
    dialog.addEventListener('close', () => clearInterval(timer));

    host.addEventListener('pointerover', event => { hovered = event.target.closest('.mc-gui-slot'); });
    host.addEventListener('pointerleave', () => { hovered = null; });

    const stateAt = target => {
        const cell = target.closest('.mc-gui-slot');
        const state = cell && states.find(entry => entry && entry.element === cell);
        return state && state.options.length > 1 ? state : null;
    };

    host.addEventListener('click', event => {
        const state = event.pointerType === 'touch' || touch.matches ? stateAt(event.target) : null;
        if (state) browse(state, 1, event);
    });

    host.addEventListener('wheel', event => {
        const state = stateAt(event.target);
        if (!state) return;
        event.preventDefault();
        wheel += event.deltaY || event.deltaX;
        if (Math.abs(wheel) < 30) return;
        const step = Math.sign(wheel);
        wheel = 0;
        browse(state, step, event);
    }, { passive: false });

    function browse(state, step, event) {
        const count = state.options.length;
        let next = (state.index + step + count) % count;
        while (broken.has(keyOf(state.options[next])) && next !== state.index) next = (next + step + count) % count;
        state.index = next;
        showOption(state);
        if (state.lazy) [1, 2, 3].forEach(ahead => warm(state.options[(next + ahead * step + count * 3) % count]));
        const shown = state.element.firstElementChild;
        if (shown) shown.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: event.clientX, clientY: event.clientY, pointerType: 'mouse' }));
    }

    return {
        resolveItems,
        open(itemId, recipeSources) {
            item = itemId;
            sources = recipeSources;
            index = 0;
            dialog.querySelector('h2').textContent = names.item(itemId);
            if (!dialog.open) dialog.showModal();
            return show();
        }
    };
}
