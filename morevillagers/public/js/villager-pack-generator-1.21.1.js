// Villager Pack Generator for Minecraft 1.21.1
// https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js

class VillagerPackGenerator_1_21_1 extends VillagerPackGeneratorBase {
    async generatePack() {
        const zip = new JSZip();
        const namespace = this.packData.metadata.namespace;

        if (!namespace) {
            alert('Pack namespace is required!');
            return;
        }

        try {
            // Generate villagerapi_config.json
            const villagerApiConfig = {
                namespace: namespace,
                display_name: this.packData.metadata.displayName || this.toTitleCase(namespace),
                description: this.packData.metadata.description || '',
                version: this.packData.metadata.version || '1.0.0',
                author: this.packData.metadata.author || 'Unknown',
                creative_tab_icon: this.packData.metadata.creativeTabIcon || 'minecraft:emerald'
            };
            zip.file('villagerapi_config.json', JSON.stringify(villagerApiConfig, null, 2));

            // Generate pack.mcmeta
            const packMcmeta = {
                pack: {
                    pack_format: this.packData.metadata.packFormat,
                    supported_formats: { min_inclusive: 0, max_inclusive: 1000 },
                    description: this.packData.metadata.description || 'A custom villager pack'
                }
            };
            zip.file('pack.mcmeta', JSON.stringify(packMcmeta, null, 2));

            if (this.packData.packIcon) {
                const base64Data = this.packData.packIcon.split(',')[1];
                zip.file('pack.png', base64Data, { base64: true });
            }

            const poiTypes = this.collectComponentData('poi');
            const types = this.collectComponentData('type');
            const professions = this.collectComponentData('profession');
            const trades = this.collectComponentData('trade');
            const biomeTrades = this.collectComponentData('biomeTrade');
            const gifts = this.collectComponentData('gift');
            const biomeMappings = this.collectComponentData('biomeMapping');
            const lootTables = this.collectComponentData('lootTable');
            const workstations = this.collectComponentData('workstation');
            const structureTags = this.collectComponentData('structureTag');

            // Generate POI types
            poiTypes.forEach(poi => {
                if (poi.name) {
                    const poiNamespace = poi.namespace || namespace;
                    const poiData = {
                        block: poi.block || 'minecraft:barrel',
                        namespace: poiNamespace
                    };
                    zip.file(`villagers/poi_types/${poi.name}.json`, JSON.stringify(poiData, null, 2));
                }
            });

            // Generate villager types
            types.forEach(type => {
                if (type.name) {
                    const typeNamespace = type.namespace || namespace;
                    const typeData = {
                        name: type.name,
                        namespace: typeNamespace
                    };
                    zip.file(`villagers/types/${type.name}.json`, JSON.stringify(typeData, null, 2));

                    if (this.packData.textures.types[type.name]) {
                        const base64Data = this.packData.textures.types[type.name].split(',')[1];
                        zip.file(`assets/${typeNamespace}/textures/entity/villager/type/${type.name}.png`, base64Data, { base64: true });
                        zip.file(`assets/${typeNamespace}/textures/entity/zombie_villager/type/${type.name}.png`, base64Data, { base64: true });
                        
                        const mcmeta = { villager: { hat: "full" } };
                        zip.file(`assets/${typeNamespace}/textures/entity/villager/type/${type.name}.png.mcmeta`, JSON.stringify(mcmeta, null, 2));
                        zip.file(`assets/${typeNamespace}/textures/entity/zombie_villager/type/${type.name}.png.mcmeta`, JSON.stringify(mcmeta, null, 2));
                    }
                }
            });

            // Generate professions
            professions.forEach(prof => {
                if (prof.name) {
                    const profNamespace = prof.namespace || namespace;
                    const profData = {
                        poi_type: prof.poiType || prof.name,
                        work_sound: prof.workSound || 'minecraft:entity.villager.work_armorer',
                        namespace: profNamespace
                    };
                    zip.file(`villagers/professions/${prof.name}.json`, JSON.stringify(profData, null, 2));

                    if (this.packData.textures.professions[prof.name]) {
                        const base64Data = this.packData.textures.professions[prof.name].split(',')[1];
                        zip.file(`assets/${profNamespace}/textures/entity/villager/profession/${prof.name}.png`, base64Data, { base64: true });
                        zip.file(`assets/${profNamespace}/textures/entity/zombie_villager/profession/${prof.name}.png`, base64Data, { base64: true });
                        
                        const mcmeta = { villager: { hat: "partial" } };
                        zip.file(`assets/${profNamespace}/textures/entity/villager/profession/${prof.name}.png.mcmeta`, JSON.stringify(mcmeta, null, 2));
                        zip.file(`assets/${profNamespace}/textures/entity/zombie_villager/profession/${prof.name}.png.mcmeta`, JSON.stringify(mcmeta, null, 2));
                    }
                }
            });

            // Generate workstations
            workstations.forEach(ws => {
                if (ws.name) {
                    const wsNamespace = ws.namespace || namespace;
                    const wsData = {
                        name: ws.name,
                        namespace: wsNamespace
                    };
                    zip.file(`villagers/workstations/${ws.name}.json`, JSON.stringify(wsData, null, 2));

                    // Blockstate
                    const blockstate = {
                        variants: {
                            "": { model: `${wsNamespace}:block/${ws.name}` }
                        }
                    };
                    zip.file(`assets/${wsNamespace}/blockstates/${ws.name}.json`, JSON.stringify(blockstate, null, 2));

                    // Block model
                    const blockModel = {
                        parent: "minecraft:block/cube",
                        textures: {
                            north: `${wsNamespace}:block/${ws.name}_back`,
                            south: `${wsNamespace}:block/${ws.name}_front`,
                            east: `${wsNamespace}:block/${ws.name}_right`,
                            west: `${wsNamespace}:block/${ws.name}_left`,
                            up: `${wsNamespace}:block/${ws.name}_top`,
                            particle: `${wsNamespace}:block/${ws.name}_bottom`,
                            down: `${wsNamespace}:block/${ws.name}_bottom`
                        },
                        elements: [{
                            from: [0, 0, 0],
                            to: [16, 16, 16],
                            faces: {
                                north: { uv: [0, 0, 16, 16], texture: "#east" },
                                east: { uv: [0, 0, 16, 16], texture: "#north" },
                                south: { uv: [0, 0, 16, 16], texture: "#west" },
                                west: { uv: [0, 0, 16, 16], texture: "#south" },
                                up: { uv: [0, 0, 16, 16], texture: "#up" },
                                down: { uv: [0, 0, 16, 16], texture: "#down" }
                            }
                        }]
                    };
                    zip.file(`assets/${wsNamespace}/models/block/${ws.name}.json`, JSON.stringify(blockModel, null, 2));

                    // Item model (1.21.1 format)
                    const itemModel = { parent: `${wsNamespace}:block/${ws.name}` };
                    zip.file(`assets/${wsNamespace}/models/item/${ws.name}.json`, JSON.stringify(itemModel, null, 2));

                    // Block textures
                    const textures = this.packData.textures.workstations[ws.name];
                    if (textures) {
                        const faces = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom'];
                        faces.forEach(face => {
                            const fieldName = `texture${face}`;
                            if (textures[fieldName]) {
                                const base64Data = textures[fieldName].split(',')[1];
                                zip.file(`assets/${wsNamespace}/textures/block/${ws.name}_${face.toLowerCase()}.png`, base64Data, { base64: true });
                            }
                        });
                    }

                    // Loot table
                    const lootTable = {
                        type: "minecraft:block",
                        pools: [{
                            rolls: 1,
                            entries: [{
                                type: "minecraft:item",
                                name: `${wsNamespace}:${ws.name}`,
                                functions: [{ function: "minecraft:copy_name", source: "block_entity" }]
                            }],
                            conditions: [{ condition: "minecraft:survives_explosion" }]
                        }]
                    };
                    zip.file(`data/${wsNamespace}/loot_table/blocks/${ws.name}.json`, JSON.stringify(lootTable, null, 2));

                    // Mineable tag
                    const mineableTag = {
                        replace: false,
                        values: [`${wsNamespace}:${ws.name}`]
                    };
                    zip.file(`data/minecraft/tags/block/mineable/axe.json`, JSON.stringify(mineableTag, null, 2));
                }
            });

            // Generate structure tags and map decorations
            structureTags.forEach(tag => {
                if (tag.tag) {
                    const tagNamespace = tag.namespace || namespace;
                    
                    const structureTagData = {
                        tag: tag.tag,
                        map_decoration: tag.mapDecoration || `${tag.tag}_decoration`,
                        map_color: tag.mapColor || "#ac7bac",
                        namespace: tagNamespace
                    };
                    zip.file(`villagers/structure_tags/${tag.tag}.json`, JSON.stringify(structureTagData, null, 2));

                    if (tag.structuresJson) {
                        zip.file(`data/${tagNamespace}/tags/worldgen/structure/${tag.tag}.json`, JSON.stringify(tag.structuresJson, null, 2));
                    }

                    const decorationName = tag.mapDecoration || `${tag.tag}_decoration`;
                    if (this.packData.textures.mapDecorations[decorationName]) {
                        const base64Data = this.packData.textures.mapDecorations[decorationName].split(',')[1];
                        zip.file(`assets/${tagNamespace}/textures/map/decorations/${decorationName}.png`, base64Data, { base64: true });
                    }
                }
            });

            // Generate trades
            trades.forEach(trade => {
                if (trade.profession && trade.tradesJson) {
                    const tradeData = {
                        profession: `${namespace}:${trade.profession}`,
                        ...trade.tradesJson
                    };
                    zip.file(`villagers/trades/${trade.profession}.json`, JSON.stringify(tradeData, null, 2));
                }
            });

            // Generate biome trades
            biomeTrades.forEach(biomeTrade => {
                if (biomeTrade.profession && biomeTrade.biomeJson) {
                    const biomeData = {
                        profession: `${namespace}:${biomeTrade.profession}`,
                        ...biomeTrade.biomeJson
                    };
                    zip.file(`villagers/biome_trades/${biomeTrade.profession}.json`, JSON.stringify(biomeData, null, 2));
                }
            });

            // Generate gifts
            gifts.forEach(gift => {
                if (gift.profession && gift.lootTable) {
                    const giftData = {
                        profession: `${namespace}:${gift.profession}`,
                        loot_table: gift.lootTable
                    };
                    zip.file(`villagers/gifts/${gift.profession}.json`, JSON.stringify(giftData, null, 2));
                }
            });

            // Generate biome mappings
            biomeMappings.forEach(mapping => {
                if (mapping.name && mapping.biomesJson) {
                    zip.file(`villagers/biome_mappings/${mapping.name}.json`, JSON.stringify(mapping.biomesJson, null, 2));
                }
            });

            // Generate loot tables
            lootTables.forEach(loot => {
                if (loot.name && loot.lootJson) {
                    zip.file(`data/${namespace}/loot_table/gameplay/hero_of_the_village/${loot.name}.json`, JSON.stringify(loot.lootJson, null, 2));
                }
            });

            // Generate language file
            const langData = {};
            professions.forEach(prof => {
                if (prof.name) {
                    const profNamespace = prof.namespace || namespace;
                    langData[`entity.minecraft.villager.${profNamespace}.${prof.name}`] = this.toTitleCase(prof.name);
                    langData[`entity.minecraft.villager.${prof.name}`] = this.toTitleCase(prof.name);
                }
            });
            types.forEach(type => {
                if (type.name) {
                    const typeNamespace = type.namespace || namespace;
                    langData[`entity.minecraft.villager.${typeNamespace}.${type.name}`] = this.toTitleCase(type.name);
                    langData[`entity.minecraft.villager.${type.name}`] = this.toTitleCase(type.name);
                }
            });
            workstations.forEach(ws => {
                if (ws.name) {
                    const wsNamespace = ws.namespace || namespace;
                    langData[`block.${wsNamespace}.${ws.name}`] = this.toTitleCase(ws.name);
                }
            });
            structureTags.forEach(tag => {
                if (tag.tag && tag.mapDecoration) {
                    const decorationName = tag.mapDecoration.split(':').pop() || tag.mapDecoration;
                    langData[`filled_map.${decorationName.replace('_decoration', '')}`] = this.toTitleCase(decorationName.replace('_decoration', '')) + ' Explorer Map';
                }
            });
            langData[`itemGroup.${namespace}.villagerpack_tab`] = this.packData.metadata.displayName || this.toTitleCase(namespace);
            
            if (Object.keys(langData).length > 0) {
                zip.file(`assets/${namespace}/lang/en_us.json`, JSON.stringify(langData, null, 2));
            }

            // Generate acquirable_job_site tag
            if (professions.length > 0) {
                const jobSiteTag = {
                    replace: false,
                    values: professions.map(p => {
                        const profNamespace = p.namespace || namespace;
                        return `${profNamespace}:${p.name}`;
                    })
                };
                zip.file('data/minecraft/tags/point_of_interest_type/acquirable_job_site.json', JSON.stringify(jobSiteTag, null, 2));
            }

            // Generate NeoForge hero gifts data map
            if (gifts.length > 0) {
                const heroGiftsMap = { values: {} };
                gifts.forEach(gift => {
                    heroGiftsMap.values[`${namespace}:${gift.profession}`] = {
                        loot_table: gift.lootTable
                    };
                });
                zip.file('data/neoforge/data_maps/villager_profession/raid_hero_gifts.json', JSON.stringify(heroGiftsMap, null, 2));
            }

            // Generate ZIP file
            const content = await zip.generateAsync({ type: 'blob' });
            const packName = namespace || 'villager_pack';
            this.downloadBlob(content, `${packName}_1.21.1.zip`);

            alert('Pack generated successfully for Minecraft 1.21.1!');
        } catch (error) {
            alert(`Error generating pack: ${error.message}`);
            console.error(error);
        }
    }
}