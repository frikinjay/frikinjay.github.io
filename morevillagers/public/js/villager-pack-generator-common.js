// Villager Pack Generator - Common/Shared Code
// Base class with shared functionality across versions

class VillagerPackGeneratorBase {
    constructor() {
        this.packData = {
            metadata: {
                packFormat: 48,
                namespace: 'morevillagers',
                displayName: '',
                description: '',
                version: '1.0.0',
                author: '',
                creativeTabIcon: 'minecraft:emerald'
            },
            packIcon: null,
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
    }

    init() {
        // Call setupEventListeners directly since this is called after window.load
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('pack-namespace')?.addEventListener('input', (e) => {
            this.packData.metadata.namespace = e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
            e.target.value = this.packData.metadata.namespace;
        });
        document.getElementById('pack-display-name')?.addEventListener('input', (e) => {
            this.packData.metadata.displayName = e.target.value;
        });
        document.getElementById('pack-description')?.addEventListener('input', (e) => {
            this.packData.metadata.description = e.target.value;
        });
        document.getElementById('pack-version')?.addEventListener('input', (e) => {
            this.packData.metadata.version = e.target.value || '1.0.0';
        });
        document.getElementById('pack-author')?.addEventListener('input', (e) => {
            this.packData.metadata.author = e.target.value;
        });
        document.getElementById('pack-creative-icon')?.addEventListener('input', (e) => {
            this.packData.metadata.creativeTabIcon = e.target.value || 'minecraft:emerald';
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
        <label>Namespace (optional): <input type="text" data-field="namespace" placeholder="Leave empty to use pack namespace" /></label>
        <label>Block: <input type="text" data-field="block" placeholder="minecraft:brewing_stand or morevillagers:custom_block" /></label>
        <label>Tickets: <input type="number" data-field="tickets" value="1" min="1" /></label>
        <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
    `;
    }

    createTypeForm(id) {
        return `
        <h4>Villager Type</h4>
        <label>Name: <input type="text" data-field="name" placeholder="e.g., jungle_dweller" /></label>
        <label>Namespace (optional): <input type="text" data-field="namespace" placeholder="Leave empty to use pack namespace" /></label>
        <label>Texture: <input type="file" data-field="texture" accept="image/png" /></label>
        <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
    `;
    }

    createProfessionForm(id) {
        return `
        <h4>Profession</h4>
        <label>Name: <input type="text" data-field="name" placeholder="e.g., alchemist" /></label>
        <label>Namespace (optional): <input type="text" data-field="namespace" placeholder="Leave empty to use pack namespace" /></label>
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
            <label>Namespace (optional): <input type="text" data-field="namespace" placeholder="Leave empty to use pack namespace" /></label>
            
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
            <label>Namespace (optional): <input type="text" data-field="namespace" placeholder="Leave empty to use pack namespace" /></label>
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

    // To be implemented by version-specific classes
    async generatePack() {
        throw new Error('generatePack() must be implemented by subclass');
    }
}