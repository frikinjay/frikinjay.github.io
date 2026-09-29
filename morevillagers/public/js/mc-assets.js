const REPOSITORY = 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets';
const ICON_SIZE = 96;
const FACE_SHADE = { up: 1, down: 0.5, north: 0.8, south: 0.8, east: 0.6, west: 0.6 };
const DEFAULT_TINT = 0x48b518;
const CACHE_PREFIX = 'mcicon:v12:';
const MAX_ANIMATION_STATES = 64;
const MAX_ANIMATION_TICKS = 2400;
const canvasTextures = new Map();

export function registerCanvasTexture(id, canvas) {
    canvasTextures.set(id, canvas);
}

const config = { version: '26.3', local: {} };
const jsonCache = new Map();
const imageCache = new Map();
const iconCache = new Map();

let threePromise = null;
let three = null;
let queue = Promise.resolve();

export function configure(options) {
    Object.assign(config, options);
}

export function splitId(id, fallbackNamespace = 'minecraft') {
    const value = String(id).replace(/^#/, '');
    const index = value.indexOf(':');
    return index === -1
        ? { ns: fallbackNamespace, path: value }
        : { ns: value.slice(0, index), path: value.slice(index + 1) };
}

export function assetUrl(ns, path) {
    if (ns === 'minecraft') return `${REPOSITORY}/${config.version}/assets/minecraft/${path}`;
    const base = config.local[ns];
    return base ? `${base}/${ns}/${path}` : null;
}

export function fetchJson(url) {
    if (!url) return Promise.resolve(null);
    if (!jsonCache.has(url)) {
        jsonCache.set(url, fetch(url).then(response => (response.ok ? response.json() : null)).catch(() => null));
    }
    return jsonCache.get(url);
}

function loadImage(url) {
    if (!url) return Promise.resolve(null);
    if (!imageCache.has(url)) {
        imageCache.set(url, new Promise(resolve => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.decoding = 'async';
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = url;
        }));
    }
    return imageCache.get(url);
}

function textureUrl(id) {
    const { ns, path } = splitId(id);
    return assetUrl(ns, `textures/${path}.png`);
}

function firstFrame(image) {
    const width = image.width;
    const height = image.height > image.width ? image.width : image.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0, width, height, 0, 0, width, height);
    return canvas;
}

const animationCache = new Map();

function loadAnimation(url) {
    if (!url) return Promise.resolve(null);
    if (!animationCache.has(url)) {
        animationCache.set(url, fetchJson(url + '.mcmeta').then(meta => (meta && meta.animation ? meta.animation : null)));
    }
    return animationCache.get(url);
}

function animationInfo(image, animation) {
    if (!image || !animation) return null;
    const width = animation.width || (animation.height ? image.width : Math.min(image.width, image.height));
    const height = animation.height || width;
    const columns = Math.max(1, Math.floor(image.width / width));
    const count = Math.max(1, columns * Math.max(1, Math.floor(image.height / height)));
    if (count < 2) return null;
    const frameTime = Math.max(1, animation.frametime || 1);
    const list = Array.isArray(animation.frames) && animation.frames.length ? animation.frames : [...Array(count).keys()];
    const frames = list.map(frame => (typeof frame === 'number'
        ? { index: frame, time: frameTime }
        : { index: frame.index, time: Math.max(1, frame.time || frameTime) })).filter(frame => frame.index < count);
    if (frames.length < 2) return null;
    return { width, height, columns, frames, interpolate: !!animation.interpolate, total: frames.reduce((sum, frame) => sum + frame.time, 0) };
}

function frameOf(image, info, position) {
    if (!info) return firstFrame(image);
    const index = info.frames[position % info.frames.length].index;
    const canvas = document.createElement('canvas');
    canvas.width = info.width;
    canvas.height = info.height;
    canvas.getContext('2d').drawImage(image, (index % info.columns) * info.width, Math.floor(index / info.columns) * info.height,
        info.width, info.height, 0, 0, info.width, info.height);
    return canvas;
}

async function textureSource(id) {
    const url = textureUrl(id);
    const [image, animation] = await Promise.all([loadImage(url), loadAnimation(url)]);
    return { url, image, info: animationInfo(image, animation) };
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

function timeline(infos) {
    if (infos.length === 1) {
        return { states: infos[0].frames.map((frame, index) => [index]), seq: infos[0].frames.map((frame, index) => [index, frame.time]), interpolate: infos[0].interpolate };
    }
    let cycle = infos.reduce((total, info) => total * info.total / gcd(total, info.total), 1);
    if (cycle > MAX_ANIMATION_TICKS) cycle = Math.max(...infos.map(info => info.total));
    const boundaries = new Set([0]);
    for (const info of infos) {
        for (let tick = 0, i = 0; tick < cycle; i++) {
            boundaries.add(tick);
            tick += info.frames[i % info.frames.length].time;
        }
    }
    const ticks = [...boundaries].sort((a, b) => a - b).slice(0, MAX_ANIMATION_STATES);
    const positionAt = (info, tick) => {
        let local = tick % info.total;
        for (let i = 0; i < info.frames.length; i++) {
            if (local < info.frames[i].time) return i;
            local -= info.frames[i].time;
        }
        return 0;
    };
    const states = [];
    const keys = new Map();
    const seq = [];
    ticks.forEach((tick, index) => {
        const state = infos.map(info => positionAt(info, tick));
        const key = state.join(',');
        if (!keys.has(key)) { keys.set(key, states.length); states.push(state); }
        seq.push([keys.get(key), (ticks[index + 1] ?? cycle) - tick]);
    });
    return { states, seq, interpolate: false };
}

async function captureAnimation(sources, size, draw) {
    const plan = timeline(sources.map(source => source.info));
    const strip = document.createElement('canvas');
    strip.width = size;
    strip.height = size * plan.states.length;
    const context = strip.getContext('2d');
    context.imageSmoothingEnabled = false;
    let first = null;
    for (let i = 0; i < plan.states.length; i++) {
        sources.forEach((source, index) => source.apply(plan.states[i][index]));
        const frame = await draw();
        context.drawImage(frame, 0, i * size, size, size);
        if (i === 0) first = frame.toDataURL('image/png');
    }
    return { first, strip: strip.toDataURL('image/png'), frames: plan.states.length, seq: plan.seq, interpolate: plan.interpolate };
}

function tintColor(tint) {
    if (!tint || typeof tint !== 'object') return null;
    const value = tint.value ?? tint.default;
    if (typeof value === 'number') return value & 0xffffff;
    if (Array.isArray(value)) return (Math.round(value[0] * 255) << 16) | (Math.round(value[1] * 255) << 8) | Math.round(value[2] * 255);
    const type = String(tint.type || '').replace('minecraft:', '');
    if (type === 'grass') return 0x7cbd6b;
    if (type === 'foliage') return DEFAULT_TINT;
    return null;
}

function builtinSpecial(path) {
    const heads = { skeleton_skull: 'skeleton', wither_skeleton_skull: 'wither_skeleton', zombie_head: 'zombie', creeper_head: 'creeper', dragon_head: 'dragon', piglin_head: 'piglin', player_head: 'player' };
    if (heads[path]) return { type: 'head', kind: heads[path] };
    if (path === 'chest') return { type: 'chest', texture: 'minecraft:normal' };
    if (path === 'trapped_chest') return { type: 'chest', texture: 'minecraft:trapped' };
    if (path === 'ender_chest') return { type: 'chest', texture: 'minecraft:ender' };
    if (path === 'decorated_pot') return { type: 'decorated_pot' };
    const shulker = path.match(/^(?:(.+)_)?shulker_box$/);
    if (shulker) return { type: 'shulker_box', texture: shulker[1] ? `minecraft:shulker_${shulker[1]}` : 'minecraft:shulker' };
    return null;
}

function pickModel(node) {
    if (!node || typeof node !== 'object') return null;
    const type = String(node.type || 'minecraft:model').replace('minecraft:', '');
    switch (type) {
        case 'model': return { model: node.model, tints: node.tints || [] };
        case 'special': return { model: node.base, special: node.model || null, tints: [] };
        case 'select': {
            const cases = node.cases || [];
            const gui = cases.find(entry => [].concat(entry.when).includes('gui'));
            return pickModel((gui && gui.model) || node.fallback || (cases[0] && cases[0].model));
        }
        case 'condition': return pickModel(node.on_false || node.on_true);
        case 'range_dispatch': return pickModel(node.fallback || (node.entries && node.entries[0] && node.entries[0].model));
        case 'composite': return pickModel(node.models && node.models[0]);
        default: return null;
    }
}

async function resolveModel(modelId) {
    const result = { textures: {}, elements: null, display: {}, generated: false, entity: false };
    let current = modelId;
    let depth = 0;

    while (current && depth++ < 16) {
        const clean = String(current);
        if (clean === 'builtin/generated' || clean === 'minecraft:builtin/generated') { result.generated = true; break; }
        if (clean === 'builtin/entity' || clean === 'minecraft:builtin/entity') { result.entity = true; break; }

        const { ns, path } = splitId(clean);
        const json = await fetchJson(assetUrl(ns, `models/${path}.json`));
        if (!json) break;

        for (const [key, value] of Object.entries(json.textures || {})) {
            if (!(key in result.textures)) result.textures[key] = value;
        }
        if (!result.elements && Array.isArray(json.elements)) result.elements = json.elements;
        for (const [key, value] of Object.entries(json.display || {})) {
            if (!(key in result.display)) result.display[key] = value;
        }
        if (json.parent && /(^|:)item\/generated$/.test(json.parent) && !result.elements) {
            result.generated = true;
        }
        current = json.parent;
    }

    return result;
}

function resolveTexture(textures, reference) {
    let value = reference;
    for (let i = 0; i < 12 && typeof value === 'string' && value.startsWith('#'); i++) {
        value = textures[value.slice(1)];
    }
    return typeof value === 'string' ? value : null;
}

async function describeItem(id, options = {}) {
    const { ns, path } = splitId(id);
    const definition = await fetchJson(assetUrl(ns, `items/${path}.json`));
    let picked = definition ? pickModel(definition.model) : null;

    if (!picked || !picked.model) {
        const itemModel = await fetchJson(assetUrl(ns, `models/item/${path}.json`));
        if (itemModel) {
            picked = { model: `${ns}:item/${path}`, tints: [] };
        } else {
            const blockstate = await fetchJson(assetUrl(ns, `blockstates/${path}.json`));
            const variant = blockstate && blockstate.variants && Object.values(blockstate.variants)[0];
            const model = variant && (Array.isArray(variant) ? variant[0].model : variant.model);
            picked = model ? { model, tints: [] } : { model: `${ns}:block/${path}`, tints: [] };
        }
    }

    if (typeof options.tint === 'number' && (!picked.tints || !picked.tints.length)) {
        picked.tints = [{ type: 'minecraft:potion', default: options.tint }];
    }
    if (typeof options.tint === 'number' && Array.isArray(picked.tints)) {
        picked.tints = picked.tints.map(tint => (tint && /potion/.test(String(tint.type)) ? { type: 'minecraft:constant', value: options.tint } : tint));
    }

    const special = picked.special ? String(picked.special.type || '').replace('minecraft:', '') : null;
    if (special === 'shulker_box' || special === 'decorated_pot' || special === 'chest' || special === 'head') {
        const base = picked.model ? await resolveModel(picked.model) : null;
        return { kind: 'special', special, data: picked.special, display: base && base.display };
    }

    const model = await resolveModel(picked.model);
    if (model.entity) {
        const builtin = builtinSpecial(path);
        if (builtin) return { kind: 'special', special: builtin.type, data: builtin, display: model.display };
    }
    if (model.elements && model.elements.length) {
        return { kind: 'block', model, tints: picked.tints };
    }

    const layers = [];
    for (let i = 0; i < 8; i++) {
        const texture = resolveTexture(model.textures, model.textures[`layer${i}`]);
        if (!texture) break;
        layers.push({ texture, tint: tintColor(picked.tints[i]) });
    }
    if (layers.length) return { kind: 'flat', layers };

    for (const folder of ['item', 'block']) {
        const image = await loadImage(assetUrl(ns, `textures/${folder}/${path}.png`));
        if (image) return { kind: 'flat', layers: [{ texture: `${ns}:${folder}/${path}`, tint: null }] };
    }

    return { kind: 'missing' };
}

async function renderFlat(description) {
    const layers = [];
    for (const layer of description.layers) {
        const source = await textureSource(layer.texture);
        if (source.image) layers.push({ ...layer, ...source, position: 0 });
    }
    if (!layers.length) return null;

    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;

    const draw = async () => {
        context.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
        for (const layer of layers) {
            const frame = frameOf(layer.image, layer.info, layer.position);
            if (layer.tint !== null && layer.tint !== undefined) {
                const tinted = document.createElement('canvas');
                tinted.width = frame.width;
                tinted.height = frame.height;
                const tintContext = tinted.getContext('2d');
                tintContext.drawImage(frame, 0, 0);
                tintContext.globalCompositeOperation = 'multiply';
                tintContext.fillStyle = `#${layer.tint.toString(16).padStart(6, '0')}`;
                tintContext.fillRect(0, 0, tinted.width, tinted.height);
                tintContext.globalCompositeOperation = 'destination-in';
                tintContext.drawImage(frame, 0, 0);
                context.drawImage(tinted, 0, 0, ICON_SIZE, ICON_SIZE);
            } else {
                context.drawImage(frame, 0, 0, ICON_SIZE, ICON_SIZE);
            }
        }
        return canvas;
    };

    const animated = layers.filter(layer => layer.info);
    if (!animated.length) return (await draw()).toDataURL('image/png');
    return captureAnimation(animated.map(layer => ({ info: layer.info, apply: position => { layer.position = position; } })), ICON_SIZE, draw);
}

function loadThree() {
    if (!threePromise) {
        threePromise = import(new URL('./vendor/three.module.min.js', import.meta.url).href).then(THREE => {
            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
            renderer.setPixelRatio(1);
            renderer.setSize(ICON_SIZE, ICON_SIZE, false);
            renderer.setClearColor(0x000000, 0);
            if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
            const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, -64, 64);
            camera.position.set(0, 0, 32);
            camera.lookAt(0, 0, 0);
            three = { THREE, renderer, camera, textures: new Map(), materials: new Map() };
            return three;
        });
    }
    return threePromise;
}

async function threeTexture(id) {
    if (String(id).startsWith('canvas:')) {
        const canvas = canvasTextures.get(id);
        if (!canvas) return null;
        if (!three.textures.has(id)) {
            const { THREE } = three;
            const texture = new THREE.CanvasTexture(canvas);
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
            three.textures.set(id, Promise.resolve(texture));
        }
        return three.textures.get(id);
    }
    const url = textureUrl(id);
    if (!url) return null;
    if (three.textures.has(url)) return three.textures.get(url);
    const promise = textureSource(id).then(({ image, info }) => {
        if (!image) return null;
        const { THREE } = three;
        const canvas = frameOf(image, info, 0);
        const texture = new THREE.CanvasTexture(canvas);
        if (info) {
            (three.animated ||= new Map()).set(url, {
                info,
                apply: position => {
                    const frame = frameOf(image, info, position);
                    const context = canvas.getContext('2d');
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(frame, 0, 0);
                    texture.needsUpdate = true;
                }
            });
        }
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    });
    three.textures.set(url, promise);
    return promise;
}

function material(texture, color) {
    const key = `${texture.uuid}:${color}`;
    if (!three.materials.has(key)) {
        const { THREE } = three;
        three.materials.set(key, new THREE.MeshBasicMaterial({
            map: texture,
            color: new THREE.Color(color),
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide
        }));
    }
    return three.materials.get(key);
}

function faceCorners(face, from, to) {
    const [x1, y1, z1] = from;
    const [x2, y2, z2] = to;
    switch (face) {
        case 'north': return [[x2, y2, z1], [x1, y2, z1], [x1, y1, z1], [x2, y1, z1]];
        case 'south': return [[x1, y2, z2], [x2, y2, z2], [x2, y1, z2], [x1, y1, z2]];
        case 'west': return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z2], [x1, y1, z1]];
        case 'east': return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z1], [x2, y1, z2]];
        case 'up': return [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]];
        case 'down': return [[x1, y1, z2], [x2, y1, z2], [x2, y1, z1], [x1, y1, z1]];
        default: return null;
    }
}

function defaultUv(face, from, to) {
    const [x1, y1, z1] = from;
    const [x2, y2, z2] = to;
    switch (face) {
        case 'north': return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
        case 'south': return [x1, 16 - y2, x2, 16 - y1];
        case 'west': return [z1, 16 - y2, z2, 16 - y1];
        case 'east': return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
        case 'up': return [x1, z1, x2, z2];
        case 'down': return [x1, 16 - z2, x2, 16 - z1];
        default: return [0, 0, 16, 16];
    }
}

function rotatePoint(point, rotation) {
    if (!rotation || !rotation.angle) return point;
    const origin = rotation.origin || [8, 8, 8];
    const angle = rotation.angle * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = point[0] - origin[0];
    const y = point[1] - origin[1];
    const z = point[2] - origin[2];
    let rx = x, ry = y, rz = z;
    if (rotation.axis === 'x') { ry = y * cos - z * sin; rz = y * sin + z * cos; }
    else if (rotation.axis === 'y') { rx = x * cos + z * sin; rz = -x * sin + z * cos; }
    else if (rotation.axis === 'z') { rx = x * cos - y * sin; ry = x * sin + y * cos; }
    return [rx + origin[0], ry + origin[1], rz + origin[2]];
}

async function buildElements(elements, textures, tints, uvScale = [1, 1]) {
    const { THREE } = three;
    const group = new THREE.Group();

    for (const element of elements) {
        if (!element.from || !element.to || !element.faces) continue;

        for (const [faceName, face] of Object.entries(element.faces)) {
            const corners = faceCorners(faceName, element.from, element.to);
            const textureId = resolveTexture(textures, face.texture);
            if (!corners || !textureId) continue;

            const texture = await threeTexture(textureId);
            if (!texture) continue;

            const uv = face.uv || defaultUv(faceName, element.from, element.to);
            const uvCorners = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
            const steps = ((face.rotation || 0) / 90) % 4;
            for (let i = 0; i < steps; i++) uvCorners.unshift(uvCorners.pop());

            const points = corners.map(point => rotatePoint(point, element.rotation));
            const positions = [];
            const uvs = [];
            for (const index of [0, 3, 2, 0, 2, 1]) {
                const point = points[index];
                positions.push(point[0] - 8, point[1] - 8, point[2] - 8);
                uvs.push(uvCorners[index][0] / 16 / uvScale[0], 1 - uvCorners[index][1] / 16 / uvScale[1]);
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

            const shade = element.shade === false ? 1 : FACE_SHADE[faceName];
            let color = new THREE.Color().setRGB(shade, shade, shade, THREE.SRGBColorSpace);
            if (typeof face.tintindex === 'number' && face.tintindex >= 0) {
                const tint = tintColor(tints && tints[face.tintindex]) ?? DEFAULT_TINT;
                color = color.multiply(new THREE.Color(tint));
            }

            group.add(new THREE.Mesh(geometry, material(texture, color.getHex())));
        }
    }

    return group;
}

function specialElements(description) {
    switch (description.special) {
        case 'shulker_box': {
            const texture = 'minecraft:entity/shulker/' + splitId(description.data.texture || 'minecraft:shulker').path;
            const box = (u, v, from, to, w, h, d) => ({
                from, to,
                faces: {
                    up: { uv: [u + d, v, u + d + w, v + d], texture: '#t' },
                    down: { uv: [u + d + w, v, u + d + w + w, v + d], texture: '#t' },
                    east: { uv: [u, v + d, u + d, v + d + h], texture: '#t' },
                    north: { uv: [u + d, v + d, u + d + w, v + d + h], texture: '#t' },
                    west: { uv: [u + d + w, v + d, u + d + w + d, v + d + h], texture: '#t' },
                    south: { uv: [u + d + w + d, v + d, u + d + w + d + w, v + d + h], texture: '#t' }
                }
            });
            return {
                textures: { t: texture },
                uvScale: [4, 4],
                elements: [box(0, 0, [0, 4, 0], [16, 16, 16], 16, 12, 16), box(0, 28, [0, 0, 0], [16, 8, 16], 16, 8, 16)]
            };
        }
        case 'decorated_pot': {
            const side = { uv: [2, 0, 30, 32], texture: '#side' };
            const base = uv => ({ uv, texture: '#base' });
            return {
                textures: { side: 'minecraft:entity/decorated_pot/decorated_pot_side', base: 'minecraft:entity/decorated_pot/decorated_pot_base' },
                uvScale: [2, 2],
                elements: [
                    { from: [1, 0, 1], to: [15, 16, 15], faces: {
                        north: side, south: side, east: side, west: side,
                        up: base([14, 27, 28, 13]), down: base([0, 13, 14, 27]) } },
                    { from: [4.8, 15.8, 4.8], to: [11.2, 17.2, 11.2], faces: {
                        up: base([6, 5, 12, 11]), north: base([18, 12, 24, 11]), south: base([6, 12, 12, 11]),
                        west: base([0, 12, 6, 11]), east: base([12, 12, 18, 11]) } },
                    { from: [4.1, 17.1, 4.1], to: [11.9, 19.9, 11.9], faces: {
                        up: base([8, 0, 16, 8]), down: base([16, 8, 24, 0]), north: base([24, 11, 32, 8]), south: base([8, 11, 16, 8]),
                        west: base([0, 11, 8, 8]), east: base([16, 11, 24, 8]) } }
                ]
            };
        }
        case 'chest': {
            const box = (x, y, z, w, h, d, u, v) => ({
                from: [x, y, z],
                to: [x + w, y + h, z + d],
                faces: {
                    down: { uv: [u + d, v, u + d + w, v + d], texture: '#t' },
                    up: { uv: [u + d + w, v + d, u + d + w + w, v], texture: '#t' },
                    west: { uv: [u, v + d, u + d, v + d + h], texture: '#t' },
                    north: { uv: [u + d, v + d, u + d + w, v + d + h], texture: '#t' },
                    east: { uv: [u + d + w, v + d, u + d + w + d, v + d + h], texture: '#t' },
                    south: { uv: [u + d + w + d, v + d, u + d + w + d + w, v + d + h], texture: '#t' }
                }
            });
            return {
                textures: { t: 'minecraft:entity/chest/' + splitId(description.data.texture || 'minecraft:normal').path },
                uvScale: [4, 4],
                elements: [box(1, 0, 1, 14, 10, 14, 0, 19), box(1, 9, 1, 14, 5, 14, 0, 0), box(7, 7, 15, 2, 4, 1, 0, 0)]
            };
        }
        case 'head': {
            const kind = String(description.data.kind || 'skeleton');
            const heads = {
                skeleton: ['minecraft:entity/skeleton/skeleton', [4, 2]],
                wither_skeleton: ['minecraft:entity/skeleton/wither_skeleton', [4, 2]],
                zombie: ['minecraft:entity/zombie/zombie', [4, 4]],
                creeper: ['minecraft:entity/creeper/creeper', [4, 2]],
                piglin: ['minecraft:entity/piglin/piglin', [4, 4]],
                player: ['minecraft:entity/player/wide/steve', [4, 4]]
            };
            if (kind === 'piglin') {
                return shiftElements(fitElements(turnAround({
                    textures: { t: 'minecraft:entity/piglin/piglin' },
                    uvScale: [4, 4],
                    elements: [entityBox(-5, -8, -4, 10, 8, 8, 0, 0), entityBox(-2, -4, -5, 4, 4, 1, 31, 1),
                        entityBox(2, -2, -5, 1, 2, 1, 2, 4), entityBox(-3, -2, -5, 1, 2, 1, 2, 0),
                        withPivot(entityBox(4.5, -6, -2, 1, 5, 4, 51, 6), [4.5, -6, 0], 'z', -Math.PI / 6),
                        withPivot(entityBox(-5.5, -6, -2, 1, 5, 4, 39, 6), [-4.5, -6, 0], 'z', Math.PI / 6)]
                }), 0.6), -4);
            }
            if (kind === 'dragon') {
                return Object.assign(fitElements(turnAround({
                    textures: { t: 'minecraft:entity/enderdragon/dragon' },
                    uvScale: [16, 16],
                    elements: [
                        entityBox(-6, -1, -24, 12, 5, 16, 176, 44),
                        entityBox(-8, -8, -10, 16, 16, 16, 112, 30),
                        entityBox(-5, -12, -4, 2, 4, 6, 0, 0),
                        entityBox(3, -12, -4, 2, 4, 6, 0, 0),
                        entityBox(-5, -3, -22, 2, 2, 4, 112, 0),
                        entityBox(3, -3, -22, 2, 2, 4, 112, 0),
                        entityBox(-6, 4, -24, 12, 4, 16, 176, 65)
                    ]
                })), { gui: { rotation: [30, 45, 0], translation: [0, 0, 0], scale: [0.72, 0.72, 0.72] } });
            }
            const [texture, scale] = heads[kind] || heads.skeleton;
            return shiftElements(fitElements(turnAround({ textures: { t: texture }, uvScale: scale, elements: [entityBox(-4, -8, -4, 8, 8, 8, 0, 0)] }), 0.5), -4);
        }
        default:
            return null;
    }
}

function entityBox(x, y, z, w, h, d, u, v, grow = 0, texture = '#t') {
    return {
        from: [-(x + w) - grow, -(y + h) - grow, z - grow],
        to: [-x + grow, -y + grow, z + d + grow],
        faces: {
            up: { uv: [u + d, v, u + d + w, v + d], texture },
            down: { uv: [u + d + w, v + d, u + d + w + w, v], texture },
            west: { uv: [u, v + d, u + d, v + d + h], texture },
            north: { uv: [u + d, v + d, u + d + w, v + d + h], texture },
            east: { uv: [u + d + w, v + d, u + d + w + d, v + d + h], texture },
            south: { uv: [u + d + w + d, v + d, u + d + w + d + w, v + d + h], texture }
        }
    };
}

function withPivot(element, pivot, axis, radians) {
    element.rotation = { origin: [-pivot[0], -pivot[1], pivot[2]], axis, angle: (axis === 'z' ? radians : -radians) * 180 / Math.PI };
    return element;
}

export function villagerElements() {
    const t = '#t';
    const head = [0, 0, 0];
    return [
        entityBox(-4, -10, -4, 8, 10, 8, 0, 0, 0, t),
        entityBox(-4, -10, -4, 8, 10, 8, 32, 0, 0.51, t),
        withPivot(entityBox(-8, -8, -6, 16, 16, 1, 30, 47, 0, t), head, 'x', -Math.PI / 2),
        entityBox(-1, -3, -6, 2, 4, 2, 24, 0, 0, t),
        entityBox(-4, 0, -3, 8, 12, 6, 16, 20, 0, t),
        entityBox(-4, 0, -3, 8, 20, 6, 0, 38, 0.5, t),
        withPivot(entityBox(-8, 1, -3, 4, 8, 4, 44, 22, 0, t), [0, 3, -1], 'x', -0.75),
        withPivot(entityBox(4, 1, -3, 4, 8, 4, 44, 22, 0, t), [0, 3, -1], 'x', -0.75),
        withPivot(entityBox(-4, 5, -3, 8, 4, 4, 40, 38, 0, t), [0, 3, -1], 'x', -0.75),
        entityBox(-4, 12, -2, 4, 12, 4, 0, 22, 0, t),
        entityBox(0, 12, -2, 4, 12, 4, 0, 22, 0, t)
    ];
}

export async function renderEntity(key, model, options = {}) {
    if (iconCache.has('entity|' + key)) return iconCache.get('entity|' + key);
    const size = options.size || 192;
    const task = async () => {
        await loadThree();
        await Promise.all(Object.values(model.textures).map(id => (String(id).startsWith('canvas:') ? null : loadImage(textureUrl(id)))));
        const { THREE, renderer, camera } = three;
        const fitted = fitElements({ elements: model.elements.map(element => ({ ...element })), textures: model.textures }, 1);
        const group = await buildElements(fitted.elements, model.textures, [], model.uvScale || [4, 4]);
        const holder = new THREE.Group();
        holder.add(group);
        const rotation = options.rotation || [8, 200, 0];
        holder.rotation.set(rotation[0] * Math.PI / 180, rotation[1] * Math.PI / 180, rotation[2] * Math.PI / 180, 'XYZ');
        holder.scale.setScalar(options.scale || 0.95);
        const scene = new THREE.Scene();
        scene.add(holder);
        renderer.setSize(size, size, false);
        const sources = [];
        for (const id of Object.values(model.textures)) {
            const canvas = canvasTextures.get(id);
            if (!canvas || !canvas.animatedLayers || !canvas.animatedLayers.length) continue;
            const texture = await threeTexture(id);
            for (const layer of canvas.animatedLayers) {
                sources.push({ info: layer.info, apply: position => { layer.position = position; canvas.compose(); texture.needsUpdate = true; } });
            }
        }
        let url;
        if (sources.length) {
            url = await captureAnimation(sources, size, async () => {
                renderer.render(scene, camera);
                return renderer.domElement;
            });
        } else {
            renderer.render(scene, camera);
            url = renderer.domElement.toDataURL('image/png');
        }
        renderer.setSize(ICON_SIZE, ICON_SIZE, false);
        group.traverse(object => { if (object.geometry) object.geometry.dispose(); });
        return url;
    };
    const run = queue.then(task, task);
    queue = run.catch(() => null);
    iconCache.set('entity|' + key, run);
    return run;
}

export function textureMeta(id) {
    const url = textureUrl(id);
    return url ? fetchJson(url + '.mcmeta') : Promise.resolve(null);
}

export async function composeTextures(ids, clear = {}) {
    const layers = (await Promise.all(ids.map(textureSource))).filter(layer => layer.image).map(layer => ({ ...layer, position: 0 }));
    if (!layers.length) return null;
    const size = layers[0].info ? layers[0].info.width : layers[0].image.width;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    canvas.compose = () => {
        context.clearRect(0, 0, size, size);
        for (const layer of layers) {
            const frame = frameOf(layer.image, layer.info, layer.position);
            const rects = clear[layers.indexOf(layer)];
            if (rects) {
                const scale = frame.width / 64;
                const copy = document.createElement('canvas');
                copy.width = frame.width;
                copy.height = frame.height;
                const copyContext = copy.getContext('2d');
                copyContext.drawImage(frame, 0, 0);
                for (const [x, y, w, h] of rects) copyContext.clearRect(x * scale, y * scale, w * scale, h * scale);
                context.drawImage(copy, 0, 0, copy.width, Math.min(copy.height, copy.width), 0, 0, size, size);
            } else {
                context.drawImage(frame, 0, 0, frame.width, Math.min(frame.height, frame.width), 0, 0, size, size);
            }
        }
    };
    canvas.animatedLayers = layers.filter(layer => layer.info);
    canvas.compose();
    return canvas;
}

function shiftElements(model, dy) {
    const move = point => [point[0], point[1] + dy, point[2]];
    model.elements = model.elements.map(element => ({
        ...element,
        from: move(element.from),
        to: move(element.to),
        rotation: element.rotation ? { ...element.rotation, origin: move(element.rotation.origin) } : undefined
    }));
    return model;
}

function turnAround(model) {
    const swap = { north: 'south', south: 'north', east: 'west', west: 'east', up: 'up', down: 'down' };
    model.elements = model.elements.map(element => {
        const faces = {};
        for (const [face, value] of Object.entries(element.faces)) faces[swap[face]] = value;
        const rotation = element.rotation && {
            ...element.rotation,
            origin: [-element.rotation.origin[0], element.rotation.origin[1], -element.rotation.origin[2]],
            angle: element.rotation.axis === 'y' ? element.rotation.angle : -element.rotation.angle
        };
        return { ...element, faces, rotation, from: [-element.to[0], element.from[1], -element.to[2]], to: [-element.from[0], element.to[1], -element.from[2]] };
    });
    return model;
}

function fitElements(model, fill = 1) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const element of model.elements) {
        for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], element.from[axis]);
            max[axis] = Math.max(max[axis], element.to[axis]);
        }
    }
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const scale = (16 * fill) / size;
    const offset = [0, 1, 2].map(axis => 8 - ((min[axis] + max[axis]) / 2) * scale);
    const place = point => point.map((value, axis) => value * scale + offset[axis]);
    model.elements = model.elements.map(element => ({
        ...element,
        from: place(element.from),
        to: place(element.to),
        rotation: element.rotation ? { ...element.rotation, origin: place(element.rotation.origin || [0, 0, 0]) } : undefined
    }));
    return model;
}

async function renderBlock(description) {
    await loadThree();
    const { THREE, renderer, camera } = three;

    let group;
    let gui = null;
    if (description.kind === 'special') {
        const special = specialElements(description);
        if (!special) return null;
        group = await buildElements(special.elements, special.textures, [], special.uvScale);
        gui = special.gui || (description.display && description.display.gui);
    } else {
        group = await buildElements(description.model.elements, description.model.textures, description.tints);
        gui = description.model.display && description.model.display.gui;
    }
    if (!group.children.length) return null;

    const transform = gui || { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [0.625, 0.625, 0.625] };
    const holder = new THREE.Group();
    holder.add(group);
    const rotation = transform.rotation || [0, 0, 0];
    holder.rotation.set(rotation[0] * Math.PI / 180, -rotation[1] * Math.PI / 180, -rotation[2] * Math.PI / 180, 'XYZ');
    const scale = transform.scale || [1, 1, 1];
    holder.scale.set(scale[0], scale[1], scale[2]);
    const translation = transform.translation || [0, 0, 0];
    holder.position.set(translation[0], translation[1], translation[2]);

    const scene = new THREE.Scene();
    scene.add(holder);
    const animated = [...new Set(textureIds(description).map(textureUrl))]
        .map(url => three.animated && three.animated.get(url)).filter(Boolean);
    let url;
    if (animated.length) {
        url = await captureAnimation(animated, ICON_SIZE, async () => {
            renderer.render(scene, camera);
            return renderer.domElement;
        });
        animated.forEach(source => source.apply(0));
    } else {
        renderer.render(scene, camera);
        url = renderer.domElement.toDataURL('image/png');
    }

    group.traverse(object => { if (object.geometry) object.geometry.dispose(); });
    return url;
}

function textureIds(description) {
    if (description.kind === 'flat') return description.layers.map(layer => layer.texture);
    if (description.kind === 'block') {
        const ids = [];
        for (const element of description.model.elements) {
            for (const face of Object.values(element.faces || {})) {
                const id = resolveTexture(description.model.textures, face.texture);
                if (id) ids.push(id);
            }
        }
        return ids;
    }
    if (description.kind === 'special') {
        const special = specialElements(description);
        return special ? Object.values(special.textures) : [];
    }
    return [];
}

function preloadTextures(description) {
    return Promise.all([...new Set(textureIds(description))].map(id => loadImage(textureUrl(id))));
}

export function glintUrl() {
    return assetUrl('minecraft', 'textures/misc/enchanted_glint_item.png');
}

async function composeMap(spec) {
    const [base, decoration] = await Promise.all([loadImage(spec.base), loadImage(spec.decoration)]);
    if (!base) return null;

    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.drawImage(firstFrame(base), 0, 0, size, size);

    const color = parseInt(String(spec.color || '').replace('#', ''), 16);
    if (Number.isFinite(color)) {
        const pixels = context.getImageData(0, 0, size, size);
        const tint = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
        for (let i = 0; i < pixels.data.length; i += 4) {
            if (pixels.data[i + 3] === 0) continue;
            for (let c = 0; c < 3; c++) {
                pixels.data[i + c] = Math.round(pixels.data[i + c] + (tint[c] - pixels.data[i + c]) * 0.1);
            }
        }
        context.putImageData(pixels, 0, 0);
    }

    if (decoration) {
        context.drawImage(firstFrame(decoration), 5, 5, 8, 8);
    }

    const output = document.createElement('canvas');
    output.width = ICON_SIZE;
    output.height = ICON_SIZE;
    const outputContext = output.getContext('2d');
    outputContext.imageSmoothingEnabled = false;
    outputContext.drawImage(canvas, 0, 0, ICON_SIZE, ICON_SIZE);
    return output.toDataURL('image/png');
}

export function renderMapIcon(key, spec) {
    const cacheKey = 'map|' + key;
    if (iconCache.has(cacheKey)) return iconCache.get(cacheKey);
    const cached = readCache(cacheKey);
    if (cached) {
        const ready = Promise.resolve(cached);
        iconCache.set(cacheKey, ready);
        return ready;
    }
    const promise = composeMap(spec).then(url => {
        if (url) writeCache(cacheKey, url);
        return url;
    }).catch(() => null);
    iconCache.set(cacheKey, promise);
    return promise;
}

function readCache(id) {
    try {
        const value = localStorage.getItem(CACHE_PREFIX + config.version + ':' + id);
        return value && value.startsWith('{') ? JSON.parse(value) : value;
    } catch (error) {
        return null;
    }
}

function writeCache(id, url) {
    try {
        localStorage.setItem(CACHE_PREFIX + config.version + ':' + id, typeof url === 'string' ? url : JSON.stringify(url));
    } catch (error) {
        /* storage full or unavailable */
    }
}

export function renderIcon(id, options = {}) {
    const key = String(id) + (typeof options.tint === 'number' ? '|' + options.tint.toString(16) : '');
    if (iconCache.has(key)) return iconCache.get(key);

    const cached = readCache(key);
    if (cached) {
        const ready = Promise.resolve(cached);
        iconCache.set(key, ready);
        return ready;
    }

    const promise = describeItem(String(id), options).then(description => preloadTextures(description).then(() => description)).then(description => {
        const task = () => {
            if (description.kind === 'flat') return renderFlat(description);
            if (description.kind === 'block' || description.kind === 'special') return renderBlock(description);
            return null;
        };
        const run = queue.then(task, task);
        queue = run.catch(() => null);
        return run;
    }).then(url => {
        if (url) writeCache(key, url);
        return url;
    }).catch(() => null);

    iconCache.set(key, promise);
    return promise;
}


const players = new Set();
let playerFrame = 0;

function playTick(now) {
    playerFrame = 0;
    const tick = now / 50;
    for (const element of players) {
        if (!element.isConnected) { players.delete(element); continue; }
        const data = element._animation;
        let local = tick % data.total;
        let index = 0;
        while (index < data.seq.length - 1 && local >= data.seq[index][1]) { local -= data.seq[index][1]; index++; }
        const current = data.seq[index][0];
        const next = data.seq[(index + 1) % data.seq.length][0];
        const fraction = data.interpolate ? local / data.seq[index][1] : 0;
        const position = frame => (data.frames > 1 ? (frame / (data.frames - 1)) * 100 : 0) + '%';
        if (element._current !== current) { element._current = current; element.firstChild.style.backgroundPositionY = position(current); }
        if (data.interpolate) {
            if (element._next !== next) { element._next = next; element.lastChild.style.backgroundPositionY = position(next); }
            element.lastChild.style.opacity = fraction.toFixed(3);
        }
    }
    if (players.size) playerFrame = requestAnimationFrame(playTick);
}

export function iconFirstFrame(result) {
    return typeof result === 'string' ? result : result && result.first;
}

export function iconElement(result, className = '') {
    if (!result) return null;
    if (typeof result === 'string') {
        const image = new Image();
        image.alt = '';
        image.decoding = 'async';
        image.src = result;
        if (className) image.className = className;
        return image;
    }
    const element = document.createElement('span');
    element.className = 'anim-icon' + (className ? ' ' + className : '');
    element.style.setProperty('--strip', `url("${result.strip}")`);
    element.style.setProperty('--frames', result.frames);
    element.innerHTML = '<i></i><i></i>';
    element._animation = { ...result, total: result.seq.reduce((sum, entry) => sum + entry[1], 0) };
    if (!result.interpolate) element.lastChild.style.opacity = '0';
    players.add(element);
    if (!playerFrame) playerFrame = requestAnimationFrame(playTick);
    return element;
}
