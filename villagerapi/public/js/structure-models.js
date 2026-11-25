import { assetUrl, fetchJson, splitId, resolveTexture, imageSource, vanillaUrl, currentVersion, frameOf } from './mc-assets.js';

function forcedTranslucent(textures, reference) {
    let value = reference;
    for (let i = 0; i < 12; i++) {
        if (value && typeof value === 'object') return Boolean(value.force_translucent);
        if (typeof value !== 'string' || !value.startsWith('#')) return false;
        value = textures[value.slice(1)];
    }
    return false;
}

const FALLBACK_VERSION = '26.3';
export const DIRS = ['down', 'up', 'north', 'south', 'west', 'east'];
export const VEC = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
export const FACE_SHADE = [0.5, 1, 0.8, 0.8, 0.6, 0.6];
export const MISSING = 'missing:texture';

const INVISIBLE = new Set(['air', 'cave_air', 'void_air', 'structure_void', 'barrier', 'light', 'moving_piston']);
const GLASS = /(^|_)glass$/;
const SELF_CULLING = /(^|_)glass$|^ice$|^slime_block$|^honey_block$|(^|_)glass_pane$/;
const CHESTS = {
    chest: 'normal', trapped_chest: 'trapped', ender_chest: 'ender',
    copper_chest: 'copper', exposed_copper_chest: 'copper_exposed', weathered_copper_chest: 'copper_weathered', oxidized_copper_chest: 'copper_oxidized'
};
const YAW = { south: 0, west: 90, north: 180, east: 270 };
const DYES = {
    white: 0xf9fffe, orange: 0xf9801d, magenta: 0xc74ebd, light_blue: 0x3ab3da, yellow: 0xfed83d, lime: 0x80c71f, pink: 0xf38baa, gray: 0x474f52,
    light_gray: 0x9d9d97, cyan: 0x169c9c, purple: 0x8932b8, blue: 0x3c44aa, brown: 0x835432, green: 0x5e7c16, red: 0xb02e26, black: 0x1d1d21
};
const BANNER = /^(.+?)_(wall_)?banner$/;
const ALIASES = { chain: 'iron_chain', iron_chain: 'chain', grass: 'short_grass', short_grass: 'grass' };

export const BIOMES = {
    plains: { label: 'Plains', grass: 0x91bd59, foliage: 0x77ab2f, water: 0x3f76e4 },
    desert: { label: 'Desert', grass: 0xbfb755, foliage: 0xaea42a, water: 0x3f76e4 },
    savanna: { label: 'Savanna', grass: 0xbfb755, foliage: 0xaea42a, water: 0x3f76e4 },
    snowy_plains: { label: 'Snowy Plains', grass: 0x80b497, foliage: 0x60a17b, water: 0x3d57d6 },
    taiga: { label: 'Taiga', grass: 0x86b783, foliage: 0x68a464, water: 0x3f76e4 },
    jungle: { label: 'Jungle', grass: 0x59c93c, foliage: 0x30bb0b, water: 0x3f76e4 },
    swamp: { label: 'Swamp', grass: 0x6a7039, foliage: 0x6a7039, water: 0x617b64 },
    badlands: { label: 'Badlands', grass: 0x90814d, foliage: 0x9e814d, water: 0x3f76e4 },
    cherry_grove: { label: 'Cherry Grove', grass: 0xb6db61, foliage: 0xb6db61, water: 0x5db7ef }
};

const GRASS_TINTED = /^(grass_block|short_grass|grass|tall_grass|fern|large_fern|potted_fern|sugar_cane|bush|pink_petals|wildflowers)$/;
const FOLIAGE_TINTED = /^(oak_leaves|jungle_leaves|acacia_leaves|dark_oak_leaves|mangrove_leaves|vine|leaf_litter)$/;
const FIXED_TINTS = { birch_leaves: 0x80a755, spruce_leaves: 0x619961, lily_pad: 0x208030, attached_melon_stem: 0xe0c71c, attached_pumpkin_stem: 0xe0c71c };

export function tintFor(name, props, biome) {
    const { ns, path } = splitId(name);
    const colors = BIOMES[biome] || BIOMES.plains;
    if (ns === 'minecraft') {
        if (path in FIXED_TINTS) return FIXED_TINTS[path];
        const banner = BANNER.exec(path);
        if (banner && banner[1] in DYES) return DYES[banner[1]];
        if (GRASS_TINTED.test(path)) return colors.grass;
        if (FOLIAGE_TINTED.test(path)) return colors.foliage;
        if (path === 'water' || path === 'water_cauldron' || path === 'bubble_column') return colors.water;
        if (path === 'melon_stem' || path === 'pumpkin_stem') {
            const age = Number(props.age) || 0;
            return ((age * 32) << 16) | ((255 - age * 8) << 8) | (age * 4);
        }
        if (path === 'redstone_wire') {
            const f = (Number(props.power) || 0) / 15;
            const r = f * 0.6 + (f > 0 ? 0.4 : 0.3);
            const g = Math.min(1, Math.max(0, f * f * 0.7 - 0.5));
            const b = Math.min(1, Math.max(0, f * f * 0.6 - 0.7));
            return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
        }
    }
    return /leaves|vine/.test(path) ? colors.foliage : colors.grass;
}

const LIGHT = {
    torch: 14, wall_torch: 14, soul_torch: 10, soul_wall_torch: 10, copper_torch: 14, copper_wall_torch: 14,
    lantern: 15, soul_lantern: 10, copper_lantern: 15, glowstone: 15, sea_lantern: 15, jack_o_lantern: 15, shroomlight: 15,
    ochre_froglight: 15, verdant_froglight: 15, pearlescent_froglight: 15, beacon: 15, conduit: 15, end_rod: 14,
    fire: 15, soul_fire: 10, lava: 15, magma_block: 3, crying_obsidian: 10, glow_lichen: 7, brewing_stand: 1,
    enchanting_table: 7, ender_chest: 7, amethyst_cluster: 5, large_amethyst_bud: 4, medium_amethyst_bud: 2, small_amethyst_bud: 1,
    end_portal: 15, nether_portal: 11, respawn_anchor: 0, sculk_catalyst: 6, creaking_heart: 0
};

export function lightOf(name, props) {
    const { ns, path } = splitId(name);
    if (ns !== 'minecraft') return /lantern|torch|lamp|glowstone|froglight/.test(path) && props.lit !== 'false' ? 14 : 0;
    if (path === 'light') return Number(props.level) || 0;
    if (/^(furnace|blast_furnace|smoker)$/.test(path)) return props.lit === 'true' ? 13 : 0;
    if (path === 'campfire') return props.lit === 'true' ? 15 : 0;
    if (path === 'soul_campfire') return props.lit === 'true' ? 10 : 0;
    if (/redstone_(wall_)?torch$/.test(path)) return props.lit === 'true' ? 7 : 0;
    if (path === 'redstone_lamp' || /copper_bulb$/.test(path)) return props.lit === 'true' ? 15 : 0;
    if (path === 'redstone_ore' || path === 'deepslate_redstone_ore') return props.lit === 'true' ? 9 : 0;
    if (/candle$/.test(path) && path !== 'candle_cake') return props.lit === 'true' ? 3 * (Number(props.candles) || 1) : 0;
    if (path === 'sea_pickle') return props.waterlogged === 'true' ? 3 + 3 * (Number(props.pickles) || 1) : 0;
    if (path === 'cave_vines' || path === 'cave_vines_plant') return props.berries === 'true' ? 14 : 0;
    if (path === 'respawn_anchor') return Math.floor((Number(props.charges) || 0) * 15 / 4);
    return LIGHT[path] || 0;
}

function source(version) {
    if (!version) return { id: 'current', url: (ns, path) => assetUrl(ns, path) };
    return { id: version, url: (ns, path) => (ns === 'minecraft' ? vanillaUrl(version, path) : assetUrl(ns, path)) };
}

const textures = new Map();

export function textureInfo(url) {
    if (url === MISSING) return Promise.resolve(missingTexture());
    if (!textures.has(url)) {
        textures.set(url, imageSource(url).then(({ image, info }) => {
            if (!image) return null;
            const canvas = frameOf(image, info, 0);
            const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
            let clear = false;
            let partial = false;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] === 0) clear = true;
                else if (data[i] < 255) { partial = true; break; }
            }
            return { url, image, info, canvas, layer: partial ? 'translucent' : clear ? 'cutout' : 'opaque' };
        }).catch(() => null));
    }
    return textures.get(url);
}

let missing = null;
function missingTexture() {
    if (!missing) {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d');
        context.fillStyle = '#000000';
        context.fillRect(0, 0, 16, 16);
        context.fillStyle = '#f800f8';
        context.fillRect(0, 0, 8, 8);
        context.fillRect(8, 8, 8, 8);
        missing = { url: MISSING, image: canvas, info: null, canvas, layer: 'opaque' };
    }
    return missing;
}

async function loadModel(src, id) {
    const out = { textures: {}, elements: null, ao: true, builtin: false, found: false };
    let aoSet = false;
    let current = id;
    for (let depth = 0; current && depth < 16; depth++) {
        const value = String(current);
        if (/^(minecraft:)?builtin\//.test(value)) { out.builtin = true; break; }
        const { ns, path } = splitId(value);
        const json = await fetchJson(src.url(ns, `models/${path}.json`));
        if (!json) break;
        out.found = true;
        for (const [key, texture] of Object.entries(json.textures || {})) if (!(key in out.textures)) out.textures[key] = texture;
        if (!out.elements && Array.isArray(json.elements)) out.elements = json.elements;
        if (!aoSet && typeof json.ambientocclusion === 'boolean') { out.ao = json.ambientocclusion; aoSet = true; }
        current = json.parent;
    }
    return out;
}

function corners(face, from, to) {
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

function projectUv(dir, p) {
    switch (dir) {
        case 2: return [16 - p[0], 16 - p[1]];
        case 3: return [p[0], 16 - p[1]];
        case 4: return [p[2], 16 - p[1]];
        case 5: return [16 - p[2], 16 - p[1]];
        case 1: return [p[0], p[2]];
        default: return [p[0], 16 - p[2]];
    }
}

function elementRotation(rotation) {
    if (!rotation) return null;
    let axis = rotation.axis;
    let angle = Number(rotation.angle) || 0;
    if (!axis) {
        for (const key of ['x', 'y', 'z']) if (Number(rotation[key])) { axis = key; angle = Number(rotation[key]); }
    }
    if (!axis || !angle) return null;
    const radians = angle * Math.PI / 180;
    const scale = rotation.rescale ? 1 / Math.cos(radians) : 1;
    return { axis, cos: Math.cos(radians), sin: Math.sin(radians), origin: rotation.origin || [8, 8, 8], scale };
}

function rotateElement(point, rotation) {
    if (!rotation) return point;
    const { axis, cos, sin, origin, scale } = rotation;
    const x = point[0] - origin[0];
    const y = point[1] - origin[1];
    const z = point[2] - origin[2];
    let rx = x, ry = y, rz = z;
    if (axis === 'x') { ry = (y * cos - z * sin) * scale; rz = (y * sin + z * cos) * scale; }
    else if (axis === 'y') { rx = (x * cos + z * sin) * scale; rz = (-x * sin + z * cos) * scale; }
    else { rx = (x * cos - y * sin) * scale; ry = (x * sin + y * cos) * scale; }
    return [rx + origin[0], ry + origin[1], rz + origin[2]];
}

const round = value => Math.round(value);

export function variantMatrix(xDegrees, yDegrees) {
    const a = -(xDegrees || 0) * Math.PI / 180;
    const b = -(yDegrees || 0) * Math.PI / 180;
    const ca = round(Math.cos(a)), sa = round(Math.sin(a));
    const cb = round(Math.cos(b)), sb = round(Math.sin(b));
    return [
        cb, sb * sa, sb * ca,
        0, ca, -sa,
        -sb, cb * sa, cb * ca
    ];
}

function turn(m, v) {
    return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

function turnPoint(m, p) {
    const r = turn(m, [p[0] - 8, p[1] - 8, p[2] - 8]);
    return [r[0] + 8, r[1] + 8, r[2] + 8];
}

export function dirOf(v) {
    const ax = Math.abs(v[0]), ay = Math.abs(v[1]), az = Math.abs(v[2]);
    if (ay >= ax && ay >= az) return v[1] < 0 ? 0 : 1;
    if (az >= ax) return v[2] < 0 ? 2 : 3;
    return v[0] < 0 ? 4 : 5;
}

function normalOf(p) {
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function makeQuad(points16, uv16, texture, options) {
    const normal = normalOf(points16);
    const dir = dirOf(normal);
    const p = new Float32Array(12);
    const uv = new Float32Array(8);
    for (let i = 0; i < 4; i++) {
        p[i * 3] = points16[i][0] / 16;
        p[i * 3 + 1] = points16[i][1] / 16;
        p[i * 3 + 2] = points16[i][2] / 16;
        uv[i * 2] = uv16[i][0];
        uv[i * 2 + 1] = uv16[i][1];
    }
    return {
        p, uv, texture, dir,
        shadeDir: options.shadeDir ?? dir,
        cull: options.cull ?? -1,
        shade: options.shade !== false,
        tint: options.tint ?? -1,
        ao: options.ao !== false,
        layer: options.layer || null
    };
}

async function bakeElements(src, model, rotation) {
    const m = variantMatrix(rotation.x, rotation.y);
    const turned = Boolean(rotation.x || rotation.y);
    const quads = [];
    const used = [];
    for (const element of model.elements || []) {
        if (!element || !element.from || !element.to || !element.faces) continue;
        const own = elementRotation(element.rotation);
        const shadeOverride = element.shade_direction_override ? DIRS.indexOf(element.shade_direction_override) : -1;
        for (const [faceName, face] of Object.entries(element.faces)) {
            const raw = corners(faceName, element.from, element.to);
            if (!raw || !face) continue;
            const id = resolveTexture(model.textures, face.texture);
            let url = MISSING;
            if (id) {
                const { ns, path } = splitId(id);
                url = src.url(ns, `textures/${path}.png`) || MISSING;
            }
            used.push(url);
            const points = raw.map(point => turnPoint(m, rotateElement(point, own)));
            const box = face.uv || defaultUv(faceName, element.from, element.to);
            let uvs = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]];
            const steps = (((Number(face.rotation) || 0) / 90) % 4 + 4) % 4;
            for (let i = 0; i < steps; i++) uvs.unshift(uvs.pop());
            const order = [points[0], points[3], points[2], points[1]];
            uvs = [uvs[0], uvs[3], uvs[2], uvs[1]];
            const finalDir = dirOf(normalOf(order));
            if (rotation.uvlock && turned) uvs = order.map(point => projectUv(finalDir, point));
            const cullIndex = face.cullface ? DIRS.indexOf(face.cullface === 'bottom' ? 'down' : face.cullface === 'top' ? 'up' : face.cullface) : -1;
            quads.push(makeQuad(order, uvs.map(([u, v]) => [u / 16, v / 16]), url, {
                cull: cullIndex >= 0 ? dirOf(turn(m, VEC[cullIndex])) : -1,
                shade: element.shade !== false,
                shadeDir: shadeOverride >= 0 ? dirOf(turn(m, VEC[shadeOverride])) : undefined,
                tint: typeof face.tintindex === 'number' ? face.tintindex : -1,
                ao: model.ao,
                layer: forcedTranslucent(model.textures, face.texture) ? 'translucent' : null
            }));
        }
    }
    return { quads, used };
}

function isFullElement(element) {
    if (!element || !element.from || !element.to || element.rotation && (Number(element.rotation.angle) || element.rotation.x || element.rotation.y || element.rotation.z)) return false;
    const full = element.from.every(v => v === 0) && element.to.every(v => v === 16);
    return full && DIRS.every(dir => element.faces && element.faces[dir]);
}

function matches(when, props) {
    if (!when) return true;
    if (Array.isArray(when.OR)) return when.OR.some(part => matches(part, props));
    if (Array.isArray(when.AND)) return when.AND.every(part => matches(part, props));
    return Object.entries(when).every(([key, value]) => {
        let text = String(value);
        const negate = text.startsWith('!');
        if (negate) text = text.slice(1);
        const hit = text.split('|').includes(props[key] === undefined ? '' : String(props[key]));
        return negate ? !hit : hit;
    });
}

function pickVariant(variants, props) {
    const entries = Object.entries(variants);
    let best = null;
    let bestScore = -1;
    for (const [key, value] of entries) {
        if (!key) { if (bestScore < 0) { best = value; bestScore = 0; } continue; }
        let score = 0;
        let ok = true;
        for (const pair of key.split(',')) {
            const index = pair.indexOf('=');
            const name = pair.slice(0, index);
            if (props[name] === undefined) continue;
            if (String(props[name]) === pair.slice(index + 1)) score++;
            else { ok = false; break; }
        }
        if (ok && score > bestScore) { best = value; bestScore = score; }
    }
    return best || (entries[0] && entries[0][1]) || null;
}

async function bakeApply(src, apply) {
    const options = (Array.isArray(apply) ? apply : [apply]).filter(Boolean);
    const out = [];
    let ao = true;
    let full = false;
    let opaque = false;
    for (const option of options) {
        const model = await loadModel(src, option.model);
        const baked = await bakeElements(src, model, { x: option.x || 0, y: option.y || 0, uvlock: Boolean(option.uvlock) });
        const fullElement = (model.elements || []).find(isFullElement);
        if (out.length === 0) {
            ao = model.ao;
            full = Boolean(fullElement);
            if (fullElement) {
                const urls = DIRS.map(dir => {
                    const id = resolveTexture(model.textures, fullElement.faces[dir].texture);
                    if (!id) return MISSING;
                    const { ns, path } = splitId(id);
                    return src.url(ns, `textures/${path}.png`) || MISSING;
                });
                const infos = await Promise.all(urls.map(textureInfo));
                opaque = infos.every(info => !info || info.layer === 'opaque');
            }
        }
        out.push({ weight: Math.max(1, Number(option.weight) || 1), quads: baked.quads, found: model.found, builtin: model.builtin });
    }
    return { options: out, ao, full, opaque };
}

function cube(u, v, x, y, z, w, h, d, size, offset, hidden = '', grow = 0, height = size) {
    const [ox, oy, oz] = offset;
    const x1 = x + ox - grow, y1 = y + oy - grow, z1 = z + oz - grow, x2 = x + ox + w + grow, y2 = y + oy + h + grow, z2 = z + oz + d + grow;
    const t0 = [x1, y1, z1], t1 = [x2, y1, z1], t2 = [x2, y2, z1], t3 = [x1, y2, z1];
    const l0 = [x1, y1, z2], l1 = [x2, y1, z2], l2 = [x2, y2, z2], l3 = [x1, y2, z2];
    const u0 = u, u1 = u + d, u2 = u + d + w, u22 = u + d + w + w, u3 = u + d + w + d, u4 = u + d + w + d + w;
    const v0 = v, v1 = v + d, v2 = v + d + h;
    const faces = [
        ['down', [l1, l0, t0, t1], u1, v0, u2, v1],
        ['up', [t2, t3, l3, l2], u2, v1, u22, v0],
        ['west', [t0, l0, l3, t3], u0, v1, u1, v2],
        ['north', [t1, t0, t3, t2], u1, v1, u2, v2],
        ['east', [l1, t1, t2, l2], u2, v1, u3, v2],
        ['south', [l0, l1, l2, l3], u3, v1, u4, v2]
    ];
    return faces.filter(face => !hidden.includes(face[0])).map(([, points, a, b, c, e]) => ({
        points,
        uv: [[c / size, b / height], [a / size, b / height], [a / size, e / height], [c / size, e / height]]
    })).filter(polygon => {
        const n = normalOf(polygon.points);
        return Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) > 1e-9;
    });
}

function pose(polygons, offset, rx = 0, ry = 0, rz = 0) {
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    const apply = ([x, y, z]) => {
        const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
        const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
        const x3 = x2 * cz - y1 * sz, y3 = x2 * sz + y1 * cz;
        return [x3 + offset[0], y3 + offset[1], z2 + offset[2]];
    };
    return polygons.map(polygon => ({ points: polygon.points.map(apply), uv: polygon.uv }));
}

function potQuads(src, props) {
    const base = src.url('minecraft', 'textures/entity/decorated_pot/decorated_pot_base.png');
    const side = src.url('minecraft', 'textures/entity/decorated_pot/decorated_pot_side.png');
    const neck = pose([...cube(0, 0, 4, 17, 4, 8, 3, 8, 32, [0, 0, 0], '', -0.1), ...cube(0, 5, 5, 20, 5, 6, 1, 6, 32, [0, 0, 0], '', 0.2)], [0, 37, 16], Math.PI);
    const plane = cube(-14, 13, 0, 0, 0, 14, 0, 14, 32, [0, 0, 0]);
    const ends = [...pose(plane, [1, 16, 1]), ...pose(plane, [1, 0, 1])];
    const sidePlane = cube(1, 0, 0, 0, 0, 14, 16, 0, 16, [0, 0, 0], 'down up west east south');
    const sides = [
        ...pose(sidePlane, [15, 16, 1], 0, 0, Math.PI),
        ...pose(sidePlane, [1, 16, 1], 0, -Math.PI / 2, Math.PI),
        ...pose(sidePlane, [15, 16, 15], 0, Math.PI / 2, Math.PI),
        ...pose(sidePlane, [1, 16, 15], Math.PI)
    ];
    const yaw = (YAW[props.facing] ?? 180) - 180;
    return [...entityQuads([...neck, ...ends], base, yaw), ...entityQuads(sides, side, yaw)];
}

function entityQuads(polygons, texture, yaw) {
    const m = variantMatrix(0, yaw);
    return polygons.map(polygon => makeQuad(polygon.points.map(point => turnPoint(m, point)), polygon.uv, texture, { ao: false }));
}

function chestQuads(src, path, props) {
    const material = CHESTS[path];
    const type = path === 'ender_chest' ? 'single' : props.type || 'single';
    const texture = src.url('minecraft', `textures/entity/chest/${material}${type === 'left' ? '_left' : type === 'right' ? '_right' : ''}.png`);
    const lid = [0, 9, 1];
    let polygons;
    if (type === 'left') {
        polygons = [...cube(0, 19, 0, 0, 1, 15, 10, 14, 64, [0, 0, 0], 'west'), ...cube(0, 0, 0, 0, 0, 15, 5, 14, 64, lid, 'west'), ...cube(0, 0, 0, -2, 14, 1, 4, 1, 64, lid, 'west')];
    } else if (type === 'right') {
        polygons = [...cube(0, 19, 1, 0, 1, 15, 10, 14, 64, [0, 0, 0], 'east'), ...cube(0, 0, 1, 0, 0, 15, 5, 14, 64, lid, 'east'), ...cube(0, 0, 15, -2, 14, 1, 4, 1, 64, lid, 'east')];
    } else {
        polygons = [...cube(0, 19, 1, 0, 1, 14, 10, 14, 64, [0, 0, 0]), ...cube(0, 0, 1, 0, 0, 14, 5, 14, 64, lid), ...cube(0, 0, 7, -2, 14, 2, 4, 1, 64, lid)];
    }
    return entityQuads(polygons, texture, YAW[props.facing] ?? 0);
}

function bannerQuads(src, path, props) {
    const wall = Boolean(BANNER.exec(path)[2]);
    const base = src.url('minecraft', /^1\./.test(currentVersion()) ? 'textures/entity/banner_base.png' : 'textures/entity/banner/banner_base.png');
    const pattern = src.url('minecraft', 'textures/entity/banner/base.png');
    const angle = wall ? (YAW[props.facing] ?? 0) : (Number(props.rotation) || 0) * 22.5;
    const flagOffset = wall ? [0, -20.5, 10.5] : [0, -44, 0];
    const body = wall
        ? cube(0, 42, -10, -20.5, 9.5, 20, 2, 2, 64, [0, 0, 0])
        : [...cube(44, 0, -1, -42, -1, 2, 42, 2, 64, [0, 0, 0]), ...cube(0, 42, -10, -44, -1, 20, 2, 2, 64, [0, 0, 0])];
    const flag = cube(0, 0, -10, 0, -2, 20, 40, 1, 64, flagOffset);
    const cloth = cube(0, 0, -10.02, -0.02, -2.02, 20.04, 40.04, 1.04, 64, flagOffset);
    const radians = -angle * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    const m = [cos, 0, sin, 0, 1, 0, -sin, 0, cos];
    const place = polygons => polygons.map(polygon => ({
        points: polygon.points.map(([x, y, z]) => {
            const r = turn(m, [x * 2 / 3, -y * 2 / 3, -z * 2 / 3]);
            return [r[0] + 8, r[1], r[2] + 8];
        }),
        uv: polygon.uv
    }));
    const make = (polygons, texture, tint) => place(polygons).map(polygon => makeQuad(polygon.points, polygon.uv, texture, { ao: false, tint }));
    return [...make([...body, ...flag], base, -1), ...make(cloth, pattern, 0)];
}

function bellQuads(src) {
    const texture = src.url('minecraft', 'textures/entity/bell/bell_body.png');
    return entityQuads([...cube(0, 0, -3, -6, -3, 6, 7, 6, 32, [8, 12, 8]), ...cube(0, 13, 4, 4, 4, 8, 2, 8, 32, [0, 0, 0])], texture, 0);
}

async function fluidQuads(kind) {
    const height = 128 / 9;
    const faces = {};
    for (const dir of DIRS) faces[dir] = { texture: '#still', cullface: dir, tintindex: kind === 'water' ? 0 : -1 };
    const model = { textures: { still: `minecraft:block/${kind}_still` }, elements: [{ from: [0, 0, 0], to: [16, height, 16], faces }], ao: false };
    const { quads } = await bakeElements(source(null), model, { x: 0, y: 0 });
    for (const quad of quads) {
        quad.fluid = kind;
        quad.ao = false;
    }
    return quads;
}

const states = new Map();

export function stateKey(name, props) {
    const keys = Object.keys(props).sort();
    return keys.length ? `${name}[${keys.map(key => `${key}=${props[key]}`).join(',')}]` : name;
}

export function bakeState(name, props) {
    const key = `${currentVersion()}|${stateKey(name, props)}`;
    if (!states.has(key)) {
        const promise = bake(name, props).catch(error => {
            console.warn(error);
            return placeholder(name, 'error');
        });
        states.set(key, promise);
        promise.then(result => { if (result.problem === 'missing' || result.problem === 'error') states.delete(key); });
    }
    return states.get(key);
}

function placeholder(name, reason) {
    return {
        name, parts: [[{ weight: 1, quads: fullCube(MISSING) }]], full: true, opaque: true, shade: 0.2, ao: true,
        water: false, light: 0, problem: reason, selfCull: false
    };
}

function fullCube(url) {
    return DIRS.map(face => {
        const points = corners(face, [0, 0, 0], [16, 16, 16]);
        return makeQuad([points[0], points[3], points[2], points[1]], [[0, 0], [0, 1], [1, 1], [1, 0]], url, { cull: DIRS.indexOf(face) });
    });
}

async function bake(name, props) {
    const { ns, path } = splitId(name);
    const water = props.waterlogged === 'true' || (ns === 'minecraft' && (path === 'water' || path === 'bubble_column'));
    const light = lightOf(name, props);
    const base = {
        name, parts: [], full: false, opaque: false, shade: 1, ao: light === 0, water, light, problem: null,
        selfCull: ns === 'minecraft' && SELF_CULLING.test(path), glass: ns === 'minecraft' && GLASS.test(path)
    };
    if (ns === 'minecraft' && INVISIBLE.has(path)) return base;
    if (ns === 'minecraft' && (path === 'water' || path === 'bubble_column')) return base;
    if (ns === 'minecraft' && path === 'lava') return { ...base, parts: [[{ weight: 1, quads: await fluidQuads('lava') }]] };

    const attempt = async (src, file = path) => {
        const blockstate = await fetchJson(src.url(ns, `blockstates/${file}.json`));
        if (!blockstate) return null;
        const parts = [];
        let info = null;
        if (blockstate.variants) {
            const apply = pickVariant(blockstate.variants, props);
            if (apply) {
                const baked = await bakeApply(src, apply);
                parts.push(baked.options);
                info = baked;
            }
        } else if (Array.isArray(blockstate.multipart)) {
            for (const part of blockstate.multipart) {
                if (!matches(part.when, props)) continue;
                const baked = await bakeApply(src, part.apply);
                parts.push(baked.options);
                if (!info) info = { ...baked, full: false, opaque: false };
            }
        }
        const quadCount = parts.reduce((sum, options) => sum + (options[0] ? options[0].quads.length : 0), 0);
        return { parts, info, quadCount };
    };

    const special = ns === 'minecraft' && (path in CHESTS || path === 'bell' || path === 'decorated_pot' || BANNER.test(path));
    const current = source(null);
    let result = await attempt(current);
    if (!result && ns === 'minecraft' && ALIASES[path]) result = await attempt(current, ALIASES[path]);
    if (!special && (!result || result.quadCount === 0) && ns === 'minecraft' && currentVersion() !== FALLBACK_VERSION) {
        const fallback = await attempt(source(FALLBACK_VERSION));
        if (fallback && fallback.quadCount > 0) result = fallback;
    }
    if (!result && !special) return placeholder(name, 'missing');

    const parts = result ? result.parts : [];
    if (ns === 'minecraft' && path in CHESTS) parts.push([{ weight: 1, quads: chestQuads(current, path, props) }]);
    if (ns === 'minecraft' && path === 'bell') parts.push([{ weight: 1, quads: bellQuads(current) }]);
    if (ns === 'minecraft' && path === 'decorated_pot') parts.push([{ weight: 1, quads: potQuads(current, props) }]);
    if (ns === 'minecraft' && BANNER.test(path)) parts.push([{ weight: 1, quads: bannerQuads(current, path, props) }]);
    const quadCount = parts.reduce((sum, options) => sum + (options[0] ? options[0].quads.length : 0), 0);
    if (quadCount === 0) return { ...placeholder(name, 'unsupported'), water, light };

    const info = result && result.info;
    const full = Boolean(info && info.full);
    return {
        ...base,
        parts,
        full,
        opaque: Boolean(info && info.opaque),
        shade: full && !base.glass ? 0.2 : 1,
        ao: base.ao && (!info || info.ao)
    };
}

let water = null;
export function waterQuads() {
    const key = currentVersion();
    if (!water || water.key !== key) water = { key, quads: fluidQuads('water') };
    return water.quads;
}
