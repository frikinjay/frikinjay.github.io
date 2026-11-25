import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPages } from './build-pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'packs');

const exists = async path => stat(path).then(() => true, () => false);
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const names = async (directory, extension = '.json') => {
    try {
        return (await readdir(directory)).filter(file => file.endsWith(extension)).map(file => file.slice(0, -extension.length)).sort();
    } catch {
        return [];
    }
};

async function walk(directory) {
    const out = [];
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) out.push(...await walk(path));
        else if (entry.name.endsWith('.json')) out.push(path);
    }
    return out;
}

async function recipesByResult(dir) {
    const recipes = {};
    for (const file of await walk(join(dir, 'data'))) {
        const rel = relative(dir, file).split(sep).join('/');
        if (!/^data\/[^/]+\/recipe\//.test(rel)) continue;
        const recipe = await readJson(file).catch(() => ({}));
        const out = recipe.output || recipe.result;
        const id = typeof out === 'string' ? out : out && (out.id || out.item);
        if (id) (recipes[id.includes(':') ? id : 'minecraft:' + id] ||= []).push(rel);
    }
    return recipes;
}

const packs = [];
for (const entry of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join(root, entry.name);
    if (!(await exists(join(dir, 'villagerapi_config.json')))) continue;

    const config = await readJson(join(dir, 'villagerapi_config.json'));
    const meta = (await exists(join(dir, 'pack.mcmeta'))) ? await readJson(join(dir, 'pack.mcmeta')) : {};
    let description = config.description || (typeof meta.pack?.description === 'string' ? meta.pack.description : '');
    const minecraft = config.minecraft_version || (meta.pack && (meta.pack.min_format !== undefined || meta.pack.max_format !== undefined) ? '26.3' : '1.21.1');

    packs.push({
        id: entry.name,
        path: `packs/${entry.name}`,
        namespace: config.namespace || entry.name,
        name: config.display_name || entry.name,
        version: config.version || '',
        minecraft,
        author: config.author || '',
        description,
        icon: (await exists(join(dir, 'pack.png'))) ? `packs/${entry.name}/pack.png` : null,
        professions: await names(join(dir, 'villagers', 'professions')),
        types: await names(join(dir, 'villagers', 'types')),
        biomeMappings: await names(join(dir, 'villagers', 'biome_mappings')),
        recipes: await recipesByResult(dir)
    });
}

await writeFile(join(root, 'index.json'), JSON.stringify({ packs }, null, 2) + '\n');
console.log(`Indexed ${packs.length} villager pack(s): ${packs.map(pack => pack.id).join(', ')}`);
await buildPages(join(root, '..'), packs);
