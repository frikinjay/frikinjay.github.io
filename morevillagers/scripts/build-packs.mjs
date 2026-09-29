// Builds public/packs/index.json from the villager packs in public/packs/.
// Runs as the Cloudflare build command, and can be run locally with: node scripts/build-packs.mjs
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const packs = [];
for (const entry of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join(root, entry.name);
    if (!(await exists(join(dir, 'villagerapi_config.json')))) continue;

    const config = await readJson(join(dir, 'villagerapi_config.json'));
    const meta = (await exists(join(dir, 'pack.mcmeta'))) ? await readJson(join(dir, 'pack.mcmeta')) : {};
    let description = config.description || (typeof meta.pack?.description === 'string' ? meta.pack.description : '');
    // 26.x packs declare min_format/max_format; 1.21.1 packs only use pack_format/supported_formats.
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
        biomeMappings: await names(join(dir, 'villagers', 'biome_mappings'))
    });
}

await writeFile(join(root, 'index.json'), JSON.stringify({ packs }, null, 2) + '\n');
console.log(`Indexed ${packs.length} villager pack(s): ${packs.map(pack => pack.id).join(', ')}`);
