class VillagerPackGeneratorBase {
    static versions = {};

    static registerVersion(id, options) {
        VillagerPackGeneratorBase.versions[id] = options;
    }

    constructor() {
        this.componentCounter = 0;
        this.componentTextures = {};
        this.packIcon = null;
        this.setupEventListeners();
    }

    setupEventListeners() {
        const namespaceInput = document.getElementById('pack-namespace');
        namespaceInput?.addEventListener('input', (e) => {
            e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
        });

        document.getElementById('pack-icon-upload')?.addEventListener('change', (e) => this.handlePackIconUpload(e));

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
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.packIcon = e.target.result;
            const preview = document.getElementById('pack-icon-preview');
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    }

    addComponent(type) {
        const container = document.getElementById(`${type}-list`);
        if (!container) return;

        this.componentCounter++;
        const id = `${type}-${this.componentCounter}`;
        const componentDiv = document.createElement('div');
        componentDiv.className = 'component-item';
        componentDiv.id = id;

        const forms = {
            poi: () => this.createPOIForm(id),
            type: () => this.createTypeForm(id),
            profession: () => this.createProfessionForm(id),
            trade: () => this.createTradeForm(id),
            biomeTrade: () => this.createBiomeTradeForm(id),
            gift: () => this.createGiftForm(id),
            biomeMapping: () => this.createBiomeMappingForm(id),
            lootTable: () => this.createLootTableForm(id),
            workstation: () => this.createWorkstationForm(id),
            structureTag: () => this.createStructureTagForm(id)
        };

        if (!forms[type]) return;
        componentDiv.innerHTML = forms[type]();
        container.appendChild(componentDiv);
        this.attachComponentListeners(id, type);
    }

    textureUpload(field, label) {
        return `
            <div class="texture-upload-item">
                <label>${label}: <input type="file" data-field="${field}" accept="image/png" /></label>
                <img class="texture-preview" data-preview="${field}" style="display:none;">
            </div>
        `;
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
            <div class="texture-upload-grid">
                ${this.textureUpload('texture', 'Villager Texture')}
                ${this.textureUpload('zombieTexture', 'Zombie Villager Texture (optional, uses villager texture if empty)')}
                ${this.textureUpload('babyTexture', 'Baby Villager Texture (26.1 and newer)')}
                ${this.textureUpload('babyZombieTexture', 'Baby Zombie Villager Texture (26.1 and newer, optional, uses baby texture if empty)')}
            </div>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
        `;
    }

    createProfessionForm(id) {
        return `
            <h4>Profession</h4>
            <label>Name: <input type="text" data-field="name" placeholder="e.g., alchemist" /></label>
            <label>Namespace (optional): <input type="text" data-field="namespace" placeholder="Leave empty to use pack namespace" /></label>
            <label>POI Type: <input type="text" data-field="poiType" placeholder="alchemist (the POI type's name)" /></label>
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
            <div class="texture-upload-grid">
                ${this.textureUpload('texture', 'Villager Texture')}
                ${this.textureUpload('zombieTexture', 'Zombie Villager Texture (optional, uses villager texture if empty)')}
            </div>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
        `;
    }

    createTradeForm(id) {
        return `
            <h4>Trade Definition</h4>
            <label>Profession: <input type="text" data-field="profession" placeholder="alchemist, or minecraft:farmer to change another villager's trades" /></label>
            <label>Trades JSON: <textarea data-field="tradesJson" rows="10" placeholder='{"levels": {"1": {"trades": [ ... ]}, "2": {"trades": [ ... ]}}}'></textarea></label>
            <button class="validate-btn" onclick="villagerGen.validateJSON('${id}', 'tradesJson')">Validate JSON</button>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
            <div class="validation-result"></div>
        `;
    }

    createBiomeTradeForm(id) {
        return `
            <h4>Biome-Specific Trade</h4>
            <label>Profession: <input type="text" data-field="profession" placeholder="alchemist, or minecraft:farmer" /></label>
            <label>Biome Overrides JSON: <textarea data-field="biomeJson" rows="10" placeholder='{"biome_overrides": {"minecraft:desert": {"levels": {"1": {"trades": [ ... ]}}}}}'></textarea></label>
            <button class="validate-btn" onclick="villagerGen.validateJSON('${id}', 'biomeJson')">Validate JSON</button>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
            <div class="validation-result"></div>
        `;
    }

    createGiftForm(id) {
        return `
            <h4>Hero Gift</h4>
            <label>Profession: <input type="text" data-field="profession" placeholder="alchemist, or minecraft:farmer" /></label>
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
                ${this.textureUpload('textureFront', 'Front Texture')}
                ${this.textureUpload('textureBack', 'Back Texture')}
                ${this.textureUpload('textureLeft', 'Left Texture')}
                ${this.textureUpload('textureRight', 'Right Texture')}
                ${this.textureUpload('textureTop', 'Top Texture')}
                ${this.textureUpload('textureBottom', 'Bottom Texture')}
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

            <div class="texture-upload-grid">
                ${this.textureUpload('decorationTexture', 'Map Decoration Texture (8x8)')}
            </div>

            <label>Structure Tags JSON: <textarea data-field="structuresJson" rows="6" placeholder='{"replace": false, "values": ["minecraft:end_city"]}'></textarea></label>
            <button class="validate-btn" onclick="villagerGen.validateJSON('${id}', 'structuresJson')">Validate JSON</button>
            <button onclick="villagerGen.removeComponent('${id}')">Remove</button>
            <div class="validation-result"></div>
        `;
    }

    attachComponentListeners(id, type) {
        const component = document.getElementById(id);
        if (!component) return;

        component.querySelectorAll('input[type="file"]').forEach(input => {
            input.addEventListener('change', (e) => this.handleTextureUpload(e, id));
        });

        if (type === 'structureTag') {
            const colorPicker = component.querySelector('[data-field="mapColorPicker"]');
            const colorInput = component.querySelector('[data-field="mapColor"]');

            if (colorPicker && colorInput) {
                colorPicker.addEventListener('input', (e) => {
                    colorInput.value = e.target.value;
                });
                colorInput.addEventListener('input', (e) => {
                    if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                        colorPicker.value = e.target.value;
                    }
                });
            }
        }
    }

    handleTextureUpload(event, id) {
        const file = event.target.files[0];
        const field = event.target.dataset.field;
        if (!file || !field) return;

        if (file.type !== 'image/png') {
            alert('Textures must be PNG files.');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            if (!this.componentTextures[id]) {
                this.componentTextures[id] = {};
            }
            this.componentTextures[id][field] = e.target.result;

            const item = event.target.closest('.texture-upload-item');
            const preview = item ? item.querySelector('.texture-preview') : null;
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    }

    validateJSON(componentId, fieldName) {
        const component = document.getElementById(componentId);
        if (!component) return false;

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
        delete this.componentTextures[id];
    }

    collectComponentData(type, errors) {
        const container = document.getElementById(`${type}-list`);
        if (!container) return [];

        const data = [];

        container.querySelectorAll('.component-item').forEach((component, index) => {
            const item = {};
            const inputs = component.querySelectorAll('input:not([type="file"]):not([type="color"]), select, textarea');

            inputs.forEach(input => {
                const field = input.dataset.field;
                if (!field) return;

                if (input.type === 'number') {
                    item[field] = parseInt(input.value, 10) || 1;
                } else if (input.tagName === 'TEXTAREA') {
                    const text = input.value.trim();
                    if (!text) return;
                    try {
                        item[field] = JSON.parse(text);
                    } catch (e) {
                        const title = component.querySelector('h4')?.textContent || type;
                        errors.push(`${title} #${index + 1}: invalid JSON in the text box (${e.message})`);
                    }
                } else {
                    item[field] = input.value.trim();
                }
            });

            item._textures = { ...(this.componentTextures[component.id] || {}) };
            data.push(item);
        });

        return data;
    }

    getMetadata() {
        const value = (id) => document.getElementById(id)?.value?.trim() || '';
        return {
            namespace: value('pack-namespace').toLowerCase().replace(/[^a-z0-9_.-]/g, ''),
            displayName: value('pack-display-name'),
            description: value('pack-description'),
            version: value('pack-version') || '1.0.0',
            author: value('pack-author'),
            creativeTabIcon: value('pack-creative-icon') || 'minecraft:emerald'
        };
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

    async generatePack() {
        const version = document.getElementById('minecraft-version')?.value;
        const options = VillagerPackGeneratorBase.versions[version];
        if (!options) {
            alert(`No generator is available for Minecraft ${version}.`);
            return;
        }

        const metadata = this.getMetadata();
        if (!metadata.namespace) {
            alert('Pack namespace is required!');
            return;
        }

        const errors = [];
        const data = {
            poiTypes: this.collectComponentData('poi', errors),
            types: this.collectComponentData('type', errors),
            professions: this.collectComponentData('profession', errors),
            trades: this.collectComponentData('trade', errors),
            biomeTrades: this.collectComponentData('biomeTrade', errors),
            gifts: this.collectComponentData('gift', errors),
            biomeMappings: this.collectComponentData('biomeMapping', errors),
            lootTables: this.collectComponentData('lootTable', errors),
            workstations: this.collectComponentData('workstation', errors),
            structureTags: this.collectComponentData('structureTag', errors)
        };

        if (errors.length > 0) {
            alert('Please fix these problems before generating:\n\n' + errors.join('\n'));
            return;
        }

        try {
            const builder = new VillagerPackBuilder(new JSZip(), metadata, data, this.packIcon, options);
            builder.build();

            const content = await builder.zip.generateAsync({ type: 'blob' });
            this.downloadBlob(content, `${metadata.namespace}_${version}.zip`);

            let message = `Pack generated successfully for ${options.label}!`;
            if (builder.warnings.length > 0) {
                message += '\n\nThings to check:\n- ' + builder.warnings.join('\n- ');
            }
            alert(message);
        } catch (error) {
            alert(`Error generating pack: ${error.message}`);
            console.error(error);
        }
    }
}

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

        this.json('pack.mcmeta', this.options.packMcmeta(meta.description || 'A custom villager pack'));

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
                this.warnings.push(`Villager type '${name}' has no texture.`);
            }

            if (this.options.babyTextures) {
                this.writeEntityTexture(`${base}/villager/baby/${name}`, textures.babyTexture, hat);
                this.writeEntityTexture(`${base}/zombie_villager/baby/${name}`, textures.babyZombieTexture || textures.babyTexture, hat);

                if (!textures.babyTexture) {
                    this.warnings.push(`Villager type '${name}' has no baby texture. Baby villagers of this type will show a missing texture.`);
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
                this.warnings.push(`Profession '${name}' has no texture.`);
            }

            if (!this.data.poiTypes.some(poi => this.name(poi.name) === this.name(poiType))) {
                this.warnings.push(`Profession '${name}' uses POI type '${poiType}', which isn't defined in this pack. That's fine if another pack defines it.`);
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

            Object.entries(faceFields).forEach(([face, field]) => {
                if (this.image(`assets/${wsNamespace}/textures/block/${name}_${face}.png`, textures[field])) {
                    uploaded.add(face);
                }
            });

            if (uploaded.size === 0) {
                this.warnings.push(`Workstation '${name}' has no textures.`);
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
                this.warnings.push(`Structure tag '${tagId.path}' has no structures listed. Maps using it won't find anything and the world may fail to load.`);
            }

            const decorationTexture = tag._textures?.decorationTexture;
            if (decorationTexture) {
                this.image(`assets/${decorationId.namespace}/textures/map/decorations/${decorationId.path}.png`, decorationTexture);
            } else if (decorationId.namespace !== 'minecraft') {
                this.warnings.push(`Map decoration '${decorationId.path}' has no texture.`);
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
                this.warnings.push(`Trades for '${professionId}' are empty and were skipped.`);
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
        const neoforgeBiomes = {};

        this.data.biomeMappings.forEach(mapping => {
            const name = this.name(mapping.name);
            if (!name || !mapping.biomesJson) return;

            const source = mapping.biomesJson.biomes || mapping.biomesJson;
            const biomes = {};

            Object.entries(source).forEach(([biome, villagerType]) => {
                if (typeof villagerType !== 'string') return;
                const typeId = this.id(villagerType);
                biomes[this.id(biome, 'minecraft')] = typeId;
                neoforgeBiomes[this.id(biome, 'minecraft')] = { villager_type: typeId };
            });

            this.json(`villagers/biome_mappings/${name}.json`, { biomes });
        });

        if (this.options.neoforgeBiomeDataMap && Object.keys(neoforgeBiomes).length > 0) {
            this.json('data/neoforge/data_maps/worldgen/biome/villager_types.json', { values: neoforgeBiomes });
        }
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
