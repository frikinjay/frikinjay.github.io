import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const SITE = 'https://villagerpacks.neoterra.dev';
const GENERATOR = 'https://villagerapi.neoterra.dev';
const VILLAGERAPI = 'https://modrinth.com/mod/villagerapi';
const SMALL = new Set(['of', 'the', 'and', 'on', 'a', 'o']);

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readJsonOr = async (path, fallback) => readFile(path, 'utf8').then(JSON.parse).catch(() => fallback);
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

async function packDetails(pack, publicDir) {
    const villagers = join(publicDir, pack.path, 'villagers');
    const lang = await readJsonOr(join(publicDir, pack.path, 'assets', pack.namespace, 'lang', 'en_us.json'), {});
    const professions = [];
    for (const id of pack.professions) {
        const tradeFile = await readJsonOr(join(villagers, 'trades', `${id}.json`), { levels: {} });
        professions.push({
            name: lang[`entity.minecraft.villager.${pack.namespace}.${id}`] || title(id),
            tradeCount: Object.values(tradeFile.levels || {}).reduce((sum, level) => sum + (level.trades || []).length, 0)
        });
    }
    return { professions, tradeCount: professions.reduce((sum, profession) => sum + profession.tradeCount, 0) };
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

function imageMeta(image) {
    if (!image) return '\n  <meta name="twitter:card" content="summary">';
    if (!image.width) return `\n  <meta property="og:image" content="${image.url}">\n  <meta name="twitter:card" content="summary">`;
    return `\n  <meta property="og:image" content="${image.url}">\n  <meta property="og:image:width" content="${image.width}">\n  <meta property="og:image:height" content="${image.height}">\n  <meta property="og:image:alt" content="${escape(image.alt)}">\n  <meta name="twitter:card" content="summary_large_image">`;
}

function setMeta(html, { pageTitle, description, url, image }) {
    html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escape(pageTitle)}</title>`, 'title');
    html = replaceOnce(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escape(description)}">`, 'description');
    html = replaceOnce(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`, 'canonical');
    html = replaceOnce(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escape(pageTitle)}">`, 'og:title');
    html = replaceOnce(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escape(description)}">`, 'og:description');
    html = replaceOnce(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">\n  <meta property="og:type" content="website">\n  <meta property="og:site_name" content="Villager Packs">${imageMeta(image)}`, 'og:url');
    return html;
}

async function packImage(publicDir, pack, details) {
    const card = `img/og/${pack.id}.png`;
    const hasCard = await readFile(join(publicDir, card)).then(() => true, () => false);
    if (hasCard) return { url: `${SITE}/${card}`, width: 1200, height: 630, alt: `${pack.name}: ${plural(details.professions.length, 'villager profession')} and ${details.tradeCount} trades for Minecraft ${pack.minecraft}` };
    return pack.icon ? { url: `${SITE}/${pack.icon}` } : null;
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
        html = setMeta(html, { pageTitle: headline(pack, details), description: describe(pack, details), url, image: await packImage(publicDir, pack, details) });
        html = replaceOnce(html, /<\/head>/, `  ${ld(packLd(pack, details, url))}\n</head>`, 'head end');
        html = replaceOnce(html, /<body>/, `<body data-pack="${escape(pack.id)}">`, 'body');
        html = replaceOnce(html, /<div class="pack-header" id="pack-header"><\/div>/, `<div class="pack-header" id="pack-header">${packHeader(pack)}\n      </div>`, 'pack header');
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
