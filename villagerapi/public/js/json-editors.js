'use strict';

(function () {
    const LEVELS = ['1', '2', '3', '4', '5'];
    const LEVEL_NAMES = { 1: 'Novice', 2: 'Apprentice', 3: 'Journeyman', 4: 'Expert', 5: 'Master' };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (value, fallback) => (value === '' || value === null || value === undefined || Number.isNaN(Number(value)) ? fallback : Number(value));
    const version = () => (document.querySelector('input[name="mc-version"]:checked') || {}).value || '26.3';
    const legacy = () => version() === '1.21.1';

    /* ---------- item properties ---------- */

    const POTIONS = ['water','mundane','thick','awkward','night_vision','long_night_vision','invisibility','long_invisibility','leaping','long_leaping','strong_leaping',
        'fire_resistance','long_fire_resistance','swiftness','long_swiftness','strong_swiftness','slowness','long_slowness','strong_slowness','turtle_master','long_turtle_master',
        'strong_turtle_master','water_breathing','long_water_breathing','healing','strong_healing','harming','strong_harming','poison','long_poison','strong_poison',
        'regeneration','long_regeneration','strong_regeneration','strength','long_strength','strong_strength','weakness','long_weakness','luck','slow_falling','long_slow_falling',
        'wind_charged','weaving','oozing','infested'].map(id => 'minecraft:' + id);
    const HORNS = ['ponder','sing','seek','feel','admire','call','yearn','dream'].map(id => `minecraft:${id}_goat_horn`);
    const SONGS = ['13','cat','blocks','chirp','far','mall','mellohi','stal','strad','ward','11','wait','pigstep','otherside','5','relic','creator','creator_music_box','precipice']
        .map(id => 'minecraft:' + id);
    const TRIM_MATERIALS = ['amethyst','copper','diamond','emerald','gold','iron','lapis','netherite','quartz','redstone','resin'].map(id => 'minecraft:' + id);
    const TRIM_PATTERNS = ['bolt','coast','dune','eye','flow','host','raiser','rib','sentry','shaper','silence','snout','spire','tide','vex','ward','wayfinder','wild']
        .map(id => 'minecraft:' + id);
    const DYES = ['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black'];
    const SHAPES = ['small_ball','large_ball','star','creeper','burst'];

    const PROPS = {
        potion: { label: 'Potion', hint: 'potion, splash_potion, lingering_potion, tipped_arrow',
            fields: [['potion', 'Potion', 'select', POTIONS], ['color', 'Custom colour (optional)', 'color']] },
        random_potion: { label: 'Random potion', hint: 'Picked from a potion tag when the trade is created. Minecraft 26.3 only',
            fields: [['options', 'Potion tag', 'text', '#minecraft:tradeable']], only: '26.3' },
        enchantments: { label: 'Enchantments', hint: 'One per line, e.g. minecraft:sharpness 5. Stored on enchanted books automatically',
            fields: [['lines', 'Enchantments', 'lines', 'minecraft:unbreaking 3']] },
        random_enchantment: { label: 'Random enchantment', hint: 'Books: random enchantment from a tag. Gear: random enchantments by level (26.3 only)',
            fields: [['mode', 'Target', 'select', ['book', 'gear']], ['options', 'Enchantment tag', 'text', '#minecraft:tradeable'], ['min', 'Min level', 'number', '5'], ['max', 'Max level', 'number', '19']] },
        stew: { label: 'Suspicious stew', hint: 'One effect per line with seconds, e.g. minecraft:night_vision 5. Random picks one of them',
            fields: [['lines', 'Effects', 'lines', 'minecraft:night_vision 5'], ['random', 'Pick one at random', 'check']] },
        dyed_color: { label: 'Dye colour', hint: 'Leather armour, wolf armour', fields: [['color', 'Colour', 'color']] },
        trim: { label: 'Armour trim', hint: 'Armour pieces', fields: [['material', 'Material', 'select', TRIM_MATERIALS], ['pattern', 'Pattern', 'select', TRIM_PATTERNS]] },
        banner: { label: 'Banner patterns', hint: 'One layer per line, e.g. minecraft:stripe_top red. Shields can set a base colour',
            fields: [['lines', 'Layers', 'lines', 'minecraft:stripe_top red'], ['base', 'Shield base colour', 'select', [''].concat(DYES)]] },
        instrument: { label: 'Goat horn', hint: 'goat_horn', fields: [['id', 'Instrument', 'select', HORNS]] },
        jukebox: { label: 'Jukebox song', hint: 'Makes any item playable in a jukebox. Music discs already have their song',
            fields: [['song', 'Song', 'select', SONGS]] },
        fireworks: { label: 'Firework rocket', hint: 'firework_rocket', fields: [['flight', 'Flight duration', 'select', ['1', '2', '3']], ...explosionFields()] },
        firework_star: { label: 'Firework star', hint: 'firework_star', fields: explosionFields() },
        profile: { label: 'Player head', hint: 'player_head', fields: [['name', 'Player name', 'text', 'Steve']] },
        book: { label: 'Written book', hint: 'written_book. Separate pages with a line containing ---',
            fields: [['title', 'Title', 'text', 'Field Notes'], ['author', 'Author', 'text', 'Librarian'], ['pages', 'Pages', 'lines', 'Page one\n---\nPage two']] },
        ominous: { label: 'Ominous bottle level', hint: 'ominous_bottle', fields: [['level', 'Bad Omen level', 'select', ['1', '2', '3', '4', '5']]] },
        name: { label: 'Name', hint: 'Any item', fields: [['text', 'Name', 'text', 'Lucky Pickaxe']] },
        lore: { label: 'Lore', hint: 'One line per row', fields: [['lines', 'Lore', 'lines', 'Forged in the village']] },
        rarity: { label: 'Rarity', hint: 'Name colour', fields: [['value', 'Rarity', 'select', ['common', 'uncommon', 'rare', 'epic']]] },
        glint: { label: 'Enchantment glint', hint: 'Force the glint on or off', fields: [['on', 'Show glint', 'check']] },
        unbreakable: { label: 'Unbreakable', hint: 'Tools, weapons and armour', fields: [] },
        damage: { label: 'Damage', hint: 'Used durability', fields: [['value', 'Damage', 'number', '0']] }
    };

    function explosionFields() {
        return [['shape', 'Shape', 'select', SHAPES], ['colors', 'Colours (hex, comma separated)', 'text', 'ff0000, ffaa00'],
            ['fade', 'Fade colours (optional)', 'text', 'ffffff'], ['trail', 'Trail', 'check'], ['twinkle', 'Twinkle', 'check']];
    }

    const hexInt = value => parseInt(String(value || '').replace('#', ''), 16);
    const intHex = value => '#' + (Number(value) >>> 0 & 0xffffff).toString(16).padStart(6, '0');
    const lines = value => String(value || '').split('\n').map(line => line.trim()).filter(Boolean);

    function explosion(p) {
        const out = { shape: p.shape || 'small_ball', colors: String(p.colors || '').split(',').map(hexInt).filter(n => !Number.isNaN(n)) };
        const fade = String(p.fade || '').split(',').map(hexInt).filter(n => !Number.isNaN(n));
        if (fade.length) out.fade_colors = fade;
        if (p.trail) out.has_trail = true;
        if (p.twinkle) out.has_twinkle = true;
        return out;
    }

    // Returns { components, modifiers, legacySell, notes } for one trade's properties.
    function applyProps(t) {
        const result = { components: {}, modifiers: [], legacySell: null, notes: [] };
        const itemPath = String(t.gives.id || '').replace(/^minecraft:/, '');
        const c = result.components;
        for (const p of t.props || []) {
            switch (p.type) {
                case 'potion': {
                    const value = { potion: p.potion || 'minecraft:water' };
                    if (p.color) value.custom_color = hexInt(p.color);
                    c['minecraft:potion_contents'] = value;
                    break;
                }
                case 'random_potion':
                    if (legacy()) result.notes.push('Random potions need Minecraft 26.3.');
                    else result.modifiers.push({ function: 'minecraft:set_random_potion', options: p.options || '#minecraft:tradeable' });
                    break;
                case 'enchantments': {
                    const map = {};
                    for (const line of lines(p.lines)) {
                        const [id, level] = line.split(/\s+/);
                        if (id) map[id.includes(':') ? id : 'minecraft:' + id] = num(level, 1);
                    }
                    c[itemPath === 'enchanted_book' ? 'minecraft:stored_enchantments' : 'minecraft:enchantments'] = map;
                    break;
                }
                case 'random_enchantment': {
                    const book = (p.mode || 'book') === 'book';
                    if (legacy()) {
                        if (book) result.legacySell = { item_type: 'enchanted_book', enchantment_tag: (p.options || '#minecraft:tradeable').replace(/^#/, ''),
                            ...(p.min ? { min_level: num(p.min, 1) } : {}), ...(p.max ? { max_level: num(p.max, 1) } : {}) };
                        else result.notes.push('Random gear enchantments need Minecraft 26.3.');
                        break;
                    }
                    result.modifiers.push(book
                        ? { function: 'minecraft:enchant_randomly', include_additional_cost_component: true, only_compatible: false, options: p.options || '#minecraft:tradeable' }
                        : { function: 'minecraft:enchant_with_levels', include_additional_cost_component: true,
                            levels: { type: 'minecraft:uniform', min: num(p.min, 5), max: num(p.max, 19) }, options: p.options || '#minecraft:on_traded_equipment' });
                    result.modifiers.push({ function: 'minecraft:filtered', item_filter: { items: t.gives.id,
                        predicates: { [book ? 'minecraft:stored_enchantments' : 'minecraft:enchantments']: [{}] } }, on_fail: { function: 'minecraft:discard' } });
                    break;
                }
                case 'stew': {
                    const effects = lines(p.lines).map(line => {
                        const [id, seconds] = line.split(/\s+/);
                        return { id: id.includes(':') ? id : 'minecraft:' + id, seconds: num(seconds, 5) };
                    });
                    if (!effects.length) break;
                    if (p.random) {
                        if (legacy()) {
                            result.legacySell = { item_type: 'suspicious_stew', effect: effects[0].id, duration: effects[0].seconds * 20 };
                            if (effects.length > 1) result.notes.push('Minecraft 1.21.1 stews support one effect, so only the first is used.');
                        } else {
                            result.modifiers.push({ function: 'minecraft:set_stew_effect', effects: effects.map(e => ({ type: e.id, duration: e.seconds })) });
                        }
                    } else {
                        c['minecraft:suspicious_stew_effects'] = effects.map(e => ({ id: e.id, duration: e.seconds * 20 }));
                    }
                    break;
                }
                case 'dyed_color':
                    c['minecraft:dyed_color'] = legacy() ? { rgb: hexInt(p.color || '#a06540') } : hexInt(p.color || '#a06540');
                    break;
                case 'trim':
                    c['minecraft:trim'] = { material: p.material || TRIM_MATERIALS[0], pattern: p.pattern || TRIM_PATTERNS[0] };
                    break;
                case 'banner': {
                    c['minecraft:banner_patterns'] = lines(p.lines).map(line => {
                        const [pattern, color] = line.split(/\s+/);
                        return { pattern: pattern.includes(':') ? pattern : 'minecraft:' + pattern, color: color || 'white' };
                    });
                    if (p.base) c['minecraft:base_color'] = p.base;
                    break;
                }
                case 'instrument': c['minecraft:instrument'] = p.id || HORNS[0]; break;
                case 'jukebox': c['minecraft:jukebox_playable'] = legacy() ? { song: p.song || SONGS[0] } : (p.song || SONGS[0]); break;
                case 'fireworks': c['minecraft:fireworks'] = { flight_duration: num(p.flight, 1), explosions: p.colors ? [explosion(p)] : [] }; break;
                case 'firework_star': c['minecraft:firework_explosion'] = explosion(p); break;
                case 'profile': if (p.name) c['minecraft:profile'] = { name: p.name }; break;
                case 'book': {
                    const pages = String(p.pages || '').split(/\n-{3,}\n/).map(page => page.trim()).filter(Boolean);
                    c['minecraft:written_book_content'] = { title: { raw: p.title || 'Book' }, author: p.author || 'Villager', pages: pages.map(page => ({ raw: page })) };
                    break;
                }
                case 'ominous': c['minecraft:ominous_bottle_amplifier'] = Math.max(0, num(p.level, 1) - 1); break;
                case 'name': if (p.text) c['minecraft:custom_name'] = p.text; break;
                case 'lore': c['minecraft:lore'] = lines(p.lines); break;
                case 'rarity': c['minecraft:rarity'] = p.value || 'common'; break;
                case 'glint': c['minecraft:enchantment_glint_override'] = !!p.on; break;
                case 'unbreakable': c['minecraft:unbreakable'] = {}; break;
                case 'damage': c['minecraft:damage'] = num(p.value, 0); break;
            }
        }
        return result;
    }

    // Reads components and modifiers back into properties; anything unknown stays as raw JSON.
    function propsFrom(components, modifiers, legacySell) {
        const props = [];
        const rest = { ...(components || {}) };
        const take = key => { const value = rest['minecraft:' + key]; delete rest['minecraft:' + key]; return value; };
        let v;
        if ((v = take('potion_contents'))) props.push({ type: 'potion', potion: v.potion || 'minecraft:water', color: v.custom_color !== undefined ? intHex(v.custom_color) : '' });
        for (const key of ['enchantments', 'stored_enchantments']) {
            if ((v = take(key))) props.push({ type: 'enchantments', lines: Object.entries(v.levels || v).map(([id, level]) => `${id} ${level}`).join('\n') });
        }
        if ((v = take('suspicious_stew_effects'))) props.push({ type: 'stew', random: false, lines: v.map(e => `${e.id} ${Math.round((e.duration || 160) / 20)}`).join('\n') });
        if ((v = take('dyed_color')) !== undefined) props.push({ type: 'dyed_color', color: intHex(typeof v === 'object' ? v.rgb : v) });
        if ((v = take('trim'))) props.push({ type: 'trim', material: v.material, pattern: v.pattern });
        if ((v = take('banner_patterns'))) props.push({ type: 'banner', lines: v.map(l => `${l.pattern} ${l.color}`).join('\n'), base: take('base_color') || '' });
        if ((v = take('instrument'))) props.push({ type: 'instrument', id: typeof v === 'string' ? v : HORNS[0] });
        if ((v = take('jukebox_playable'))) props.push({ type: 'jukebox', song: typeof v === 'string' ? v : v.song });
        const toExplosion = e => ({ shape: e.shape, colors: (e.colors || []).map(n => intHex(n).slice(1)).join(', '), fade: (e.fade_colors || []).map(n => intHex(n).slice(1)).join(', '), trail: !!e.has_trail, twinkle: !!e.has_twinkle });
        if ((v = take('fireworks'))) props.push({ type: 'fireworks', flight: String(v.flight_duration || 1), ...toExplosion((v.explosions || [])[0] || {}) });
        if ((v = take('firework_explosion'))) props.push({ type: 'firework_star', ...toExplosion(v) });
        if ((v = take('profile'))) props.push({ type: 'profile', name: typeof v === 'string' ? v : v.name || '' });
        if ((v = take('written_book_content'))) props.push({ type: 'book', title: v.title && (v.title.raw || v.title), author: v.author || '',
            pages: (v.pages || []).map(page => (typeof page === 'string' ? page : page.raw || '')).join('\n---\n') });
        if ((v = take('ominous_bottle_amplifier')) !== undefined) props.push({ type: 'ominous', level: String(Number(v) + 1) });
        if ((v = take('custom_name')) !== undefined) props.push({ type: 'name', text: typeof v === 'string' ? v : v.text || '' });
        if ((v = take('lore'))) props.push({ type: 'lore', lines: v.map(l => (typeof l === 'string' ? l : l.text || '')).join('\n') });
        if ((v = take('rarity'))) props.push({ type: 'rarity', value: v });
        if ((v = take('enchantment_glint_override')) !== undefined) props.push({ type: 'glint', on: !!v });
        if (take('unbreakable') !== undefined) props.push({ type: 'unbreakable' });
        if ((v = take('damage')) !== undefined) props.push({ type: 'damage', value: v });

        for (const m of modifiers || []) {
            const type = String(m.function || m.type || '').replace('minecraft:', '');
            if (type === 'set_random_potion') props.push({ type: 'random_potion', options: m.options || '#minecraft:tradeable' });
            if (type === 'enchant_randomly') props.push({ type: 'random_enchantment', mode: 'book', options: m.options || '#minecraft:tradeable', min: '', max: '' });
            if (type === 'enchant_with_levels') props.push({ type: 'random_enchantment', mode: 'gear', options: m.options || '#minecraft:on_traded_equipment',
                min: m.levels && m.levels.min !== undefined ? m.levels.min : (typeof m.levels === 'number' ? m.levels : 5), max: m.levels && m.levels.max !== undefined ? m.levels.max : 19 });
            if (type === 'set_stew_effect') props.push({ type: 'stew', random: true, lines: (m.effects || []).map(e => `${e.type} ${typeof e.duration === 'number' ? e.duration : 5}`).join('\n') });
        }
        if (legacySell && legacySell.item_type === 'enchanted_book') props.push({ type: 'random_enchantment', mode: 'book', options: '#' + (legacySell.enchantment_tag || 'minecraft:tradeable'), min: legacySell.min_level ?? '', max: legacySell.max_level ?? '' });
        if (legacySell && legacySell.item_type === 'suspicious_stew') props.push({ type: 'stew', random: true, lines: `${legacySell.effect || 'minecraft:night_vision'} ${Math.round((legacySell.duration || 100) / 20)}` });
        return { props, raw: Object.keys(rest).length ? JSON.stringify(rest) : '' };
    }


    /* ---------- recipes ---------- */

    const RECIPE_TYPES = [
        ['crafting_shaped', 'Shaped Crafting'], ['crafting_shapeless', 'Shapeless Crafting'], ['smelting', 'Smelting'], ['blasting', 'Blasting'],
        ['smoking', 'Smoking'], ['campfire_cooking', 'Campfire Cooking'], ['stonecutting', 'Stonecutting'], ['smithing_transform', 'Smithing Transform'],
        ['smithing_trim', 'Smithing Trim']
    ];
    const COOKING = { smelting: [200, 'misc'], blasting: [100, 'misc'], smoking: [100, 'food'], campfire_cooking: [600, 'food'] };
    const CATEGORIES = { crafting: ['building', 'redstone', 'equipment', 'misc'], cooking: ['blocks', 'food', 'misc'] };
    const newRecipe = () => ({ type: 'crafting_shaped', grid: Array(9).fill(''), ingredients: [''], ingredient: '', template: '', base: '', addition: '', pattern: '',
        result: '', count: 1, category: 'misc', group: '', experience: 0.1, time: '' });

    // One ingredient field: an item, a #tag, or alternatives separated by |.
    function ingredientJson(text) {
        const options = String(text || '').split('|').map(v => v.trim()).filter(Boolean);
        if (!options.length) return null;
        const one = v => (legacy() ? (v.startsWith('#') ? { tag: v.slice(1) } : { item: v }) : v);
        if (options.length === 1) return one(options[0]);
        return legacy() ? options.map(one) : options;
    }
    function ingredientText(value) {
        if (value == null) return '';
        if (Array.isArray(value)) return value.map(ingredientText).join(' | ');
        if (typeof value === 'object') return value.tag ? '#' + value.tag : value.item || value.id || '';
        return String(value);
    }

    function recipeJson(r) {
        const type = r.type || 'crafting_shaped';
        const out = { type: 'minecraft:' + type };
        const result = { id: r.result || undefined, count: num(r.count, 1) };
        if (result.count === 1 && !COOKING[type]) delete result.count;
        if (type === 'crafting_shaped') {
            const keys = new Map(), letters = 'ABCDEFGHI';
            const cells = r.grid.map(cell => {
                const text = String(cell || '').trim();
                if (!text) return ' ';
                if (!keys.has(text)) keys.set(text, letters[keys.size]);
                return keys.get(text);
            });
            let rows = [0, 1, 2].map(i => cells.slice(i * 3, i * 3 + 3).join(''));
            while (rows.length && !rows[0].trim()) rows.shift();
            while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
            const used = [0, 1, 2].filter(c => rows.some(row => row[c] !== ' '));
            if (used.length) rows = rows.map(row => row.slice(used[0], used[used.length - 1] + 1));
            Object.assign(out, { category: r.category || 'misc', ...(r.group ? { group: r.group } : {}), pattern: rows,
                key: Object.fromEntries([...keys].map(([text, letter]) => [letter, ingredientJson(text)])), result });
        } else if (type === 'crafting_shapeless') {
            Object.assign(out, { category: r.category || 'misc', ...(r.group ? { group: r.group } : {}), ingredients: r.ingredients.map(ingredientJson).filter(Boolean), result });
        } else if (COOKING[type]) {
            const [time, category] = COOKING[type];
            Object.assign(out, { category: r.category && CATEGORIES.cooking.includes(r.category) ? r.category : category, ...(r.group ? { group: r.group } : {}),
                ingredient: ingredientJson(r.ingredient), result: { id: r.result || undefined, ...(num(r.count, 1) !== 1 ? { count: num(r.count, 1) } : {}) },
                experience: num(r.experience, 0.1), cookingtime: num(r.time, time) });
        } else if (type === 'stonecutting') {
            Object.assign(out, { ingredient: ingredientJson(r.ingredient), result: { id: r.result || undefined, count: num(r.count, 1) } });
        } else if (type === 'smithing_transform') {
            Object.assign(out, { template: ingredientJson(r.template), base: ingredientJson(r.base), addition: ingredientJson(r.addition), result: { id: r.result || undefined, ...(num(r.count, 1) !== 1 ? { count: num(r.count, 1) } : {}) } });
        } else if (type === 'smithing_trim') {
            Object.assign(out, { template: ingredientJson(r.template), base: ingredientJson(r.base), addition: ingredientJson(r.addition) });
            if (!legacy() && r.pattern) out.pattern = r.pattern;
        }
        return out;
    }

    function recipeFrom(j) {
        const r = newRecipe();
        if (!j || !j.type) return r;
        r.type = String(j.type).replace('minecraft:', '');
        if (!RECIPE_TYPES.some(([t]) => t === r.type)) { r.type = 'crafting_shaped'; return r; }
        const res = typeof j.result === 'string' ? { id: j.result } : (j.result || {});
        r.result = res.id || res.item || ''; r.count = res.count || j.count || 1;
        r.category = j.category || r.category; r.group = j.group || '';
        if (r.type === 'crafting_shaped') {
            (j.pattern || []).forEach((row, y) => [...row].forEach((ch, x) => { if (x < 3 && y < 3 && ch !== ' ') r.grid[y * 3 + x] = ingredientText((j.key || {})[ch]); }));
        } else if (r.type === 'crafting_shapeless') {
            r.ingredients = (j.ingredients || []).map(ingredientText);
        } else {
            r.ingredient = ingredientText(j.ingredient); r.template = ingredientText(j.template); r.base = ingredientText(j.base); r.addition = ingredientText(j.addition);
            r.experience = j.experience ?? r.experience; r.time = j.cookingtime ?? ''; r.pattern = j.pattern || '';
        }
        return r;
    }

    /* ---------- models ---------- */

    const newTrade = () => ({ map: false, props: [], wants: { id: 'minecraft:emerald', count: 1 }, extra: null, gives: { id: '', count: 1, components: '' },
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
        recipe: { create: newRecipe, toJson: recipeJson, fromJson: recipeFrom },
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
        const applied = applyProps(t);
        const extraComponents = { ...applied.components, ...(components(t.gives.components) || {}) };
        const hasComponents = Object.keys(extraComponents).length > 0;
        if (legacy()) {
            const out = { buy_a: { item: t.wants.id, count: num(t.wants.count, 1) } };
            if (t.extra && t.extra.id) out.buy_b = { item: t.extra.id, count: num(t.extra.count, 1) };
            if (t.map) {
                out.sell = { item_type: 'treasure_map', structure_tag: t.mapInfo.tag, display_name: t.mapInfo.name || undefined, map_decoration: t.mapInfo.decoration || undefined };
            } else if (applied.legacySell) {
                out.sell = applied.legacySell;
            } else {
                out.sell = { item: t.gives.id, count: num(t.gives.count, 1) };
                if (hasComponents) out.sell.components = extraComponents;
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
            if (hasComponents) out.gives.components = extraComponents;
            if (applied.modifiers.length) out.given_item_modifiers = applied.modifiers;
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
            const legacySell = sell && sell.item_type ? sell : null;
            const gives = legacySell
                ? { id: legacySell.item_type === 'enchanted_book' ? 'minecraft:enchanted_book' : 'minecraft:suspicious_stew', count: 1, components: '' }
                : stackFrom(j.gives || j.sell);
            if (gives) {
                const rawComponents = gives.components ? JSON.parse(gives.components) : {};
                const modifiers = [].concat(j.given_item_modifiers || j.given_item_modifier || []);
                const parsed = propsFrom(rawComponents, modifiers, legacySell);
                t.gives = { id: gives.id, count: gives.count, components: parsed.raw };
                t.props = parsed.props;
            }
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
    const SMALL = new Set(['a', 'an', 'and', 'or', 'the', 'of', 'to', 'in', 'on', 'per', 'by', 'for', 'as', 'at']);
    const tc = text => String(text).replace(/[A-Za-z][\w'’-]*/g, (word, index) => (index > 0 && SMALL.has(word.toLowerCase()) ? word.toLowerCase() : /^[A-Z]{2,}$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)));
    const labelled = (label, control) => `<label class="field"><span>${tc(label)}</span>${control}</label>`;

    function tradeHtml(base, t, index) {
        const p = `${base}.trades.${index}`;
        return `<div class="je-trade">
            <div class="je-row">
                <strong>Trade ${index + 1}</strong>
                <label class="check"><input type="checkbox" data-path="${p}.map"${t.map ? ' checked' : ''}> Explorer Map</label>
                <button type="button" class="link danger" data-op="remove-trade" data-base="${base}" data-index="${index}">Remove</button>
            </div>
            <div class="je-grid">
                ${labelled('Wants', input(`${p}.wants.id`, t.wants.id, 'minecraft:emerald'))}
                ${labelled('Count', input(`${p}.wants.count`, t.wants.count, '1', 'number', 'min="1"'))}
                ${t.extra
                    ? labelled('Also Wants', input(`${p}.extra.id`, t.extra.id, 'minecraft:compass')) + labelled('Count', input(`${p}.extra.count`, t.extra.count, '1', 'number', 'min="1"'))
                    : `<div class="je-add-extra"><button type="button" class="link" data-op="add-extra" data-path="${p}">+ Second Wanted Item</button></div>`}
                ${t.map
                    ? labelled('Structure Tag', input(`${p}.mapInfo.tag`, t.mapInfo.tag, 'namespace:on_example_maps', 'text', 'list="je-map-tags" data-map-tag'))
                      + labelled('Decoration', input(`${p}.mapInfo.decoration`, t.mapInfo.decoration, 'namespace:example_decoration'))
                      + labelled('Name Key', input(`${p}.mapInfo.name`, t.mapInfo.name, 'filled_map.example'))
                      + (legacy() ? '' : labelled('Search Radius', input(`${p}.mapInfo.radius`, t.mapInfo.radius, '100', 'number')))
                    : labelled('Gives', input(`${p}.gives.id`, t.gives.id, 'minecraft:diamond', 'text', 'list="je-items"'))
                      + labelled('Count', input(`${p}.gives.count`, t.gives.count, '1', 'number', 'min="1"'))}
                ${labelled('Max Uses', input(`${p}.uses`, t.uses, '12', 'number', 'min="1"'))}
                ${labelled('XP', input(`${p}.xp`, t.xp, '1', 'number', 'min="0"'))}
                ${labelled(legacy() ? 'Price Multiplier' : 'Reputation Discount', input(`${p}.discount`, t.discount, '0.05', 'number', 'step="0.01" min="0"'))}
                ${labelled('List Weight', input(`${p}.weight`, t.weight, 'Default', 'number', 'min="0"'))}
            </div>
            ${t.map ? `<p class="je-hint">Pick one of this pack’s Explorer Maps tags to fill in the decoration and name, or type another pack's tag. Untick Explorer Map to go back to a regular item.</p>` : propsHtml(p, t)}
        </div>`;
    }

    function propField(path, [key, label, kind, extra], value) {
        const id = `${path}.${key}`;
        if (kind === 'select') return labelled(label, `<select data-path="${id}">${extra.map(option => `<option value="${esc(option)}"${option === value ? ' selected' : ''}>${esc(option ? option.replace(/^minecraft:/, '') : 'None')}</option>`).join('')}</select>`);
        if (kind === 'check') return `<label class="check"><input type="checkbox" data-path="${id}"${value ? ' checked' : ''}> ${tc(label)}</label>`;
        if (kind === 'lines') return `<label class="field je-wide"><span>${tc(label)}</span><textarea rows="3" data-path="${id}" spellcheck="false" placeholder="${esc(extra)}">${esc(value)}</textarea></label>`;
        if (kind === 'color') return labelled(label, `<span class="inline"><input type="color" data-path="${id}" value="${esc(value || '#a06540')}"></span>`);
        return labelled(label, input(id, value, extra || '', kind === 'number' ? 'number' : 'text'));
    }

    function propsHtml(base, t) {
        const available = Object.entries(PROPS).filter(([, def]) => !def.only || def.only === version());
        const notes = applyProps(t).notes;
        return `<div class="je-props">
            ${(t.props || []).map((prop, index) => {
                const def = PROPS[prop.type];
                if (!def) return '';
                return `<div class="je-prop">
                    <div class="je-row"><strong>${tc(def.label)}</strong><span class="je-hint">${esc(def.hint)}</span>
                    <button type="button" class="link danger" data-op="remove-prop" data-path="${base}" data-index="${index}">Remove</button></div>
                    ${def.fields.length ? `<div class="je-grid">${def.fields.map(field => propField(`${base}.props.${index}`, field, prop[field[0]])).join('')}</div>` : ''}
                </div>`;
            }).join('')}
            ${notes.map(note => `<p class="je-note">${esc(note)}</p>`).join('')}
            <div class="je-row">
                <select data-add-prop="${base}" aria-label="Add item property"><option value="">+ Add Item Property</option><option value="__map">Explorer Map (Replaces the Item)</option>${available.map(([key, def]) => `<option value="${key}">${tc(def.label)}</option>`).join('')}</select>
            </div>
            <label class="field"><span>Other Components (Optional JSON)</span><textarea rows="2" data-path="${base}.gives.components" spellcheck="false" placeholder='{"minecraft:custom_model_data": 1}'>${esc(t.gives.components)}</textarea></label>
        </div>`;
    }

    function levelsHtml(base, levels) {
        return LEVELS.map(level => {
            const data = levels[level];
            const p = `${base}.${level}`;
            return `<details class="je-level"${data.trades.length || level === '1' ? ' open' : ''}>
                <summary>${LEVEL_NAMES[level]} <span>${data.trades.length} ${data.trades.length === 1 ? 'Trade' : 'Trades'}</span></summary>
                <div class="je-row">
                    <label class="check"><input type="checkbox" data-path="${p}.replace"${data.replace ? ' checked' : ''}> Replace Existing Trades</label>
                    ${labelled('Trades Offered', input(`${p}.amount`, data.amount, 'All', 'number', 'min="1"'))}
                </div>
                ${data.trades.map((t, i) => tradeHtml(p, t, i)).join('')}
                <button type="button" class="link" data-op="add-trade" data-base="${p}">+ Add Trade</button>
            </details>`;
        }).join('');
    }

    const RENDER = {
        trades: m => levelsHtml('levels', m.levels),
        biome: m => m.groups.map((g, i) => `<div class="je-group">
                <div class="je-row">${labelled('Villager Types (comma separated)', input(`groups.${i}.types`, g.types, 'minecraft:desert, minecraft:savanna'))}
                <button type="button" class="link danger" data-op="remove-group" data-index="${i}">Remove</button></div>
                ${levelsHtml(`groups.${i}.levels`, g.levels)}</div>`).join('')
            + '<button type="button" class="link" data-op="add-group">+ Add Villager Types</button>',
        loot: m => m.pools.map((pool, i) => `<div class="je-group">
                <div class="je-row">${labelled('Rolls', input(`pools.${i}.rolls`, pool.rolls, '1', 'number', 'min="1"'))}
                <button type="button" class="link danger" data-op="remove-pool" data-index="${i}">Remove Pool</button></div>
                ${pool.entries.map((e, j) => `<div class="je-grid je-entry">
                    ${labelled('Item', input(`pools.${i}.entries.${j}.item`, e.item, 'minecraft:emerald'))}
                    ${labelled('Weight', input(`pools.${i}.entries.${j}.weight`, e.weight, '1', 'number', 'min="1"'))}
                    ${labelled('Min', input(`pools.${i}.entries.${j}.min`, e.min, '1', 'number', 'min="1"'))}
                    ${labelled('Max', input(`pools.${i}.entries.${j}.max`, e.max, '1', 'number', 'min="1"'))}
                    <button type="button" class="link danger" data-op="remove-entry" data-pool="${i}" data-index="${j}">Remove</button></div>`).join('')}
                <button type="button" class="link" data-op="add-entry" data-pool="${i}">+ Add Item</button></div>`).join('')
            + '<button type="button" class="link" data-op="add-pool">+ Add Pool</button>',
        recipe: r => {
            const cooking = !!COOKING[r.type], smithing = r.type.startsWith('smithing');
            const ing = (path, value, label) => labelled(label, input(path, value, 'minecraft:stick or #minecraft:planks', 'text', 'data-ingredient'));
            let body = '';
            if (r.type === 'crafting_shaped') {
                body = `<div class="je-recipe-grid">${r.grid.map((cell, i) => input(`grid.${i}`, cell, '', 'text', 'data-ingredient aria-label="Slot ' + (i + 1) + '"')).join('')}</div>`;
            } else if (r.type === 'crafting_shapeless') {
                body = `<div class="je-grid">${r.ingredients.map((v, i) => `<div class="je-row">${ing(`ingredients.${i}`, v, 'Ingredient ' + (i + 1))}<button type="button" class="link danger" data-op="remove-ingredient" data-index="${i}">Remove</button></div>`).join('')}</div>
                    ${r.ingredients.length < 9 ? '<button type="button" class="link" data-op="add-ingredient">+ Add Ingredient</button>' : ''}`;
            } else if (smithing) {
                body = `<div class="je-grid">${ing('template', r.template, 'Template')}${ing('base', r.base, 'Base')}${ing('addition', r.addition, 'Addition')}
                    ${r.type === 'smithing_trim' && !legacy() ? labelled('Trim Pattern', input('pattern', r.pattern, 'minecraft:spire')) : ''}</div>`;
            } else {
                body = `<div class="je-grid">${ing('ingredient', r.ingredient, 'Ingredient')}
                    ${cooking ? labelled('Experience', input('experience', r.experience, '0.1', 'number', 'step="0.05" min="0"')) + labelled('Cooking Time (ticks)', input('time', r.time, String(COOKING[r.type][0]), 'number', 'min="1"')) : ''}</div>`;
            }
            const categories = cooking ? CATEGORIES.cooking : CATEGORIES.crafting;
            return `<div class="je-grid">
                    <label class="field"><span>Recipe Type</span><select data-path="type">${RECIPE_TYPES.map(([t, label]) => `<option value="${t}"${t === r.type ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
                    ${r.type === 'smithing_trim' ? '' : labelled('Result', input('result', r.result, 'This workstation', 'text', 'data-ingredient')) + labelled('Count', input('count', r.count, '1', 'number', 'min="1" max="64"'))}
                    ${r.type.startsWith('crafting') || cooking ? `<label class="field"><span>Category</span><select data-path="category">${categories.map(c => `<option value="${c}"${c === r.category ? ' selected' : ''}>${c.charAt(0).toUpperCase() + c.slice(1)}</option>`).join('')}</select></label>` + labelled('Group (optional)', input('group', r.group, 'workstations')) : ''}
                </div>
                ${body}
                <p class="je-hint">Ingredients take an item, a #tag, or alternatives separated by |. Leave Result empty to craft this workstation. Use Manual Mode for other or modded recipe types.</p>`;
        },
        structures: m => `<label class="check"><input type="checkbox" data-path="replace"${m.replace ? ' checked' : ''}> Replace Tag</label>
            ${m.values.map((v, i) => `<div class="je-row">${input(`values.${i}`, v, 'minecraft:end_city')}<button type="button" class="link danger" data-op="remove-value" data-index="${i}">Remove</button></div>`).join('')}
            <button type="button" class="link" data-op="add-value">+ Add Structure</button>`
    };

    /* ---------- wiring ---------- */

    const get = (object, path) => path.split('.').reduce((value, key) => (value == null ? value : value[key]), object);
    const set = (object, path, value) => {
        const keys = path.split('.');
        const last = keys.pop();
        (keys.length ? get(object, keys.join('.')) : object)[last] = value;
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

    function packMapTags() {
        const namespace = (document.getElementById('pack-namespace') || {}).value || 'namespace';
        return [...document.querySelectorAll('[data-list="structureTag"] > .entry')].map(entry => {
            const value = key => ((entry.querySelector(`[data-field="${key}"]`) || {}).value || '').trim();
            const tag = value('tag');
            if (!tag) return null;
            const ns = value('namespace') || namespace;
            const decoration = value('mapDecoration') || `${tag}_decoration`;
            const decorationId = decoration.includes(':') ? decoration : `${ns}:${decoration}`;
            return { tag: `${ns}:${tag}`, decoration: decorationId, name: `filled_map.${decorationId.split(':')[1].replace(/_decoration$/, '')}` };
        }).filter(Boolean);
    }

    function updateMapList() {
        let list = document.getElementById('je-map-tags');
        if (!list) {
            list = document.createElement('datalist');
            list.id = 'je-map-tags';
            document.body.appendChild(list);
        }
        const registryTags = [...((document.getElementById('reg-tag-worldgen-structure') || {}).options || [])].map(o => o.value.replace(/^#/, ''));
        list.innerHTML = packMapTags().map(entry => `<option value="${esc(entry.tag)}">${esc(entry.name)}</option>`).join('')
            + registryTags.map(tag => `<option value="${esc(tag)}"></option>`).join('');
    }

    function itemList() {
        if (document.getElementById('je-items')) return;
        const items = ['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow', 'enchanted_book', 'suspicious_stew', 'goat_horn', 'firework_rocket', 'firework_star',
            'player_head', 'written_book', 'ominous_bottle', 'leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots', 'wolf_armor', 'white_banner', 'shield',
            ...SONGS.map(song => 'music_disc_' + song.split(':')[1])].map(id => 'minecraft:' + id);
        const list = document.createElement('datalist');
        list.id = 'je-items';
        list.innerHTML = items.map(id => `<option value="${id}"></option>`).join('');
        document.body.appendChild(list);
    }

    function mount(root) {
        itemList();
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

            editor.host.addEventListener('focusin', event => { if (event.target.hasAttribute('data-map-tag')) updateMapList(); });
            editor.host.addEventListener('input', event => {
                const path = event.target.dataset.path;
                if (!path) return;
                if (event.target.hasAttribute('data-map-tag')) {
                    const match = packMapTags().find(entry => entry.tag === event.target.value.trim());
                    if (match) {
                        const info = get(editor.model, path.replace(/\.tag$/, ''));
                        Object.assign(info, { tag: match.tag, decoration: match.decoration, name: match.name });
                        render(editor);
                        return;
                    }
                }
                const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
                set(editor.model, path, value);
                if (event.target.type === 'checkbox') render(editor); else write(editor);
            });
            editor.host.addEventListener('change', event => {
                if (event.target.dataset.addProp !== undefined && event.target.value) {
                    const trade = get(editor.model, event.target.dataset.addProp);
                    if (event.target.value === '__map') trade.map = true;
                    else (trade.props ||= []).push({ type: event.target.value });
                    render(editor);
                    return;
                }
                if (event.target.tagName === 'SELECT' && event.target.dataset.path) {
                    set(editor.model, event.target.dataset.path, event.target.value);
                    render(editor);
                    return;
                }
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
                    case 'remove-prop': get(m, d.path).props.splice(Number(d.index), 1); break;
                    case 'add-group': m.groups.push({ types: '', levels: newLevels() }); break;
                    case 'remove-group': m.groups.splice(Number(d.index), 1); break;
                    case 'add-pool': m.pools.push({ rolls: 1, entries: [] }); break;
                    case 'remove-pool': m.pools.splice(Number(d.index), 1); break;
                    case 'add-entry': m.pools[d.pool].entries.push({ item: '', weight: 1, min: 1, max: 1 }); break;
                    case 'remove-entry': m.pools[d.pool].entries.splice(Number(d.index), 1); break;
                    case 'add-value': m.values.push(''); break;
                    case 'add-ingredient': m.ingredients.push(''); break;
                    case 'remove-ingredient': m.ingredients.splice(Number(d.index), 1); if (!m.ingredients.length) m.ingredients.push(''); break;
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
