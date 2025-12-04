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
            workstations: [],
            structureTags: [],
            textures: {
                professions: {},
                types: {},
                workstations: {},
                mapDecorations: {}
            }
        };
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
        } else {
            this.setupEventListeners();
        }
    }

    setupEventListeners() {
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

        document.getElementById('add-poi')?.addEventListener('click', () => this.addComponent('poi'));
        document.getElementById('add-type')?.addEventListener('click', () => this.addComponent('type'));
        document.getElementById('add-profession')?.addEventListener('click', () => this.addComponent('profession'));
        document.getElementById('add-trade')?.addEventListener('click', () => this.addComponent('trade'));
        document.getElementById('add-biome-trade')?.addEventListener('click', () => this.addComponent('biomeTrade'));
        document.getElementById('add-gift')?.addEventListener('click', () => this.addComponent('gift'));
        document.getElementById('add-biome-mapping')?.addEventListener('click', () => this.addComponent('biomeMapping'));
        document.getElementById('add-loot-table')?.addEventListener('click', () => this.addComponent('lootTable'));
        document.getElementById('add-workstation')?.addEventListener('click', () => this.addComponent('workstation'));
        document.getElementById('add-structure-tag')?.addEventListener('click', () => this.addComponent('structureTag'));

        document.getElementById('generate-pack')?.addEventListener('click', () => this.generatePack());

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
                const preview = document.getElementById('pack-icon-preview');
                preview.src = e.target.result;
                preview.style.display = 'block';
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
            case 'workstation':
                componentDiv.innerHTML = this.createWorkstationForm(id);
                break;
            case 'structureTag':
                componentDiv.innerHTML = this.createStructureTagForm(id);
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
        <label>Block: <input type="text" data-field="block" placeholder="minecraft:brewing_stand or morevillagers:custom_block" /></label>
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
            <button class="validate-btn" onclick="villagerGen.validateJSON('${id}', 'tradesJson')">Validate JSON</button>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
            <div class="validation-result"></div>
        `;
    }

    createBiomeTradeForm(id) {
        return `
            <h4>Biome-Specific Trade</h4>
            <label>Profession: <input type="text" data-field="profession" placeholder="alchemist" /></label>
            <label>Biome Overrides JSON: <textarea data-field="biomeJson" rows="10" placeholder='{"biome_overrides": {...}}'></textarea></label>
            <button class="validate-btn" onclick="villagerGen.validateJSON('${id}', 'biomeJson')">Validate JSON</button>
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
            <button class="validate-btn" onclick="villagerGen.validateJSON('${id}', 'biomesJson')">Validate JSON</button>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
            <div class="validation-result"></div>
        `;
    }

    createLootTableForm(id) {
        return `
            <h4>Loot Table</h4>
            <label>Name: <input type="text" data-field="name" placeholder="alchemist_gift" /></label>
            <label>Loot Table JSON: <textarea data-field="lootJson" rows="10" placeholder='{"type": "minecraft:gift", "pools": [...]}'></textarea></label>
            <button class="validate-btn" onclick="villagerGen.validateJSON('${id}', 'lootJson')">Validate JSON</button>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
            <div class="validation-result"></div>
        `;
    }

    createWorkstationForm(id) {
        return `
            <h4>Workstation Block</h4>
            <label>Name: <input type="text" data-field="name" placeholder="e.g., purpur_altar" /></label>
            <label>Namespace: <input type="text" data-field="namespace" placeholder="villagerapi (default)" /></label>
            
            <div class="texture-upload-grid">
                <div class="texture-upload-item">
                    <label>Front Texture: <input type="file" data-field="textureFront" accept="image/png" /></label>
                    <img class="texture-preview" data-preview="front" style="display:none;">
                </div>
                <div class="texture-upload-item">
                    <label>Back Texture: <input type="file" data-field="textureBack" accept="image/png" /></label>
                    <img class="texture-preview" data-preview="back" style="display:none;">
                </div>
                <div class="texture-upload-item">
                    <label>Left Texture: <input type="file" data-field="textureLeft" accept="image/png" /></label>
                    <img class="texture-preview" data-preview="left" style="display:none;">
                </div>
                <div class="texture-upload-item">
                    <label>Right Texture: <input type="file" data-field="textureRight" accept="image/png" /></label>
                    <img class="texture-preview" data-preview="right" style="display:none;">
                </div>
                <div class="texture-upload-item">
                    <label>Top Texture: <input type="file" data-field="textureTop" accept="image/png" /></label>
                    <img class="texture-preview" data-preview="top" style="display:none;">
                </div>
                <div class="texture-upload-item">
                    <label>Bottom Texture: <input type="file" data-field="textureBottom" accept="image/png" /></label>
                    <img class="texture-preview" data-preview="bottom" style="display:none;">
                </div>
            </div>
            
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
        `;
    }

    createStructureTagForm(id) {
        return `
            <h4>Structure Tag & Map Decoration</h4>
            <label>Tag Name: <input type="text" data-field="tag" placeholder="e.g., on_end_city_explorer_maps" /></label>
            <label>Namespace: <input type="text" data-field="namespace" placeholder="villagerapi (default)" /></label>
            <label>Map Decoration Name: <input type="text" data-field="mapDecoration" placeholder="e.g., end_city_decoration" /></label>
            
            <div style="margin: 15px 0;">
                <label style="display: block; margin-bottom: 10px;">Map Color:</label>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <input type="color" data-field="mapColorPicker" value="#ac7bac" 
                           style="width: 80px; height: 50px; cursor: pointer; border: 2px solid #ccc; border-radius: 5px;">
                    <input type="text" data-field="mapColor" value="#ac7bac" placeholder="#ac7bac" 
                           style="width: 150px; font-family: monospace;">
                </div>
            </div>
            
            <label>Map Decoration Texture: <input type="file" data-field="decorationTexture" accept="image/png" /></label>
            <img class="texture-preview" data-preview="decoration" style="display:none; margin-top: 10px;">
            
            <label>Structure Tags JSON: <textarea data-field="structuresJson" rows="6" placeholder='{"replace": false, "values": ["minecraft:end_city"]}'></textarea></label>
            <button class="validate-btn" onclick="villagerGen.validateJSON('${id}', 'structuresJson')">Validate JSON</button>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
            <div class="validation-result"></div>
        `;
    }

    attachComponentListeners(id, type) {
        const component = document.getElementById(id);
        if (!component) return;

        const fileInputs = component.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            input.addEventListener('change', (e) => this.handleTextureUpload(e, id, type));
        });

        if (type === 'structureTag') {
            const colorPicker = component.querySelector('[data-field="mapColorPicker"]');
            const colorInput = component.querySelector('[data-field="mapColor"]');
            
            if (colorPicker && colorInput) {
                colorPicker.addEventListener('input', (e) => {
                    colorInput.value = e.target.value;
                });
                
                colorInput.addEventListener('input', (e) => {
                    const value = e.target.value;
                    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                        colorPicker.value = value;
                    }
                });
            }
        }
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
                } else if (type === 'workstation') {
                    if (!this.packData.textures.workstations[name]) {
                        this.packData.textures.workstations[name] = {};
                    }
                    this.packData.textures.workstations[name][field] = e.target.result;
                } else if (type === 'structureTag' && field === 'decorationTexture') {
                    const decorationName = component.querySelector('[data-field="mapDecoration"]')?.value || '';
                    this.packData.textures.mapDecorations[decorationName] = e.target.result;
                }

                // Show preview
                const preview = event.target.parentElement.parentElement.querySelector(`[data-preview]`);
                if (preview) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';
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
            resultDiv.textContent = '✓ Valid JSON';
            resultDiv.style.color = 'green';
            return true;
        } catch (e) {
            resultDiv.textContent = `✗ Invalid JSON: ${e.message}`;
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
            const inputs = component.querySelectorAll('input:not([type="file"]):not([type="color"]), select, textarea');
            
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
            const packMcmeta = {
                pack: {
                    pack_format: this.packData.metadata.packFormat,
                    supported_formats: { min_inclusive: 42, max_inclusive: 1000 },
                    description: this.packData.metadata.description
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
                    const poiNamespace = poi.namespace || 'villagerapi';
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
                    const typeNamespace = type.namespace || 'villagerapi';
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
                    const profNamespace = prof.namespace || 'villagerapi';
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
                    const wsNamespace = ws.namespace || 'villagerapi';
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

                    // Item model
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
                    const tagNamespace = tag.namespace || 'villagerapi';
                    
                    // Structure tag data
                    const structureTagData = {
                        tag: tag.tag,
                        map_decoration: tag.mapDecoration || `${tag.tag}_decoration`,
                        map_color: tag.mapColor || "#ac7bac",
                        namespace: tagNamespace
                    };
                    zip.file(`villagers/structure_tags/${tag.tag}.json`, JSON.stringify(structureTagData, null, 2));

                    // Structure tag
                    if (tag.structuresJson) {
                        zip.file(`data/${tagNamespace}/tags/worldgen/structure/${tag.tag}.json`, JSON.stringify(tag.structuresJson, null, 2));
                    }

                    // Map decoration texture
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
            workstations.forEach(ws => {
                if (ws.name) {
                    const wsNamespace = ws.namespace || 'villagerapi';
                    langData[`block.${wsNamespace}.${ws.name}`] = this.toTitleCase(ws.name);
                }
            });
            structureTags.forEach(tag => {
                if (tag.tag && tag.mapDecoration) {
                    const decorationName = tag.mapDecoration.split(':').pop() || tag.mapDecoration;
                    langData[`filled_map.${decorationName.replace('_decoration', '')}`] = this.toTitleCase(decorationName.replace('_decoration', '')) + ' Explorer Map';
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