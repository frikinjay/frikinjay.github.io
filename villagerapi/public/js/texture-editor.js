import { configure, villagerElements, composeTextures, registerCanvasTexture, buildModel, entityBox, withPivot } from './mc-assets.js';
import { villagerModel } from './mcsrc.js';

const KINDS = {
    villager: { w: 64, h: 64, model: 'villager', base: ['minecraft:entity/villager/villager', 'minecraft:entity/villager/type/plains'], label: 'Villager Texture' },
    type: { w: 64, h: 64, model: 'villager', base: ['minecraft:entity/villager/villager'], label: 'Villager Type Texture' },
    zombie: { w: 64, h: 64, model: 'villager', base: ['minecraft:entity/zombie_villager/zombie_villager', 'minecraft:entity/zombie_villager/type/plains'], label: 'Zombie Villager Texture', zombie: true },
    zombie_type: { w: 64, h: 64, model: 'villager', base: ['minecraft:entity/zombie_villager/zombie_villager'], label: 'Zombie Villager Type Texture', zombie: true },
    baby: { w: 64, h: 64, model: 'baby', base: ['minecraft:entity/villager/villager_baby'], label: 'Baby Villager Texture' },
    baby_zombie: { w: 64, h: 64, model: 'baby', base: ['minecraft:entity/zombie_villager/zombie_villager_baby'], label: 'Baby Zombie Villager Texture', zombie: true },
    block: { w: 16, h: 16, model: 'block', label: 'Workstation' },
    decoration: { w: 8, h: 8, model: null, label: 'Map Decoration' },
    icon: { w: 64, h: 64, model: null, label: 'Pack Icon' }
};

const ADULT_PARTS = [
    { name: 'Head', boxes: [[0, 0, 8, 10, 8]], elements: [0] }, { name: 'Hat', boxes: [[32, 0, 8, 10, 8]], elements: [1] },
    { name: 'Hat Brim', boxes: [[30, 47, 16, 16, 1]], elements: [2] }, { name: 'Nose', boxes: [[24, 0, 2, 4, 2]], elements: [3] },
    { name: 'Body', boxes: [[16, 20, 8, 12, 6]], elements: [4] }, { name: 'Robe', boxes: [[0, 38, 8, 20, 6]], elements: [5] },
    { name: 'Arms', boxes: [[44, 22, 4, 8, 4], [40, 38, 8, 4, 4]], elements: [6, 7, 8] }, { name: 'Legs', boxes: [[0, 22, 4, 12, 4]], elements: [9, 10] }
];
// 26.3 baby villager, reconstructed from the villager_baby texture layout.
const BABY_PARTS = [
    { name: 'Head', boxes: [[0, 0, 8, 8, 7]], elements: [0] }, { name: 'Nose', boxes: [[24, 0, 2, 2, 1]], elements: [1] },
    { name: 'Body', boxes: [[0, 15, 4, 4, 3]], elements: [2] }, { name: 'Arms', boxes: [[16, 15, 4, 2, 3], [36, 15, 2, 4, 2]], elements: [3, 4, 5] },
    { name: 'Legs', boxes: [[0, 22, 2, 4, 2], [8, 22, 2, 4, 2]], elements: [6, 7] }
];
function babyElements() {
    return [
        entityBox(-4, -8, -3.5, 8, 8, 7, 0, 0), entityBox(-1, -3, -4.5, 2, 2, 1, 24, 0), entityBox(-2, 0, -1.5, 4, 4, 3, 0, 15),
        withPivot(entityBox(-2, 2, -2.5, 4, 2, 3, 16, 15), [0, 1, -0.5], 'x', -0.75),
        withPivot(entityBox(-4, 0.5, -1.5, 2, 4, 2, 36, 15), [0, 1, -0.5], 'x', -0.75),
        withPivot(entityBox(2, 0.5, -1.5, 2, 4, 2, 36, 15), [0, 1, -0.5], 'x', -0.75),
        entityBox(-2, 4, -1, 2, 4, 2, 0, 22), entityBox(0, 4, -1, 2, 4, 2, 8, 22)
    ];
}
const PART_COLORS = ['#ff5c5c', '#ffb020', '#f0e040', '#40d0ff', '#60e060', '#b070ff', '#ff70c0', '#80a0ff'];

const CUBE = [['front', 'north'], ['back', 'south'], ['left', 'east'], ['right', 'west'], ['top', 'up'], ['bottom', 'down']];
const FALLBACKS = { front: ['back', 'left', 'right', 'top', 'bottom'], back: ['left', 'right', 'front', 'top', 'bottom'], left: ['right', 'back', 'front', 'top', 'bottom'],
    right: ['left', 'back', 'front', 'top', 'bottom'], top: ['bottom', 'front', 'back', 'left', 'right'], bottom: ['top', 'front', 'back', 'left', 'right'] };

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const title = v => String(v).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
const rgba = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const loadImage = src => new Promise(resolve => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });
const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

class Viewer {
    constructor(host, canvas, handlers) {
        Object.assign(this, { host, canvas, handlers, yaw: 20, pitch: 15, distance: 1.6, pan: [0, 0, 0], group: null, frame: 0, paintMode: false, grid: true, size: 1 });
        let mode = null, lastX = 0, lastY = 0, moved = 0;
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        canvas.addEventListener('pointerdown', e => {
            e.preventDefault(); canvas.setPointerCapture(e.pointerId);
            lastX = e.clientX; lastY = e.clientY; moved = 0;
            if (this.paintMode) mode = e.button === 0 ? 'paint' : e.button === 2 ? 'rotate' : 'pan';
            else mode = e.button === 0 ? 'rotate' : 'pan';
            if (mode === 'paint') this.handlers.paint(this.hit(e), 'start', e);
        });
        canvas.addEventListener('pointermove', e => {
            if (!mode) return;
            const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
            if (mode === 'paint') { this.handlers.paint(this.hit(e), 'move', e); return; }
            if (mode === 'rotate') { this.yaw -= dx * 0.5; this.pitch = Math.max(-89, Math.min(89, this.pitch + dy * 0.5)); this.handlers.rotate(this.yaw, this.pitch); }
            else this.panBy(dx, dy);
            this.render();
        });
        const end = e => {
            if (mode === 'rotate' && moved < 4 && !this.paintMode) { const hit = this.hit(e); if (hit) this.handlers.pick(hit); }
            if (mode === 'paint') this.handlers.paint(null, 'end', e);
            mode = null;
        };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', () => { mode = null; });
        canvas.addEventListener('wheel', e => { e.preventDefault(); this.distance = Math.max(0.35, Math.min(8, this.distance * (e.deltaY > 0 ? 1.1 : 0.9))); this.render(); }, { passive: false });
        new ResizeObserver(() => this.render()).observe(host);
        document.addEventListener('fullscreenchange', () => this.render());
    }
    panBy(dx, dy) {
        const s = this.distance * 0.0016 * this.size, T = this.THREE;
        const right = new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(-dx * s);
        const up = new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).multiplyScalar(dy * s);
        this.pan = [this.pan[0] + right.x + up.x, this.pan[1] + right.y + up.y, this.pan[2] + right.z + up.z];
    }
    async setModel(elements, textures, uvScale, gridSizes) {
        const { THREE, group } = await buildModel(elements, textures, uvScale);
        this.THREE = THREE;
        if (!this.renderer) {
            this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
            if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
        }
        if (this.group) { this.scene.remove(this.group); this.group.traverse(o => o.geometry && o.geometry.dispose()); }
        const box = new THREE.Box3().setFromObject(group);
        group.position.sub(box.getCenter(new THREE.Vector3()));
        this.size = box.getSize(new THREE.Vector3()).length();
        [...group.children].forEach(mesh => {
            const size = gridSizes(mesh.userData.textureRef);
            if (!size) return;
            const overlay = new THREE.Mesh(mesh.geometry, gridMaterial(THREE, size[0], size[1]));
            overlay.userData.grid = true;
            overlay.renderOrder = 1;
            mesh.add(overlay);
        });
        this.group = group;
        this.scene.add(group);
        this.setGrid(this.grid);
    }
    setGrid(on) { this.grid = on; if (this.group) this.group.traverse(o => { if (o.userData.grid) o.visible = on; }); this.render(); }
    refresh() { if (this.group) { this.group.traverse(o => { if (!o.userData.grid && o.material && o.material.map) o.material.map.needsUpdate = true; }); this.render(); } }
    render() {
        if (this.frame || !this.renderer) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            const w = this.host.clientWidth, h = this.host.clientHeight;
            if (!w || !h) return;
            this.renderer.setPixelRatio(window.devicePixelRatio || 1);
            this.renderer.setSize(w, h, false);
            this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
            const yaw = this.yaw * Math.PI / 180, pitch = this.pitch * Math.PI / 180, r = this.distance * this.size, t = new this.THREE.Vector3(...this.pan);
            this.camera.position.set(t.x + r * Math.cos(pitch) * Math.sin(yaw), t.y + r * Math.sin(pitch), t.z + r * Math.cos(pitch) * Math.cos(yaw));
            this.camera.lookAt(t);
            this.renderer.render(this.scene, this.camera);
        });
    }
    hit(e) {
        if (!this.group || !e) return null;
        const rect = this.canvas.getBoundingClientRect(), ray = new this.THREE.Raycaster();
        ray.setFromCamera(new this.THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
        return ray.intersectObjects(this.group.children, false).find(h => h.uv) || null;
    }
}

const gridCache = new Map();
function gridMaterial(THREE, w, h) {
    const key = w + 'x' + h;
    if (!gridCache.has(key)) {
        const scale = Math.max(4, Math.min(16, Math.floor(1024 / Math.max(w, h))));
        const c = newCanvas(w * scale, h * scale), x = c.getContext('2d');
        const lines = (offset, colour) => {
            x.strokeStyle = colour; x.lineWidth = 1; x.beginPath();
            for (let i = 0; i <= w; i++) { x.moveTo(i * scale + offset, 0); x.lineTo(i * scale + offset, c.height); }
            for (let j = 0; j <= h; j++) { x.moveTo(0, j * scale + offset); x.lineTo(c.width, j * scale + offset); }
            x.stroke();
        };
        lines(0.5, 'rgba(0,0,0,0.5)');
        lines(1.5, 'rgba(255,255,255,0.35)');
        const texture = new THREE.CanvasTexture(c);
        texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
        gridCache.set(key, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
    }
    return gridCache.get(key);
}

let dialog, state, viewer;
const q = name => dialog.querySelector(`[data-te="${name}"]`);

function ui() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'tex-editor';
    dialog.innerHTML = `
      <div class="te-head">
        <strong data-te="title">Texture</strong>
        <div class="te-actions">
          <button type="button" class="link" data-te-act="undo" title="Undo (Ctrl+Z)">Undo</button>
          <button type="button" class="link" data-te-act="redo" title="Redo (Ctrl+Y)">Redo</button>
          <button type="button" class="link" data-te-act="import">Import PNG</button>
          <button type="button" class="link" data-te-act="copy-sibling" hidden>Copy Villager Texture</button>
          <button type="button" class="link" data-te-act="zombify" hidden title="Darken and tear the texture like vanilla zombie villager type textures">Zombify</button>
          <button type="button" class="link danger" data-te-act="clear">Clear</button>
          <button type="button" class="link" data-te-act="close">Cancel</button>
          <button type="button" class="button small" data-te-act="save">Save</button>
        </div>
      </div>
      <div class="te-body">
        <div class="te-tools">
          ${[['pencil', 'Pencil', 'B'], ['eraser', 'Eraser', 'E'], ['fill', 'Fill', 'G'], ['picker', 'Picker', 'I'], ['line', 'Line', 'L']]
              .map(([t, label, key]) => `<button type="button" data-te-tool="${t}" title="${label} (${key})">${label}<kbd>${key}</kbd></button>`).join('')}
          <label class="te-field">Colour<input type="color" data-te="color" value="#3c8527"></label>
          <label class="te-field">Opacity<input type="range" data-te="alpha" min="0" max="255" value="255"></label>
          <label class="te-field">Brush Size<select data-te="size"><option>1</option><option>2</option><option>3</option></select></label>
          <div class="te-swatches" data-te="swatches"></div>
          <label class="check"><input type="checkbox" data-te="mirror"> Mirror X</label>
          <label class="check"><input type="checkbox" data-te="grid" checked> Grid</label>
          <label class="te-field">Zoom<input type="range" data-te="zoom" min="2" max="48" value="8"></label>
        </div>
        <div class="te-stage"><div class="te-canvas-wrap"><canvas data-te="canvas"></canvas><canvas data-te="overlay"></canvas></div></div>
        <div class="te-side">
          <div class="te-slots" data-te="slots"></div>
          <div class="te-slot-options" data-te="slot-options">
            <label class="te-field">Texture Size<select data-te="tex-size"><option>16</option><option>32</option><option>64</option><option>128</option></select></label>
            <label class="te-field" data-te="mode-row">Painting Applies To<select data-te="face-mode">
              <option value="only">This face only</option><option value="fallback">This face, empty faces preview it</option><option value="all">All faces at once</option></select></label>
          </div>
          <div class="te-viewer" data-te="viewer"><canvas data-te="gl"></canvas>
            <div class="te-viewer-tools">
              <button type="button" data-te-act="paint-mode" title="Paint on the model">Paint</button>
              <button type="button" data-te-act="model-grid" class="active" title="Show the pixel grid on the model">Grid</button>
              <button type="button" data-te-act="reset-view" title="Reset the view">Reset</button>
              <button type="button" data-te-act="fullscreen" title="Fullscreen">⤢</button>
            </div>
            <span class="te-viewer-help" data-te="viewer-help"></span></div>
          <img class="te-flat" data-te="preview" alt="">
          <label class="te-field" data-te="rot-row">Horizontal Rotation<input type="range" data-te="rot" min="-180" max="180" value="20"></label>
          <label class="te-field" data-te="pitch-row">Vertical Rotation<input type="range" data-te="pitch" min="-89" max="89" value="15"></label>
          <label class="check" data-te="base-row"><input type="checkbox" data-te="base" checked> Show Base Villager</label>
          <div class="te-parts" data-te="parts"></div>
        </div>
      </div>
      <input type="file" accept="image/png" data-te="file" hidden>`;
    document.body.appendChild(dialog);
    wire();
    return dialog;
}

/* ---------- pixel operations on the active canvas ---------- */

function snapshot() {
    state.undo.push(state.ctx.getImageData(0, 0, state.w, state.h));
    if (state.undo.length > 100) state.undo.shift();
    state.redo.length = 0;
}
function restore(from, to) {
    const image = from.pop();
    if (!image) return;
    to.push(state.ctx.getImageData(0, 0, state.w, state.h));
    state.ctx.putImageData(image, 0, 0);
    changed();
}
function setPixel(x, y, color) {
    const size = Number(q('size').value), points = [];
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) points.push([x + dx, y + dy]);
    if (q('mirror').checked) points.push(...points.map(([px, py]) => [state.w - 1 - px, py]));
    for (const [px, py] of points) {
        if (px < 0 || py < 0 || px >= state.w || py >= state.h) continue;
        state.ctx.clearRect(px, py, 1, 1);
        if (color) { state.ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${color[3] / 255})`; state.ctx.fillRect(px, py, 1, 1); }
    }
}
function line(x0, y0, x1, y1, color) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
        setPixel(x0, y0, color);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}
function fill(x, y, color) {
    const image = state.ctx.getImageData(0, 0, state.w, state.h), d = image.data, at = (px, py) => (py * state.w + px) * 4;
    const target = d.slice(at(x, y), at(x, y) + 4), next = color || [0, 0, 0, 0];
    if (next.every((v, i) => v === target[i])) return;
    const same = i => d[i] === target[0] && d[i + 1] === target[1] && d[i + 2] === target[2] && d[i + 3] === target[3];
    const stack = [[x, y]];
    while (stack.length) {
        const [px, py] = stack.pop();
        if (px < 0 || py < 0 || px >= state.w || py >= state.h) continue;
        const i = at(px, py);
        if (!same(i)) continue;
        d.set(next, i);
        stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    state.ctx.putImageData(image, 0, 0);
}
const currentColor = () => [...rgba(q('color').value).slice(0, 3), Number(q('alpha').value)];
function remember(color) {
    const h = hex(color);
    state.recent = [h, ...state.recent.filter(c => c !== h)].slice(0, 16);
    q('swatches').innerHTML = state.recent.map(c => `<button type="button" style="background:${c}" data-swatch="${c}" title="${c}"></button>`).join('');
}
function pick(x, y) {
    const [r, g, b, a] = state.ctx.getImageData(x, y, 1, 1).data;
    if (a) { q('color').value = hex([r, g, b]); q('alpha').value = a; }
}
function applyTool(x, y, phase, last) {
    if (state.tool === 'picker') { if (phase === 'start') pick(x, y); return; }
    const color = state.tool === 'eraser' ? null : currentColor();
    if (phase === 'start') { snapshot(); if (color) remember(color); }
    if (state.tool === 'fill') { if (phase === 'start') fill(x, y, color); }
    else if (last && phase === 'move') line(last[0], last[1], x, y, color);
    else setPixel(x, y, color);
    changed();
}

/* ---------- slots (workstation faces or model texture keys) ---------- */

function hasContent(canvas) {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
    return false;
}

function storeActive() {
    if (!state.slots) return;
    const slot = state.slots[state.slot];
    slot.canvas.getContext('2d').clearRect(0, 0, slot.canvas.width, slot.canvas.height);
    slot.canvas.getContext('2d').drawImage(state.canvas, 0, 0);
    if (state.faceMode === 'all' && state.cube) {
        for (const [key, other] of Object.entries(state.slots)) {
            if (key === state.slot) continue;
            if (other.canvas.width !== slot.canvas.width) resizeSlot(key, slot.canvas.width);
            const c = other.canvas.getContext('2d'); c.clearRect(0, 0, other.canvas.width, other.canvas.height); c.drawImage(slot.canvas, 0, 0);
        }
    }
}

function resizeSlot(key, size) {
    const slot = state.slots[key], old = slot.canvas, next = newCanvas(size, size);
    const c = next.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(old, 0, 0, size, size);
    slot.canvas = next;
    slot.display = newCanvas(size, size);
    registerCanvasTexture('canvas:te-slot-' + key, slot.display);
    slot.history = [];
}

function selectSlot(key, keepView) {
    if (!state.slots || !state.slots[key] || key === state.slot) return;
    storeActive();
    state.slot = key;
    loadSlot();
    if (!keepView) buildViewerModel();
}

function loadSlot() {
    const slot = state.slots[state.slot];
    state.w = slot.canvas.width; state.h = slot.canvas.height;
    state.canvas.width = state.w; state.canvas.height = state.h;
    state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
    state.ctx.drawImage(slot.canvas, 0, 0);
    state.undo = slot.history; state.redo = [];
    q('tex-size').value = String(state.w);
    q('slots').querySelectorAll('[data-slot]').forEach(b => b.classList.toggle('active', b.dataset.slot === state.slot));
    setTitle();
    state.zoom = Math.max(2, Math.floor(480 / Math.max(state.w, state.h)));
    q('zoom').value = state.zoom;
    layout();
}

function updateTextures() {
    const model = state.kind.model;
    if (model === 'villager' || model === 'baby') {
        const c = state.display.getContext('2d');
        c.clearRect(0, 0, state.w, state.h);
        if (q('base').checked && state.baseCanvas) c.drawImage(state.baseCanvas, 0, 0, state.w, state.h);
        c.drawImage(state.canvas, 0, 0);
    } else if (model === 'block') {
        storeActive();
        for (const [key, slot] of Object.entries(state.slots)) {
            let source = slot.canvas;
            if (state.cube && state.faceMode === 'fallback' && !hasContent(slot.canvas)) {
                const other = FALLBACKS[key].find(k => hasContent(state.slots[k].canvas));
                if (other) source = state.slots[other].canvas;
            }
            if (slot.display.width !== source.width || slot.display.height !== source.height) {
                slot.display = newCanvas(source.width, source.height);
                registerCanvasTexture('canvas:te-slot-' + key, slot.display);
                state.rebuild = true;
            }
            const c = slot.display.getContext('2d'); c.clearRect(0, 0, slot.display.width, slot.display.height); c.drawImage(source, 0, 0);
        }
    }
}

// Elements for a block model: its own elements, or a cube from a common parent.
function blockElements(model) {
    if (model && Array.isArray(model.elements) && model.elements.length) return model.elements;
    const t = (model && model.textures) || {};
    const has = k => t[k] !== undefined;
    const pick = (...keys) => '#' + (keys.find(has) || Object.keys(t).find(k => k !== 'particle') || 'front');
    const faces = {
        north: pick('north', 'front', 'side', 'all'), south: pick('south', 'back', 'side', 'all'), east: pick('east', 'side', 'all'),
        west: pick('west', 'side', 'all'), up: pick('up', 'top', 'end', 'all'), down: pick('down', 'bottom', 'end', 'all')
    };
    return [{ from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries(Object.entries(faces).map(([dir, texture]) => [dir, { uv: [0, 0, 16, 16], texture }])) }];
}

async function buildViewerModel() {
    const model = state.kind.model;
    if (model === 'villager' || model === 'baby') {
        const list = parts();
        const hidden = new Set(list.flatMap((part, i) => (state.visible[i] ? [] : part.elements)));
        const source = state.live ? state.live.elements : model === 'baby' ? babyElements() : villagerElements();
        const elements = source.filter((_, i) => !hidden.has(i));
        await viewer.setModel(elements, { t: 'canvas:te-entity' }, [4, 4], () => [state.w, state.h]);
    } else if (model === 'block') {
        const textures = Object.fromEntries(Object.keys(state.slots).map(key => [key, 'canvas:te-slot-' + key]));
        const elements = state.cube
            ? [{ from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries(CUBE.map(([face, dir]) => [dir, { uv: [0, 0, 16, 16], texture: '#' + face }])) }]
            : blockElements(state.options.model);
        await viewer.setModel(elements, textures, [1, 1], ref => (state.slots[ref] ? [state.slots[ref].display.width, state.slots[ref].display.height] : null));
    }
    viewer.refresh();
}

let previewTimer = 0;
function changed() { clearTimeout(previewTimer); previewTimer = setTimeout(preview, 30); }
function preview() {
    if (!state.kind.model) { q('preview').src = state.canvas.toDataURL(); return; }
    updateTextures();
    if (state.rebuild) { state.rebuild = false; buildViewerModel(); return; }
    viewer.refresh();
}

/* ---------- 2D canvas and overlay ---------- */

function parts() {
    if (state.live) return state.live.groups.map(g => ({ name: title(g.name), boxes: g.boxes.map(([u, v, w, h, d]) => [u, v, w, h, d]), elements: g.elements }));
    return state.kind.model === 'baby' ? BABY_PARTS : state.kind.model === 'villager' ? ADULT_PARTS : [];
}

function drawOverlay() {
    const o = q('overlay'), z = state.zoom;
    o.width = state.w * z; o.height = state.h * z;
    const c = o.getContext('2d');
    if (q('grid').checked && z >= 4) {
        c.strokeStyle = 'rgba(128,128,128,0.3)'; c.lineWidth = 1; c.beginPath();
        for (let x = 0; x <= state.w; x++) { c.moveTo(x * z + 0.5, 0); c.lineTo(x * z + 0.5, o.height); }
        for (let y = 0; y <= state.h; y++) { c.moveTo(0, y * z + 0.5); c.lineTo(o.width, y * z + 0.5); }
        c.stroke();
    }
    parts().forEach((part, i) => {
        if (!state.outline[i]) return;
        c.strokeStyle = PART_COLORS[i % PART_COLORS.length]; c.lineWidth = 2;
        for (const [u, v, w, h, d] of part.boxes) c.strokeRect(u * z + 1, v * z + 1, (2 * d + 2 * w) * z - 2, (d + h) * z - 2);
    });
}
function layout() {
    const canvas = q('canvas'), z = state.zoom;
    canvas.style.width = state.w * z + 'px'; canvas.style.height = state.h * z + 'px';
    q('overlay').style.width = canvas.style.width; q('overlay').style.height = canvas.style.height;
    drawOverlay();
}
function setTitle() {
    const bits = [state.options.title ? title(state.options.title) : state.kind.label];
    if (state.slots) bits.push(title(state.slot));
    bits.push(`${state.w}×${state.h}`);
    q('title').textContent = bits.join(' · ');
}

// Vanilla zombie villager type textures are the normal ones darkened a little, slightly desaturated and torn:
// edge pixels and a few inner pixels are removed. Profession textures are identical to the normal ones.
function zombifyData(data, w, h) {
    let seed = 1337;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const alpha = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]);
    const remove = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (!data[i + 3]) continue;
            const edge = !alpha(x - 1, y) || !alpha(x + 1, y) || !alpha(x, y - 1) || !alpha(x, y + 1);
            if (rand() < (edge ? 0.3 : 0.04)) { remove.push(i); continue; }
            const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255, max = Math.max(r, g, b), min = Math.min(r, g, b);
            const v = max * (0.88 + rand() * 0.04), s = (max ? (max - min) / max : 0) * 0.9;
            let hue = 0;
            if (max !== min) hue = ((max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min)) * 60 + 360) % 360;
            const f = n => { const k = (n + hue / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
            data[i] = Math.round(f(5) * 255); data[i + 1] = Math.round(f(3) * 255); data[i + 2] = Math.round(f(1) * 255);
        }
    }
    for (const i of remove) data[i + 3] = 0;
    return data;
}

function zombify() {
    snapshot();
    const image = state.ctx.getImageData(0, 0, state.w, state.h);
    zombifyData(image.data, state.w, state.h);
    state.ctx.putImageData(image, 0, 0);
    changed();
}

export async function zombifyUrl(url) {
    const img = await loadImage(url);
    if (!img) return url;
    const c = newCanvas(img.width, img.height), x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const image = x.getImageData(0, 0, c.width, c.height);
    zombifyData(image.data, c.width, c.height);
    x.putImageData(image, 0, 0);
    return c.toDataURL('image/png');
}

function setTool(tool) {
    state.tool = tool;
    dialog.querySelectorAll('[data-te-tool]').forEach(b => b.classList.toggle('active', b.dataset.teTool === tool));
}

function wire() {
    const canvas = q('canvas');
    let drawing = false, last = null, start = null, saved = null;
    const cell = e => { const r = canvas.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * state.w), Math.floor((e.clientY - r.top) / r.height * state.h)]; };
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
        const [x, y] = cell(e);
        if (e.button === 2) { pick(x, y); return; }
        canvas.setPointerCapture(e.pointerId);
        if (state.tool === 'line') { snapshot(); saved = state.ctx.getImageData(0, 0, state.w, state.h); start = [x, y]; drawing = true; return; }
        applyTool(x, y, 'start'); drawing = state.tool !== 'fill' && state.tool !== 'picker'; last = [x, y];
    });
    canvas.addEventListener('pointermove', e => {
        if (!drawing) return;
        const [x, y] = cell(e);
        if (state.tool === 'line') { state.ctx.putImageData(saved, 0, 0); line(start[0], start[1], x, y, currentColor()); changed(); }
        else applyTool(x, y, 'move', last);
        last = [x, y];
    });
    const end = () => { drawing = false; saved = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    dialog.querySelector('.te-stage').addEventListener('wheel', e => {
        e.preventDefault();
        state.zoom = Math.max(2, Math.min(48, state.zoom + (e.deltaY < 0 ? 1 : -1) * Math.max(1, Math.round(state.zoom / 6))));
        q('zoom').value = state.zoom; layout();
    }, { passive: false });

    dialog.addEventListener('click', e => {
        const tool = e.target.closest('[data-te-tool]');
        if (tool) return setTool(tool.dataset.teTool);
        const swatch = e.target.closest('[data-swatch]');
        if (swatch) { q('color').value = swatch.dataset.swatch; return; }
        const slot = e.target.closest('[data-slot]');
        if (slot) return selectSlot(slot.dataset.slot);
        const act = e.target.closest('[data-te-act]');
        if (!act) return;
        const a = act.dataset.teAct;
        if (a === 'undo') restore(state.undo, state.redo);
        if (a === 'redo') restore(state.redo, state.undo);
        if (a === 'clear') { snapshot(); state.ctx.clearRect(0, 0, state.w, state.h); changed(); }
        if (a === 'import') q('file').click();
        if (a === 'zombify') zombify();
        if (a === 'copy-sibling' && state.options.sibling) loadImage(state.options.sibling).then(img => {
            if (!img) return;
            snapshot(); state.ctx.clearRect(0, 0, state.w, state.h); state.ctx.drawImage(img, 0, 0, state.w, state.h);
            if (state.typeTexture) { state.undo.pop(); zombify(); } else changed();
        });
        if (a === 'paint-mode') { viewer.paintMode = !viewer.paintMode; act.classList.toggle('active', viewer.paintMode); helpText(); }
        if (a === 'model-grid') { act.classList.toggle('active'); viewer.setGrid(act.classList.contains('active')); }
        if (a === 'reset-view') { viewer.pan = [0, 0, 0]; viewer.distance = state.kind.model === 'block' ? 1.9 : 1.5; viewer.render(); }
        if (a === 'fullscreen') { const v = q('viewer'); document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen && v.requestFullscreen(); }
        if (a === 'close') dialog.close();
        if (a === 'save') save();
    });
    q('file').addEventListener('change', async e => {
        const file = e.target.files[0]; e.target.value = '';
        const img = file && await loadImage(URL.createObjectURL(file));
        if (!img) return;
        snapshot(); state.ctx.clearRect(0, 0, state.w, state.h); state.ctx.drawImage(img, 0, 0, state.w, state.h); changed();
    });
    q('zoom').addEventListener('input', () => { state.zoom = Number(q('zoom').value); layout(); });
    q('grid').addEventListener('input', drawOverlay);
    q('rot').addEventListener('input', () => { viewer.yaw = Number(q('rot').value); viewer.render(); });
    q('pitch').addEventListener('input', () => { viewer.pitch = Number(q('pitch').value); viewer.render(); });
    q('base').addEventListener('input', changed);
    q('face-mode').addEventListener('change', () => { state.faceMode = q('face-mode').value; changed(); });
    q('tex-size').addEventListener('change', () => {
        storeActive();
        resizeSlot(state.slot, Number(q('tex-size').value));
        loadSlot();
        buildViewerModel();
    });
    q('parts').addEventListener('change', e => {
        const i = Number(e.target.dataset.part);
        if (e.target.dataset.kind === 'outline') { state.outline[i] = e.target.checked; drawOverlay(); }
        else { state.visible[i] = e.target.checked; buildViewerModel(); }
    });
    dialog.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' && !['range', 'checkbox', 'color'].includes(e.target.type)) return;
        const k = e.key.toLowerCase(), keys = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker', l: 'line' };
        if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? restore(state.redo, state.undo) : restore(state.undo, state.redo); }
        else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); restore(state.redo, state.undo); }
        else if (!e.ctrlKey && !e.metaKey && keys[k]) setTool(keys[k]);
    });
}

function helpText() {
    q('viewer-help').textContent = viewer && viewer.paintMode
        ? 'Paint: left click · rotate: right drag · pan: middle drag · zoom: scroll'
        : 'Rotate: drag · pan: right or middle drag · zoom: scroll · click a face to edit it';
}

let lastModelPixel = null;
function paintOnModel(hit, phase) {
    if (phase === 'end') { lastModelPixel = null; return; }
    if (!hit) return;
    const ref = hit.object.userData.textureRef;
    if (state.slots && ref && state.slots[ref] && ref !== state.slot) { selectSlot(ref, true); lastModelPixel = null; phase = 'start'; }
    const x = Math.min(state.w - 1, Math.floor(hit.uv.x * state.w)), y = Math.min(state.h - 1, Math.floor((1 - hit.uv.y) * state.h));
    if (lastModelPixel && lastModelPixel[0] === x && lastModelPixel[1] === y) return;
    if (phase === 'move' && !lastModelPixel) phase = 'start';
    applyTool(x, y, phase, lastModelPixel);
    lastModelPixel = [x, y];
}

function save() {
    if (state.kind.model === 'block') {
        storeActive();
        const out = {};
        for (const [key, slot] of Object.entries(state.slots)) if (hasContent(slot.canvas)) out[key] = slot.canvas.toDataURL('image/png');
        if (state.cube) state.options.onSave(out[state.slot] || null, out, null);
        else state.options.onSave(null, null, out);
    } else {
        state.options.onSave(state.canvas.toDataURL('image/png'));
    }
    dialog.close();
}

export async function open(options) {
    ui();
    const kind = KINDS[options.kind] || KINDS.icon;
    state = { options, kind, w: kind.w, h: kind.h, undo: [], redo: [], recent: [], tool: 'pencil', canvas: q('canvas'), ctx: null, faceMode: 'only',
        zoom: Math.max(2, Math.floor(480 / Math.max(kind.w, kind.h))), outline: PART_COLORS.map(() => true), visible: PART_COLORS.map(() => true) };
    state.canvas.width = kind.w; state.canvas.height = kind.h;
    state.ctx = state.canvas.getContext('2d', { willReadFrequently: true });
    const entity = kind.model === 'villager' || kind.model === 'baby', block = kind.model === 'block';

    if (!block && options.src) { const img = await loadImage(options.src); if (img) state.ctx.drawImage(img, 0, 0, kind.w, kind.h); }
    if (block) {
        state.cube = !options.model;
        const sources = state.cube ? options.faces || {} : options.modelTextures || {};
        const keys = state.cube ? CUBE.map(([face]) => face) : Object.keys(sources);
        if (!keys.length) keys.push('texture');
        state.slots = {};
        for (const key of keys) {
            const img = sources[key] ? await loadImage(sources[key]) : null;
            const size = img ? Math.max(img.width, 16) : 16;
            const canvas = newCanvas(size, img ? img.height : size);
            if (img) canvas.getContext('2d').drawImage(img, 0, 0);
            const display = newCanvas(canvas.width, canvas.height);
            registerCanvasTexture('canvas:te-slot-' + key, display);
            state.slots[key] = { canvas, display, history: [] };
        }
        state.slot = keys.includes(options.face) ? options.face : keys[0];
        q('slots').innerHTML = keys.map(key => `<button type="button" data-slot="${esc(key)}">${esc(title(key))}</button>`).join('');
        loadSlot();
    }

    q('title').textContent = '';
    if (!block) setTitle();
    q('swatches').innerHTML = '';
    state.typeTexture = ['type', 'zombie_type', 'baby', 'baby_zombie'].includes(options.kind);
    const zombifyButton = dialog.querySelector('[data-te-act="zombify"]');
    zombifyButton.hidden = !entity;
    zombifyButton.title = state.typeTexture
        ? 'Darken and tear the texture like vanilla zombie villager type textures'
        : 'Darken and tear this overlay. Vanilla zombie villagers use the same profession overlay, unchanged';
    dialog.querySelector('[data-te-act="copy-sibling"]').hidden = !(kind.zombie && options.sibling);
    q('slots').hidden = !block; q('slot-options').hidden = !block; q('mode-row').hidden = !(block && state.cube);
    q('face-mode').value = 'only';
    q('base-row').hidden = !entity;
    q('rot-row').hidden = q('pitch-row').hidden = q('viewer').hidden = !kind.model;
    q('preview').hidden = !!kind.model;
    state.live = null;
    const version = options.version || '26.3';
    if (entity && (version === '26.3' || kind.model !== 'baby')) {
        const liveKind = { villager: 'villager', type: 'villager', zombie: 'zombie', zombie_type: 'zombie', baby: 'baby', baby_zombie: 'baby_zombie' }[options.kind];
        state.live = await villagerModel(liveKind, version, entityBox, withPivot);
    }
    state.outline = parts().map(() => true); state.visible = parts().map(() => true);
    const partList = parts();
    q('parts').innerHTML = partList.length ? `<p class="te-parts-head"><span>Part</span><span>Outline</span><span>Show</span></p>` + partList.map((part, i) =>
        `<p><span><span style="color:${PART_COLORS[i % PART_COLORS.length]}">■</span> ${esc(part.name)}</span><input type="checkbox" data-part="${i}" data-kind="outline" checked><input type="checkbox" data-part="${i}" data-kind="visible" checked></p>`).join('') : '';
    setTool('pencil');
    layout();
    if (!dialog.open) dialog.showModal();

    if (kind.model) {
        configure({ version: options.version || '26.3', local: {} });
        if (!viewer) {
            viewer = new Viewer(q('viewer'), q('gl'), {
                rotate: (yaw, pitch) => { q('rot').value = ((yaw + 540) % 360) - 180; q('pitch').value = pitch; },
                pick: hit => { if (state.slots && state.slots[hit.object.userData.textureRef]) selectSlot(hit.object.userData.textureRef); },
                paint: paintOnModel
            });
        }
        viewer.paintMode = false;
        dialog.querySelector('[data-te-act="paint-mode"]').classList.remove('active');
        viewer.yaw = block ? 35 : 200; viewer.pitch = block ? 25 : 8; viewer.pan = [0, 0, 0]; viewer.distance = block ? 1.9 : 1.5;
        q('rot').value = ((viewer.yaw + 540) % 360) - 180; q('pitch').value = viewer.pitch;
        helpText();
        if (entity) {
            state.baseCanvas = await composeTextures(kind.base);
            state.display = newCanvas(kind.w, kind.h);
            registerCanvasTexture('canvas:te-entity', state.display);
        }
        updateTextures();
        await buildViewerModel();
    }
    preview();
}

window.TextureEditor = { open, zombify: zombifyUrl };
