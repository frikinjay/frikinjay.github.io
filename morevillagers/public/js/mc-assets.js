const REPOSITORY = 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets';
const ICON_SIZE = 96;
const FACE_SHADE = { up: 1, down: 0.5, north: 0.8, south: 0.8, east: 0.6, west: 0.6 };
const DEFAULT_TINT = 0x48b518;
const CACHE_PREFIX = 'mcicon:v5:';

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
    const size = Math.min(image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(image, 0, 0, size, size, 0, 0, size, size);
    return canvas;
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

async function describeItem(id) {
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

    const special = picked.special ? String(picked.special.type || '').replace('minecraft:', '') : null;
    if (special === 'shulker_box' || special === 'decorated_pot' || special === 'chest' || special === 'head') {
        return { kind: 'special', special, data: picked.special };
    }

    const model = await resolveModel(picked.model);
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
    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;

    let drawn = false;
    for (const layer of description.layers) {
        const image = await loadImage(textureUrl(layer.texture));
        if (!image) continue;
        const frame = firstFrame(image);

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
        drawn = true;
    }

    return drawn ? canvas.toDataURL('image/png') : null;
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
    const url = textureUrl(id);
    if (!url) return null;
    if (three.textures.has(url)) return three.textures.get(url);
    const promise = loadImage(url).then(image => {
        if (!image) return null;
        const { THREE } = three;
        const texture = new THREE.CanvasTexture(firstFrame(image));
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
        case 'decorated_pot':
            return {
                textures: { side: 'minecraft:entity/decorated_pot/decorated_pot_side', base: 'minecraft:entity/decorated_pot/decorated_pot_base' },
                uvScale: [1, 1],
                elements: [
                    {
                        from: [1, 0, 1], to: [15, 16, 15],
                        faces: {
                            north: { uv: [1, 0, 15, 16], texture: '#side' }, south: { uv: [1, 0, 15, 16], texture: '#side' },
                            east: { uv: [1, 0, 15, 16], texture: '#side' }, west: { uv: [1, 0, 15, 16], texture: '#side' },
                            up: { uv: [0, 6.5, 7, 13.5], texture: '#base' }, down: { uv: [7, 6.5, 14, 13.5], texture: '#base' }
                        }
                    },
                    {
                        from: [4, 16, 4], to: [12, 20, 12],
                        faces: {
                            north: { uv: [0, 0, 4, 2], texture: '#base' }, south: { uv: [0, 0, 4, 2], texture: '#base' },
                            east: { uv: [0, 0, 4, 2], texture: '#base' }, west: { uv: [0, 0, 4, 2], texture: '#base' },
                            up: { uv: [4, 0, 8, 4], texture: '#base' }
                        }
                    }
                ]
            };
        case 'chest':
            return {
                textures: { t: 'minecraft:entity/chest/' + splitId(description.data.texture || 'minecraft:normal').path },
                uvScale: [4, 4],
                elements: [
                    { from: [1, 0, 1], to: [15, 10, 15], faces: {
                        north: { uv: [14, 33, 28, 43], texture: '#t' }, south: { uv: [42, 33, 56, 43], texture: '#t' },
                        east: { uv: [0, 33, 14, 43], texture: '#t' }, west: { uv: [28, 33, 42, 43], texture: '#t' },
                        down: { uv: [28, 19, 42, 33], texture: '#t' } } },
                    { from: [1, 9, 1], to: [15, 14, 15], faces: {
                        north: { uv: [14, 14, 28, 19], texture: '#t' }, south: { uv: [42, 14, 56, 19], texture: '#t' },
                        east: { uv: [0, 14, 14, 19], texture: '#t' }, west: { uv: [28, 14, 42, 19], texture: '#t' },
                        up: { uv: [14, 0, 28, 14], texture: '#t' } } }
                ]
            };
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
            if (kind === 'dragon') {
                return fitElements({
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
                });
            }
            const [texture, scale] = heads[kind] || heads.skeleton;
            return fitElements({ textures: { t: texture }, uvScale: scale, elements: [entityBox(-4, -8, -4, 8, 8, 8, 0, 0)] }, 0.75);
        }
        default:
            return null;
    }
}

function entityBox(x, y, z, w, h, d, u, v) {
    return {
        from: [x, -(y + h), z],
        to: [x + w, -y, z + d],
        faces: {
            up: { uv: [u + d, v, u + d + w, v + d], texture: '#t' },
            down: { uv: [u + d + w, v, u + d + w + w, v + d], texture: '#t' },
            east: { uv: [u, v + d, u + d, v + d + h], texture: '#t' },
            north: { uv: [u + d, v + d, u + d + w, v + d + h], texture: '#t' },
            west: { uv: [u + d + w, v + d, u + d + w + d, v + d + h], texture: '#t' },
            south: { uv: [u + d + w + d, v + d, u + d + w + d + w, v + d + h], texture: '#t' }
        }
    };
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
    model.elements = model.elements.map(element => ({ ...element, from: place(element.from), to: place(element.to) }));
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
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');

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
        return localStorage.getItem(CACHE_PREFIX + config.version + ':' + id);
    } catch (error) {
        return null;
    }
}

function writeCache(id, url) {
    try {
        localStorage.setItem(CACHE_PREFIX + config.version + ':' + id, url);
    } catch (error) {
        /* storage full or unavailable */
    }
}

export function renderIcon(id) {
    const key = String(id);
    if (iconCache.has(key)) return iconCache.get(key);

    const cached = readCache(key);
    if (cached) {
        const ready = Promise.resolve(cached);
        iconCache.set(key, ready);
        return ready;
    }

    const promise = describeItem(key).then(description => preloadTextures(description).then(() => description)).then(description => {
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
