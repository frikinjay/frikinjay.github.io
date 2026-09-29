'use strict';

class VillagerPackBuilder {
    constructor(zip, metadata, data, packIcon, options) {
        this.zip = zip;
        this.metadata = metadata;
        this.data = data;
        this.packIcon = packIcon;
        this.options = options;
        this.warnings = [];
        this.lang = {};
        this.mineableAxe = [];
    }

    get namespace() {
        return this.metadata.namespace;
    }

    json(path, value) {
        this.zip.file(path, JSON.stringify(value, null, 2));
    }

    binary(path, bytes) {
        if (!bytes) return false;
        this.zip.file(path, bytes, { binary: true });
        return true;
    }

    image(path, dataUrl) {
        if (!dataUrl) return false;
        this.zip.file(path, dataUrl.split(',')[1], { base64: true });
        return true;
    }

    ns(value) {
        const cleaned = (value || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '');
        return cleaned || this.namespace;
    }

    name(value) {
        return (value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_./-]/g, '');
    }

    id(value, fallbackNamespace = this.namespace) {
        const trimmed = (value || '').trim();
        if (!trimmed) return '';
        return trimmed.includes(':') ? trimmed : `${fallbackNamespace}:${trimmed}`;
    }

    splitId(value, fallbackNamespace = this.namespace) {
        const full = this.id(value, fallbackNamespace);
        const index = full.indexOf(':');
        return { namespace: full.substring(0, index), path: full.substring(index + 1) };
    }

    fileNameForId(fullId) {
        const { namespace, path } = this.splitId(fullId);
        const base = namespace === this.namespace ? path : `${namespace}_${path}`;
        return base.replace(/[:/\\]/g, '_');
    }

    titleCase(value) {
        return value.replace(/[_/]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    build() {
        this.buildConfig();
        this.buildPoiTypes();
        this.buildVillagerTypes();
        this.buildProfessions();
        this.buildWorkstations();
        this.buildStructureTags();
        this.buildTrades();
        this.buildBiomeTrades();
        this.buildGifts();
        this.buildBiomeMappings();
        this.buildLootTables();
        this.buildVillageTypes();
        this.buildVillageStructures();
        this.buildLanguage();
    }

    buildConfig() {
        const meta = this.metadata;
        this.json('villagerapi_config.json', {
            namespace: this.namespace,
            display_name: meta.displayName || this.titleCase(this.namespace),
            description: meta.description || '',
            version: meta.version || '1.0.0',
            author: meta.author || 'Unknown',
            creative_tab_icon: meta.creativeTabIcon || 'minecraft:emerald'
        });

        this.json('pack.mcmeta', this.options.packMcmeta(meta.description || 'A villager pack created with the Villager Pack Generator'));

        if (this.packIcon) {
            this.image('pack.png', this.packIcon);
        }

        this.lang[`itemGroup.${this.namespace}.villagerpack_tab`] = meta.displayName || this.titleCase(this.namespace);
        this.lang[`itemGroup.${this.namespace}.tab`] = meta.displayName || this.titleCase(this.namespace);
    }

    buildPoiTypes() {
        const jobSites = [];

        this.data.poiTypes.forEach(poi => {
            const name = this.name(poi.name);
            if (!name) return;

            const poiNamespace = this.ns(poi.namespace);
            this.json(`villagers/poi_types/${name}.json`, {
                block: this.id(poi.block || 'minecraft:barrel', 'minecraft'),
                tickets: poi.tickets || 1,
                namespace: poiNamespace
            });
            jobSites.push(`${poiNamespace}:${name}`);
        });

        if (jobSites.length > 0) {
            this.json('data/minecraft/tags/point_of_interest_type/acquirable_job_site.json', {
                replace: false,
                values: jobSites
            });
        }
    }

    buildVillagerTypes() {
        this.data.types.forEach(type => {
            const name = this.name(type.name);
            if (!name) return;

            const typeNamespace = this.ns(type.namespace);
            const textures = type._textures || {};
            const base = `assets/${typeNamespace}/textures/entity`;
            const hat = { villager: { hat: 'full' } };

            this.json(`villagers/types/${name}.json`, { name, namespace: typeNamespace });

            this.writeEntityTexture(`${base}/villager/type/${name}`, textures.texture, hat);
            this.writeEntityTexture(`${base}/zombie_villager/type/${name}`, textures.zombieTexture || textures.texture, hat);

            if (!textures.texture) {
                this.warnings.push(`Villager type "${name}" has no texture.`);
            }

            if (this.options.babyTextures) {
                this.writeEntityTexture(`${base}/villager/baby/${name}`, textures.babyTexture, hat);
                this.writeEntityTexture(`${base}/zombie_villager/baby/${name}`, textures.babyZombieTexture || textures.babyTexture, hat);

                if (!textures.babyTexture) {
                    this.warnings.push(`Villager type "${name}" has no baby texture. Baby villagers of this type will display the missing texture.`);
                }
            }
        });
    }

    buildProfessions() {
        this.data.professions.forEach(prof => {
            const name = this.name(prof.name);
            if (!name) return;

            const profNamespace = this.ns(prof.namespace);
            const textures = prof._textures || {};
            const base = `assets/${profNamespace}/textures/entity`;
            const hat = { villager: { hat: 'partial' } };
            const poiType = (prof.poiType || name).split(':').pop();

            this.json(`villagers/professions/${name}.json`, {
                poi_type: this.name(poiType),
                work_sound: prof.workSound || 'minecraft:entity.villager.work_armorer',
                namespace: profNamespace
            });

            this.writeEntityTexture(`${base}/villager/profession/${name}`, textures.texture, hat);
            this.writeEntityTexture(`${base}/zombie_villager/profession/${name}`, textures.zombieTexture || textures.texture, hat);

            if (!textures.texture) {
                this.warnings.push(`Profession "${name}" has no texture.`);
            }

            if (!this.data.poiTypes.some(poi => this.name(poi.name) === this.name(poiType))) {
                this.warnings.push(`Profession "${name}" uses the POI type "${poiType}", which is not defined in this pack. Make sure another pack or mod provides it.`);
            }

            this.lang[`entity.minecraft.villager.${profNamespace}.${name}`] = this.titleCase(name);
            if (this.options.legacyLangKeys) {
                this.lang[`entity.minecraft.villager.${name}`] = this.titleCase(name);
            }
        });
    }

    writeEntityTexture(pathWithoutExtension, dataUrl, mcmeta) {
        if (this.image(`${pathWithoutExtension}.png`, dataUrl)) {
            this.json(`${pathWithoutExtension}.png.mcmeta`, mcmeta);
        }
    }

    buildWorkstations() {
        const faceFields = {
            front: 'textureFront',
            back: 'textureBack',
            left: 'textureLeft',
            right: 'textureRight',
            top: 'textureTop',
            bottom: 'textureBottom'
        };
        const fallbacks = {
            front: ['front', 'back', 'left', 'right', 'top', 'bottom'],
            back: ['back', 'left', 'right', 'front', 'top', 'bottom'],
            left: ['left', 'right', 'back', 'front', 'top', 'bottom'],
            right: ['right', 'left', 'back', 'front', 'top', 'bottom'],
            top: ['top', 'bottom', 'front', 'back', 'left', 'right'],
            bottom: ['bottom', 'top', 'front', 'back', 'left', 'right']
        };

        this.data.workstations.forEach(ws => {
            const name = this.name(ws.name);
            if (!name) return;

            const wsNamespace = this.ns(ws.namespace);
            const textures = ws._textures || {};
            const uploaded = new Set();
            let customModel = null;
            if (textures.__model) {
                try {
                    customModel = JSON.parse(textures.__model);
                    const keys = Object.keys(customModel.textures || {}).filter(key => !String(customModel.textures[key]).startsWith('#'));
                    for (const key of keys) {
                        if (this.image(`assets/${wsNamespace}/textures/block/${name}_${key}.png`, textures['model:' + key])) {
                            customModel.textures[key] = `${wsNamespace}:block/${name}_${key}`;
                            uploaded.add('front');
                        }
                    }
                    if (!customModel.textures.particle && keys.length) customModel.textures.particle = `#${keys[0]}`;
                } catch (error) {
                    this.warnings.push(`Workstation "${name}" has a block model that is not valid JSON.`);
                    customModel = null;
                }
            }

            Object.entries(faceFields).forEach(([face, field]) => {
                if (this.image(`assets/${wsNamespace}/textures/block/${name}_${face}.png`, textures[field])) {
                    uploaded.add(face);
                }
            });

            if (uploaded.size === 0) {
                this.warnings.push(`Workstation "${name}" has no textures.`);
            }

            const texture = (face) => {
                const chosen = fallbacks[face].find(candidate => uploaded.has(candidate)) || face;
                return `${wsNamespace}:block/${name}_${chosen}`;
            };

            this.json(`villagers/workstations/${name}.json`, { name, namespace: wsNamespace });

            this.json(`assets/${wsNamespace}/blockstates/${name}.json`, {
                variants: { '': { model: `${wsNamespace}:block/${name}` } }
            });

            this.json(`assets/${wsNamespace}/models/block/${name}.json`, {
                parent: 'minecraft:block/cube',
                textures: {
                    particle: texture('front'),
                    north: texture('front'),
                    south: texture('back'),
                    east: texture('left'),
                    west: texture('right'),
                    up: texture('top'),
                    down: texture('bottom')
                }
            });

            if (customModel) this.json(`assets/${wsNamespace}/models/block/${name}.json`, customModel);

            const recipe = ws.recipeJson;
            if (recipe && typeof recipe === 'object' && recipe.type) {
                const out = JSON.parse(JSON.stringify(recipe));
                const own = `${wsNamespace}:${name}`;
                if (out.result && typeof out.result === 'object' && !out.result.id && !out.result.item) out.result.id = own;
                else if (!out.result && !/smithing_trim$/.test(out.type)) out.result = { id: own };
                const empty = ['key', 'ingredients', 'ingredient', 'base'].some(k => k in out && (out[k] == null || (Array.isArray(out[k]) && !out[k].length) || (typeof out[k] === 'object' && !Array.isArray(out[k]) && !Object.keys(out[k]).length)));
                if (empty) this.warnings.push(`Workstation "${name}" has a recipe with no ingredients, so it was skipped.`);
                else this.json(`data/${wsNamespace}/recipe/${name}.json`, out);
            }
            this.json(`assets/${wsNamespace}/models/item/${name}.json`, { parent: `${wsNamespace}:block/${name}` });

            if (this.options.itemDefinitions) {
                this.json(`assets/${wsNamespace}/items/${name}.json`, {
                    model: { type: 'minecraft:model', model: `${wsNamespace}:item/${name}` }
                });
            }

            this.json(`data/${wsNamespace}/loot_table/blocks/${name}.json`, {
                type: 'minecraft:block',
                pools: [{
                    rolls: 1,
                    entries: [{ type: 'minecraft:item', name: `${wsNamespace}:${name}` }],
                    conditions: [{ condition: 'minecraft:survives_explosion' }]
                }]
            });

            this.mineableAxe.push(`${wsNamespace}:${name}`);
            this.lang[`block.${wsNamespace}.${name}`] = this.titleCase(name);
            this.lang[`item.${wsNamespace}.${name}`] = this.titleCase(name);
        });

        if (this.mineableAxe.length > 0) {
            this.json('data/minecraft/tags/block/mineable/axe.json', { replace: false, values: this.mineableAxe });
        }
    }

    buildStructureTags() {
        this.data.structureTags.forEach(tag => {
            const rawTag = (tag.tag || '').trim();
            if (!rawTag) return;

            const tagNamespace = this.ns(tag.namespace);
            const tagId = this.splitId(rawTag, tagNamespace);
            const decoration = (tag.mapDecoration || '').trim() || `${tagId.path}_decoration`;
            const decorationId = this.splitId(decoration, tagId.namespace);
            const mapColor = /^#[0-9A-Fa-f]{6}$/.test(tag.mapColor || '') ? tag.mapColor : '#ac7bac';

            this.json(`villagers/structure_tags/${tagId.path.replace(/\//g, '_')}.json`, {
                tag: tagId.path,
                map_decoration: decoration,
                map_color: mapColor,
                namespace: tagId.namespace
            });

            if (tag.structuresJson) {
                this.json(`data/${tagId.namespace}/tags/worldgen/structure/${tagId.path}.json`, tag.structuresJson);
            } else {
                this.warnings.push(`Structure tag "${tagId.path}" lists no structures. Maps that use it cannot locate anything, and worlds may fail to load.`);
            }

            const decorationTexture = tag._textures?.decorationTexture;
            if (decorationTexture) {
                this.image(`assets/${decorationId.namespace}/textures/map/decorations/${decorationId.path}.png`, decorationTexture);
            } else if (decorationId.namespace !== 'minecraft') {
                this.warnings.push(`Map decoration "${decorationId.path}" has no texture.`);
            }

            const mapName = decorationId.path.replace(/_decoration$/, '');
            this.lang[`filled_map.${mapName}`] = `${this.titleCase(mapName)} Explorer Map`;
        });
    }

    withoutProfession(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
        const { profession, ...rest } = value;
        return rest;
    }

    buildTrades() {
        this.data.trades.forEach(trade => {
            const professionId = this.id(trade.profession);
            if (!professionId) return;

            if (!trade.tradesJson) {
                this.warnings.push(`Trades for "${professionId}" are empty and were not included.`);
                return;
            }

            this.json(`villagers/trades/${this.fileNameForId(professionId)}.json`, {
                profession: professionId,
                ...this.withoutProfession(trade.tradesJson)
            });
        });
    }

    buildBiomeTrades() {
        this.data.biomeTrades.forEach(biomeTrade => {
            const professionId = this.id(biomeTrade.profession);
            if (!professionId || !biomeTrade.biomeJson) return;

            this.json(`villagers/biome_trades/${this.fileNameForId(professionId)}.json`, {
                profession: professionId,
                ...this.withoutProfession(biomeTrade.biomeJson)
            });
        });
    }

    buildGifts() {
        const heroGifts = {};

        this.data.gifts.forEach(gift => {
            const professionId = this.id(gift.profession);
            const lootTable = this.id(gift.lootTable);
            if (!professionId || !lootTable) return;

            this.json(`villagers/gifts/${this.fileNameForId(professionId)}.json`, {
                profession: professionId,
                loot_table: lootTable
            });
            heroGifts[professionId] = { loot_table: lootTable };
        });

        if (Object.keys(heroGifts).length > 0) {
            this.json('data/neoforge/data_maps/villager_profession/raid_hero_gifts.json', { values: heroGifts });
        }
    }

    buildBiomeMappings() {
        this.data.biomeMappings.forEach(mapping => {
            const name = this.name(mapping.name) || 'biome_mappings';
            const rows = (mapping._rows || []).filter(row => row.biome && row.villagerType);
            if (rows.length === 0) return;

            const entries = rows.map(row => {
                const entry = {
                    biome: row.biome.startsWith('#') ? row.biome : this.id(row.biome, 'minecraft'),
                    villager_type: this.id(row.villagerType)
                };
                if (row.weight && row.weight !== 1) entry.weight = Math.max(1, row.weight);
                if (row.replace) entry.replace = true;
                return entry;
            });

            this.json(`villagers/biome_mappings/${name}.json`, { biomes: entries });
        });
    }

    buildVillageTypes() {
        const types = this.data.villageTypes || [];
        if (types.length === 0) return;

        types.forEach(village => {
            const name = this.name(village.name);
            if (!name) return;

            const namespace = this.ns(village.namespace);
            const folder = this.name(village.folder) || name.replace(/^village_/, '');
            const copyFrom = village.copyFrom === 'custom' ? (village.copyFromCustom || '').trim() : village.copyFrom;
            const biomes = (village.biomes || []).map(biome => biome.startsWith('#') ? biome : this.id(biome, 'minecraft'));

            if (!copyFrom) {
                this.warnings.push(`Village type "${name}" has no source village and was not included.`);
                return;
            }
            if (biomes.length === 0) {
                this.warnings.push(`Village type "${name}" has no biomes and was not included, as it could never generate.`);
                return;
            }

            this.json(`villagers/village_types/${folder}/${name}.json`, {
                namespace,
                name,
                copy_from: this.id(copyFrom, 'minecraft'),
                biomes,
                weight: Math.max(1, village.weight || 1)
            });

            const overrides = village._overrides || {};
            Object.entries(overrides).forEach(([relative, bytes]) => {
                this.binary(`villagers/village_types/${folder}/${name}/${relative}`, bytes);
            });

            this.warnings.push(`Village type "${namespace}:${name}": map its biomes to a villager type under Biome Mappings so its villagers match the new village.`);
        });
    }

    buildVillageStructures() {
        const structures = this.data.villageStructures || [];
        if (structures.length === 0) return;

        structures.forEach(addition => {
            const village = (addition.villageType || '').trim();
            const folder = this.name(addition.folder) || this.name(village.split(':').pop() || 'village');
            if (!village) {
                this.warnings.push(`Village houses "${folder}" have no target village and were not included.`);
                return;
            }

            const json = { namespace: this.ns(addition.namespace), village_type: this.id(village) };
            const houses = {};
            const zombieHouses = {};

            (addition._rows || []).forEach(row => {
                const name = this.name(row.name);
                if (!name) return;

                const entry = { weight: Math.min(150, Math.max(1, row.weight || 1)) };
                if (row.location) {
                    entry.location = this.id(row.location);
                } else if (row._file) {
                    this.binary(`villagers/village_structures/${folder}/${row.kind}/${name}.nbt`, row._file.data);
                } else {
                    this.warnings.push(`House "${name}" in "${folder}" has neither a structure file nor an existing structure and was not included.`);
                    return;
                }
                if (row.processors) entry.processors = this.id(row.processors, 'minecraft');
                if (row.elementType === 'single') entry.element_type = 'single';
                if (row.maxCount !== null && row.maxCount !== undefined && !Number.isNaN(row.maxCount)) entry.max_count = row.maxCount;

                (row.kind === 'zombie_houses' ? zombieHouses : houses)[name] = entry;
            });

            if (Object.keys(houses).length > 0) json.houses = houses;
            if (Object.keys(zombieHouses).length > 0) json.zombie_houses = zombieHouses;

            if (!json.houses && !json.zombie_houses) {
                this.warnings.push(`Village houses "${folder}" contain no houses and were not included.`);
                return;
            }

            this.json(`villagers/village_structures/${folder}/${folder}_structures.json`, json);
        });
    }

    buildLootTables() {
        this.data.lootTables.forEach(loot => {
            const name = this.name(loot.name);
            if (!name || !loot.lootJson) return;

            const lootJson = { ...loot.lootJson };
            if (this.options.lootRandomSequence && !lootJson.random_sequence) {
                lootJson.random_sequence = `${this.namespace}:gameplay/hero_of_the_village/${name}`;
            }

            this.json(`data/${this.namespace}/loot_table/gameplay/hero_of_the_village/${name}.json`, lootJson);
        });
    }

    buildLanguage() {
        if (Object.keys(this.lang).length > 0) {
            this.json(`assets/${this.namespace}/lang/en_us.json`, this.lang);
        }
    }
}
