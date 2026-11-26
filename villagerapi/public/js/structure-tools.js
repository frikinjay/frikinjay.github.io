import { readStructure, scan, structureView, applyMapping, readMapping, parseSnbt, plain, TAG, BLOCK_ID, MAPPING_FILE } from './structure-core.js';
import { renderIcon, iconElement, fetchJson, assetUrl, splitId, configure } from './mc-assets.js';

const PRESETS = [
    { id: 'vanilla_desert_village_to_badlands', label: 'Vanilla Desert Village to Badlands' },
    { id: 'morevillagers_desert_houses_to_badlands', label: 'More Villagers Desert Houses to Badlands' }
];
const BIOME_GUESS = [[/badlands|mesa/, 'badlands'], [/desert|pyramid/, 'desert'], [/savanna/, 'savanna'], [/snowy|snow|ice|igloo/, 'snowy_plains'],
    [/taiga|spruce/, 'taiga'], [/jungle|bamboo/, 'jungle'], [/mangrove/, 'mangrove_swamp'], [/swamp|witch_hut/, 'swamp'], [/cherry/, 'cherry_grove'],
    [/woodland_mansion|dark_forest/, 'dark_forest'], [/ocean|shipwreck|underwater/, 'ocean'], [/bastion|nether|fortress|ruined_portal\/nether/, 'nether_wastes'],
    [/end_city|end_/, 'the_end'], [/ancient_city|deep_dark/, 'deep_dark'], [/trail_ruins/, 'old_growth_spruce_taiga']];
const FALLBACK_TINTS = { grass: 0x91bd59, foliage: 0x77ab2f, dry: 0x7b5334, water: 0x3f76e4 };
const MCMETA = 'https://cdn.jsdelivr.net/gh/misode/mcmeta@';
const ZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

const root = document.querySelector('[data-structure-tools]');
const panel = root && root.closest('[data-panel]');

const state = {
    files: [],
    mapping: { replace_jigsaw_final_states: true, rename_files: {}, blocks: {}, used_in_files: {} },
    props: new Map(),
    keys: new Map(),
    current: null,
    viewer: null,
    viewerModule: null,
    mode: 'swapped',
    biome: 'auto',
    custom: null,
    biomes: new Map(),
    blockInfo: new Map(),
    lighting: 'day',
    smooth: true,
    jigsaws: false,
    grid: true,
    palette: 0,
    selected: null,
    filter: '',
    blockFilter: '',
    blockScope: 'all',
    nextId: 1,
    registered: new Set(),
    openData: new Set(),
    folders: new Map(),
    mounted: false
};

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = name => root.querySelector(`[data-st="${name}"]`);
const toast = (message, type) => (window.Site && window.Site.toast ? window.Site.toast(message, type) : console.log(message));
const plural = (count, word) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
const version = () => (window.currentVillagerPackVersion ? window.currentVillagerPackVersion() : { registries: '26.3', assets: '26.3' });

function debounce(fn, wait) {
    let timer = 0;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}

function loadZipLib() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = ZIP_URL;
        script.onload = () => resolve(window.JSZip);
        script.onerror = () => reject(new Error('Could not load the zip library'));
        document.head.appendChild(script);
    });
}

function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function markup() {
    return `
    <div class="card st-sources">
      <label class="drop st-drop" data-st="drop">
        <input type="file" multiple data-st="files">
        <span>Add Structures</span>
        <small class="st-mouse-only">Drop .nbt files, a folder, or a .zip or .jar to pick structures from</small>
        <small class="st-touch-only">Tap to choose .nbt files, or a .zip or .jar to pick structures from</small>
      </label>
      <div class="st-source-row">
        <label class="button small secondary st-folder">Add Folder<input type="file" webkitdirectory multiple hidden data-st="folder"></label>
        <label class="field st-vanilla"><span>Vanilla Structures</span><select data-st="vanilla"><option value="">Choose a Folder</option></select></label>
      </div>
    </div>

    <div class="st-work">
      <aside class="card st-files">
        <div class="st-files-head">
          <input type="search" placeholder="Search Structures" aria-label="Search structures" data-st="search">
        </div>
        <div class="st-tree" data-st="tree" role="tree" aria-label="Structures"></div>
        <div class="st-files-foot"><span data-st="count">No Structures Yet</span><button type="button" class="link danger" data-st="clear" hidden>Clear All</button></div>
      </aside>

      <div class="st-stage">
        <div class="st-toolbar">
          <div class="segmented st-mode" role="radiogroup" aria-label="Preview">
            <input type="radio" name="st-mode" id="st-mode-original" value="original"><label for="st-mode-original">Original</label>
            <input type="radio" name="st-mode" id="st-mode-swapped" value="swapped" checked><label for="st-mode-swapped">Swapped</label>
          </div>
          <div class="st-inline st-biome">
            <label class="st-inline"><span>Biome Tint</span><select data-st="biome"><option value="auto">Auto</option></select></label>
            <span class="st-swatches" role="group" aria-label="Tint colors">
              <label class="st-swatch" data-tip='"Grass"'><input type="color" data-tint="grass" aria-label="Grass color"></label>
              <label class="st-swatch" data-tip='"Leaves"'><input type="color" data-tint="foliage" aria-label="Leaf color"></label>
              <label class="st-swatch" data-tip='"Water"'><input type="color" data-tint="water" aria-label="Water color"></label>
            </span>
          </div>
          <label class="st-inline"><span>Light</span><select data-st="lighting">
            <option value="off">Full Bright</option><option value="day" selected>Day</option><option value="night">Night</option>
          </select></label>
          <label class="st-inline" data-st="palette-field" hidden><span>Palette</span><select data-st="palette"></select></label>
          <label class="check"><input type="checkbox" data-st="smooth" checked> Smooth Lighting</label>
          <label class="check"><input type="checkbox" data-st="jigsaws"> Jigsaw Blocks</label>
          <label class="check"><input type="checkbox" data-st="grid" checked> Grid</label>
        </div>
        <div class="sv-viewport" data-st="viewport">
          <div class="sv-tools">
            <button type="button" class="sv-tool" data-st="frame" data-tip='"Frame Structure (Home)"' aria-label="Frame structure">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
            <button type="button" class="sv-tool sv-text" data-st="ortho" data-tip='"Perspective or Orthographic (5)"' aria-label="Switch perspective">Persp</button>
            <button type="button" class="sv-tool" data-st="shot" data-tip='"Save Screenshot"' aria-label="Save screenshot">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5h3l1.5-2h3L11 5h3v8H2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
            <button type="button" class="sv-tool" data-st="full" data-tip='"Expand"' aria-label="Expand preview" aria-pressed="false">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4M5 5l2 2M11 5l-2 2M11 11l-2-2M5 11l2-2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
            <button type="button" class="sv-tool sv-text" data-st="help-toggle" aria-expanded="false" aria-label="Controls">?</button>
          </div>
          <div class="sv-help" data-st="help" hidden>
            <strong>Controls</strong>
            <dl class="st-touch-only">
              <dt>Rotate</dt><dd>Drag</dd>
              <dt>Zoom</dt><dd>Pinch</dd>
              <dt>Pan</dt><dd>Two-Finger Drag</dd>
              <dt>Select Block</dt><dd>Tap</dd>
              <dt>Orbit Here</dt><dd>Double Tap a Block</dd>
              <dt>Reset View</dt><dd>Double Tap Empty Space</dd>
              <dt>Views</dt><dd>Tap the Compass</dd>
            </dl>
            <dl class="st-mouse-only">
              <dt>Rotate</dt><dd>Left or Middle Drag</dd>
              <dt>Pan</dt><dd>Right Drag, Shift+Drag</dd>
              <dt>Zoom</dt><dd>Scroll, Ctrl+Middle Drag</dd>
              <dt>Orbit Here</dt><dd>Double Click a Block</dd>
              <dt>Reset View</dt><dd>Double Click Empty Space, Home</dd>
              <dt>Views</dt><dd>1 Front, 3 Right, 7 Top</dd>
              <dt>Opposite Side</dt><dd>9</dd>
              <dt>Orthographic</dt><dd>5</dd>
              <dt>Select Block</dt><dd>Click</dd>
              <dt>Views</dt><dd>Click the Compass</dd>
            </dl>
          </div>
          <div class="sv-empty" data-st="empty">
            <strong>Nothing to Preview Yet</strong>
            <span>Add structures above, or pick a vanilla folder like village/plains/houses.</span>
          </div>
          <div class="sv-loading" data-st="loading" hidden>LOADING...</div>
          <div class="sv-pick" data-st="pick" hidden>
            <div class="sv-pick-head">
              <span class="slot slot-small st-icon" data-pick-icon></span>
              <div class="sv-pick-name"><code data-pick-name></code><small data-pick-where></small></div>
              <button type="button" class="sv-pick-close" data-st="pick-close" aria-label="Clear selection">\u00d7</button>
            </div>
            <label class="field"><span>Replace With</span><input type="text" data-pick-input data-field="block" list="reg-block" spellcheck="false" autocomplete="off"></label>
            <small class="st-warning" data-pick-warning></small>
            <div class="st-data" data-pick-data hidden>
              <label class="field"><span>Block Data (SNBT)</span><textarea data-pick-nbt rows="2" spellcheck="false" autocomplete="off" placeholder="{LootTable:&quot;minecraft:chests/village/village_desert_house&quot;}"></textarea></label>
              <small class="st-warning" data-pick-nbt-warning></small>
            </div>
            <div class="sv-pick-foot"><button type="button" class="link" data-st="pick-find">Find in List</button><button type="button" class="link" data-st="pick-data" aria-expanded="false">Block Data</button><button type="button" class="link" data-st="pick-keep" hidden>Keep Original</button></div>
          </div>
        </div>
        <div class="st-status" data-st="status" aria-live="polite"></div>
      </div>
    </div>

    <section class="st-section">
      <div class="st-section-head">
        <div><h3>Blocks</h3><p>Every block the included structures use. Type a new block to swap it in all of them, or click a block in the preview to swap it right there. Block Data adds NBT, like a loot table or banner patterns, to every copy of that block.</p></div>
        <div class="st-filters">
          <input type="search" placeholder="Search Blocks" aria-label="Search blocks" data-st="block-search">
          <select data-st="block-scope" aria-label="Which blocks to show">
            <option value="all">All Blocks</option><option value="preview">In This Structure</option><option value="swapped">Swapped Only</option>
          </select>
        </div>
      </div>
      <div class="card st-blocks" data-st="blocks"><p class="st-none">Add structures to see their blocks.</p></div>
    </section>

    <div class="st-options">
      <div class="card card-body st-option">
        <h3>Jigsaw Blocks</h3>
        <label class="check"><input type="checkbox" data-st="final-states" checked> Swap What Jigsaw Blocks Turn Into</label>
        <p>Jigsaw blocks become another block once the structure generates, like the path under village streets. Leave this on unless you have a reason not to.</p>
      </div>
      <div class="card card-body st-option">
        <h3>Rename Files</h3>
        <div class="st-renames" data-st="renames"></div>
        <button type="button" class="link" data-st="add-rename">Add Rename</button>
        <p>For example <code>desert_</code> to <code>badlands_</code>. Leave this empty for VillagerAPI <code>village_types</code> overrides, which must keep the original names.</p>
      </div>
      <div class="card card-body st-option">
        <h3>Mappings</h3>
        <label class="field"><span>Preset</span><select data-st="preset"><option value="">Choose a Preset</option>${PRESETS.map(p => `<option value="${p.id}">${escape(p.label)}</option>`).join('')}</select></label>
        <div class="st-buttons">
          <label class="button small secondary">Import Mapping<input type="file" accept=".json,application/json" hidden data-st="import"></label>
          <button type="button" class="button small secondary" data-st="export-mapping">Export Mapping</button>
          <button type="button" class="link danger" data-st="reset-mapping">Reset Swaps</button>
        </div>
        <p>Mappings use the same <code>${MAPPING_FILE}</code> format as the <a href="./tools/README.md">command line scripts</a>.</p>
      </div>
    </div>

    <div class="st-export">
      <button type="button" class="button" data-st="download" disabled>Download Swapped Structures</button>
      <span data-st="export-note">Add structures to download swapped copies.</span>
    </div>
    <div class="report card" data-st="report" hidden aria-live="polite"></div>`;
}

function mount() {
    if (state.mounted) return;
    state.mounted = true;
    root.innerHTML = markup();
    root.classList.add('ready');
    if (typeof DecompressionStream === 'undefined') {
        const note = document.createElement('p');
        note.className = 'st-old';
        note.textContent = 'This browser is too old to read structure files. Update it to use Structure Tools.';
        root.prepend(note);
    }
    bind();
    loadBiomes();
    renderRenames();
    loadVanillaList();
    renderFiles();
}

async function ensureViewer() {
    if (state.viewer) return state.viewer;
    if (!state.viewerModule) state.viewerModule = import('./structure-viewer.js');
    const { StructureViewer } = await state.viewerModule;
    if (state.viewer) return state.viewer;
    const viewport = $('viewport');
    const tip = document.createElement('div');
    tip.className = 'mc-tooltip sv-tip';
    tip.setAttribute('aria-hidden', 'true');
    viewport.appendChild(tip);
    state.tip = tip;
    state.viewer = new StructureViewer(viewport, {
        onPick: instance => pickBlock(instance),
        onHover: (instance, x, y) => hoverBlock(instance, x, y),
        onOrtho: ortho => { $('ortho').textContent = ortho ? 'Ortho' : 'Persp'; }
    });
    await state.viewer.ready;
    state.viewer.setOptions({ grid: state.grid });
    state.viewer.setVisible(panel.classList.contains('active'));
    return state.viewer;
}

function hoverBlock(instance, x, y) {
    const tip = state.tip;
    if (!tip) return;
    if (!instance) { tip.classList.remove('visible'); return; }
    const lines = [`<div class="mc-tooltip-title" style="color:#fff;text-shadow:2px 2px 0 #3f3f3f">${escape(instance.shown)}</div>`];
    if (instance.shown !== instance.original) lines.push(`<div style="color:#aaa;text-shadow:2px 2px 0 #2a2a2a">Was ${escape(instance.original)}</div>`);
    lines.push(`<div style="color:#555;text-shadow:2px 2px 0 #151515">${instance.x}, ${instance.y}, ${instance.z}</div>`);
    tip.innerHTML = lines.join('');
    const rect = $('viewport').getBoundingClientRect();
    tip.classList.add('visible');
    const width = tip.offsetWidth, height = tip.offsetHeight;
    let left = rect.left + x + 14, top = rect.top + y - height - 10;
    if (left + width > window.innerWidth - 8) left = rect.left + x - width - 14;
    if (top < 8) top = rect.top + y + 18;
    tip.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
}

function expand(on) {
    const viewport = $('viewport');
    if (!viewport || viewport.classList.contains('sv-max') === on) return;
    viewport.classList.toggle('sv-max', on);
    document.documentElement.classList.toggle('st-locked', on);
    const button = $('full');
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Close expanded preview' : 'Expand preview');
    button.dataset.tip = JSON.stringify(on ? 'Close' : 'Expand');
}

function stickyBottom() {
    let bottom = 0;
    for (const element of document.querySelectorAll('.nav, .sidebar')) {
        const position = getComputedStyle(element).position;
        if (position === 'sticky' || position === 'fixed') bottom = Math.max(bottom, element.getBoundingClientRect().bottom);
    }
    return bottom;
}

function revealStage() {
    if (window.matchMedia('(min-width: 901px)').matches) return;
    const stage = $('viewport').closest('.st-stage');
    const top = stage.getBoundingClientRect().top - stickyBottom() - 8;
    if (Math.abs(top) > 4) window.scrollBy({ top, behavior: 'smooth' });
}

function pickBlock(instance) {
    const card = $('pick');
    if (!instance) {
        state.selected = null;
        if (state.viewer) state.viewer.select(-1);
        card.hidden = true;
        root.querySelectorAll('.st-row.selected').forEach(row => row.classList.remove('selected'));
        return;
    }
    const name = instance.original;
    state.selected = name;
    if (state.viewer) state.viewer.select(keyOf(name));
    root.querySelectorAll('.st-row').forEach(row => row.classList.toggle('selected', row.dataset.block === name));
    const target = isSwapped(name) ? state.mapping.blocks[name] : '';
    const data = dataOf(name);
    const nbtInput = card.querySelector('[data-pick-nbt]');
    nbtInput.value = data;
    const nbtProblem = nbtError(data);
    nbtInput.classList.toggle('invalid', Boolean(nbtProblem));
    card.querySelector('[data-pick-nbt-warning]').textContent = nbtProblem;
    const dataOpen = Boolean(data) || state.openData.has(name);
    card.querySelector('[data-pick-data]').hidden = !dataOpen;
    $('pick-data').setAttribute('aria-expanded', String(dataOpen));
    card.querySelector('[data-pick-name]').textContent = name;
    card.querySelector('[data-pick-where]').textContent = `${instance.x}, ${instance.y}, ${instance.z}${instance.shown !== name ? ` \u00b7 Shown as ${instance.shown}` : ''}`;
    const input = card.querySelector('[data-pick-input]');
    input.value = target;
    input.placeholder = `Keep ${splitId(name).path}`;
    input.classList.remove('invalid');
    $('pick-keep').hidden = !isChanged(name);
    card.querySelector('[data-pick-warning]').textContent = '';
    const icon = card.querySelector('[data-pick-icon]');
    icon.dataset.icon = name;
    drawIcon(icon);
    card.hidden = false;
    if (target) checkTarget(name, target);
}

function findRow(name) {
    expand(false);
    if (state.blockScope !== 'all') { state.blockScope = 'all'; $('block-scope').value = 'all'; }
    if (state.blockFilter) { state.blockFilter = ''; $('block-search').value = ''; }
    renderBlocks();
    const row = root.querySelector(`.st-row[data-block="${CSS.escape(name)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
    const input = row.querySelector('[data-target]');
    if (input) input.focus({ preventScroll: true });
}

function keyOf(name) {
    if (!state.keys.has(name)) state.keys.set(name, state.keys.size);
    return state.keys.get(name);
}

const isSwapped = name => {
    const to = state.mapping.blocks[name];
    return Boolean(to) && to !== name;
};
const dataOf = name => (state.mapping.block_nbt && state.mapping.block_nbt[name]) || '';
const isChanged = name => isSwapped(name) || Boolean(dataOf(name));

function nbtError(value) {
    if (!value) return '';
    try {
        return parseSnbt(value).type === TAG.COMPOUND ? '' : 'Block data goes in curly brackets, like {CustomName:"Shop"}.';
    } catch (error) {
        return error.message + '.';
    }
}

function nbtInputs(from) {
    const inputs = [...root.querySelectorAll('[data-nbt]')].filter(input => input.dataset.nbt === from);
    if (state.selected === from) inputs.push($('pick').querySelector('[data-pick-nbt]'));
    return inputs;
}

function showData(from, open) {
    if (open) state.openData.add(from); else state.openData.delete(from);
    const row = root.querySelector(`.st-row[data-block="${CSS.escape(from)}"]`);
    if (row) {
        row.querySelector('.st-data').hidden = !open;
        row.querySelector('[data-data-toggle]').setAttribute('aria-expanded', String(open));
    }
    if (state.selected === from) {
        $('pick').querySelector('[data-pick-data]').hidden = !open;
        $('pick-data').setAttribute('aria-expanded', String(open));
    }
}

function setNbt(from, raw, source) {
    const value = String(raw || '').trim();
    const before = dataOf(from);
    const map = { ...(state.mapping.block_nbt || {}) };
    if (value) map[from] = value; else delete map[from];
    state.mapping.block_nbt = map;
    const error = nbtError(value);
    for (const input of nbtInputs(from)) {
        input.classList.toggle('invalid', Boolean(error));
        if (input !== source && input.value.trim() !== value) input.value = value;
    }
    const row = root.querySelector(`.st-row[data-block="${CSS.escape(from)}"]`);
    if (row) {
        row.classList.toggle('has-data', Boolean(value));
        row.querySelector('[data-nbt-warning]').textContent = error;
        row.querySelector('[data-reset]').hidden = !isChanged(from);
    }
    if (state.selected === from) {
        $('pick').querySelector('[data-pick-nbt-warning]').textContent = error;
        $('pick-keep').hidden = !isChanged(from);
    }
    const shown = isSwapped(from) ? state.mapping.blocks[from] : from;
    if (before !== value && state.mode === 'swapped' && /[:_](banner|decorated_pot)$/.test(shown)) previewSoon();
    updateExport();
}

function mappingForExport() {
    const { replace_jigsaw_final_states, rename_files, blocks, block_nbt, used_in_files } = state.mapping;
    const data = Object.fromEntries(Object.entries(block_nbt || {}).filter(([, value]) => value));
    return { replace_jigsaw_final_states, rename_files, blocks, ...(Object.keys(data).length ? { block_nbt: data } : {}), used_in_files };
}

function bind() {
    const drop = $('drop');
    $('files').addEventListener('change', event => {
        const files = [...event.target.files];
        event.target.value = '';
        addFiles(files.map(file => ({ file, path: file.name })));
    });
    drop.addEventListener('drop', event => {
        const items = [...(event.dataTransfer && event.dataTransfer.items || [])];
        const entries = items.map(item => item.webkitGetAsEntry && item.webkitGetAsEntry()).filter(Boolean);
        if (!entries.some(entry => entry.isDirectory)) return;
        event.preventDefault();
        drop.classList.remove('over');
        readEntries(entries).then(addFiles);
    });
    $('folder').addEventListener('change', event => {
        const files = [...event.target.files];
        event.target.value = '';
        addFiles(files.map(file => ({ file, path: file.webkitRelativePath || file.name })));
    });
    $('vanilla').addEventListener('change', event => {
        const folder = event.target.value;
        if (!folder) return;
        event.target.value = '';
        loadVanilla(folder);
    });
    $('search').addEventListener('input', debounce(event => { state.filter = event.target.value.trim().toLowerCase(); renderFiles(); }, 120));
    $('clear').addEventListener('click', () => {
        state.files = [];
        state.current = null;
        pickBlock(null);
        rescan();
        renderFiles();
        showCurrent();
    });
    $('tree').addEventListener('click', event => {
        const remove = event.target.closest('[data-remove-folder]');
        if (remove) {
            const folder = remove.dataset.removeFolder;
            state.files = state.files.filter(file => !inFolder(file, folder));
            if (state.current && !state.files.includes(state.current)) state.current = state.files[0] || null;
            rescan();
            renderFiles();
            showCurrent(true);
            return;
        }
        const folderRow = event.target.closest('[data-folder]');
        if (folderRow && !event.target.closest('input')) {
            const path = folderRow.dataset.folder;
            state.folders.set(path, folderRow.getAttribute('aria-expanded') !== 'true');
            renderFiles(true);
            return;
        }
        const item = event.target.closest('[data-file]');
        if (item && !event.target.closest('input')) {
            const file = state.files.find(entry => entry.id === Number(item.dataset.file));
            if (file && file !== state.current) { state.current = file; state.palette = 0; pickBlock(null); renderFiles(); showCurrent(true); revealStage(); }
        }
    });
    $('tree').addEventListener('change', event => {
        const box = event.target;
        if (box.dataset.include) {
            const file = state.files.find(entry => entry.id === Number(box.dataset.include));
            if (file) file.included = box.checked;
        } else if (box.dataset.includeFolder !== undefined) {
            for (const file of state.files) if (inFolder(file, box.dataset.includeFolder)) file.included = box.checked;
        }
        rescan();
        renderFiles();
    });
    root.querySelectorAll('input[name="st-mode"]').forEach(input => input.addEventListener('change', () => { state.mode = input.value; showCurrent(); }));
    $('biome').addEventListener('change', event => {
        state.biome = event.target.value;
        if (state.biome === 'custom' && !state.custom) state.custom = { ...tintsFor(state.current) };
        showCurrent();
    });
    root.querySelectorAll('[data-tint]').forEach(input => input.addEventListener('input', () => {
        const base = state.biome === 'custom' && state.custom ? state.custom : tintsFor(state.current);
        state.custom = { ...base, [input.dataset.tint]: parseInt(input.value.slice(1), 16) };
        state.biome = 'custom';
        syncBiome();
        previewSoon();
    }));
    $('lighting').addEventListener('change', event => { state.lighting = event.target.value; showCurrent(); });
    $('palette').addEventListener('change', event => { state.palette = Number(event.target.value) || 0; showCurrent(); });
    $('smooth').addEventListener('change', event => { state.smooth = event.target.checked; showCurrent(); });
    $('jigsaws').addEventListener('change', event => { state.jigsaws = event.target.checked; showCurrent(); });
    $('grid').addEventListener('change', event => { state.grid = event.target.checked; if (state.viewer) state.viewer.setOptions({ grid: state.grid }); });
    $('frame').addEventListener('click', () => state.viewer && state.viewer.frame());
    $('ortho').addEventListener('click', () => { if (state.viewer) $('ortho').textContent = state.viewer.toggleOrtho() ? 'Ortho' : 'Persp'; });
    $('shot').addEventListener('click', async () => {
        if (!state.viewer || !state.current) return;
        const blob = await state.viewer.screenshot();
        if (blob) save(blob, `${baseName(state.current.path)}.png`);
    });
    $('full').addEventListener('click', () => expand(!$('viewport').classList.contains('sv-max')));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && $('viewport').classList.contains('sv-max')) expand(false);
    });
    const help = $('help');
    $('help-toggle').addEventListener('click', event => {
        help.hidden = !help.hidden;
        event.currentTarget.setAttribute('aria-expanded', String(!help.hidden));
    });
    $('block-search').addEventListener('input', debounce(event => { state.blockFilter = event.target.value.trim().toLowerCase(); renderBlocks(); }, 120));
    $('block-scope').addEventListener('change', event => { state.blockScope = event.target.value; renderBlocks(); });
    const blocks = $('blocks');
    blocks.addEventListener('pointerover', event => {
        const row = event.target.closest('.st-row');
        if (state.viewer) state.viewer.highlight(row ? keyOf(row.dataset.block) : -1);
    });
    blocks.addEventListener('pointerleave', () => state.viewer && state.viewer.highlight(-1));
    blocks.addEventListener('input', event => {
        const input = event.target.closest('[data-target]');
        if (input) setTarget(input.dataset.target, input.value, false, input);
        const data = event.target.closest('[data-nbt]');
        if (data) setNbt(data.dataset.nbt, data.value, data);
    });
    blocks.addEventListener('change', event => {
        const input = event.target.closest('[data-target]');
        if (input) setTarget(input.dataset.target, input.value, true, input);
    });
    blocks.addEventListener('click', event => {
        const reset = event.target.closest('[data-reset]');
        if (reset) keepOriginal(reset.closest('.st-row').dataset.block);
        const toggle = event.target.closest('[data-data-toggle]');
        if (toggle) {
            const name = toggle.closest('.st-row').dataset.block;
            const open = toggle.getAttribute('aria-expanded') !== 'true';
            showData(name, open);
            if (open) toggle.closest('.st-row').querySelector('[data-nbt]').focus();
        }
    });
    const pick = $('pick');
    const pickInput = pick.querySelector('[data-pick-input]');
    pickInput.addEventListener('input', () => state.selected && setTarget(state.selected, pickInput.value, false, pickInput));
    pickInput.addEventListener('change', () => state.selected && setTarget(state.selected, pickInput.value, true, pickInput));
    $('pick-keep').addEventListener('click', () => state.selected && keepOriginal(state.selected));
    const pickNbt = pick.querySelector('[data-pick-nbt]');
    pickNbt.addEventListener('input', () => state.selected && setNbt(state.selected, pickNbt.value, pickNbt));
    $('pick-data').addEventListener('click', () => {
        if (!state.selected) return;
        const open = $('pick-data').getAttribute('aria-expanded') !== 'true';
        showData(state.selected, open);
        if (open) pickNbt.focus();
    });
    $('pick-find').addEventListener('click', () => state.selected && findRow(state.selected));
    $('pick-close').addEventListener('click', () => pickBlock(null));
    $('final-states').addEventListener('change', event => {
        state.mapping.replace_jigsaw_final_states = event.target.checked;
        showCurrent();
    });
    $('add-rename').addEventListener('click', () => {
        state.mapping.rename_files = { ...state.mapping.rename_files, '': '' };
        renderRenames(true);
    });
    $('renames').addEventListener('input', debounce(readRenames, 150));
    $('renames').addEventListener('click', event => {
        const remove = event.target.closest('[data-remove-rename]');
        if (!remove) return;
        remove.closest('.st-rename').remove();
        readRenames();
    });
    $('preset').addEventListener('change', async event => {
        const id = event.target.value;
        if (!id) return;
        event.target.value = '';
        const data = await fetch(`./tools/presets/${id}/${MAPPING_FILE}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
        if (!data) return toast('Couldn’t load that preset.', 'error');
        useMapping(data);
        toast(`Loaded the ${PRESETS.find(p => p.id === id).label} preset.`);
    });
    $('import').addEventListener('change', async event => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
            useMapping(JSON.parse(await file.text()));
            toast(`Loaded ${file.name}.`);
        } catch (error) {
            toast(`${file.name} isn’t a valid mapping file.`, 'error');
        }
    });
    $('export-mapping').addEventListener('click', () => {
        const text = JSON.stringify(mappingForExport(), null, 2) + '\n';
        save(new Blob([text], { type: 'application/json' }), MAPPING_FILE);
    });
    $('reset-mapping').addEventListener('click', () => {
        for (const name of Object.keys(state.mapping.blocks)) state.mapping.blocks[name] = name;
        delete state.mapping.block_nbt;
        state.openData.clear();
        renderBlocks(true);
        updateExport();
        if (state.selected) pickBlock(null);
        showCurrent();
    });
    $('download').addEventListener('click', download);
    document.addEventListener('change', event => {
        if (event.target.name !== 'mc-version') return;
        loadVanillaList();
        loadBiomes();
        if (state.current) showCurrent();
    });

}

async function readEntries(entries) {
    const out = [];
    const walk = async (entry, prefix) => {
        if (entry.isFile) {
            const file = await new Promise(resolve => entry.file(resolve, () => resolve(null)));
            if (file) out.push({ file, path: prefix + entry.name });
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            let batch;
            do {
                batch = await new Promise(resolve => reader.readEntries(resolve, () => resolve([])));
                for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
            } while (batch.length);
        }
    };
    for (const entry of entries) await walk(entry, '');
    return out;
}

function folderOf(path) {
    const slash = path.lastIndexOf('/');
    return slash === -1 ? '' : path.slice(0, slash);
}

const baseName = path => path.split('/').pop().replace(/\.nbt$/i, '');
const inFolder = (file, folder) => !folder || file.path.startsWith(folder + '/');

async function addFiles(items, label) {
    const structures = [];
    let mappingFile = null;
    for (const { file, path } of items) {
        const lower = path.toLowerCase();
        if (lower.endsWith('.nbt')) structures.push({ path, read: () => file.arrayBuffer() });
        else if (lower.endsWith('.zip') || lower.endsWith('.jar')) {
            try {
                const JSZip = await loadZipLib();
                const zip = await JSZip.loadAsync(file);
                const inner = Object.keys(zip.files).filter(name => !zip.files[name].dir && /\.nbt$/i.test(name));
                if (!inner.length) toast(`${file.name} has no structure files.`, 'error');
                if (Object.keys(zip.files).some(name => name.startsWith('assets/'))) registerArchive(file);
                for (const name of inner) structures.push({ path: name, read: () => zip.file(name).async('arraybuffer') });
            } catch (error) {
                toast(`Couldn’t open ${file.name}.`, 'error');
            }
        } else if (lower.split('/').pop() === MAPPING_FILE || (items.length === 1 && lower.endsWith('.json'))) {
            mappingFile = file;
        }
    }
    if (mappingFile) {
        try {
            useMapping(JSON.parse(await mappingFile.text()), false);
            toast(`Loaded ${mappingFile.name}.`);
        } catch (error) {
            toast(`${mappingFile.name} isn’t a valid mapping file.`, 'error');
        }
    }
    if (!structures.length) { if (!mappingFile) toast('No .nbt structure files found.', 'error'); else rescan(); return; }
    await addStructures(structures, label);
}

function registerArchive(file) {
    const input = document.querySelector('[data-registry-upload]');
    if (!input || state.registered.has(file.name)) return;
    state.registered.add(file.name);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function addStructures(structures, label) {
    setStatus(`Reading ${plural(structures.length, 'structure')}...`);
    const failed = [];
    const added = [];
    for (const item of structures) {
        try {
            const bytes = new Uint8Array(await item.read());
            const structure = await readStructure(bytes);
            const existing = state.files.findIndex(file => file.path === item.path);
            const entry = { id: state.nextId++, path: item.path, bytes, structure, view: null, included: true, label };
            if (existing >= 0) state.files[existing] = entry; else state.files.push(entry);
            added.push(entry);
        } catch (error) {
            failed.push(item.path);
        }
    }
    state.files.sort((a, b) => a.path.localeCompare(b.path));
    if (failed.length) toast(`Couldn’t read ${plural(failed.length, 'file')}: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '...' : ''}`, 'error');
    if (added.length) {
        if (!state.current || !state.files.includes(state.current)) { state.current = added[0]; state.palette = 0; }
        toast(`Added ${plural(added.length, 'structure')}.`);
    }
    rescan();
    renderFiles();
    showCurrent(true);
}

async function loadVanillaList() {
    const select = $('vanilla');
    const { registries } = version();
    if (select.dataset.version === registries) return;
    select.dataset.version = registries;
    const list = await fetch(`./data/${registries}/structures.json`).then(r => (r.ok ? r.json() : [])).catch(() => []);
    state.vanilla = list;
    const counts = new Map();
    for (const path of list) {
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) {
            const folder = parts.slice(0, i).join('/');
            counts.set(folder, (counts.get(folder) || 0) + 1);
        }
    }
    const folders = [...counts.keys()].sort();
    select.replaceChildren(new Option('Choose a Folder', ''), ...folders.map(folder => new Option(`${folder} (${counts.get(folder)})`, folder)));
}

async function fetchStructure(registries, path) {
    const urls = [
        `https://cdn.jsdelivr.net/gh/misode/mcmeta@${registries}-data/data/minecraft/structure/${path}.nbt`,
        `https://raw.githubusercontent.com/misode/mcmeta/${registries}-data/data/minecraft/structure/${path}.nbt`
    ];
    for (const url of urls) {
        const response = await fetch(url).catch(() => null);
        if (response && response.ok) return response.arrayBuffer();
    }
    throw new Error(`Couldn’t download ${path}`);
}

async function loadVanilla(folder) {
    const { registries } = version();
    const paths = (state.vanilla || []).filter(path => path.startsWith(folder + '/'));
    if (!paths.length) return;
    if (paths.length > 200 && window.UIControls && !(await window.UIControls.confirm(`Load ${paths.length} structures? Big folders take a while to download.`))) return;
    setStatus(`Downloading ${plural(paths.length, 'structure')}...`);
    const results = new Array(paths.length);
    let next = 0;
    let done = 0;
    const worker = async () => {
        while (next < paths.length) {
            const index = next++;
            try { results[index] = await fetchStructure(registries, paths[index]); } catch (error) { results[index] = null; }
            done++;
            if (done % 8 === 0) setStatus(`Downloading structures... ${done} of ${paths.length}`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(6, paths.length) }, worker));
    const missing = paths.filter((_, i) => !results[i]);
    if (missing.length) toast(`Couldn’t download ${plural(missing.length, 'structure')}.`, 'error');
    await addStructures(paths.map((path, i) => ({ path: `${path}.nbt`, read: () => (results[i] ? results[i] : Promise.reject(new Error('missing'))) })).filter((_, i) => results[i]), `Vanilla ${registries}`);
}

function included() {
    return state.files.filter(file => file.included);
}

function rescan() {
    const files = included();
    const previous = state.mapping;
    const result = scan(files.map(file => file.structure), previous);
    state.mapping = result.mapping;
    for (const [name, target] of Object.entries(state.mapping.blocks)) {
        if (!state.mapping.used_in_files[name] && target === name && !dataOf(name)) delete state.mapping.blocks[name];
    }
    for (const name of Object.keys(state.mapping.block_nbt || {})) if (!(name in state.mapping.blocks)) state.mapping.blocks[name] = name;
    state.props = new Map();
    for (const file of files) {
        const view = viewOf(file);
        for (const palette of view.palettes) {
            for (const entry of palette) {
                if (!state.props.has(entry.name)) state.props.set(entry.name, new Set());
                const set = state.props.get(entry.name);
                for (const key of Object.keys(entry.props)) set.add(key);
            }
        }
    }
    for (const name of Object.keys(state.mapping.blocks)) keyOf(name);
    $('final-states').checked = state.mapping.replace_jigsaw_final_states;
    renderBlocks(true);
    updateExport();
}

function viewOf(file) {
    if (!file.view) file.view = structureView(file.structure.root);
    return file.view;
}

function useMapping(data, rerender = true) {
    if (!data || typeof data !== 'object' || typeof data.blocks !== 'object') throw new Error('Not a mapping');
    state.mapping = {
        replace_jigsaw_final_states: 'replace_jigsaw_final_states' in data ? Boolean(data.replace_jigsaw_final_states) : true,
        rename_files: data.rename_files && typeof data.rename_files === 'object' ? { ...data.rename_files } : {},
        blocks: { ...data.blocks },
        used_in_files: {}
    };
    if (data.block_nbt && typeof data.block_nbt === 'object') {
        const nbt = Object.fromEntries(Object.entries(data.block_nbt).filter(([, value]) => typeof value === 'string' && value.trim()));
        if (Object.keys(nbt).length) state.mapping.block_nbt = nbt;
    }
    renderRenames();
    if (rerender) { rescan(); showCurrent(); }
}

function fileTree(files) {
    const top = { name: '', path: '', folders: new Map(), files: [], total: 0, on: 0 };
    for (const file of files) {
        const parts = file.path.split('/');
        parts.pop();
        let node = top;
        for (const part of parts) {
            const path = node.path ? `${node.path}/${part}` : part;
            if (!node.folders.has(part)) node.folders.set(part, { name: part, path, folders: new Map(), files: [], total: 0, on: 0 });
            node = node.folders.get(part);
        }
        node.files.push(file);
    }
    const count = node => {
        node.total = node.files.length;
        node.on = node.files.filter(file => file.included).length;
        for (const child of node.folders.values()) { count(child); node.total += child.total; node.on += child.on; }
        node.has = new Set([...node.files, ...[...node.folders.values()].flatMap(child => [...child.has])]);
    };
    count(top);
    const merge = node => {
        for (const [key, child] of [...node.folders]) {
            let merged = child;
            while (!merged.files.length && merged.folders.size === 1) {
                const [only] = merged.folders.values();
                merged = { ...only, name: `${merged.name}/${only.name}` };
            }
            node.folders.set(key, merged);
            merge(merged);
        }
    };
    merge(top);
    return top;
}

function renderFiles(keepScroll) {
    const tree = $('tree');
    const count = $('count');
    $('clear').hidden = !state.files.length;
    if (!state.files.length) {
        tree.innerHTML = '<p class="st-none">Structures you add show up here.</p>';
        count.textContent = 'No Structures Yet';
        return;
    }
    const chosen = included().length;
    count.textContent = `${plural(state.files.length, 'Structure')}${chosen !== state.files.length ? `, ${chosen} Included` : ''}`;
    const matches = state.filter ? state.files.filter(file => file.path.toLowerCase().includes(state.filter)) : state.files;
    if (!matches.length) { tree.innerHTML = '<p class="st-none">No structures match.</p>'; return; }
    const full = fileTree(state.files);
    const shownTree = state.filter ? fileTree(matches) : full;
    const totals = new Map();
    const collect = node => { totals.set(node.path, node); for (const child of node.folders.values()) collect(child); };
    collect(full);
    const small = state.files.length <= 40;
    const isOpen = node => {
        if (state.filter) return true;
        if (state.current && node.has.has(state.current)) return state.folders.get(node.path) !== false;
        return state.folders.has(node.path) ? state.folders.get(node.path) : small;
    };
    const html = [];
    const walk = (node, depth) => {
        for (const child of [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
            const all = totals.get(child.path) || child;
            const open = isOpen(child);
            html.push(`<div class="st-folder-row" data-folder="${escape(child.path)}" role="treeitem" aria-expanded="${open}" aria-level="${depth + 1}" style="--depth:${depth}">
                <span class="st-chevron" aria-hidden="true"></span>
                <input type="checkbox" data-include-folder="${escape(child.path)}" ${all.on === all.total ? 'checked' : ''} ${all.on && all.on < all.total ? 'data-mixed' : ''} aria-label="Include ${escape(child.path)}">
                <button type="button" class="st-folder-name" title="${escape(child.path)}" aria-label="${escape(child.path)}, ${all.total} structures"><bdi>${escape(child.name)}</bdi></button>
                <small>${all.on === all.total ? all.total : `${all.on}/${all.total}`}</small>
                <button type="button" class="link danger" data-remove-folder="${escape(child.path)}" aria-label="Remove ${escape(child.path)}">Remove</button></div>`);
            if (open) walk(child, depth + 1);
        }
        for (const file of node.files) {
            const view = viewOf(file);
            html.push(`<div class="st-file${file === state.current ? ' current' : ''}" data-file="${file.id}" role="treeitem" aria-level="${depth + 1}" aria-selected="${file === state.current}" style="--depth:${depth}">
                <input type="checkbox" data-include="${file.id}" ${file.included ? 'checked' : ''} aria-label="Include ${escape(baseName(file.path))}">
                <button type="button" class="st-file-name" title="${escape(file.path)}"><bdi>${escape(baseName(file.path))}</bdi></button>
                <small>${view.size.join('×')}</small></div>`);
        }
    };
    walk(shownTree, 0);
    const scroll = tree.scrollTop;
    tree.innerHTML = html.join('');
    tree.querySelectorAll('[data-mixed]').forEach(box => { box.indeterminate = true; });
    if (keepScroll) { tree.scrollTop = scroll; return; }
    const current = tree.querySelector('.st-file.current');
    if (current) {
        const top = current.offsetTop - tree.offsetTop;
        if (top < tree.scrollTop) tree.scrollTop = top;
        else if (top + current.offsetHeight > tree.scrollTop + tree.clientHeight) tree.scrollTop = top + current.offsetHeight - tree.clientHeight;
    }
}

function setStatus(text, problems) {
    const status = $('status');
    status.innerHTML = `<span>${escape(text)}</span>${problems || ''}`;
}

const titleCase = id => id.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
const hex = value => `#${(value >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;

function biomeTable() {
    return state.biomes.get(version().registries) || null;
}

function loadBiomes() {
    const { registries } = version();
    if (!state.biomes.has(registries)) {
        state.biomes.set(registries, null);
        fetch(`./data/${registries}/biomes.json`).then(r => (r.ok ? r.json() : null)).catch(() => null).then(table => {
            if (!table) { state.biomes.delete(registries); return; }
            state.biomes.set(registries, table);
            if (version().registries === registries) { syncBiome(); if (state.current) showCurrent(); }
        });
    }
    syncBiome();
}

function guessBiome(file) {
    const table = biomeTable();
    const path = file ? file.path.toLowerCase() : '';
    const named = table ? Object.keys(table).filter(id => new RegExp(`(^|[/_])${id}([/_.]|$)`).test(path)).sort((a, b) => b.length - a.length)[0] : null;
    if (named) return named;
    for (const [pattern, biome] of BIOME_GUESS) if (pattern.test(path) && (!table || table[biome])) return biome;
    return 'plains';
}

function biomeFor(file) {
    if (state.biome === 'auto' || state.biome === 'custom') return guessBiome(file);
    return state.biome;
}

function tintsFor(file) {
    if (state.biome === 'custom' && state.custom) return state.custom;
    const table = biomeTable();
    const colors = table && table[biomeFor(file)];
    return colors ? { ...colors, dry: colors.dry ?? FALLBACK_TINTS.dry } : FALLBACK_TINTS;
}

function syncBiome() {
    const select = $('biome');
    if (!select) return;
    const table = biomeTable();
    const ids = table ? Object.keys(table) : [];
    const signature = ids.join(',');
    if (select.dataset.signature !== signature) {
        select.dataset.signature = signature;
        select.replaceChildren(new Option('Auto', 'auto'), ...ids.map(id => new Option(titleCase(id), id)), new Option('Custom Colors', 'custom'));
    }
    if (state.biome !== 'auto' && state.biome !== 'custom' && table && !table[state.biome]) state.biome = 'auto';
    select.options[0].textContent = `Auto (${titleCase(guessBiome(state.current))})`;
    select.value = state.biome;
    const colors = tintsFor(state.current);
    root.querySelectorAll('[data-tint]').forEach(input => { input.value = hex(colors[input.dataset.tint]); });
}

function blockInfo() {
    const { registries } = version();
    if (!state.blockInfo.has(registries)) {
        const promise = fetch(`${MCMETA}${registries}-summary/blocks/data.min.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
        state.blockInfo.set(registries, promise);
        promise.then(data => { if (!data) state.blockInfo.delete(registries); });
    }
    return state.blockInfo.get(registries);
}

function defaultsOf(data) {
    return name => {
        if (!data || !name.startsWith('minecraft:')) return null;
        return data[name.slice(10)] || null;
    };
}

const showCurrent = (() => {
    let frameNext = false;
    let running = false;
    let queued = false;
    const run = async () => {
        if (running) { queued = true; return; }
        running = true;
        try {
            const file = state.current;
            $('empty').hidden = Boolean(file);
            $('download').disabled = !included().length;
            if (!file) {
                if (state.viewer) await state.viewer.show({ size: [0, 0, 0], palettes: [], blocks: [] }, {});
                setStatus('');
                return;
            }
            const view = viewOf(file);
            const paletteField = $('palette-field');
            paletteField.hidden = view.palettes.length < 2;
            if (view.palettes.length > 1) {
                const select = $('palette');
                if (select.options.length !== view.palettes.length) select.replaceChildren(...view.palettes.map((_, i) => new Option(`${i + 1} of ${view.palettes.length}`, String(i))));
                select.value = String(Math.min(state.palette, view.palettes.length - 1));
            }
            $('loading').hidden = false;
            configure({ version: version().assets });
            const viewer = await ensureViewer();
            const mapping = readMapping(state.mapping);
            const swaps = state.mode === 'swapped' ? mapping.blocks : {};
            const blockData = state.mode === 'swapped' ? Object.fromEntries(Object.entries(mapping.nbt).map(([name, value]) => [name, plain(TAG.COMPOUND, value)])) : null;
            const info = await blockInfo();
            syncBiome();
            const frame = frameNext;
            frameNext = false;
            const result = await viewer.show(view, {
                swaps,
                swapFinalStates: state.mapping.replace_jigsaw_final_states,
                showJigsaws: state.jigsaws,
                tints: tintsFor(file),
                defaults: defaultsOf(info),
                blockData,
                lighting: state.lighting,
                smooth: state.smooth,
                paletteIndex: Math.min(state.palette, view.palettes.length - 1),
                keyOf,
                frame
            });
            $('loading').hidden = true;
            if (!result) return;
            if (state.selected) viewer.select(keyOf(state.selected));
            const [x, y, z] = view.size;
            const problems = [...result.problems.entries()];
            const notes = [];
            if (problems.length) {
                notes.push(`<span class="st-problem">Not previewed: ${problems.slice(0, 4).map(([name, reason]) => `<code>${escape(name)}</code>${reason === 'missing' ? (splitId(name).ns === 'minecraft' ? ` (not in Minecraft ${escape(version().id)})` : ' (add its mod under Mods &amp; Datapacks)') : ''}`).join(', ')}${problems.length > 4 ? ` and ${problems.length - 4} more` : ''}</span>`);
            }
            const hidden = [...(result.notDrawn || new Map()).entries()];
            if (hidden.length) notes.push(`<span>Not drawn: ${hidden.map(([label, count]) => escape(count > 1 && !/text|books/.test(label) ? `${count} ${label}s` : label)).join(', ')}</span>`);
            const note = notes.join('');
            setStatus(`${baseName(file.path)} · ${x} × ${y} × ${z} · ${plural(result.shown, 'Block')}`, note);
            if (state.blockScope === 'preview') renderBlocks();
        } catch (error) {
            console.error(error);
            $('loading').hidden = true;
            setStatus('This structure couldn’t be previewed.');
        } finally {
            running = false;
            if (queued) { queued = false; run(); }
        }
    };
    return frame => {
        if (frame) frameNext = true;
        run();
    };
})();

const previewSoon = debounce(() => showCurrent(), 220);

function blocksInPreview() {
    const file = state.current;
    if (!file) return new Set();
    const view = viewOf(file);
    const names = new Set();
    const palette = view.palettes[Math.min(state.palette, view.palettes.length - 1)] || [];
    for (const entry of palette) names.add(entry.name);
    for (const block of view.blocks) if (block.finalState) names.add(block.finalState.split(/[[{]/)[0]);
    return names;
}

function renderBlocks(force) {
    const host = $('blocks');
    const names = Object.keys(state.mapping.blocks);
    if (!names.length) {
        host.innerHTML = '<p class="st-none">Add structures to see their blocks.</p>';
        return;
    }
    const used = state.mapping.used_in_files;
    const preview = state.blockScope === 'preview' ? blocksInPreview() : null;
    const visible = names.filter(name => {
        if (state.blockFilter && !name.includes(state.blockFilter) && !String(state.mapping.blocks[name]).includes(state.blockFilter)) return false;
        if (preview && !preview.has(name)) return false;
        if (state.blockScope === 'swapped' && !isChanged(name)) return false;
        return true;
    }).sort((a, b) => ((used[b] ? 1 : 0) - (used[a] ? 1 : 0)) || a.localeCompare(b));
    const signature = visible.join('|');
    if (!force && host.dataset.signature === signature) {
        host.querySelectorAll('.st-row').forEach(row => row.classList.toggle('selected', row.dataset.block === state.selected));
        return;
    }
    host.dataset.signature = signature;
    if (!visible.length) { host.innerHTML = '<p class="st-none">No blocks match.</p>'; return; }
    host.innerHTML = visible.map(name => {
        const target = state.mapping.blocks[name];
        const value = target && target !== name ? target : '';
        const count = used[name] || 0;
        const data = dataOf(name);
        const open = Boolean(data) || state.openData.has(name);
        const problem = nbtError(data);
        return `<div class="st-row${name === state.selected ? ' selected' : ''}${value ? ' swapped' : ''}${data ? ' has-data' : ''}" data-block="${escape(name)}">
            <span class="slot slot-small st-icon" data-icon="${escape(name)}"></span>
            <div class="st-name"><code>${escape(name)}</code><small>${count ? `Used in ${plural(count, 'File')}` : 'Not in These Structures'}</small></div>
            <span class="st-arrow" aria-hidden="true">→</span>
            <span class="slot slot-small st-icon st-target-icon" data-icon="${escape(value)}"></span>
            <div class="st-target">
              <input type="text" data-target="${escape(name)}" data-field="block" list="reg-block" value="${escape(value)}" placeholder="Keep ${escape(splitId(name).path)}" spellcheck="false" autocomplete="off" aria-label="Replace ${escape(name)} with">
              <small class="st-warning" data-warning></small>
            </div>
            <div class="st-actions">
              <button type="button" class="link st-data-toggle" data-data-toggle aria-expanded="${open}" aria-label="Block data for ${escape(name)}">Data</button>
              <button type="button" class="link st-reset" data-reset ${value || data ? '' : 'hidden'} aria-label="Keep ${escape(name)}">Keep</button>
            </div>
            <div class="st-data" ${open ? '' : 'hidden'}>
              <textarea data-nbt="${escape(name)}" rows="2" spellcheck="false" autocomplete="off" class="${problem ? 'invalid' : ''}" placeholder="Block data (SNBT), like {CustomName:&quot;Shop&quot;}" aria-label="Block data for ${escape(name)}">${escape(data)}</textarea>
              <small class="st-warning" data-nbt-warning>${escape(problem)}</small>
            </div>
        </div>`;
    }).join('');
    lazyIcons(host);
    host.querySelectorAll('[data-target]').forEach(input => { if (input.value) checkTarget(input.dataset.target, input.value); });
}

const iconObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        iconObserver.unobserve(entry.target);
        drawIcon(entry.target);
    }
}, { rootMargin: '200px' }) : null;

function lazyIcons(host) {
    host.querySelectorAll('[data-icon]').forEach(slot => (iconObserver ? iconObserver.observe(slot) : drawIcon(slot)));
}

function drawIcon(slot) {
    const id = slot.dataset.icon;
    slot.replaceChildren();
    slot.removeAttribute('data-tip');
    if (!id || !BLOCK_ID.test(id)) return;
    slot.dataset.tip = JSON.stringify(id);
    if (/^minecraft:(air|cave_air|void_air|structure_void)$/.test(id)) return;
    renderIcon(id).then(result => {
        if (slot.dataset.icon !== id) return;
        const icon = iconElement(result);
        if (icon) slot.replaceChildren(icon);
        else slot.innerHTML = '<i>?</i>';
    }).catch(() => {});
}

function targetInputs(from) {
    const inputs = [...root.querySelectorAll('[data-target]')].filter(input => input.dataset.target === from);
    if (state.selected === from) inputs.push($('pick').querySelector('[data-pick-input]'));
    return inputs;
}

function warn(from, text) {
    const row = root.querySelector(`.st-row[data-block="${CSS.escape(from)}"]`);
    if (row) row.querySelector('[data-warning]').textContent = text;
    if (state.selected === from) $('pick').querySelector('[data-pick-warning]').textContent = text;
}

function setTarget(from, raw, final, source) {
    const value = String(raw || '').trim();
    const valid = !value || BLOCK_ID.test(value);
    const inputs = targetInputs(from);
    inputs.forEach(input => input.classList.toggle('invalid', !valid));
    const before = state.mapping.blocks[from];
    state.mapping.blocks[from] = value || from;
    for (const input of inputs) if (input !== source && input.value.trim() !== value) input.value = value;
    const row = root.querySelector(`.st-row[data-block="${CSS.escape(from)}"]`);
    if (row) {
        row.classList.toggle('swapped', Boolean(value));
        row.querySelector('[data-reset]').hidden = !value && !dataOf(from);
        const icon = row.querySelector('.st-target-icon');
        if (icon.dataset.icon !== value) { icon.dataset.icon = value; drawIcon(icon); }
    }
    if (state.selected === from) $('pick-keep').hidden = !isChanged(from);
    if (!valid) warn(from, 'Use a full block ID like minecraft:red_sand.');
    else if (final || !value || BLOCK_ID.test(value)) checkTarget(from, value);
    if (before !== state.mapping.blocks[from] && state.mode === 'swapped') previewSoon();
    updateExport();
}

function keepOriginal(from) {
    setTarget(from, '', true);
    setNbt(from, '');
    showData(from, false);
}

const blockstateProps = new Map();
function propsOfBlock(id) {
    const key = `${version().assets}|${id}`;
    if (!blockstateProps.has(key)) {
        configure({ version: version().assets });
        const { ns, path } = splitId(id);
        blockstateProps.set(key, fetchJson(assetUrl(ns, `blockstates/${path}.json`)).then(json => {
            if (!json) return null;
            const names = new Set();
            const collectWhen = when => {
                if (!when || typeof when !== 'object') return;
                for (const [key, value] of Object.entries(when)) {
                    if (key === 'OR' || key === 'AND') (Array.isArray(value) ? value : []).forEach(collectWhen);
                    else names.add(key);
                }
            };
            for (const key of Object.keys(json.variants || {})) for (const pair of key.split(',')) if (pair.includes('=')) names.add(pair.split('=')[0]);
            for (const part of json.multipart || []) collectWhen(part.when);
            return names;
        }).catch(() => null));
        blockstateProps.get(key).then(result => { if (!result) blockstateProps.delete(key); });
    }
    return blockstateProps.get(key);
}

async function checkTarget(from, value) {
    if (!value || !BLOCK_ID.test(value) || value === from) { warn(from, ''); return; }
    const data = splitId(value).ns === 'minecraft' ? await blockInfo() : null;
    const known = data && data[splitId(value).path];
    const target = known ? new Set(Object.keys(known[0])) : data ? null : await propsOfBlock(value);
    if (state.mapping.blocks[from] !== value) return;
    if (!target) {
        warn(from, splitId(value).ns === 'minecraft'
            ? 'Minecraft has no block with this ID in the selected version.'
            : 'Unknown block. Add its mod under Mods & Datapacks to check it.');
        return;
    }
    const source = state.props.get(from) || new Set();
    const lost = [...source].filter(name => !target.has(name) && name !== 'waterlogged');
    const list = lost.length > 1 ? `${lost.slice(0, -1).join(', ')} or ${lost[lost.length - 1]}` : lost[0];
    warn(from, lost.length ? `${value} has no ${list} property, so ${lost.length === 1 ? 'it' : 'they'} will be dropped. Swap stairs for stairs and slabs for slabs.` : '');
}

function renderRenames(focusLast) {
    const host = $('renames');
    const entries = Object.entries(state.mapping.rename_files || {});
    host.innerHTML = entries.map(([from, to]) => `<div class="st-rename">
        <input type="text" value="${escape(from)}" placeholder="Find" aria-label="Text to find in file names" data-rename-from spellcheck="false">
        <span aria-hidden="true">→</span>
        <input type="text" value="${escape(to)}" placeholder="Replace" aria-label="Text to put instead" data-rename-to spellcheck="false">
        <button type="button" class="link danger" data-remove-rename aria-label="Remove rename">Remove</button></div>`).join('');
    if (focusLast) { const inputs = host.querySelectorAll('[data-rename-from]'); if (inputs.length) inputs[inputs.length - 1].focus(); }
}

function readRenames() {
    const rename = {};
    $('renames').querySelectorAll('.st-rename').forEach(row => {
        const from = row.querySelector('[data-rename-from]').value;
        const to = row.querySelector('[data-rename-to]').value;
        if (from || to) rename[from] = to;
    });
    state.mapping.rename_files = rename;
    updateExport();
}

function exportPaths(files) {
    const folders = files.map(file => folderOf(file.path).split('/').filter(Boolean));
    let common = folders[0] || [];
    for (const parts of folders) {
        let i = 0;
        while (i < common.length && i < parts.length && common[i] === parts[i]) i++;
        common = common.slice(0, i);
    }
    const prefix = common.length ? common.join('/') + '/' : '';
    return files.map(file => ({ path: file.path.slice(prefix.length), bytes: file.bytes }));
}

function updateExport() {
    const files = included();
    const mapping = readMapping(state.mapping);
    const swaps = Object.keys(mapping.blocks).length;
    const data = Object.keys(mapping.nbt).length + mapping.nbtErrors.length;
    $('download').disabled = !files.length;
    $('export-note').textContent = files.length
        ? `${plural(files.length, 'structure')}, ${plural(swaps, 'block swap')}${data ? `, block data on ${plural(data, 'block')}` : ''}${Object.keys(state.mapping.rename_files || {}).some(Boolean) ? ', with renamed files' : ''}.`
        : 'Add structures to download swapped copies.';
}

async function download() {
    const files = included();
    if (!files.length) return;
    const { errors, nbtErrors } = readMapping(state.mapping);
    const report = $('report');
    if (errors.length || nbtErrors.length) {
        report.hidden = false;
        report.className = 'report card error';
        report.innerHTML = `<h3>Fix These First</h3><ul>${[
            ...errors.map(e => `<li><code>${escape(e.from)}</code> → <code>${escape(e.to)}</code> needs a namespace, like minecraft:red_sand</li>`),
            ...nbtErrors.map(e => `<li>Block data for <code>${escape(e.from)}</code>: ${escape(e.message)}</li>`)
        ].join('')}</ul>`;
        return;
    }
    const button = $('download');
    button.disabled = true;
    button.textContent = 'Building...';
    try {
        const result = await applyMapping(exportPaths(files), mappingForExport());
        const JSZip = await loadZipLib();
        const zip = new JSZip();
        for (const file of result.files) zip.file(file.path, file.bytes, { binary: true });
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        save(blob, 'generated_structures.zip');
        report.hidden = false;
        report.className = 'report card';
        const items = [
            ...result.swaps.map(swap => `<li><code>${escape(swap.from)}</code> → <code>${escape(swap.to)}</code> (${swap.count.toLocaleString()} palette ${swap.count === 1 ? 'entry' : 'entries'})</li>`),
            ...result.nbt.map(item => `<li>Block data added to <code>${escape(item.block)}</code> (${plural(item.count, 'block')})</li>`),
            ...result.nbtSkipped.map(item => `<li>Skipped block data on ${plural(item.count, 'block')} of <code>${escape(item.block)}</code>: its palettes don’t agree on what block it is</li>`),
            ...(result.unused.length || result.nbtUnused.length ? [`<li>Not used by any structure: ${[...new Set([...result.unused, ...result.nbtUnused])].map(name => `<code>${escape(name)}</code>`).join(', ')}</li>`] : []),
            ...result.failed.map(fail => `<li>Skipped <code>${escape(fail.path)}</code>: ${escape(fail.reason)}</li>`)
        ];
        report.innerHTML = `<h3>Saved ${plural(result.files.length, 'Structure')} (${result.changedFiles} Changed)</h3>${items.length ? `<ul>${items.join('')}</ul>` : ''}`;
    } catch (error) {
        console.error(error);
        report.hidden = false;
        report.className = 'report card error';
        report.innerHTML = `<h3>Download Failed</h3><ul><li>${escape(error.message)}</li></ul>`;
    } finally {
        button.textContent = 'Download Swapped Structures';
        button.disabled = !included().length;
    }
}

if (root && panel) {
    let wasActive = false;
    const sync = () => {
        const active = panel.classList.contains('active');
        if (active) mount();
        if (state.viewer) state.viewer.setVisible(active);
        if (!active && state.tip) state.tip.classList.remove('visible');
        if (!active) expand(false);
        if (active && !wasActive && state.current && state.viewer) showCurrent();
        wasActive = active;
    };
    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
    sync();
}
