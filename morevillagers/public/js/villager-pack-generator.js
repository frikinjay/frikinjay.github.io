// Villager Pack Generator JavaScript
// https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js

class VillagerPackGenerator {
    constructor() {
        this.packData = {
            metadata: {
                packFormat: 48,
                description: ''
            },
            packIcon: null,
            namespace: 'morevillagers',
            poiTypes: [],
            villagerTypes: [],
            professions: [],
            trades: [],
            biomeTrades: [],
            gifts: [],
            biomeMappings: [],
            lootTables: [],
            textures: {
                professions: {},
                types: {}
            }
        };
        this.init();
    }

    init() {
        // Initialize event listeners after DOM loads
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
        } else {
            this.setupEventListeners();
        }
    }

    setupEventListeners() {
        // Pack metadata
        document.getElementById('pack-namespace')?.addEventListener('input', (e) => {
            this.packData.namespace = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
            e.target.value = this.packData.namespace;
        });
        document.getElementById('pack-description')?.addEventListener('input', (e) => {
            this.packData.metadata.description = e.target.value;
        });
        document.getElementById('pack-icon-upload')?.addEventListener('change', (e) => {
            this.handlePackIconUpload(e);
        });

        // Add component buttons
        document.getElementById('add-poi')?.addEventListener('click', () => this.addComponent('poi'));
        document.getElementById('add-type')?.addEventListener('click', () => this.addComponent('type'));
        document.getElementById('add-profession')?.addEventListener('click', () => this.addComponent('profession'));
        document.getElementById('add-trade')?.addEventListener('click', () => this.addComponent('trade'));
        document.getElementById('add-biome-trade')?.addEventListener('click', () => this.addComponent('biomeTrade'));
        document.getElementById('add-gift')?.addEventListener('click', () => this.addComponent('gift'));
        document.getElementById('add-biome-mapping')?.addEventListener('click', () => this.addComponent('biomeMapping'));
        document.getElementById('add-loot-table')?.addEventListener('click', () => this.addComponent('lootTable'));

        // Generate pack button
        document.getElementById('generate-pack')?.addEventListener('click', () => this.generatePack());

        // Add initial empty forms
        this.addComponent('poi');
        this.addComponent('type');
        this.addComponent('profession');
    }

    handlePackIconUpload(event) {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.packData.packIcon = e.target.result;
                document.getElementById('pack-icon-preview').src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    addComponent(type) {
        const container = document.getElementById(`${type}-list`);
        if (!container) return;

        const id = `${type}-${Date.now()}`;
        const componentDiv = document.createElement('div');
        componentDiv.className = 'component-item';
        componentDiv.id = id;

        switch (type) {
            case 'poi':
                componentDiv.innerHTML = this.createPOIForm(id);
                break;
            case 'type':
                componentDiv.innerHTML = this.createTypeForm(id);
                break;
            case 'profession':
                componentDiv.innerHTML = this.createProfessionForm(id);
                break;
            case 'trade':
                componentDiv.innerHTML = this.createTradeForm(id);
                break;
            case 'biomeTrade':
                componentDiv.innerHTML = this.createBiomeTradeForm(id);
                break;
            case 'gift':
                componentDiv.innerHTML = this.createGiftForm(id);
                break;
            case 'biomeMapping':
                componentDiv.innerHTML = this.createBiomeMappingForm(id);
                break;
            case 'lootTable':
                componentDiv.innerHTML = this.createLootTableForm(id);
                break;
        }

        container.appendChild(componentDiv);
        this.attachComponentListeners(id, type);
    }

    createPOIForm(id) {
        return `
        <h4>POI Type</h4>
        <label>Name: <input type="text" data-field="name" placeholder="e.g., alchemist" /></label>
        <label>Namespace: <input type="text" data-field="namespace" placeholder="villagerapi (default)" /></label>
        <label>Block: <input type="text" data-field="block" placeholder="minecraft:brewing_stand" /></label>
        <label>Tickets: <input type="number" data-field="tickets" value="1" min="1" /></label>
        <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
    `;
    }

    createTypeForm(id) {
        return `
        <h4>Villager Type</h4>
        <label>Name: <input type="text" data-field="name" placeholder="e.g., jungle_dweller" /></label>
        <label>Namespace: <input type="text" data-field="namespace" placeholder="villagerapi (default)" /></label>
        <label>Texture: <input type="file" data-field="texture" accept="image/png" /></label>
        <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
    `;
    }

    createProfessionForm(id) {
        return `
        <h4>Profession</h4>
        <label>Name: <input type="text" data-field="name" placeholder="e.g., alchemist" /></label>
        <label>Namespace: <input type="text" data-field="namespace" placeholder="villagerapi (default)" /></label>
        <label>POI Type: <input type="text" data-field="poiType" placeholder="alchemist" /></label>
        <label>Work Sound: <select data-field="workSound">
            <option value="minecraft:entity.villager.work_armorer">Armorer</option>
            <option value="minecraft:entity.villager.work_butcher">Butcher</option>
            <option value="minecraft:entity.villager.work_cartographer">Cartographer</option>
            <option value="minecraft:entity.villager.work_cleric">Cleric</option>
            <option value="minecraft:entity.villager.work_farmer">Farmer</option>
            <option value="minecraft:entity.villager.work_fisherman">Fisherman</option>
            <option value="minecraft:entity.villager.work_fletcher">Fletcher</option>
            <option value="minecraft:entity.villager.work_leatherworker">Leatherworker</option>
            <option value="minecraft:entity.villager.work_librarian">Librarian</option>
            <option value="minecraft:entity.villager.work_mason">Mason</option>
            <option value="minecraft:entity.villager.work_shepherd">Shepherd</option>
            <option value="minecraft:entity.villager.work_toolsmith">Toolsmith</option>
            <option value="minecraft:entity.villager.work_weaponsmith">Weaponsmith</option>
        </select></label>
        <label>Texture: <input type="file" data-field="texture" accept="image/png" /></label>
        <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
    `;
    }

    createTradeForm(id) {
        return `
            <h4>Trade Definition</h4>
            <label>Profession: <input type="text" data-field="profession" placeholder="alchemist" /></label>
            <label>Trades JSON: <textarea data-field="tradesJson" rows="10" placeholder='{"levels": {"1": [], "2": [], ...}}'></textarea></label>
            <button onclick="villagerGen.validateJSON('${id}', 'tradesJson')">Validate JSON</button>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
            <div class="validation-result"></div>
        `;
    }

    createBiomeTradeForm(id) {
        return `
            <h4>Biome-Specific Trade</h4>
            <label>Profession: <input type="text" data-field="profession" placeholder="alchemist" /></label>
            <label>Biome Overrides JSON: <textarea data-field="biomeJson" rows="10" placeholder='{"biome_overrides": {...}}'></textarea></label>
            <button onclick="villagerGen.validateJSON('${id}', 'biomeJson')">Validate JSON</button>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
            <div class="validation-result"></div>
        `;
    }

    createGiftForm(id) {
        return `
            <h4>Hero Gift</h4>
            <label>Profession: <input type="text" data-field="profession" placeholder="alchemist" /></label>
            <label>Loot Table: <input type="text" data-field="lootTable" placeholder="morevillagers:gameplay/hero_of_the_village/alchemist_gift" /></label>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
        `;
    }

    createBiomeMappingForm(id) {
        return `
            <h4>Biome Mapping</h4>
            <label>Name: <input type="text" data-field="name" placeholder="custom_biomes" /></label>
            <label>Biomes JSON: <textarea data-field="biomesJson" rows="8" placeholder='{"biomes": {"minecraft:jungle": "jungle_dweller"}}'></textarea></label>
            <button onclick="villagerGen.validateJSON('${id}', 'biomesJson')">Validate JSON</button>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
            <div class="validation-result"></div>
        `;
    }

    createLootTableForm(id) {
        return `
            <h4>Loot Table</h4>
            <label>Name: <input type="text" data-field="name" placeholder="alchemist_gift" /></label>
            <label>Loot Table JSON: <textarea data-field="lootJson" rows="10" placeholder='{"type": "minecraft:gift", "pools": [...]}'></textarea></label>
            <button onclick="villagerGen.validateJSON('${id}', 'lootJson')">Validate JSON</button>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
            <div class="validation-result"></div>
        `;
    }

    attachComponentListeners(id, type) {
        const component = document.getElementById(id);
        if (!component) return;

        // Handle file uploads
        const fileInputs = component.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            input.addEventListener('change', (e) => this.handleTextureUpload(e, id, type));
        });
    }

    handleTextureUpload(event, id, type) {
        const file = event.target.files[0];
        if (file && file.type === 'image/png') {
            const reader = new FileReader();
            reader.onload = (e) => {
                const field = event.target.dataset.field;
                const component = document.getElementById(id);
                const nameInput = component.querySelector('[data-field="name"]');
                const name = nameInput ? nameInput.value : '';
                
                if (type === 'profession') {
                    this.packData.textures.professions[name] = e.target.result;
                } else if (type === 'type') {
                    this.packData.textures.types[name] = e.target.result;
                }
            };
            reader.readAsDataURL(file);
        }
    }

    validateJSON(componentId, fieldName) {
        const component = document.getElementById(componentId);
        const textarea = component.querySelector(`[data-field="${fieldName}"]`);
        const resultDiv = component.querySelector('.validation-result');
        
        try {
            JSON.parse(textarea.value);
            resultDiv.textContent = 'Valid JSON';
            resultDiv.style.color = 'green';
            return true;
        } catch (e) {
            resultDiv.textContent = `Invalid JSON: ${e.message}`;
            resultDiv.style.color = 'red';
            return false;
        }
    }

    removeComponent(id) {
        const component = document.getElementById(id);
        if (component) {
            component.remove();
        }
    }

    collectComponentData(type) {
        const container = document.getElementById(`${type}-list`);
        if (!container) return [];

        const components = container.querySelectorAll('.component-item');
        const data = [];

        components.forEach(component => {
            const item = {};
            const inputs = component.querySelectorAll('input:not([type="file"]), select, textarea');
            
            inputs.forEach(input => {
                const field = input.dataset.field;
                if (field) {
                    if (input.type === 'number') {
                        item[field] = parseInt(input.value) || 1;
                    } else if (input.tagName === 'TEXTAREA') {
                        try {
                            item[field] = JSON.parse(input.value);
                        } catch (e) {
                            item[field] = input.value;
                        }
                    } else {
                        item[field] = input.value;
                    }
                }
            });

            if (Object.keys(item).length > 0) {
                data.push(item);
            }
        });

        return data;
    }

    async generatePack() {
        const zip = new JSZip();
        const namespace = this.packData.namespace;

        try {
            // Generate pack.mcmeta
            const packMcmeta = {
                pack: {
                    pack_format: this.packData.metadata.packFormat,
                    description: this.packData.metadata.description
                }
            };
            zip.file('pack.mcmeta', JSON.stringify(packMcmeta, null, 2));

            // Add pack.png if available
            if (this.packData.packIcon) {
                const base64Data = this.packData.packIcon.split(',')[1];
                zip.file('pack.png', base64Data, { base64: true });
            }

            // Create villagers directory structure
            const poiTypes = this.collectComponentData('poi');
            const types = this.collectComponentData('type');
            const professions = this.collectComponentData('profession');
            const trades = this.collectComponentData('trade');
            const biomeTrades = this.collectComponentData('biomeTrade');
            const gifts = this.collectComponentData('gift');
            const biomeMappings = this.collectComponentData('biomeMapping');
            const lootTables = this.collectComponentData('lootTable');

            // Generate POI types
            poiTypes.forEach(poi => {
                if (poi.name) {
                    const poiNamespace = poi.namespace || 'villagerapi';
                    const poiData = {
                        block: poi.block || 'minecraft:barrel',
                        tickets: poi.tickets || 1,
                        namespace: poiNamespace
                    };
                    zip.file(`villagers/poi_types/${poi.name}.json`, JSON.stringify(poiData, null, 2));
                }
            });

            // Generate villager types
            types.forEach(type => {
                if (type.name) {
                    const typeNamespace = type.namespace || 'villagerapi';
                    const typeData = {
                        name: type.name,
                        namespace: typeNamespace
                    };
                    zip.file(`villagers/types/${type.name}.json`, JSON.stringify(typeData, null, 2));

                    // Add type texture if available
                    if (this.packData.textures.types[type.name]) {
                        const base64Data = this.packData.textures.types[type.name].split(',')[1];
                        zip.file(`assets/${typeNamespace}/textures/entity/villager/type/${type.name}.png`, base64Data, { base64: true });
                        zip.file(`assets/${typeNamespace}/textures/entity/zombie_villager/type/${type.name}.png`, base64Data, { base64: true });
                    }
                }
            });

            // Generate professions
            professions.forEach(prof => {
                if (prof.name) {
                    const profNamespace = prof.namespace || 'villagerapi';
                    const profData = {
                        poi_type: prof.poiType || prof.name,
                        work_sound: prof.workSound || 'minecraft:entity.villager.work_armorer',
                        namespace: profNamespace
                    };
                    zip.file(`villagers/professions/${prof.name}.json`, JSON.stringify(profData, null, 2));

                    // Add profession texture if available
                    if (this.packData.textures.professions[prof.name]) {
                        const base64Data = this.packData.textures.professions[prof.name].split(',')[1];
                        zip.file(`assets/${profNamespace}/textures/entity/villager/profession/${prof.name}.png`, base64Data, { base64: true });
                        zip.file(`assets/${profNamespace}/textures/entity/zombie_villager/profession/${prof.name}.png`, base64Data, { base64: true });
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
                    const profNamespace = prof.namespace || 'villagerapi';
                    langData[`entity.minecraft.villager.${profNamespace}.${prof.name}`] = this.toTitleCase(prof.name);
                    langData[`entity.minecraft.villager.${prof.name}`] = this.toTitleCase(prof.name);
                }
            });
            types.forEach(type => {
                if (type.name) {
                    const typeNamespace = type.namespace || 'villagerapi';
                    langData[`entity.minecraft.villager.${typeNamespace}.${type.name}`] = this.toTitleCase(type.name);
                    langData[`entity.minecraft.villager.${type.name}`] = this.toTitleCase(type.name);
                }
            });
            if (Object.keys(langData).length > 0) {
                zip.file(`assets/${namespace}/lang/en_us.json`, JSON.stringify(langData, null, 2));
            }

            // Generate acquirable_job_site tag
            if (professions.length > 0) {
                const jobSiteTag = {
                    replace: false,
                    values: professions.map(p => {
                        const profNamespace = p.namespace || 'villagerapi';
                        return `${profNamespace}:${p.name}`;
                    })
                };
                zip.file('data/minecraft/tags/point_of_interest_type/acquirable_job_site.json', JSON.stringify(jobSiteTag, null, 2));
            }

            // Generate NeoForge hero gifts data map
            if (gifts.length > 0) {
                const heroGiftsMap = {
                    values: {}
                };
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
            this.downloadBlob(content, `${packName}.zip`);

            alert('Pack generated successfully!');
        } catch (error) {
            alert(`Error generating pack: ${error.message}`);
            console.error(error);
        }
    }

    toTitleCase(str) {
        return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize the generator
let villagerGen;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        villagerGen = new VillagerPackGenerator();
    });
} else {
    villagerGen = new VillagerPackGenerator();
}