'use strict';

(function () {
    const LEVELS = ['1', '2', '3', '4', '5'];
    const LEVEL_NAMES = { 1: 'Novice', 2: 'Apprentice', 3: 'Journeyman', 4: 'Expert', 5: 'Master' };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (value, fallback) => (value === '' || value === null || value === undefined || Number.isNaN(Number(value)) ? fallback : Number(value));
    const version = () => (document.querySelector('input[name="mc-version"]:checked') || {}).value || '26.3';
    const legacy = () => version() === '1.21.1';

    /* ---------- models ---------- */

    const newTrade = () => ({ map: false, wants: { id: 'minecraft:emerald', count: 1 }, extra: null, gives: { id: '', count: 1, components: '' },
        mapInfo: { tag: '', decoration: '', name: '', radius: 100 }, uses: 12, xp: 1, discount: 0.05, weight: '' });
    const newLevels = () => Object.fromEntries(LEVELS.map(level => [level, { replace: false, amount: '', trades: [] }]));

    const MODELS = {
        trades: { create: () => ({ levels: newLevels() }), toJson: m => ({ levels: levelsJson(m.levels) }), fromJson: j => ({ levels: levelsFrom(j && j.levels) }) },
        biome: {
            create: () => ({ groups: [] }),
            toJson: m => ({ biome_overrides: Object.fromEntries(m.groups.filter(g => g.types.trim()).map(g => [g.types.trim(), { levels: levelsJson(g.levels) }])) }),
            fromJson: j => ({ groups: Object.entries((j && j.biome_overrides) || {}).map(([types, value]) => ({ types, levels: levelsFrom(value && value.levels) })) })
        },
        loot: {
            create: () => ({ pools: [{ rolls: 1, entries: [] }] }),
            toJson: m => ({ type: 'minecraft:gift', pools: m.pools.map(pool => ({
                rolls: num(pool.rolls, 1),
                entries: pool.entries.filter(e => e.item).map(e => {
                    const entry = { type: 'minecraft:item', name: e.item };
                    if (num(e.weight, 1) !== 1) entry.weight = num(e.weight, 1);
                    const min = num(e.min, 1), max = num(e.max, min);
                    if (min !== 1 || max !== 1) entry.functions = [{ function: 'minecraft:set_count', count: min === max ? min : { min, max } }];
                    return entry;
                })
            })) }),
            fromJson: j => ({ pools: ((j && j.pools) || []).map(pool => ({
                rolls: typeof pool.rolls === 'number' ? pool.rolls : 1,
                entries: (pool.entries || []).map(e => {
                    const count = ((e.functions || []).find(f => String(f.function).endsWith('set_count')) || {}).count;
                    return { item: e.name || '', weight: e.weight || 1, min: typeof count === 'object' ? count.min : (count || 1), max: typeof count === 'object' ? count.max : (count || 1) };
                })
            })) })
        },
        structures: {
            create: () => ({ replace: false, values: [''] }),
            toJson: m => ({ replace: !!m.replace, values: m.values.map(v => v.trim()).filter(Boolean) }),
            fromJson: j => ({ replace: !!(j && j.replace), values: ((j && j.values) || []).map(v => (typeof v === 'object' ? v.id : v)) })
        }
    };

    function levelsJson(levels) {
        const out = {};
        for (const level of LEVELS) {
            const data = levels[level];
            if (!data || !data.trades.length) continue;
            const value = { trades: data.trades.map(tradeJson) };
            if (data.replace) value.replace = true;
            if (data.amount !== '' && data.amount !== undefined) value.trade_list_amount = num(data.amount, 1);
            out[level] = value;
        }
        return out;
    }

    function components(text) {
        if (!text || !text.trim()) return undefined;
        try { return JSON.parse(text); } catch (error) { return undefined; }
    }

    function tradeJson(t) {
        const weight = t.weight === '' ? undefined : num(t.weight, 1);
        if (legacy()) {
            const out = { buy_a: { item: t.wants.id, count: num(t.wants.count, 1) } };
            if (t.extra && t.extra.id) out.buy_b = { item: t.extra.id, count: num(t.extra.count, 1) };
            if (t.map) {
                out.sell = { item_type: 'treasure_map', structure_tag: t.mapInfo.tag, display_name: t.mapInfo.name || undefined, map_decoration: t.mapInfo.decoration || undefined };
            } else {
                out.sell = { item: t.gives.id, count: num(t.gives.count, 1) };
                const extra = components(t.gives.components);
                if (extra) out.sell.components = extra;
            }
            Object.assign(out, { max_uses: num(t.uses, 12), xp: num(t.xp, 1), price_multiplier: num(t.discount, 0.05) });
            if (weight !== undefined) out.trade_list_weight = weight;
            return out;
        }
        const out = { wants: { id: t.wants.id, count: num(t.wants.count, 1) } };
        if (t.extra && t.extra.id) out.additional_wants = { id: t.extra.id, count: num(t.extra.count, 1) };
        if (t.map) {
            out.gives = { id: 'minecraft:map' };
            out.given_item_modifiers = [
                { function: 'minecraft:exploration_map', destination: t.mapInfo.tag, decoration: t.mapInfo.decoration || 'minecraft:red_x', search_radius: num(t.mapInfo.radius, 100) },
                ...(t.mapInfo.name ? [{ function: 'minecraft:set_name', name: { translate: t.mapInfo.name }, target: 'item_name' }] : []),
                { function: 'minecraft:filtered', item_filter: { items: 'minecraft:filled_map', predicates: { 'minecraft:map_id': {} } }, on_fail: { function: 'minecraft:discard' } }
            ];
        } else {
            out.gives = { id: t.gives.id };
            if (num(t.gives.count, 1) !== 1) out.gives.count = num(t.gives.count, 1);
            const extra = components(t.gives.components);
            if (extra) out.gives.components = extra;
        }
        Object.assign(out, { max_uses: num(t.uses, 12), xp: num(t.xp, 1), reputation_discount: num(t.discount, 0.05) });
        if (weight !== undefined) out.trade_list_weight = weight;
        return out;
    }

    function stackFrom(value) {
        if (!value) return null;
        if (typeof value === 'string') return { id: value, count: 1 };
        return { id: value.id || value.item || '', count: typeof value.count === 'number' ? value.count : 1, components: value.components ? JSON.stringify(value.components) : '' };
    }

    function tradeFrom(j) {
        const t = newTrade();
        const wants = stackFrom(j.wants || j.buy_a);
        if (wants) t.wants = { id: wants.id, count: wants.count };
        const extra = stackFrom(j.additional_wants || j.buy_b);
        if (extra) t.extra = { id: extra.id, count: extra.count };
        const sell = j.sell && typeof j.sell === 'object' ? j.sell : null;
        const exploration = (j.given_item_modifiers || []).find(m => String(m.function || m.type).endsWith('exploration_map'));
        if (exploration || (sell && sell.item_type === 'treasure_map')) {
            t.map = true;
            const naming = (j.given_item_modifiers || []).find(m => String(m.function || m.type).endsWith('set_name'));
            t.mapInfo = exploration
                ? { tag: exploration.destination || '', decoration: exploration.decoration || '', name: naming && naming.name ? naming.name.translate || '' : '', radius: exploration.search_radius || 100 }
                : { tag: sell.structure_tag || '', decoration: sell.map_decoration || '', name: sell.display_name || '', radius: 100 };
        } else {
            const gives = stackFrom(j.gives || j.sell);
            if (gives) t.gives = gives;
        }
        t.uses = j.max_uses ?? 12;
        t.xp = j.xp ?? 1;
        t.discount = j.reputation_discount ?? j.price_multiplier ?? 0.05;
        t.weight = j.trade_list_weight ?? '';
        return t;
    }

    function levelsFrom(levels) {
        const out = newLevels();
        for (const [level, value] of Object.entries(levels || {})) {
            if (!out[level]) continue;
            const trades = Array.isArray(value) ? value : (value && value.trades) || [];
            out[level] = { replace: !!(value && value.replace), amount: value && value.trade_list_amount !== undefined ? value.trade_list_amount : '', trades: trades.map(tradeFrom) };
        }
        return out;
    }

    /* ---------- rendering ---------- */

    const input = (path, value, placeholder = '', type = 'text', extra = '') =>
        `<input type="${type}" data-path="${path}" value="${esc(value)}" placeholder="${esc(placeholder)}" spellcheck="false" autocomplete="off" ${extra}>`;
    const labelled = (label, control) => `<label class="field"><span>${label}</span>${control}</label>`;

    function tradeHtml(base, t, index) {
        const p = `${base}.trades.${index}`;
        return `<div class="je-trade">
            <div class="je-row">
                <strong>Trade ${index + 1}</strong>
                <label class="check"><input type="checkbox" data-path="${p}.map"${t.map ? ' checked' : ''}> Explorer map</label>
                <button type="button" class="link danger" data-op="remove-trade" data-base="${base}" data-index="${index}">Remove</button>
            </div>
            <div class="je-grid">
                ${labelled('Wants', input(`${p}.wants.id`, t.wants.id, 'minecraft:emerald'))}
                ${labelled('Count', input(`${p}.wants.count`, t.wants.count, '1', 'number', 'min="1"'))}
                ${t.extra
                    ? labelled('Also wants', input(`${p}.extra.id`, t.extra.id, 'minecraft:compass')) + labelled('Count', input(`${p}.extra.count`, t.extra.count, '1', 'number', 'min="1"'))
                    : `<div class="je-add-extra"><button type="button" class="link" data-op="add-extra" data-path="${p}">+ Second item wanted</button></div>`}
                ${t.map
                    ? labelled('Structure tag', input(`${p}.mapInfo.tag`, t.mapInfo.tag, 'namespace:on_example_maps'))
                      + labelled('Decoration', input(`${p}.mapInfo.decoration`, t.mapInfo.decoration, 'namespace:example_decoration'))
                      + labelled('Name key', input(`${p}.mapInfo.name`, t.mapInfo.name, 'filled_map.example'))
                      + (legacy() ? '' : labelled('Search radius', input(`${p}.mapInfo.radius`, t.mapInfo.radius, '100', 'number')))
                    : labelled('Gives', input(`${p}.gives.id`, t.gives.id, 'minecraft:diamond'))
                      + labelled('Count', input(`${p}.gives.count`, t.gives.count, '1', 'number', 'min="1"'))}
                ${labelled('Max uses', input(`${p}.uses`, t.uses, '12', 'number', 'min="1"'))}
                ${labelled('XP', input(`${p}.xp`, t.xp, '1', 'number', 'min="0"'))}
                ${labelled(legacy() ? 'Price multiplier' : 'Reputation discount', input(`${p}.discount`, t.discount, '0.05', 'number', 'step="0.01" min="0"'))}
                ${labelled('List weight', input(`${p}.weight`, t.weight, 'Default', 'number', 'min="0"'))}
            </div>
            ${t.map ? '' : `<label class="field"><span>Item components (optional JSON)</span><textarea rows="2" data-path="${p}.gives.components" spellcheck="false" placeholder='{"minecraft:enchantments": {"minecraft:sharpness": 3}}'>${esc(t.gives.components)}</textarea></label>`}
        </div>`;
    }

    function levelsHtml(base, levels) {
        return LEVELS.map(level => {
            const data = levels[level];
            const p = `${base}.${level}`;
            return `<details class="je-level"${data.trades.length || level === '1' ? ' open' : ''}>
                <summary>${LEVEL_NAMES[level]} <span>${data.trades.length} trade${data.trades.length === 1 ? '' : 's'}</span></summary>
                <div class="je-row">
                    <label class="check"><input type="checkbox" data-path="${p}.replace"${data.replace ? ' checked' : ''}> Replace existing trades</label>
                    ${labelled('Trades offered', input(`${p}.amount`, data.amount, 'All', 'number', 'min="1"'))}
                </div>
                ${data.trades.map((t, i) => tradeHtml(p, t, i)).join('')}
                <button type="button" class="link" data-op="add-trade" data-base="${p}">+ Add trade</button>
            </details>`;
        }).join('');
    }

    const RENDER = {
        trades: m => levelsHtml('levels', m.levels),
        biome: m => m.groups.map((g, i) => `<div class="je-group">
                <div class="je-row">${labelled('Villager types (comma separated)', input(`groups.${i}.types`, g.types, 'minecraft:desert, minecraft:savanna'))}
                <button type="button" class="link danger" data-op="remove-group" data-index="${i}">Remove</button></div>
                ${levelsHtml(`groups.${i}.levels`, g.levels)}</div>`).join('')
            + '<button type="button" class="link" data-op="add-group">+ Add villager types</button>',
        loot: m => m.pools.map((pool, i) => `<div class="je-group">
                <div class="je-row">${labelled('Rolls', input(`pools.${i}.rolls`, pool.rolls, '1', 'number', 'min="1"'))}
                <button type="button" class="link danger" data-op="remove-pool" data-index="${i}">Remove pool</button></div>
                ${pool.entries.map((e, j) => `<div class="je-grid je-entry">
                    ${labelled('Item', input(`pools.${i}.entries.${j}.item`, e.item, 'minecraft:emerald'))}
                    ${labelled('Weight', input(`pools.${i}.entries.${j}.weight`, e.weight, '1', 'number', 'min="1"'))}
                    ${labelled('Min', input(`pools.${i}.entries.${j}.min`, e.min, '1', 'number', 'min="1"'))}
                    ${labelled('Max', input(`pools.${i}.entries.${j}.max`, e.max, '1', 'number', 'min="1"'))}
                    <button type="button" class="link danger" data-op="remove-entry" data-pool="${i}" data-index="${j}">Remove</button></div>`).join('')}
                <button type="button" class="link" data-op="add-entry" data-pool="${i}">+ Add item</button></div>`).join('')
            + '<button type="button" class="link" data-op="add-pool">+ Add pool</button>',
        structures: m => `<label class="check"><input type="checkbox" data-path="replace"${m.replace ? ' checked' : ''}> Replace tag</label>
            ${m.values.map((v, i) => `<div class="je-row">${input(`values.${i}`, v, 'minecraft:end_city')}<button type="button" class="link danger" data-op="remove-value" data-index="${i}">Remove</button></div>`).join('')}
            <button type="button" class="link" data-op="add-value">+ Add structure</button>`
    };

    /* ---------- wiring ---------- */

    const get = (object, path) => path.split('.').reduce((value, key) => (value == null ? value : value[key]), object);
    const set = (object, path, value) => {
        const keys = path.split('.');
        const last = keys.pop();
        get(object, keys.join('.'))[last] = value;
    };

    const editors = new Set();

    function write(editor) {
        const area = editor.area;
        area.value = JSON.stringify(MODELS[editor.kind].toJson(editor.model), null, 2);
    }

    function render(editor) {
        editor.host.innerHTML = RENDER[editor.kind](editor.model);
        write(editor);
    }

    function setManual(editor, manual) {
        editor.manual = manual;
        editor.wrap.classList.toggle('is-manual', manual);
        if (manual) {
            write(editor);
        } else if (editor.area.value.trim()) {
            try {
                editor.model = MODELS[editor.kind].fromJson(JSON.parse(editor.area.value));
            } catch (error) {
                if (window.Site) window.Site.toast('The JSON could not be read, so the editor kept its previous values', 'error');
            }
            render(editor);
        }
    }

    function mount(root) {
        root.querySelectorAll('[data-json-editor]:not([data-mounted])').forEach(wrap => {
            wrap.dataset.mounted = '1';
            const editor = {
                wrap,
                kind: wrap.dataset.jsonEditor,
                area: wrap.querySelector('textarea[data-field]'),
                host: wrap.querySelector('.json-editor'),
                model: null,
                manual: false
            };
            editor.model = MODELS[editor.kind].create();
            editors.add(editor);
            render(editor);

            wrap.querySelector('[data-manual]').addEventListener('change', event => setManual(editor, event.target.checked));

            editor.host.addEventListener('input', event => {
                const path = event.target.dataset.path;
                if (!path) return;
                const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
                set(editor.model, path, value);
                if (event.target.type === 'checkbox') render(editor); else write(editor);
            });
            editor.host.addEventListener('change', event => {
                if (event.target.type === 'checkbox' && event.target.dataset.path) {
                    set(editor.model, event.target.dataset.path, event.target.checked);
                    render(editor);
                }
            });
            editor.host.addEventListener('click', event => {
                const button = event.target.closest('[data-op]');
                if (!button) return;
                const d = button.dataset;
                const m = editor.model;
                switch (d.op) {
                    case 'add-trade': get(m, d.base).trades.push(newTrade()); break;
                    case 'remove-trade': get(m, d.base).trades.splice(Number(d.index), 1); break;
                    case 'add-extra': get(m, d.path).extra = { id: '', count: 1 }; break;
                    case 'add-group': m.groups.push({ types: '', levels: newLevels() }); break;
                    case 'remove-group': m.groups.splice(Number(d.index), 1); break;
                    case 'add-pool': m.pools.push({ rolls: 1, entries: [] }); break;
                    case 'remove-pool': m.pools.splice(Number(d.index), 1); break;
                    case 'add-entry': m.pools[d.pool].entries.push({ item: '', weight: 1, min: 1, max: 1 }); break;
                    case 'remove-entry': m.pools[d.pool].entries.splice(Number(d.index), 1); break;
                    case 'add-value': m.values.push(''); break;
                    case 'remove-value': m.values.splice(Number(d.index), 1); break;
                }
                render(editor);
            });
        });
    }

    function refreshAll() {
        for (const editor of editors) {
            if (!editor.wrap.isConnected) { editors.delete(editor); continue; }
            if (!editor.manual) render(editor);
        }
    }

    window.JsonEditors = { mount, refreshAll };
})();
