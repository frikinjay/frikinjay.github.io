import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SITE = 'https://villagerpacks.neoterra.dev';
const GENERATOR = 'https://villagerapi.neoterra.dev';
const VILLAGERAPI = 'https://modrinth.com/mod/villagerapi';
const LEVELS = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const SMALL = new Set(['of', 'the', 'and', 'on', 'a', 'o']);

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const exists = async path => stat(path).then(() => true, () => false);
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const readJsonOr = async (path, fallback) => readJson(path).catch(() => fallback);
const plural = (count, word) => `${count} ${count === 1 ? word : word + 's'}`;
const ld = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function title(id) {
    const path = String(id).split(':').pop().split('/').pop();
    return path.split('_').filter(Boolean).map((word, index) => index > 0 && SMALL.has(word) ? word : word[0].toUpperCase() + word.slice(1)).join(' ');
}

function listText(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

const UNCOUNTABLE = new Set(['bamboo', 'basalt', 'blackstone', 'ice', 'meal', 'bread', 'calcite', 'charcoal', 'coal', 'cobblestone', 'cod', 'prismarine',
    'deepslate', 'breath', 'kelp', 'stone', 'berries', 'lazuli', 'leather', 'netherrack', 'obsidian', 'moss', 'paper', 'crystals', 'quartz', 'redstone',
    'salmon', 'scaffolding', 'seagrass', 'sand', 'string', 'fish', 'pufferfish', 'tuff', 'wildflowers', 'wool', 'wart', 'gunpowder', 'flint', 'flesh',
    'copper', 'gold', 'iron', 'fruit', 'bricks', 'dripleaf', 'sugar', 'wheat', 'glass', 'dirt', 'gravel', 'clay', 'concrete', 'terracotta']);
const IRREGULAR = { foot: 'feet', leaf: 'leaves' };

function pluralize(name) {
    if (name.endsWith(')')) return name;
    const split = name.indexOf(' of ');
    const head = split > 0 ? name.slice(0, split) : name;
    const rest = split > 0 ? name.slice(split) : '';
    const words = head.split(' ');
    const last = words[words.length - 1];
    const lower = last.toLowerCase();
    let plural = last;
    if (IRREGULAR[lower]) plural = last[0] + IRREGULAR[lower].slice(1);
    else if (UNCOUNTABLE.has(lower) || /s$/.test(lower)) plural = last;
    else if (/(ch|sh|x)$/.test(lower)) plural = last + 'es';
    else if (/[^aeiou]y$/.test(lower)) plural = last.slice(0, -1) + 'ies';
    else plural = last + 's';
    words[words.length - 1] = plural;
    return words.join(' ') + rest;
}

function enchantmentList(map) {
    return Object.entries(map || {}).map(([id, level]) => `${title(id)} ${ROMAN[level - 1] || level}`).join(', ');
}

function potionName(id) {
    return title(String(id).replace(/:(long|strong)_/, ':'));
}

function stackName(stack, lang, trade) {
    const [namespace, path] = stack.id.includes(':') ? stack.id.split(':') : ['minecraft', stack.id];
    let name = lang[`item.${namespace}.${path}`] || lang[`block.${namespace}.${path}`] || title(stack.id);
    const components = stack.components || {};
    const named = (trade?.given_item_modifiers || []).find(modifier => modifier.function === 'minecraft:set_name');
    if (named && stack === trade.gives) {
        const key = named.name?.translate;
        if (key) name = lang[key] || title(key.split('.').pop());
    }
    const stored = components['minecraft:stored_enchantments'];
    const enchanted = components['minecraft:enchantments'];
    const potion = components['minecraft:potion_contents']?.potion;
    const instrument = components['minecraft:instrument'];
    if (stored) name = `Enchanted Book (${enchantmentList(stored)})`;
    else if (enchanted) name = `Enchanted ${name} (${enchantmentList(enchanted)})`;
    if (potion) {
        const effect = potionName(potion);
        if (path === 'tipped_arrow') name = `Arrow of ${effect}`;
        else if (path === 'splash_potion') name = `Splash Potion of ${effect}`;
        else if (path === 'lingering_potion') name = `Lingering Potion of ${effect}`;
        else name = `Potion of ${effect}`;
    }
    if (instrument) name = `${name} (${title(instrument).replace(/ Goat Horn$/, '')})`;
    const count = Math.max(1, Math.round(Number(stack.count) || 1));
    return `${count} ${count > 1 ? pluralize(name) : name}`;
}

function tradeText(trade, lang) {
    const wants = [trade.wants, trade.additional_wants].filter(Boolean).map(stack => stackName(stack, lang, trade));
    return `${wants.join(' + ')} for ${stackName(trade.gives, lang, trade)}`;
}

async function packDetails(pack, publicDir) {
    const dir = join(publicDir, pack.path);
    const villagers = join(dir, 'villagers');
    const lang = await readJsonOr(join(dir, 'assets', pack.namespace, 'lang', 'en_us.json'), {});
    const professions = [];
    for (const id of pack.professions) {
        const profession = await readJsonOr(join(villagers, 'professions', `${id}.json`), {});
        const poi = profession.poi_type ? await readJsonOr(join(villagers, 'poi_types', `${String(profession.poi_type).split(':').pop()}.json`), {}) : {};
        const block = poi.block ? stackName({ id: poi.block }, lang).replace(/^1 /, '') : null;
        const tradeFile = await readJsonOr(join(villagers, 'trades', `${id}.json`), { levels: {} });
        const levels = Object.entries(tradeFile.levels || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([level, entry]) => ({
            level: Number(level),
            amount: entry.trade_list_amount,
            trades: (entry.trades || []).map(trade => tradeText(trade, lang))
        }));
        professions.push({
            id,
            name: lang[`entity.minecraft.villager.${pack.namespace}.${id}`] || title(id),
            workstation: block,
            levels,
            tradeCount: levels.reduce((sum, level) => sum + level.trades.length, 0)
        });
    }
    const types = [];
    for (const id of pack.types) {
        const mapping = await readJsonOr(join(villagers, 'biome_mappings', `${id}.json`), {});
        const biomes = (mapping.biomes || []).map(entry => title(entry.biome));
        types.push({ id, name: lang[`villager_type.${pack.namespace}.${id}`] || title(id), biomes });
    }
    const villages = (await readdir(join(villagers, 'village_structures'), { withFileTypes: true }).catch(() => []))
        .filter(entry => entry.isDirectory()).map(entry => title(entry.name)).sort();
    return { professions, types, villages, tradeCount: professions.reduce((sum, profession) => sum + profession.tradeCount, 0) };
}

function describe(pack, details) {
    const names = details.professions.map(profession => profession.name);
    const shown = names.length > 4 ? [...names.slice(0, 3), `${names.length - 3} more`] : names;
    return `${pack.name} adds ${plural(names.length, 'new villager profession')} to Minecraft ${pack.minecraft}: ${listText(shown)}. See all ${details.tradeCount} trades and workstations.`;
}

function headline(pack, details) {
    const count = details.professions.length;
    if (!count) return `${pack.name}: Minecraft Villager Pack`;
    return `${pack.name}: ${count} New Minecraft Villager Profession${count === 1 ? '' : 's'}`;
}

function packHeader(pack) {
    const meta = [pack.version && 'v' + pack.version, pack.author && 'by ' + pack.author, pack.namespace, 'Minecraft ' + (pack.minecraft || '26.3')].filter(Boolean).map(escape).join(' · ');
    return `
        ${pack.icon ? `<img class="pack-icon-large" src="${escape(pack.icon)}" alt="" width="96" height="96">` : ''}
        <div><h1>${escape(pack.name)}</h1><p>${escape(pack.description)}</p>
        <small>${meta}</small></div>`;
}

function packText(pack, details) {
    const professionItems = details.professions.map(profession => `
            <li><b>${escape(profession.name)}</b>${profession.workstation ? ` works at the ${escape(profession.workstation)}` : ''} and has ${plural(profession.tradeCount, 'trade')} across ${plural(profession.levels.length, 'level')}.</li>`).join('');
    const typeItems = details.types.map(type => `
            <li><b>${escape(type.name)}</b>${type.biomes.length ? ` villagers live in ${escape(listText(type.biomes))}.` : ''}</li>`).join('');
    const tradeLists = details.professions.map(profession => `
          <h4>${escape(profession.name)}</h4>${profession.levels.map(level => `
          <p class="trade-level">Level ${level.level}${LEVELS[level.level - 1] ? ' · ' + LEVELS[level.level - 1] : ''}${level.amount && level.amount < level.trades.length ? ` · offers ${level.amount} of these ${level.trades.length}` : ''}</p>
          <ul>${level.trades.map(trade => `<li>${escape(trade)}</li>`).join('')}</ul>`).join('')}`).join('');
    return `
      <section class="pack-text prose" aria-labelledby="pack-about">
        <h2 id="pack-about">About ${escape(pack.name)}</h2>
        <p>${escape(pack.name)} is a villager pack for <a href="${VILLAGERAPI}">VillagerAPI</a> on Minecraft ${escape(pack.minecraft)} with Fabric or NeoForge. It adds ${plural(details.professions.length, 'villager profession')}${details.types.length ? `, ${plural(details.types.length, 'villager type')}` : ''} and ${details.tradeCount} custom villager trades${details.villages.length ? `, plus new village houses for ${escape(listText(details.villages))} villages` : ''}.${details.professions.length && details.professions.every(profession => profession.workstation) ? ' Every profession has its own workstation, so unemployed villagers pick up the new jobs just like vanilla ones.' : ''}</p>
        ${details.professions.length ? `<h3>Villager professions</h3>
        <ul class="pack-facts">${professionItems}
        </ul>` : ''}
        ${details.types.length ? `<h3>Villager types</h3>
        <ul class="pack-facts">${typeItems}
        </ul>` : ''}
        <h3>Make your own</h3>
        <p>Want different trades or another profession? Load this pack, or the mod jar it comes in, into the <a href="${GENERATOR}/">villager pack generator</a>, change anything and download your own pack. No code needed.</p>
        <details class="trade-list">
          <summary>All ${details.tradeCount} ${escape(pack.name)} trades</summary>${tradeLists}
        </details>
      </section>`;
}

function packLd(pack, details, url) {
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'CreativeWork',
                '@id': url + '#pack',
                name: pack.name,
                headline: headline(pack, details),
                description: describe(pack, details),
                url,
                version: pack.version || undefined,
                image: pack.icon ? `${SITE}/${pack.icon}` : undefined,
                author: pack.author ? { '@type': 'Person', name: pack.author } : undefined,
                genre: 'Minecraft villager pack',
                keywords: ['Minecraft villagers', 'custom villager trades', 'villager professions', 'VillagerAPI', pack.name].join(', '),
                about: { '@type': 'VideoGame', name: 'Minecraft' },
                isPartOf: { '@type': 'WebSite', name: 'Villager Packs', url: SITE + '/' }
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Villager Packs', item: SITE + '/' },
                    { '@type': 'ListItem', position: 2, name: pack.name, item: url }
                ]
            }
        ]
    };
}

function packCard(pack, index) {
    const counts = [[pack.professions, 'professions'], [pack.types, 'villager types']].filter(([list]) => list && list.length).map(([list, label]) => `<b>${list.length}</b> ${list.length === 1 ? label.replace(/s$/, '') : label}`);
    const tags = [...counts, pack.version && escape('v' + pack.version), escape('Minecraft ' + (pack.minecraft || '26.3'))].filter(Boolean);
    return `
        <a class="pack-card" href="./pack/${encodeURIComponent(pack.id)}" data-search="${escape([pack.name, pack.id, pack.author, pack.description].join(' ').toLowerCase())}">
            <span class="pack-card-head">
                <span class="pack-icon">${pack.icon ? `<img src="./${escape(pack.icon)}" alt="" width="64" height="64"${index ? ' loading="lazy"' : ''}>` : ''}</span>
                <span class="pack-title"><strong>${escape(pack.name)}</strong>${pack.author ? `<span>by ${escape(pack.author)}</span>` : ''}</span>
            </span>
            ${pack.description ? `<span class="pack-desc">${escape(pack.description)}</span>` : ''}
            <span class="pack-tags">${tags.map(tag => `<span>${tag}</span>`).join('')}</span>
        </a>`;
}

function replaceOnce(text, pattern, replacement, what) {
    if (!pattern.test(text)) throw new Error(`build-pages: could not find ${what}`);
    return text.replace(pattern, replacement);
}

function setMeta(html, { pageTitle, description, url, image }) {
    html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escape(pageTitle)}</title>`, 'title');
    html = replaceOnce(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escape(description)}">`, 'description');
    html = replaceOnce(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`, 'canonical');
    html = replaceOnce(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escape(pageTitle)}">`, 'og:title');
    html = replaceOnce(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escape(description)}">`, 'og:description');
    html = replaceOnce(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">\n  <meta property="og:type" content="website">\n  <meta property="og:site_name" content="Villager Packs">${image ? `\n  <meta property="og:image" content="${image}">` : ''}\n  <meta name="twitter:card" content="summary">`, 'og:url');
    return html;
}

export async function buildPages(publicDir, packs) {
    const template = await readFile(join(publicDir, 'pack.html'), 'utf8');
    const outDir = join(publicDir, 'pack');
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    const urls = [SITE + '/'];
    const summaries = [];
    for (const pack of packs) {
        const details = await packDetails(pack, publicDir);
        const url = `${SITE}/pack/${encodeURIComponent(pack.id)}`;
        let html = template.replace(/<meta name="robots" content="[^"]*">/, '<link rel="canonical" href="">');
        html = replaceOnce(html, /<meta charset="utf-8">/, '<meta charset="utf-8">\n  <base href="/">', 'charset');
        html = setMeta(html, { pageTitle: headline(pack, details), description: describe(pack, details), url, image: pack.icon ? `${SITE}/${pack.icon}` : null });
        html = replaceOnce(html, /<\/head>/, `  ${ld(packLd(pack, details, url))}\n</head>`, 'head end');
        html = replaceOnce(html, /<body>/, `<body data-pack="${escape(pack.id)}">`, 'body');
        html = replaceOnce(html, /<div class="pack-header" id="pack-header"><\/div>/, `<div class="pack-header" id="pack-header">${packHeader(pack)}\n      </div>`, 'pack header');
        html = replaceOnce(html, /\n    <\/div>\n  <\/main>/, `\n${packText(pack, details)}\n    </div>\n  </main>`, 'main end');
        await writeFile(join(outDir, `${pack.id}.html`), html);
        urls.push(url);
        summaries.push({ pack, details, url });
    }

    const indexPath = join(publicDir, 'index.html');
    let index = await readFile(indexPath, 'utf8');
    index = replaceOnce(index, /(<div class="pack-grid" id="pack-grid">)[\s\S]*?(<\/div>\s*<p class="no-results")/, `$1${packs.map(packCard).join('')}\n      $2`, 'pack grid');
    const listLd = ld({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Minecraft villager packs',
        itemListElement: summaries.map(({ pack, url }, i) => ({ '@type': 'ListItem', position: i + 1, url, name: pack.name }))
    });
    index = index.replace(/\n  <script type="application\/ld\+json" data-packs>[\s\S]*?<\/script>/, '');
    index = replaceOnce(index, /<\/head>/, `  ${listLd.replace('<script type="application/ld+json">', '<script type="application/ld+json" data-packs>')}\n</head>`, 'index head end');
    await writeFile(indexPath, index);

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`;
    await writeFile(join(publicDir, 'sitemap.xml'), sitemap);

    const llms = [
        '# Villager Packs',
        '',
        '> Browse villager packs for VillagerAPI, the Minecraft mod (Fabric and NeoForge, Minecraft 1.21.1, 1.21.11, 26.1.2, 26.2, 26.3 and 26.4) that adds custom villager professions, villager types, trades, wandering trader trades and village houses from data files, without code.',
        '',
        `- [Villager pack generator](${GENERATOR}/): make your own custom villagers and trades in the browser and download them as a villager pack`,
        `- [VillagerAPI on Modrinth](${VILLAGERAPI})`,
        '',
        '## Packs',
        '',
        ...summaries.map(({ pack, details, url }) => `- [${pack.name}](${url}): ${describe(pack, details)}`),
        ''
    ].join('\n');
    await writeFile(join(publicDir, 'llms.txt'), llms);

    console.log(`Built ${summaries.length} pack page(s), sitemap.xml and llms.txt`);
}
