'use strict';

(function () {
    const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

    const WORK_SOUNDS = [
        ['armorer', 'Armorer'], ['butcher', 'Butcher'], ['cartographer', 'Cartographer'], ['cleric', 'Cleric'],
        ['farmer', 'Farmer'], ['fisherman', 'Fisherman'], ['fletcher', 'Fletcher'], ['leatherworker', 'Leatherworker'],
        ['librarian', 'Librarian'], ['mason', 'Mason'], ['shepherd', 'Shepherd'], ['toolsmith', 'Toolsmith'], ['weaponsmith', 'Weaponsmith']
    ];

    const VANILLA_VILLAGES = [
        ['minecraft:village_plains', 'Plains village'],
        ['minecraft:village_desert', 'Desert village'],
        ['minecraft:village_savanna', 'Savanna village'],
        ['minecraft:village_snowy', 'Snowy village'],
        ['minecraft:village_taiga', 'Taiga village']
    ];

    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const field = (label, control) => `<label class="field"><span>${label}</span>${control}</label>`;

    const text = (name, placeholder, extra = '') =>
        `<input type="text" data-field="${name}" placeholder="${escape(placeholder)}" autocomplete="off" spellcheck="false" ${extra}>`;

    const number = (name, value, min, max) =>
        `<input type="number" data-field="${name}" value="${value}"${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''}>`;

    const json = (name, label, placeholder, rows = 8, kind = null) => `
        <div class="field json-field"${kind ? ` data-json-editor="${kind}"` : ''}>
            <span class="inline"><span class="label">${label}</span>
                ${kind ? `<label class="check manual-toggle"><input type="checkbox" data-manual="${name}"> Manual mode</label>` : ''}
                <button type="button" class="link manual-only" data-action="validate" data-target="${name}" style="font-size:12px">Validate</button></span>
            ${kind ? '<div class="json-editor"></div>' : ''}
            <textarea class="manual-only" data-field="${name}" rows="${rows}" placeholder="${escape(placeholder)}" spellcheck="false"></textarea>
            <span class="json-state manual-only" data-json-status="${name}" aria-live="polite"></span>
        </div>`;

    const texture = (name, title, note) =>
        `<label class="drop"><input type="file" accept="image/png" data-texture="${name}"><img alt="" data-preview="${name}"><span>${title}</span>${note ? `<small>${note}</small>` : ''}</label>`;

    const namespace = () => field('Namespace', text('namespace', 'Pack namespace'));

    const TYPES = {
        workstation: {
            data: 'workstations', title: 'name',
            render: () => `
                <div class="grid">${field('Name', text('name', 'purpur_altar'))}${namespace()}</div>
                <div class="tiles">
                    ${texture('textureFront', 'Front')}${texture('textureBack', 'Back')}${texture('textureLeft', 'Left')}
                    ${texture('textureRight', 'Right')}${texture('textureTop', 'Top')}${texture('textureBottom', 'Bottom')}
                </div>`
        },
        poi: {
            data: 'poiTypes', title: 'name',
            render: () => `
                <div class="grid">
                    ${field('Name', text('name', 'alchemist'))}${namespace()}
                    ${field('Block', text('block', 'minecraft:brewing_stand'))}${field('Tickets', number('tickets', 1, 1))}
                </div>`
        },
        type: {
            data: 'types', title: 'name',
            render: () => `
                <div class="grid">${field('Name', text('name', 'jungle_dweller'))}${namespace()}</div>
                <div class="tiles">
                    ${texture('texture', 'Adult')}${texture('zombieTexture', 'Zombie', 'Optional')}
                    ${texture('babyTexture', 'Baby', '26.3')}${texture('babyZombieTexture', 'Baby zombie', '26.3, optional')}
                </div>`
        },
        profession: {
            data: 'professions', title: 'name',
            render: () => `
                <div class="grid">
                    ${field('Name', text('name', 'alchemist'))}${namespace()}
                    ${field('POI type', text('poiType', 'alchemist'))}
                    ${field('Work sound', `<select data-field="workSound">${WORK_SOUNDS.map(([id, label]) => `<option value="minecraft:entity.villager.work_${id}">${label}</option>`).join('')}</select>`)}
                </div>
                <div class="tiles">${texture('texture', 'Overlay')}${texture('zombieTexture', 'Zombie overlay', 'Optional')}</div>`
        },
        trade: {
            data: 'trades', title: 'profession',
            render: () => `
                ${field('Profession', text('profession', 'alchemist or minecraft:farmer'))}
                ${json('tradesJson', 'Levels', '{\n  "levels": {\n    "1": { "trades": [ ... ] }\n  }\n}', 10, 'trades')}`
        },
        biomeTrade: {
            data: 'biomeTrades', title: 'profession',
            render: () => `
                ${field('Profession', text('profession', 'alchemist'))}
                ${json('biomeJson', 'Villager type overrides', '{\n  "biome_overrides": {\n    "minecraft:desert": { "levels": { ... } }\n  }\n}', 9, 'biome')}`
        },
        gift: {
            data: 'gifts', title: 'profession',
            render: () => `<div class="grid">${field('Profession', text('profession', 'alchemist'))}${field('Loot table', text('lootTable', 'gameplay/hero_of_the_village/alchemist_gift'))}</div>`
        },
        lootTable: {
            data: 'lootTables', title: 'name',
            render: () => `
                ${field('Name', text('name', 'alchemist_gift'))}
                ${json('lootJson', 'Loot table', '{\n  "type": "minecraft:gift",\n  "pools": [ ... ]\n}', 8, 'loot')}`
        },
        structureTag: {
            data: 'structureTags', title: 'tag',
            render: () => `
                <div class="grid">
                    ${field('Structure tag', text('tag', 'on_end_city_explorer_maps'))}${namespace()}
                    ${field('Decoration', text('mapDecoration', 'end_city_decoration'))}
                    ${field('Colour', `<span class="inline"><input type="color" value="#ac7bac" data-color-for="mapColor">${text('mapColor', '#ac7bac', 'value="#ac7bac"')}</span>`)}
                </div>
                <div class="tiles">${texture('decorationTexture', 'Icon', '8 × 8')}</div>
                ${json('structuresJson', 'Structures', '{\n  "replace": false,\n  "values": ["minecraft:end_city"]\n}', 5, 'structures')}`
        },
        biomeMapping: {
            data: 'biomeMappings', title: 'name', rows: 'mapping',
            render: () => `
                ${field('File name', text('name', 'badlands'))}
                <div class="subrows" data-rows></div>
                <div><button type="button" class="link" data-action="add-row" data-row="mapping">Add biome</button></div>`
        },
        villageType: {
            data: 'villageTypes', title: 'name',
            render: () => `
                <div class="grid">
                    ${field('Name', text('name', 'village_badlands'))}${namespace()}
                    ${field('Based on', `<select data-field="copyFrom">${VANILLA_VILLAGES.map(([id, label]) => `<option value="${id}"${id.endsWith('desert') ? ' selected' : ''}>${label}</option>`).join('')}<option value="custom">Other</option></select>`)}
                    ${field('Other village', text('copyFromCustom', 'mod:village_example'))}
                    ${field('Folder', text('folder', 'badlands'))}${field('Weight', number('weight', 1, 1))}
                </div>
                ${field('Biomes', '<textarea data-field="biomes" data-format="lines" rows="3" placeholder="#minecraft:is_badlands" spellcheck="false"></textarea>')}
                <label class="drop"><input type="file" webkitdirectory directory multiple data-override-folder><span>Replacement structures</span><small data-override-state>Folder, optional</small></label>`
        },
        villageStructure: {
            data: 'villageStructures', title: 'villageType', rows: 'house',
            render: () => `
                <div class="grid">
                    ${field('Village', text('villageType', 'minecraft:village_plains', 'list="village-options"'))}
                    ${field('Folder', text('folder', 'plains'))}${namespace()}
                </div>
                <label class="drop"><input type="file" accept=".nbt" multiple data-bulk-houses><span>Add structures</span><small>.nbt files</small></label>
                <div class="subrows" data-rows></div>
                <div><button type="button" class="link" data-action="add-row" data-row="house">Add house</button></div>`
        }
    };

    const ROWS = {
        mapping: (values = {}) => `
            ${field('Biome or tag', `<input type="text" data-row-field="biome" placeholder="#minecraft:is_badlands" value="${escape(values.biome)}" spellcheck="false">`)}
            ${field('Villager type', `<input type="text" data-row-field="villagerType" placeholder="badlands" value="${escape(values.villagerType)}" spellcheck="false">`)}
            ${field('Weight', `<input type="number" data-row-field="weight" min="1" value="${values.weight || 1}">`)}
            <label class="check" style="padding-bottom:9px"><input type="checkbox" data-row-field="replace"${values.replace ? ' checked' : ''}>Override</label>`,
        house: (values = {}) => `
            ${field('Name', `<input type="text" data-row-field="name" placeholder="house_1" value="${escape(values.name)}" spellcheck="false">`)}
            ${field('Pool', `<select data-row-field="kind"><option value="houses">Houses</option><option value="zombie_houses"${values.kind === 'zombie_houses' ? ' selected' : ''}>Abandoned</option></select>`)}
            ${field('Structure', '<input type="file" accept=".nbt" data-row-file>')}
            ${field('Or existing ID', `<input type="text" data-row-field="location" placeholder="mod:village/house" value="${escape(values.location)}" spellcheck="false">`)}
            ${field('Weight', `<input type="number" data-row-field="weight" min="1" max="150" value="${values.weight || 1}">`)}
            ${field('Processors', '<input type="text" data-row-field="processors" placeholder="Default" spellcheck="false">')}
            ${field('Placement', '<select data-row-field="elementType"><option value="legacy">Standard</option><option value="single">Clear terrain</option></select>')}
            ${field('Limit', '<input type="number" data-row-field="maxCount" min="0" placeholder="None">')}
            <span class="file-state" data-file-state>${values.fileName ? escape(values.fileName) : ''}</span>`
    };

    class VillagerPackGenerator {
        constructor(root) {
            this.root = root;
            this.counter = 0;
            this.textures = {};
            this.files = {};
                        this.packIcon = null;

            this.bindEvents();
            this.routeFromHash();
            this.refresh();
        }

        notify(message, type) {
            if (window.Site) window.Site.toast(message, type);
        }

        bindEvents() {
            document.addEventListener('click', (event) => {
                const add = event.target.closest('[data-add]');
                if (add) {
                    event.preventDefault();
                    this.addEntry(add.dataset.add);
                    return;
                }

                const action = event.target.closest('[data-action]');
                if (!action) return;

                const entry = action.closest('.entry');
                switch (action.dataset.action) {
                    case 'remove-entry': this.removeEntry(entry); break;
                    case 'add-row': this.addRow(entry, action.dataset.row); break;
                    case 'remove-row': this.removeRow(entry, action.closest('.subrow')); break;
                    case 'validate': this.validate(entry, action.dataset.target); break;
                    case 'generate': this.generate(); break;
                    case 'go': this.show(action.dataset.target); break;
                }
            });

            document.addEventListener('input', (event) => {
                const target = event.target;
                const entry = target.closest('.entry');

                if (target.matches('[data-color-for]') && entry) {
                    const input = entry.querySelector(`[data-field="${target.dataset.colorFor}"]`);
                    if (input) input.value = target.value;
                }
                if (target.matches('[data-field="mapColor"]') && entry && /^#[0-9a-f]{6}$/i.test(target.value)) {
                    const picker = entry.querySelector('[data-color-for="mapColor"]');
                    if (picker) picker.value = target.value;
                }
                if (entry && target.dataset.field === entry.dataset.titleField) {
                    entry.querySelector('.entry-title').textContent = target.value.trim();
                }
                if (target.id === 'pack-namespace') {
                    target.value = target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
                }
                if (target.id === 'pack-namespace' || target.id === 'pack-display-name') {
                    this.refresh();
                }
            });

            document.addEventListener('change', (event) => {
                const target = event.target;
                const entry = target.closest('.entry');

                if (target.id === 'pack-icon-upload') this.readPackIcon(target);
                else if (target.name === 'mc-version') { this.refresh(); if (window.JsonEditors) window.JsonEditors.refreshAll(); }
                else if (!entry) return;
                else if (target.matches('[data-texture]')) this.readTexture(entry, target);
                else if (target.matches('[data-row-file]')) this.readRowFile(entry, target);
                else if (target.matches('[data-bulk-houses]')) this.readBulkHouses(entry, target);
                else if (target.matches('[data-override-folder]')) this.readOverrideFolder(entry, target);
            });

            ['dragenter', 'dragover'].forEach(type => document.addEventListener(type, (event) => {
                const zone = event.target.closest && event.target.closest('.drop');
                if (zone) zone.classList.add('over');
            }));
            ['dragleave', 'drop'].forEach(type => document.addEventListener(type, (event) => {
                const zone = event.target.closest && event.target.closest('.drop');
                if (zone) zone.classList.remove('over');
            }));

            window.addEventListener('hashchange', () => this.routeFromHash(true));
        }

        routeFromHash(scroll = false) {
            const id = (window.location.hash || '').slice(1);
            const known = id && this.root.querySelector(`[data-panel="${id}"]`);
            this.show(known ? id : 'pack', false, scroll && known);
        }

        show(id, updateHash = true, scroll = updateHash) {
            const panel = this.root.querySelector(`[data-panel="${id}"]`);
            if (!panel) return;

            this.root.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('active', p === panel));
            document.querySelectorAll('[data-nav]').forEach(link => {
                const active = link.dataset.nav === id;
                link.classList.toggle('active', active);
                if (active) {
                    link.setAttribute('aria-current', 'page');
                    link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                } else {
                    link.removeAttribute('aria-current');
                }
            });

            if (updateHash && window.location.hash !== '#' + id) {
                history.replaceState(null, '', '#' + id);
            }

            if (scroll) window.scrollTo({ top: 0 });
        }

        addEntry(type) {
            const config = TYPES[type];
            const list = this.root.querySelector(`[data-list="${type}"]`);
            if (!config || !list) return null;

            this.counter++;
            const id = `entry-${this.counter}`;
            const entry = document.createElement('article');
            entry.className = 'entry card';
            entry.id = id;
            entry.dataset.type = type;
            entry.dataset.titleField = config.title;
            entry.innerHTML = `
                <header class="entry-head">
                    <strong class="entry-title"></strong>
                    <button type="button" class="link danger" data-action="remove-entry">Remove</button>
                </header>
                <div class="entry-body">${config.render()}</div>`;

            list.appendChild(entry);
            if (window.JsonEditors) window.JsonEditors.mount(entry);
            if (config.rows === 'mapping') this.addRow(entry, 'mapping');

            const first = entry.querySelector('input[type="text"], textarea');
            if (first) first.focus({ preventScroll: true });
            entry.scrollIntoView({ block: 'nearest' });

            this.refresh();
            return entry;
        }

        removeEntry(entry) {
            if (!entry) return;
            delete this.textures[entry.id];
            delete this.files[entry.id];
            entry.remove();
            this.refresh();
        }

        addRow(entry, kind, values) {
            const rows = entry && entry.querySelector('[data-rows]');
            if (!rows || !ROWS[kind]) return null;

            this.counter++;
            const row = document.createElement('div');
            row.className = 'subrow';
            row.id = `row-${this.counter}`;
            row.innerHTML = ROWS[kind](values) + '<button type="button" class="link danger" data-action="remove-row">Remove</button>';
            rows.appendChild(row);
            return row;
        }

        removeRow(entry, row) {
            if (!row) return;
            const store = this.files[entry.id];
            if (store) delete store.rows[row.id];
            row.remove();
        }

        store(entry) {
            if (!this.files[entry.id]) this.files[entry.id] = { overrides: {}, rows: {} };
            return this.files[entry.id];
        }

        readBytes(file) {
            return file.arrayBuffer().then(buffer => new Uint8Array(buffer));
        }

        readDataUrl(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });
        }

        readPackIcon(input) {
            const file = input.files[0];
            if (!file) return;
            this.readDataUrl(file).then(url => {
                this.packIcon = url;
                const zone = input.closest('.drop');
                zone.classList.add('filled');
                zone.querySelector('img').src = url;
            });
        }

        readTexture(entry, input) {
            const file = input.files[0];
            if (!file) return;
            if (file.type !== 'image/png') {
                this.notify('Textures must be PNG files', 'error');
                input.value = '';
                return;
            }
            this.readDataUrl(file).then(url => {
                if (!this.textures[entry.id]) this.textures[entry.id] = {};
                this.textures[entry.id][input.dataset.texture] = url;
                const zone = input.closest('.drop');
                zone.classList.add('filled');
                zone.querySelector('img').src = url;
            });
        }

        readRowFile(entry, input) {
            const file = input.files[0];
            const row = input.closest('.subrow');
            if (!file || !row) return;
            this.readBytes(file).then(bytes => {
                this.store(entry).rows[row.id] = { name: file.name, data: bytes };
                const name = row.querySelector('[data-row-field="name"]');
                if (name && !name.value) name.value = file.name.replace(/\.nbt$/i, '');
                row.querySelector('[data-file-state]').textContent = file.name;
            });
        }

        readBulkHouses(entry, input) {
            const files = Array.from(input.files || []).filter(file => /\.nbt$/i.test(file.name));
            files.forEach(file => {
                const row = this.addRow(entry, 'house', { name: file.name.replace(/\.nbt$/i, ''), fileName: file.name });
                this.readBytes(file).then(bytes => { this.store(entry).rows[row.id] = { name: file.name, data: bytes }; });
            });
            if (files.length) this.notify(`${files.length} ${files.length === 1 ? 'house' : 'houses'} added`);
            input.value = '';
        }

        readOverrideFolder(entry, input) {
            const files = Array.from(input.files || []).filter(file => /\.nbt$/i.test(file.name));
            const store = this.store(entry);
            store.overrides = {};

            Promise.all(files.map(file => {
                const parts = (file.webkitRelativePath || file.name).split('/');
                const relative = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
                return this.readBytes(file).then(bytes => { store.overrides[relative] = bytes; });
            })).then(() => {
                const state = entry.querySelector('[data-override-state]');
                const zone = input.closest('.drop');
                zone.classList.toggle('filled', files.length > 0);
                state.textContent = files.length
                    ? `${files.length} ${files.length === 1 ? 'structure' : 'structures'}`
                    : 'No .nbt files found';
            });
        }

        validate(entry, fieldName) {
            const area = entry.querySelector(`[data-field="${fieldName}"]`);
            const status = entry.querySelector(`[data-json-status="${fieldName}"]`);
            try {
                JSON.parse(area.value);
                status.textContent = 'Valid';
                status.className = 'json-state ok';
            } catch (error) {
                status.textContent = error.message;
                status.className = 'json-state error';
            }
        }

        version() {
            const checked = document.querySelector('input[name="mc-version"]:checked');
            return VillagerPackVersions[checked ? checked.value : '26.3'];
        }

        metadata() {
            const value = (id) => (document.getElementById(id)?.value || '').trim();
            return {
                namespace: value('pack-namespace').toLowerCase().replace(/[^a-z0-9_.-]/g, ''),
                displayName: value('pack-display-name'),
                description: value('pack-description'),
                version: value('pack-version') || '1.0.0',
                author: value('pack-author'),
                creativeTabIcon: value('pack-creative-icon') || 'minecraft:emerald'
            };
        }

        refresh() {
            let total = 0;
            Object.keys(TYPES).forEach(type => {
                const count = this.root.querySelectorAll(`[data-list="${type}"] > .entry`).length;
                total += count;
                document.querySelectorAll(`[data-count="${type}"]`).forEach(badge => {
                    badge.textContent = count > 0 ? count : '';
                });
                document.querySelectorAll(`[data-overview="${type}"]`).forEach(el => { el.textContent = count; });
            });

            const meta = this.metadata();
            document.querySelectorAll('[data-pack-total]').forEach(el => { el.textContent = total; });
            document.querySelectorAll('[data-docs]').forEach(link => { link.href = this.version().docs + (link.dataset.docs || ''); });
        }

        collect(type, errors) {
            return Array.from(this.root.querySelectorAll(`[data-list="${type}"] > .entry`)).map((entry, index) => {
                const item = {};

                entry.querySelectorAll('[data-field]').forEach(input => {
                    const key = input.dataset.field;
                    if (input.tagName === 'TEXTAREA' && input.dataset.format === 'lines') {
                        item[key] = input.value.split('\n').map(line => line.trim()).filter(Boolean);
                    } else if (input.tagName === 'TEXTAREA') {
                        const value = input.value.trim();
                        if (!value) return;
                        try {
                            item[key] = JSON.parse(value);
                        } catch (error) {
                            errors.push(`${TYPES[type].label || type} ${index + 1}: ${error.message}`);
                        }
                    } else if (input.type === 'number') {
                        item[key] = input.value === '' ? null : parseInt(input.value, 10);
                    } else {
                        item[key] = input.value.trim();
                    }
                });

                const store = this.files[entry.id] || { overrides: {}, rows: {} };
                item._textures = { ...(this.textures[entry.id] || {}) };
                item._overrides = { ...store.overrides };
                item._rows = Array.from(entry.querySelectorAll('[data-rows] > .subrow')).map(row => {
                    const values = { _file: store.rows[row.id] || null };
                    row.querySelectorAll('[data-row-field]').forEach(input => {
                        const key = input.dataset.rowField;
                        if (input.type === 'checkbox') values[key] = input.checked;
                        else if (input.type === 'number') values[key] = input.value === '' ? null : parseInt(input.value, 10);
                        else values[key] = input.value.trim();
                    });
                    return values;
                });
                if (item.tickets === null) item.tickets = 1;
                return item;
            });
        }

        loadZip() {
            if (window.JSZip) return Promise.resolve(window.JSZip);
            if (this.zipPromise) return this.zipPromise;
            this.zipPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = JSZIP_URL;
                script.async = true;
                script.onload = () => resolve(window.JSZip);
                script.onerror = () => {
                    this.zipPromise = null;
                    reject(new Error('Could not load the packaging library. Check your connection and try again.'));
                };
                document.head.appendChild(script);
            });
            return this.zipPromise;
        }

        report(kind, title, lines) {
            const report = document.getElementById('export-report');
            if (!report) return;
            report.className = `report card ${kind}`;
            report.hidden = false;
            report.innerHTML = `<h3>${escape(title)}</h3>` + (lines.length ? `<ul>${lines.map(line => `<li>${escape(line)}</li>`).join('')}</ul>` : '');
        }

        async generate() {
            const meta = this.metadata();
            const options = this.version();
            const buttons = document.querySelectorAll('[data-action="generate"]');

            if (!meta.namespace) {
                this.notify('Enter a namespace', 'error');
                this.show('pack');
                document.getElementById('pack-namespace')?.focus();
                return;
            }

            const errors = [];
            const data = {};
            Object.entries(TYPES).forEach(([type, config]) => { data[config.data] = this.collect(type, errors); });

            if (errors.length) {
                this.report('error', 'Fix these issues', errors);
                this.show('export');
                this.notify('The pack has errors', 'error');
                return;
            }

            buttons.forEach(button => { button.disabled = true; });
            try {
                const JSZip = await this.loadZip();
                const builder = new VillagerPackBuilder(new JSZip(), meta, data, this.packIcon, options);
                builder.build();

                const blob = await builder.zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${meta.namespace}_${options.id}.zip`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 2000);

                this.report('success', builder.warnings.length ? 'Downloaded, with notes' : 'Downloaded', builder.warnings);
                if (builder.warnings.length) this.show('export');
                this.notify(`${meta.namespace}_${options.id}.zip downloaded`);
            } catch (error) {
                console.error(error);
                this.report('error', 'Export failed', [error.message]);
                this.notify('Export failed', 'error');
            } finally {
                buttons.forEach(button => { button.disabled = false; });
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const root = document.querySelector('[data-generator]');
        if (root) window.villagerGen = new VillagerPackGenerator(root);
    });
})();
