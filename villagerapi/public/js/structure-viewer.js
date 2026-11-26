import { VEC, FACE_SHADE, MISSING, bakeState, textureInfo, tintFor, fluidTextures, quadOf, stateKey, blockExtra, cushionQuads } from './structure-models.js';
import { parseState, plain, TAG } from './structure-core.js';
import { entityModel, signTextQuads } from './structure-entities.js';

const THREE_URL = new URL('./vendor/three.module.min.js', import.meta.url).href;
const FOV = 40;
const MIN_PITCH = -Math.PI / 2 + 0.002;
const MAX_PITCH = Math.PI / 2 - 0.002;
const TANGENTS = [[0, 2], [0, 2], [0, 1], [0, 1], [2, 1], [2, 1]];
const AXIS_VIEWS = {
    front: [0, 0], back: [Math.PI, 0], right: [Math.PI / 2, 0], left: [-Math.PI / 2, 0], top: [0, MAX_PITCH], bottom: [0, MIN_PITCH]
};

const VERTEX = `
attribute vec3 shade;
attribute float key;
varying vec2 vUv;
varying vec3 vShade;
varying float vKey;
void main() {
    vUv = uv;
    vShade = shade;
    vKey = key;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = `
uniform sampler2D map;
uniform float alphaCut;
uniform float highlight;
varying vec2 vUv;
varying vec3 vShade;
varying float vKey;
void main() {
    vec4 texel = texture2D(map, vUv);
    if (texel.a < alphaCut) discard;
    vec3 color = texel.rgb * vShade;
    if (highlight > -0.5) {
        if (abs(vKey - highlight) < 0.5) color = mix(color, vec3(1.0, 0.86, 0.3), 0.3);
        else color *= 0.28;
    }
    gl_FragColor = vec4(color, texel.a);
}`;

const PORTAL_VERTEX = `
varying vec4 vProj;
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 mid = gl_Position * 0.5;
    vProj = vec4(mid.x + mid.w, mid.y + mid.w, gl_Position.z, gl_Position.w);
}`;

const PORTAL_FRAGMENT = `
uniform sampler2D sky;
uniform sampler2D stars;
uniform float time;
uniform float layers;
varying vec4 vProj;
vec3 layerColor(int i) {
    if (i == 0) return vec3(0.022087, 0.098399, 0.110818);
    if (i == 1) return vec3(0.011892, 0.095924, 0.089485);
    if (i == 2) return vec3(0.027636, 0.101689, 0.100326);
    if (i == 3) return vec3(0.046564, 0.109883, 0.114838);
    if (i == 4) return vec3(0.064901, 0.117696, 0.097189);
    if (i == 5) return vec3(0.063761, 0.086895, 0.123646);
    if (i == 6) return vec3(0.084817, 0.111994, 0.166380);
    if (i == 7) return vec3(0.097489, 0.154120, 0.091064);
    if (i == 8) return vec3(0.106152, 0.131144, 0.195191);
    if (i == 9) return vec3(0.097721, 0.110188, 0.187229);
    if (i == 10) return vec3(0.133516, 0.138278, 0.148582);
    if (i == 11) return vec3(0.070006, 0.243332, 0.235792);
    if (i == 12) return vec3(0.196766, 0.142899, 0.214696);
    if (i == 13) return vec3(0.047281, 0.315338, 0.321970);
    if (i == 14) return vec3(0.204675, 0.390010, 0.302066);
    return vec3(0.080955, 0.314821, 0.661491);
}
mat4 portalLayer(float layer) {
    mat4 translate = mat4(1.0, 0.0, 0.0, 17.0 / layer, 0.0, 1.0, 0.0, (2.0 + layer / 1.5) * (time * 1.5), 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
    float angle = radians((layer * layer * 4321.0 + layer * 9.0) * 2.0);
    mat2 rotate = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    mat2 scale = mat2((4.5 - layer / 4.0) * 2.0);
    mat4 scaleTranslate = mat4(0.5, 0.0, 0.0, 0.25, 0.0, 0.5, 0.0, 0.25, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
    return mat4(scale * rotate) * translate * scaleTranslate;
}
void main() {
    vec3 color = texture2D(sky, vProj.xy / vProj.w).rgb * layerColor(0);
    for (int i = 0; i < 16; i++) {
        if (float(i) >= layers) break;
        vec4 p = vProj * portalLayer(float(i + 1));
        color += texture2D(stars, p.xy / p.w).rgb * layerColor(i);
    }
    gl_FragColor = vec4(color, 1.0);
}`;

function hash(x, y, z, salt) {
    let h = Math.imul(x, 3129871) ^ Math.imul(z, 116129781) ^ y ^ Math.imul(salt + 1, 0x27d4eb2d);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function choose(options, x, y, z, salt) {
    if (options.length === 1) return options[0];
    const total = options.reduce((sum, option) => sum + option.weight, 0);
    let pick = hash(x, y, z, salt) * total;
    for (const option of options) {
        pick -= option.weight;
        if (pick < 0) return option;
    }
    return options[options.length - 1];
}

const lightmaps = new Map();

function lightmap(mode) {
    if (lightmaps.has(mode)) return lightmaps.get(mode);
    const night = mode === 'night';
    const skyFactor = night ? 0.24 : 1;
    const skyColor = night ? [122 / 255, 122 / 255, 1] : [1, 1, 1];
    const tint = [1, 216 / 255, 140 / 255];
    const brightness = level => level / (4 - 3 * level);
    const table = new Float32Array(16 * 16 * 3);
    for (let sky = 0; sky < 16; sky++) {
        for (let block = 0; block < 16; block++) {
            const blockLevel = block / 15;
            const blockBrightness = brightness(blockLevel) * 1.4;
            const skyBrightness = brightness(sky / 15) * skyFactor;
            const whiten = 0.9 * (2 * blockLevel - 1) * (2 * blockLevel - 1);
            const color = [0, 1, 2].map(i => Math.min(1, Math.max(0, skyColor[i] * skyBrightness + (tint[i] + (1 - tint[i]) * whiten) * blockBrightness)));
            const max = Math.max(color[0], color[1], color[2]);
            if (max > 0) {
                const inverse = 1 - max;
                const scaled = 1 - inverse * inverse * inverse * inverse;
                for (let i = 0; i < 3; i++) color[i] += (color[i] * scaled / max - color[i]) * 0.5;
            }
            table.set(color, (sky * 16 + block) * 3);
        }
    }
    lightmaps.set(mode, table);
    return table;
}

function lightColor(table, sky, block) {
    const s = Math.min(15, Math.max(0, sky)), b = Math.min(15, Math.max(0, block));
    const s0 = Math.floor(s), b0 = Math.floor(b);
    const s1 = Math.min(15, s0 + 1), b1 = Math.min(15, b0 + 1);
    const fs = s - s0, fb = b - b0;
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
        const low = table[(s0 * 16 + b0) * 3 + i] * (1 - fb) + table[(s0 * 16 + b1) * 3 + i] * fb;
        const high = table[(s1 * 16 + b0) * 3 + i] * (1 - fb) + table[(s1 * 16 + b1) * 3 + i] * fb;
        out[i] = low * (1 - fs) + high * fs;
    }
    return out;
}

class Grid {
    constructor(size) {
        this.sx = size[0];
        this.sy = size[1];
        this.sz = size[2];
        this.py = this.sy + 2;
        this.pz = this.sz + 2;
        const cells = (this.sx + 2) * this.py * this.pz;
        this.opaque = new Uint8Array(cells);
        this.solid = new Uint8Array(cells);
        this.damp = new Uint8Array(cells);
        this.shade = new Float32Array(cells).fill(1);
        this.fluid = new Uint8Array(cells);
        this.own = new Float32Array(cells);
        this.full = new Uint8Array(cells);
        this.self = new Uint8Array(cells);
        this.emissive = new Uint8Array(cells);
        this.kind = new Int32Array(cells).fill(-1);
        this.sky = null;
        this.block = null;
    }

    at(x, y, z) {
        if (x < -1 || y < -1 || z < -1 || x > this.sx || y > this.sy || z > this.sz) return -1;
        return ((x + 1) * this.py + (y + 1)) * this.pz + (z + 1);
    }
}

const FULL_FACE = 0xffff;

function computeLight(grid, masksOf, emitters) {
    const { py, pz } = grid;
    const sx = grid.sx + 2;
    const cells = grid.kind.length;
    const sky = new Uint8Array(cells);
    const block = new Uint8Array(cells);
    const step = [-pz, pz, -1, 1, -py * pz, py * pz];
    const mask = (cell, dir) => {
        const masks = grid.kind[cell] >= 0 ? masksOf(grid.kind[cell]) : null;
        return masks ? masks[dir] : 0;
    };
    const occludes = (from, to, dir) => {
        const a = mask(from, dir), b = mask(to, dir ^ 1);
        return (a || b) && ((a | b) & FULL_FACE) === FULL_FACE;
    };
    const flood = (levels, isSky) => {
        const buckets = Array.from({ length: 16 }, () => []);
        for (let cell = 0; cell < cells; cell++) if (levels[cell] > 1) buckets[levels[cell]].push(cell);
        for (let level = 15; level >= 2; level--) {
            const bucket = buckets[level];
            for (let i = 0; i < bucket.length; i++) {
                const cell = bucket[i];
                if (levels[cell] !== level) continue;
                const z = cell % pz, y = Math.floor(cell / pz) % py, x = Math.floor(cell / (py * pz));
                for (let dir = 0; dir < 6; dir++) {
                    if ((dir === 0 && y === 0) || (dir === 1 && y === py - 1) || (dir === 2 && z === 0) || (dir === 3 && z === pz - 1) || (dir === 4 && x === 0) || (dir === 5 && x === sx - 1)) continue;
                    const next = cell + step[dir];
                    const damp = grid.damp[next];
                    if (damp >= 15 || occludes(cell, next, dir)) continue;
                    const value = isSky && dir === 0 && level === 15 && damp === 0 ? 15 : level - Math.max(1, damp);
                    if (value > levels[next]) {
                        levels[next] = value;
                        buckets[value].push(next);
                    }
                }
            }
        }
    };
    for (let x = 0; x < sx; x++) {
        for (let z = 0; z < pz; z++) {
            let level = 15;
            let above = -1;
            for (let y = py - 1; y >= 0; y--) {
                const cell = (x * py + y) * pz + z;
                const damp = grid.damp[cell];
                if (above >= 0) {
                    if (damp >= 15 || occludes(above, cell, 0)) level = 0;
                    else level = level === 15 && damp === 0 ? 15 : Math.max(0, level - Math.max(1, damp));
                } else if (damp >= 15) level = 0;
                sky[cell] = level;
                above = cell;
            }
        }
    }
    flood(sky, true);
    for (const [cell, level] of emitters) if (level > block[cell]) block[cell] = level;
    flood(block, false);
    grid.sky = sky;
    grid.block = block;
}

function mergePlain(base, patch) {
    const out = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        out[key] = value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])
            ? mergePlain(base[key], value) : value;
    }
    return out;
}

function fillProps(props, info) {
    const [allowed, defaults] = info;
    const out = {};
    for (const [key, fallback] of Object.entries(defaults)) {
        const value = props[key];
        out[key] = value !== undefined && (!allowed[key] || allowed[key].includes(String(value))) ? String(value) : String(fallback);
    }
    return out;
}

const SPECIAL_DATA = /[:_](banner|decorated_pot)$/;

async function buildMesh(view, options) {
    const [sx, sy, sz] = view.size;
    const palette = view.palettes[options.paletteIndex] || view.palettes[0] || [];
    const instances = [];
    const unique = new Map();
    for (let i = 0; i < view.blocks.length; i++) {
        const block = view.blocks[i];
        const entry = palette[block.state];
        if (!entry) continue;
        let { name, props } = entry;
        const original = name;
        if (name === 'minecraft:structure_block' && props.mode === 'data' && !options.showJigsaws) continue;
        let fromJigsaw = false;
        if (name === 'minecraft:jigsaw' && !options.showJigsaws && block.finalState) {
            ({ name, props } = parseState(block.finalState));
            fromJigsaw = true;
        }
        const keyName = fromJigsaw ? name : original;
        const swap = options.swaps && options.swaps[name];
        if (swap && (!fromJigsaw || options.swapFinalStates)) name = swap;
        const defaults = options.defaults && options.defaults(name);
        if (defaults) props = fillProps(props, defaults);
        let extra = null;
        if (SPECIAL_DATA.test(name)) {
            let data = block.nbt && !fromJigsaw ? plain(TAG.COMPOUND, block.nbt) : {};
            const patch = options.blockData && !fromJigsaw && options.blockData[keyName];
            if (patch) data = mergePlain(data, patch);
            extra = blockExtra(name, data);
        }
        const id = stateKey(name, props) + (extra ? JSON.stringify(extra) : '');
        if (!unique.has(id)) unique.set(id, { name, props, extra, index: unique.size });
        instances.push({ block: i, x: block.x, y: block.y, z: block.z, state: unique.get(id), key: options.keyOf ? options.keyOf(keyName) : -1, original: keyName, shown: name });
    }

    const entities = [];
    const missingParts = new Map();
    const note = label => missingParts.set(label, (missingParts.get(label) || 0) + 1);
    await Promise.all((view.entities || []).map(async entity => {
        if (entity.id === 'minecraft:cushion') {
            const data = plain(TAG.COMPOUND, entity.nbt);
            const [ex, ey, ez] = entity.pos;
            const x = Math.floor(ex), y = Math.floor(ey), z = Math.floor(ez);
            const yaw = Math.round((Array.isArray(data.Rotation) ? Number(data.Rotation[0]) || 0 : 0) / 90) * 90;
            entities.push({ x, y, z, quads: cushionQuads(String(data.color || 'white'), yaw, [(ex - x) * 16, (ey - y) * 16, (ez - z) * 16]) });
            return;
        }
        const result = await entityModel(entity).catch(error => { console.warn(error); return null; });
        if (!result) { note(entity.id.replace(/^minecraft:/, '').replace(/_/g, ' ')); return; }
        for (const label of result.notes) note(label);
        if (result.quads.length) entities.push({ x: result.cell[0], y: result.cell[1], z: result.cell[2], quads: result.quads });
    }));
    await Promise.all(instances.map(async instance => {
        if (!/_sign$/.test(instance.shown)) return;
        const block = view.blocks[instance.block];
        if (!block || !block.nbt) return;
        const quads = await signTextQuads(instance.shown, instance.state.props, block.nbt).catch(() => []);
        if (quads.length) instance.text = quads;
    }));

    const states = [...unique.values()];
    const baked = await Promise.all(states.map(state => bakeState(state.name, state.props, state.extra)));
    if (options.isStale && options.isStale()) return null;

    const grid = new Grid([sx, sy, sz]);
    const emitters = [];
    const fluidKinds = new Set();
    for (const instance of instances) {
        const cell = grid.at(instance.x, instance.y, instance.z);
        if (cell < 0) continue;
        const result = baked[instance.state.index];
        instance.cell = cell;
        if (result.opaque) grid.opaque[cell] = 1;
        if (result.solid) grid.solid[cell] = 1;
        if (result.motion) grid.full[cell] = 1;
        grid.damp[cell] = result.dampen ?? (result.opaque ? 15 : 0);
        grid.shade[cell] = result.shade;
        if (result.water) grid.fluid[cell] = 1;
        else if (result.fluid === 'lava') grid.fluid[cell] = 2;
        grid.self[cell] = result.light;
        if (result.emissive) grid.emissive[cell] = 1;
        grid.kind[cell] = instance.state.index;
        if (result.light > 0) emitters.push([cell, result.light]);
    }
    for (const instance of instances) {
        const kind = instance.cell === undefined ? 0 : grid.fluid[instance.cell];
        if (!kind) continue;
        const level = /^minecraft:(water|lava)$/.test(instance.state.name) ? Number(instance.state.props.level) || 0 : 0;
        const amount = level === 0 || level >= 8 ? 8 : 8 - level;
        instance.fluid = kind === 1 ? 'water' : 'lava';
        grid.own[instance.cell] = amount / 9;
        fluidKinds.add(instance.fluid);
    }
    const fluidSprites = new Map([...fluidKinds].map(kind => [kind, fluidTextures(kind)]));

    const urls = new Set();
    for (const result of baked) for (const part of result.parts) for (const option of part) for (const quad of option.quads) urls.add(quad.texture);
    for (const sprites of fluidSprites.values()) for (const url of Object.values(sprites)) if (url) urls.add(url);
    for (const entity of entities) for (const quad of entity.quads) urls.add(quad.texture);
    for (const instance of instances) if (instance.text) for (const quad of instance.text) urls.add(quad.texture);
    const infos = new Map();
    await Promise.all([...urls].map(async url => infos.set(url, (await textureInfo(url)) || (await textureInfo(MISSING)))));
    if (options.isStale && options.isStale()) return null;

    const lighting = options.lighting && options.lighting !== 'off';
    const table = lighting ? lightmap(options.lighting) : null;
    if (lighting) computeLight(grid, kind => baked[kind].masks, emitters);

    const buckets = new Map();
    const bucketFor = (url, forced) => {
        const info = infos.get(url);
        const layer = forced || info.layer;
        const id = `${layer}|${info.url}`;
        if (!buckets.has(id)) buckets.set(id, { info, layer, pos: [], uv: [], shade: [], key: [], index: [], owners: [], centers: [] });
        return buckets.get(id);
    };

    const OUTSIDE = [15, 0];
    const BRIGHT = [15, 15];
    const shadeAt = (x, y, z) => { const c = grid.at(x, y, z); return c < 0 ? 1 : grid.shade[c]; };
    const permeable = (x, y, z) => { const c = grid.at(x, y, z); return c < 0 || !grid.opaque[c]; };
    const coordsAt = (x, y, z) => {
        const c = grid.at(x, y, z);
        if (c < 0) return OUTSIDE;
        if (grid.emissive[c]) return BRIGHT;
        return [grid.sky[c], Math.max(grid.block[c], grid.self[c])];
    };
    const blend = (a, b, c, center) => {
        if (center[0] > 2 || center[1] > 2) {
            const fix = n => (n[0] === 0 && n[1] === 0 ? center : n[0] === 0 ? [center[0], n[1]] : n);
            a = fix(a); b = fix(b); c = fix(c);
        }
        return [(a[0] + b[0] + c[0] + center[0]) / 4, (a[1] + b[1] + c[1] + center[1]) / 4];
    };

    const faceSample = (x, y, z, dir, cubic, useAo) => {
        const [dx, dy, dz] = VEC[dir];
        const bx = cubic ? x + dx : x, by = cubic ? y + dy : y, bz = cubic ? z + dz : z;
        const [axisA, axisB] = TANGENTS[dir];
        const offset = (axis, sign) => [axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0];
        const center = cubic ? shadeAt(bx, by, bz) : shadeAt(x, y, z);
        let centerLight = null;
        if (lighting) {
            const next = grid.at(x + dx, y + dy, z + dz);
            centerLight = cubic || !(next >= 0 && grid.solid[next]) ? coordsAt(x + dx, y + dy, z + dz) : coordsAt(x, y, z);
        }
        const values = [];
        const lights = [];
        for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const a = offset(axisA, sa), b = offset(axisB, sb);
            const ax = bx + a[0], ay = by + a[1], az = bz + a[2];
            const cx = bx + b[0], cy = by + b[1], cz = bz + b[2];
            const shadeA = shadeAt(ax, ay, az);
            const shadeB = shadeAt(cx, cy, cz);
            const open = permeable(ax + dx, ay + dy, az + dz) || permeable(cx + dx, cy + dy, cz + dz);
            const ox = bx + a[0] + b[0], oy = by + a[1] + b[1], oz = bz + a[2] + b[2];
            if (useAo) values.push((shadeA + shadeB + (open ? shadeAt(ox, oy, oz) : shadeA) + center) * 0.25);
            if (lighting) {
                const la = coordsAt(ax, ay, az);
                lights.push(blend(la, coordsAt(cx, cy, cz), open ? coordsAt(ox, oy, oz) : la, centerLight));
            }
        }
        return { values, lights, axisA, axisB };
    };

    const flatLight = (instance, dir, cubic) => {
        if (grid.emissive[instance.cell]) return BRIGHT;
        const [dx, dy, dz] = VEC[dir];
        const c = cubic ? grid.at(instance.x + dx, instance.y + dy, instance.z + dz) : instance.cell;
        const own = grid.self[instance.cell];
        if (c < 0) return [15, own];
        return [grid.sky[c], Math.max(grid.block[c], own)];
    };

    const isCubic = (quad, result) => {
        const axis = quad.dir < 2 ? 1 : quad.dir < 4 ? 2 : 0;
        const v0 = quad.p[axis], v1 = quad.p[3 + axis], v2 = quad.p[6 + axis], v3 = quad.p[9 + axis];
        if (v0 !== v1 || v1 !== v2 || v2 !== v3) return false;
        return (quad.dir % 2 === 1 ? v0 > 0.9999 : v0 < 0.0001) || result.shade === 0.2;
    };

    let quadCount = 0;
    const emit = (quad, instance, tint, useAo, result, fixedLight) => {
        const { x, y, z } = instance;
        const cubic = (useAo || lighting) && !fixedLight ? isCubic(quad, result) : false;
        const smoothLight = lighting && !fixedLight && useAo;
        const sample = useAo || smoothLight ? faceSample(x, y, z, quad.dir, cubic, useAo) : null;
        const flat = lighting && !smoothLight ? (fixedLight || flatLight(instance, quad.dir, cubic)) : null;
        const directional = quad.shade ? FACE_SHADE[quad.shadeDir] : 1;
        const tr = ((tint >> 16) & 255) / 255, tg = ((tint >> 8) & 255) / 255, tb = (tint & 255) / 255;
        const bucket = bucketFor(quad.texture, quad.layer);
        const base = bucket.pos.length / 3;
        const emission = quad.emission || 0;
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < 4; i++) {
            const px = quad.p[i * 3], py = quad.p[i * 3 + 1], pz = quad.p[i * 3 + 2];
            bucket.pos.push(x + px, y + py, z + pz);
            cx += px; cy += py; cz += pz;
            bucket.uv.push(quad.uv[i * 2], quad.uv[i * 2 + 1]);
            let ao = 1;
            let light = [1, 1, 1];
            if (sample) {
                const point = [px, py, pz];
                const a = Math.min(1, Math.max(0, point[sample.axisA]));
                const b = Math.min(1, Math.max(0, point[sample.axisB]));
                const w = [(1 - a) * (1 - b), a * (1 - b), a * b, (1 - a) * b];
                if (useAo) ao = sample.values[0] * w[0] + sample.values[1] * w[1] + sample.values[2] * w[2] + sample.values[3] * w[3];
                if (smoothLight) {
                    let skyLevel = 0, blockLevel = 0;
                    for (let k = 0; k < 4; k++) { skyLevel += sample.lights[k][0] * w[k]; blockLevel += sample.lights[k][1] * w[k]; }
                    light = lightColor(table, Math.max(skyLevel, emission), Math.max(blockLevel, emission));
                }
            }
            if (flat) light = lightColor(table, Math.max(flat[0], emission), Math.max(flat[1], emission));
            const s = directional * ao;
            bucket.shade.push(s * tr * light[0], s * tg * light[1], s * tb * light[2]);
            bucket.key.push(instance.key);
        }
        bucket.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
        bucket.owners.push(instance.block);
        bucket.centers.push(x + cx / 4, y + cy / 4, z + cz / 4);
        quadCount++;
    };

    const fluidCode = kind => (kind === 'water' ? 1 : 2);
    const blocksMotion = c => grid.full[c] === 1;
    const heightAt = (x, y, z, code) => {
        const c = grid.at(x, y, z);
        if (c < 0) return -1;
        if (grid.fluid[c] === code) {
            const up = grid.at(x, y + 1, z);
            return up >= 0 && grid.fluid[up] === code ? 1 : grid.own[c];
        }
        return blocksMotion(c) ? -1 : 0;
    };
    const weighted = (sum, height) => {
        if (height >= 0.8) { sum[0] += height * 10; sum[1] += 10; } else if (height >= 0) { sum[0] += height; sum[1] += 1; }
    };
    const average = (x, y, z, code, self, a, b, cx, cz) => {
        if (a >= 1 || b >= 1) return 1;
        const sum = [0, 0];
        if (a > 0 || b > 0) {
            const corner = heightAt(x + cx, y, z + cz, code);
            if (corner >= 1) return 1;
            weighted(sum, corner);
        }
        weighted(sum, self);
        weighted(sum, a);
        weighted(sum, b);
        return sum[0] / sum[1];
    };
    const flowOf = (x, y, z, code) => {
        const own = grid.own[grid.at(x, y, z)];
        let fx = 0, fz = 0;
        for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const n = grid.at(x + dx, y, z + dz);
            if (n < 0 || (grid.fluid[n] && grid.fluid[n] !== code)) continue;
            const same = grid.fluid[n] === code;
            const neighbor = same ? grid.own[n] : 0;
            let distance = 0;
            if (neighbor === 0) {
                if (!blocksMotion(n)) {
                    const below = grid.at(x + dx, y - 1, z + dz);
                    if (below >= 0 && grid.fluid[below] === code && grid.own[below] > 0) distance = own - (grid.own[below] - 0.8888889);
                }
            } else distance = own - neighbor;
            fx += dx * distance;
            fz += dz * distance;
        }
        return [fx, fz];
    };
    const overlayNeighbor = c => {
        if (c < 0 || grid.kind[c] < 0) return false;
        const name = baked[grid.kind[c]].name;
        return /^minecraft:(.*_)?(glass|ice|slime_block|honey_block|leaves)$|_leaves$|stained_glass$/.test(name);
    };
    const fluidFace = (points, uv, texture, dir, instance, tint, result, light, back) => {
        let quad = quadOf(points.map(p => p.map(v => v * 16)), uv, texture, { ao: false });
        if (quad.dir !== dir) quad = quadOf(points.slice().reverse().map(p => p.map(v => v * 16)), uv.slice().reverse(), texture, { ao: false });
        quad.shadeDir = dir;
        quad.dir = dir;
        emit(quad, instance, tint, false, result, light);
        if (back) {
            const reverse = quadOf(points.slice().reverse().map(p => p.map(v => v * 16)), uv.slice().reverse(), texture, { ao: false });
            reverse.shadeDir = dir;
            emit(reverse, instance, tint, false, result, light);
        }
    };
    const emitFluid = (instance, result) => {
        const { x, y, z } = instance;
        const kind = instance.fluid;
        const code = fluidCode(kind);
        const sprites = fluidSprites.get(kind);
        const tint = kind === 'water' ? tintFor('minecraft:water', {}, options.tints, 0) : 0xffffff;
        const near = (dx, dy, dz) => grid.at(x + dx, y + dy, z + dz);
        const same = c => c >= 0 && grid.fluid[c] === code;
        const solidAt = c => c >= 0 && grid.opaque[c] === 1;
        const up = near(0, 1, 0), down = near(0, -1, 0);
        const self = heightAt(x, y, z, code);
        let ne = 1, nw = 1, se = 1, sw = 1;
        if (self < 1) {
            const hn = heightAt(x, y, z - 1, code), hs = heightAt(x, y, z + 1, code), he = heightAt(x + 1, y, z, code), hw = heightAt(x - 1, y, z, code);
            ne = average(x, y, z, code, self, hn, he, 1, -1);
            nw = average(x, y, z, code, self, hn, hw, -1, -1);
            se = average(x, y, z, code, self, hs, he, 1, 1);
            sw = average(x, y, z, code, self, hs, hw, -1, 1);
        }
        let light = null, lightBelow = null;
        if (lighting) {
            const own = coordsAt(x, y, z), above = coordsAt(x, y + 1, z), below = coordsAt(x, y - 1, z);
            light = [Math.max(own[0], above[0]), Math.max(own[1], above[1])];
            lightBelow = [Math.max(own[0], below[0]), Math.max(own[1], below[1])];
        }
        const renderDown = !same(down) && !solidAt(down);
        const bottom = renderDown ? 0.001 : 0;
        if (!same(up) && !(Math.min(ne, nw, se, sw) >= 1 && solidAt(up))) {
            const [fx, fz] = flowOf(x, y, z, code);
            let uv, texture;
            if (fx === 0 && fz === 0) {
                texture = sprites.still;
                uv = [[0, 0], [0, 1], [1, 1], [1, 0]];
            } else {
                texture = sprites.flow;
                const angle = Math.atan2(fz, fx) - Math.PI / 2;
                const sn = Math.sin(angle) * 0.25, cs = Math.cos(angle) * 0.25;
                uv = [[0.5 + (-cs - sn), 0.5 + (-cs + sn)], [0.5 + (-cs + sn), 0.5 + (cs + sn)], [0.5 + (cs + sn), 0.5 + (cs - sn)], [0.5 + (cs - sn), 0.5 + (-cs - sn)]];
            }
            fluidFace([[0, nw - 0.001, 0], [0, sw - 0.001, 1], [1, se - 0.001, 1], [1, ne - 0.001, 0]], uv, texture, 1, instance, tint, result, light, !solidAt(up));
        }
        if (renderDown) fluidFace([[0, bottom, 0], [1, bottom, 0], [1, bottom, 1], [0, bottom, 1]], [[0, 0], [1, 0], [1, 1], [0, 1]], sprites.still, 0, instance, tint, result, lightBelow, false);
        const sides = [
            [2, [0, 0, -1], nw, ne, [0, 0.001], [1, 0.001]],
            [3, [0, 0, 1], se, sw, [1, 0.999], [0, 0.999]],
            [4, [-1, 0, 0], sw, nw, [0.001, 1], [0.001, 0]],
            [5, [1, 0, 0], ne, se, [0.999, 0], [0.999, 1]]
        ];
        for (const [dir, [dx, , dz], h0, h1, [x0, z0], [x1, z1]] of sides) {
            const n = near(dx, 0, dz);
            if (same(n) || solidAt(n)) continue;
            const overlay = sprites.overlay && overlayNeighbor(n);
            const texture = overlay ? sprites.overlay : sprites.flow;
            fluidFace([[x0, h0, z0], [x1, h1, z1], [x1, bottom, z1], [x0, bottom, z0]], [[0, (1 - h0) * 0.5], [0.5, (1 - h1) * 0.5], [0.5, 0.5], [0, 0.5]], texture, dir, instance, tint, result, light, !overlay);
        }
    };

    const problems = new Map();
    let shown = 0;
    for (const instance of instances) {
        if (instance.cell === undefined) continue;
        const result = baked[instance.state.index];
        const { x, y, z } = instance;
        if (result.problem) problems.set(instance.shown, result.problem);
        if (result.parts.length || instance.fluid) shown++;
        const smooth = options.smooth !== false && result.ao;
        const tints = new Map();
        result.parts.forEach((choices, partIndex) => {
            const option = choose(choices, x, y, z, partIndex);
            for (const quad of option.quads) {
                if (quad.cull >= 0) {
                    const [dx, dy, dz] = VEC[quad.cull];
                    const next = grid.at(x + dx, y + dy, z + dz);
                    if (next >= 0 && grid.opaque[next]) continue;
                    if (next >= 0 && result.selfCull && grid.kind[next] === instance.state.index) continue;
                }
                let color = 0xffffff;
                if (quad.color >= 0) color = quad.color;
                else if (quad.tint >= 0) {
                    if (!tints.has(quad.tint)) tints.set(quad.tint, tintFor(instance.state.name, instance.state.props, options.tints, quad.tint));
                    color = tints.get(quad.tint);
                }
                emit(quad, instance, color, smooth && quad.ao, result);
            }
        });
        if (instance.fluid) emitFluid(instance, result);
        if (instance.text) {
            const fixed = lighting ? coordsAt(x, y, z) : null;
            for (const quad of instance.text) emit(quad, instance, 0xffffff, false, result, fixed);
        }
    }

    for (const entity of entities) {
        const cell = grid.at(entity.x, entity.y, entity.z);
        const instance = { block: -1, key: -1, x: entity.x, y: entity.y, z: entity.z, cell: cell < 0 ? 0 : cell };
        const fixed = lighting ? (cell < 0 ? OUTSIDE : coordsAt(entity.x, entity.y, entity.z)) : null;
        for (const quad of entity.quads) emit(quad, instance, quad.color >= 0 ? quad.color : 0xffffff, false, { shade: 1 }, fixed);
    }

    return { buckets, instances, problems, quadCount, shown, notDrawn: missingParts };
}

class Navigator {
    constructor(viewer) {
        this.viewer = viewer;
        this.yaw = Math.PI / 4;
        this.pitch = Math.PI / 6;
        this.distance = 20;
        this.target = null;
        this.ortho = false;
        this.autoOrtho = false;
    }

    apply() {
        const { THREE, perspective, orthographic, canvas } = this.viewer;
        const offset = new THREE.Vector3(
            Math.cos(this.pitch) * Math.sin(this.yaw),
            Math.sin(this.pitch),
            Math.cos(this.pitch) * Math.cos(this.yaw)
        ).multiplyScalar(this.distance);
        const aspect = Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
        for (const camera of [perspective, orthographic]) {
            camera.position.copy(this.target).add(offset);
            camera.lookAt(this.target);
            camera.updateMatrixWorld();
        }
        const far = Math.max(1000, this.distance * 8);
        const slope = this.slope();
        perspective.fov = 2 * Math.atan(slope) * 180 / Math.PI;
        perspective.aspect = aspect;
        perspective.near = Math.max(0.05, this.distance / 2000);
        perspective.far = far;
        perspective.updateProjectionMatrix();
        const half = this.distance * slope;
        orthographic.left = -half * aspect;
        orthographic.right = half * aspect;
        orthographic.top = half;
        orthographic.bottom = -half;
        orthographic.near = -far;
        orthographic.far = far;
        orthographic.updateProjectionMatrix();
        this.viewer.camera = this.ortho ? orthographic : perspective;
        if (this.reported !== this.ortho) {
            this.reported = this.ortho;
            if (this.viewer.callbacks.onOrtho) this.viewer.callbacks.onOrtho(this.ortho);
        }
        this.viewer.requestRender();
    }

    slope() {
        const { canvas } = this.viewer;
        const aspect = Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
        return Math.min(Math.tan(40 * Math.PI / 180), Math.tan(FOV * Math.PI / 360) / Math.min(1, aspect));
    }

    orbit(dx, dy) {
        if (this.autoOrtho) { this.ortho = false; this.autoOrtho = false; }
        this.yaw -= dx * 0.008;
        this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dy * 0.008));
        this.apply();
    }

    unitsPerPixel() {
        return 2 * this.distance * this.slope() / Math.max(1, this.viewer.canvas.clientHeight);
    }

    pan(dx, dy) {
        const { THREE } = this.viewer;
        const camera = this.viewer.camera;
        const scale = this.unitsPerPixel();
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        this.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
        this.apply();
    }

    zoom(factor, anchor) {
        const next = Math.min(4000, Math.max(0.4, this.distance * factor));
        const real = next / this.distance;
        if (anchor) this.target.sub(anchor).multiplyScalar(real).add(anchor);
        this.distance = next;
        this.apply();
    }

    view(name) {
        const [yaw, pitch] = AXIS_VIEWS[name];
        this.yaw = yaw;
        this.pitch = pitch;
        if (!this.ortho) { this.ortho = true; this.autoOrtho = true; }
        this.apply();
    }

    opposite() {
        this.yaw += Math.PI;
        this.pitch = -this.pitch;
        this.apply();
    }

    lookFrom(vector) {
        const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
        const pitch = Math.asin(Math.max(-1, Math.min(1, vector[1] / length)));
        this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch));
        if (Math.abs(vector[0]) + Math.abs(vector[2]) > 1e-6) this.yaw = Math.atan2(vector[0], vector[2]);
        if (!this.ortho) { this.ortho = true; this.autoOrtho = true; }
        this.apply();
    }

    pivot(point) {
        const camera = this.viewer.camera;
        const offset = camera.position.clone().sub(point);
        const distance = offset.length();
        if (distance < 0.01) return;
        this.target.copy(point);
        if (!this.ortho) {
            this.distance = distance;
            this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, Math.asin(offset.y / distance)));
            this.yaw = Math.atan2(offset.x, offset.z);
        }
        this.apply();
    }
}

export class StructureViewer {
    constructor(host, callbacks = {}) {
        this.host = host;
        this.callbacks = callbacks;
        this.ready = this.init();
    }

    async init() {
        const THREE = await import(THREE_URL);
        this.THREE = THREE;
        const canvas = document.createElement('canvas');
        canvas.className = 'sv-canvas';
        canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', 'Structure preview. Drag to rotate, right drag to pan, scroll to zoom.');
        this.host.prepend(canvas);
        this.canvas = canvas;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setClearColor(0x000000, 0);
        this.renderer = renderer;
        this.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        this.scene = new THREE.Scene();
        this.world = new THREE.Group();
        this.scene.add(this.world);
        this.helpers = new THREE.Group();
        this.scene.add(this.helpers);
        this.perspective = new THREE.PerspectiveCamera(FOV, 1, 0.05, 1000);
        this.orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
        this.camera = this.perspective;
        this.nav = new Navigator(this);
        this.nav.target = new THREE.Vector3();
        this.textures = new Map();
        this.materials = new Map();
        this.meshes = [];
        this.animated = [];
        this.highlightKey = -1;
        this.selectedKey = -1;
        this.visible = true;
        this.pending = false;
        this.raycaster = new THREE.Raycaster();
        this.mountGizmo();
        this.bindInput();
        new ResizeObserver(() => this.resize()).observe(this.host);
        this.resize();
        this.tick = this.tick.bind(this);
        document.addEventListener('visibilitychange', () => this.updateTicker());
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.refreshHelpers());
    }

    resize() {
        const width = this.host.clientWidth;
        const height = this.host.clientHeight;
        if (!width || !height) return;
        this.renderer.setSize(width, height, false);
        this.nav.apply();
    }

    requestRender() {
        if (this.pending) return;
        this.pending = true;
        requestAnimationFrame(() => {
            this.pending = false;
            this.render();
        });
    }

    render() {
        if (!this.visible) return;
        this.sortTranslucent();
        this.renderer.render(this.scene, this.camera);
        this.drawGizmo();
    }

    setVisible(visible) {
        this.visible = visible;
        this.updateTicker();
        if (visible) { this.resize(); this.requestRender(); }
    }

    texture(info) {
        if (this.textures.has(info.url)) return this.textures.get(info.url);
        const { THREE } = this;
        const canvas = document.createElement('canvas');
        canvas.width = info.canvas.width;
        canvas.height = info.canvas.height;
        canvas.getContext('2d').drawImage(info.canvas, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.flipY = false;
        texture.colorSpace = THREE.NoColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = this.anisotropy;
        if (info.info) this.animated.push({ texture, canvas, image: info.image, info: info.info, frame: 0, time: 0 });
        this.textures.set(info.url, texture);
        return texture;
    }

    material(info, layer) {
        const id = `${layer}|${info.url}`;
        if (this.materials.has(id)) return this.materials.get(id);
        const { THREE } = this;
        if (layer === 'portal') {
            const repeat = source => {
                const texture = new THREE.CanvasTexture(source.canvas);
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                texture.colorSpace = THREE.NoColorSpace;
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                texture.generateMipmaps = false;
                return texture;
            };
            const material = new THREE.ShaderMaterial({
                vertexShader: PORTAL_VERTEX,
                fragmentShader: PORTAL_FRAGMENT,
                uniforms: { sky: { value: repeat(info.sky) }, stars: { value: repeat(info.stars) }, time: { value: 0 }, layers: { value: info.layers }, highlight: { value: -1 } },
                side: THREE.FrontSide
            });
            material.userData.portal = true;
            this.materials.set(id, material);
            return material;
        }
        const material = new THREE.ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                map: { value: this.texture(info) },
                alphaCut: { value: layer === 'cutout' || layer.startsWith('overlay') ? 0.1 : layer === 'translucent' ? 0.004 : -1 },
                highlight: { value: -1 }
            },
            transparent: layer === 'translucent',
            depthWrite: true,
            side: THREE.FrontSide
        });
        this.materials.set(id, material);
        return material;
    }

    clear() {
        for (const mesh of this.meshes) {
            this.world.remove(mesh);
            mesh.geometry.dispose();
        }
        this.meshes = [];
        this.active = [];
        this.instances = [];
        this.byBlock = new Map();
    }

    async show(view, options = {}) {
        await this.ready;
        const token = (this.token = (this.token || 0) + 1);
        const result = await buildMesh(view, { ...options, isStale: () => token !== this.token });
        if (!result || token !== this.token) return null;
        const { THREE } = this;
        this.clear();
        this.view = view;
        this.instances = result.instances;
        this.byBlock = new Map(result.instances.map(instance => [instance.block, instance]));
        const order = { opaque: 0, portal: 0, cutout: 1, overlay1: 1.1, overlay2: 1.2, overlay3: 1.3, translucent: 2 };
        for (const bucket of result.buckets.values()) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
            geometry.setAttribute('shade', new THREE.Float32BufferAttribute(bucket.shade, 3));
            geometry.setAttribute('key', new THREE.Float32BufferAttribute(bucket.key, 1));
            const quads = bucket.owners.length;
            const index = new (bucket.pos.length / 3 > 65535 ? Uint32Array : Uint16Array)(bucket.index);
            geometry.setIndex(new THREE.BufferAttribute(index, 1));
            geometry.computeBoundingSphere();
            const mesh = new THREE.Mesh(geometry, this.material(bucket.info, bucket.layer));
            mesh.renderOrder = order[bucket.layer];
            mesh.userData.owners = bucket.owners;
            if (bucket.layer === 'translucent') mesh.userData.sort = { centers: new Float32Array(bucket.centers), quads, base: index.slice() };
            this.world.add(mesh);
            this.meshes.push(mesh);
        }
        const [sx, sy, sz] = view.size;
        this.world.position.set(-sx / 2, 0, -sz / 2);
        this.helpers.position.copy(this.world.position);
        this.size = [sx, sy, sz];
        const bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(sx, sy, sz));
        for (const mesh of this.meshes) { mesh.geometry.computeBoundingBox(); bounds.union(mesh.geometry.boundingBox); }
        this.bounds = bounds.translate(this.world.position);
        this.refreshHelpers();
        this.applyHighlight();
        if (options.frame) this.frame();
        const used = new Set(this.meshes.map(mesh => mesh.material.uniforms.map && mesh.material.uniforms.map.value));
        this.active = this.animated.filter(item => used.has(item.texture));
        for (const material of new Set(this.meshes.map(mesh => mesh.material))) if (material.userData.portal) this.active.push({ portal: material });
        this.lastSort = null;
        this.updateTicker();
        this.requestRender();
        return { problems: result.problems, quads: result.quadCount, shown: result.shown, notDrawn: result.notDrawn };
    }

    refreshHelpers() {
        if (!this.THREE || !this.size) return;
        const { THREE } = this;
        for (const child of [...this.helpers.children]) {
            this.helpers.remove(child);
            child.geometry.dispose();
            child.material.dispose();
        }
        const style = getComputedStyle(this.host);
        const gridColor = new THREE.Color(style.getPropertyValue('--sv-grid').trim() || '#c8c8cf');
        const boundsColor = new THREE.Color(style.getPropertyValue('--sv-bounds').trim() || '#8e8e93');
        const [sx, sy, sz] = this.size;
        if (this.options && this.options.grid === false) return this.requestRender();
        const margin = 4;
        const points = [];
        for (let x = -margin; x <= sx + margin; x++) points.push(x, 0, -margin, x, 0, sz + margin);
        for (let z = -margin; z <= sz + margin; z++) points.push(-margin, 0, z, sx + margin, 0, z);
        const gridGeometry = new THREE.BufferGeometry();
        gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        const grid = new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: gridColor, transparent: true, opacity: 0.55, depthWrite: false }));
        grid.position.y = -0.002;
        grid.renderOrder = -1;
        this.helpers.add(grid);
        const box = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz).translate(sx / 2, sy / 2, sz / 2)),
            new THREE.LineBasicMaterial({ color: boundsColor, transparent: true, opacity: 0.6, depthWrite: false })
        );
        this.helpers.add(box);
        this.requestRender();
    }

    setOptions(options) {
        this.options = { ...(this.options || {}), ...options };
        this.refreshHelpers();
    }

    frame() {
        if (!this.size || !this.THREE) return;
        const [sx, sy, sz] = this.size;
        const bounds = this.bounds;
        if (bounds) bounds.getCenter(this.nav.target); else this.nav.target.set(0, sy / 2, 0);
        const radius = Math.max(1, bounds ? bounds.getSize(new this.THREE.Vector3()).length() / 2 : Math.hypot(sx, sy, sz) / 2);
        const aspect = Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight);
        const narrow = Math.atan(this.nav.slope() * Math.min(1, aspect));
        this.nav.distance = radius / Math.sin(narrow) * 1.08;
        this.nav.yaw = Math.PI / 4;
        this.nav.pitch = 0.5;
        this.nav.apply();
    }

    highlight(key) {
        this.highlightKey = key;
        this.applyHighlight();
    }

    select(key) {
        this.selectedKey = key;
        this.applyHighlight();
    }

    applyHighlight() {
        const key = this.highlightKey >= 0 ? this.highlightKey : this.selectedKey;
        for (const material of this.materials.values()) material.uniforms.highlight.value = key;
        this.requestRender();
    }

    toggleOrtho() {
        this.nav.ortho = !this.nav.ortho;
        this.nav.autoOrtho = false;
        this.nav.apply();
        return this.nav.ortho;
    }

    pick(clientX, clientY) {
        if (!this.meshes.length) return null;
        this.scene.updateMatrixWorld();
        this.camera.updateMatrixWorld();
        const rect = this.canvas.getBoundingClientRect();
        const pointer = new this.THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(pointer, this.camera);
        const hits = this.raycaster.intersectObjects(this.meshes, false);
        for (const hit of hits) {
            const owners = hit.object.userData.owners;
            const quad = Math.floor(hit.faceIndex / 2);
            const sort = hit.object.userData.sort;
            const owner = sort && sort.order ? owners[sort.order[quad]] : owners[quad];
            const instance = this.byBlock.get(owner);
            if (instance) return { instance, point: hit.point };
        }
        return null;
    }

    sortTranslucent() {
        const camera = this.camera;
        const key = `${camera.position.x.toFixed(2)},${camera.position.y.toFixed(2)},${camera.position.z.toFixed(2)},${this.nav.ortho}`;
        if (this.lastSort === key) return;
        this.lastSort = key;
        const local = camera.position.clone().sub(this.world.position);
        const forward = new this.THREE.Vector3();
        camera.getWorldDirection(forward);
        for (const mesh of this.meshes) {
            const sort = mesh.userData.sort;
            if (!sort) continue;
            const { centers, quads, base } = sort;
            const depth = new Float32Array(quads);
            for (let i = 0; i < quads; i++) {
                const dx = centers[i * 3] - local.x, dy = centers[i * 3 + 1] - local.y, dz = centers[i * 3 + 2] - local.z;
                depth[i] = this.nav.ortho ? dx * forward.x + dy * forward.y + dz * forward.z : dx * dx + dy * dy + dz * dz;
            }
            const order = Array.from({ length: quads }, (_, i) => i).sort((a, b) => depth[b] - depth[a]);
            const index = mesh.geometry.index.array;
            for (let i = 0; i < quads; i++) index.set(base.subarray(order[i] * 6, order[i] * 6 + 6), i * 6);
            mesh.geometry.index.needsUpdate = true;
            sort.order = order;
        }
    }

    updateTicker() {
        const run = this.visible && this.active && this.active.length && document.visibilityState === 'visible' && this.meshes.length;
        if (run && !this.ticking) {
            this.ticking = true;
            this.lastTick = performance.now();
            requestAnimationFrame(this.tick);
        } else if (!run) {
            this.ticking = false;
        }
    }

    tick(now) {
        if (!this.ticking) return;
        if (now - this.lastTick >= 50) {
            const steps = Math.min(4, Math.floor((now - this.lastTick) / 50));
            this.lastTick += steps * 50;
            let changed = false;
            for (const item of this.active) {
                if (item.portal) {
                    item.portal.uniforms.time.value = ((now / 50) % 24000) / 24000;
                    changed = true;
                    continue;
                }
                const { info } = item;
                item.time += steps;
                let frame = item.frame;
                while (item.time >= info.frames[frame].time) {
                    item.time -= info.frames[frame].time;
                    frame = (frame + 1) % info.frames.length;
                }
                if (frame !== item.frame) {
                    item.frame = frame;
                    const index = info.frames[frame].index;
                    const context = item.canvas.getContext('2d');
                    context.clearRect(0, 0, item.canvas.width, item.canvas.height);
                    context.drawImage(item.image, (index % info.columns) * info.width, Math.floor(index / info.columns) * info.height, info.width, info.height, 0, 0, info.width, info.height);
                    item.texture.needsUpdate = true;
                    changed = true;
                }
            }
            if (changed) this.requestRender();
        }
        requestAnimationFrame(this.tick);
    }

    screenshot() {
        this.renderer.render(this.scene, this.camera);
        return new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
    }

    anchorAt(clientX, clientY) {
        const hit = this.pick(clientX, clientY);
        if (hit) return hit.point;
        const { THREE } = this;
        this.camera.updateMatrixWorld();
        const rect = this.canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(pointer, this.camera);
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, this.nav.target);
        const point = new THREE.Vector3();
        return this.raycaster.ray.intersectPlane(plane, point) ? point : null;
    }

    bindInput() {
        const canvas = this.canvas;
        const nav = this.nav;
        const pointers = new Map();
        let mode = null;
        let moved = 0;
        let pinch = null;
        let hoverQueued = false;
        let lastHover = null;
        let start = null;
        let lastTap = null;
        let lastTouch = -1e9;
        const coarse = window.matchMedia('(pointer: coarse)');
        this.coarse = coarse;

        canvas.style.touchAction = 'none';
        canvas.addEventListener('contextmenu', event => event.preventDefault());
        canvas.addEventListener('mousedown', event => { if (event.button === 1) event.preventDefault(); });
        canvas.addEventListener('auxclick', event => event.preventDefault());

        canvas.addEventListener('pointerdown', event => {
            canvas.focus({ preventScroll: true });
            try { canvas.setPointerCapture(event.pointerId); } catch (error) { }
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            this.hideHover();
            if (event.pointerType !== 'mouse') lastTouch = performance.now();
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
                pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), x, y, anchor: this.anchorAt(x, y) };
                mode = 'pinch';
                return;
            }
            moved = 0;
            start = { x: event.clientX, y: event.clientY, touch: event.pointerType !== 'mouse', active: event.pointerType === 'mouse' };
            const left = event.button === 0, middle = event.button === 1, right = event.button === 2;
            if ((middle && event.shiftKey) || right || (left && event.shiftKey)) mode = 'pan';
            else if (middle && event.ctrlKey) mode = 'zoom';
            else mode = 'orbit';
        });

        canvas.addEventListener('pointermove', event => {
            const previous = pointers.get(event.pointerId);
            if (previous && event.pointerType === 'mouse' && event.buttons === 0) {
                pointers.delete(event.pointerId);
                mode = null;
                return;
            }
            if (!previous) {
                lastHover = event;
                if (!hoverQueued) {
                    hoverQueued = true;
                    requestAnimationFrame(() => { hoverQueued = false; if (lastHover) this.hover(lastHover); });
                }
                return;
            }
            if (mode !== 'pinch' && start && !start.active) {
                if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 10) return;
                start.active = true;
            }
            const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            moved += Math.abs(dx) + Math.abs(dy);
            if (mode === 'pinch' && pointers.size >= 2) {
                const [a, b] = [...pointers.values()];
                const distance = Math.hypot(a.x - b.x, a.y - b.y);
                const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
                nav.pan(x - pinch.x, y - pinch.y);
                if (distance > 0 && pinch.distance > 0) nav.zoom(pinch.distance / distance, pinch.anchor);
                pinch = { ...pinch, distance, x, y };
            } else if (mode === 'orbit') nav.orbit(dx, dy);
            else if (mode === 'pan') nav.pan(dx, dy);
            else if (mode === 'zoom') nav.zoom(Math.exp(dy * 0.01), null);
        });

        const end = event => {
            const had = pointers.has(event.pointerId);
            pointers.delete(event.pointerId);
            if (!had) return;
            if (mode === 'pinch') { if (pointers.size < 2) { mode = pointers.size ? 'none' : null; pinch = null; } return; }
            const tap = start && (start.touch ? !start.active : moved < 5);
            if (mode === 'orbit' && tap && event.type === 'pointerup' && event.button === 0) {
                const now = performance.now();
                if (start.touch && lastTap && now - lastTap.time < 350 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 30) {
                    lastTap = null;
                    this.doubleAt(event.clientX, event.clientY);
                } else {
                    if (start.touch) lastTap = { time: now, x: event.clientX, y: event.clientY };
                    const hit = this.pick(event.clientX, event.clientY);
                    if (this.callbacks.onPick) this.callbacks.onPick(hit ? hit.instance : null);
                }
            }
            if (!pointers.size) { mode = null; start = null; }
        };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        canvas.addEventListener('lostpointercapture', event => {
            if (!pointers.has(event.pointerId)) return;
            pointers.delete(event.pointerId);
            if (!pointers.size) mode = null;
        });
        canvas.addEventListener('pointerleave', () => this.hideHover());

        canvas.addEventListener('dblclick', event => {
            if (performance.now() - lastTouch < 800) return;
            this.doubleAt(event.clientX, event.clientY);
        });
        canvas.addEventListener('webglcontextlost', event => event.preventDefault());
        canvas.addEventListener('webglcontextrestored', () => { this.lastSort = null; this.requestRender(); });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.requestRender(); });

        canvas.addEventListener('wheel', event => {
            event.preventDefault();
            const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
            const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
            nav.zoom(Math.exp(delta * (event.ctrlKey ? 0.01 : 0.0018)), this.anchorAt(event.clientX, event.clientY));
        }, { passive: false });

        canvas.addEventListener('keydown', event => {
            const code = event.code;
            const opposite = event.ctrlKey || event.metaKey;
            const step = Math.PI / 12;
            let handled = true;
            if (code === 'Numpad1' || code === 'Digit1') nav.view(opposite ? 'back' : 'front');
            else if (code === 'Numpad3' || code === 'Digit3') nav.view(opposite ? 'left' : 'right');
            else if (code === 'Numpad7' || code === 'Digit7') nav.view(opposite ? 'bottom' : 'top');
            else if (code === 'Numpad9' || code === 'Digit9') nav.opposite();
            else if (code === 'Numpad5' || code === 'Digit5') this.toggleOrtho();
            else if (code === 'Numpad4') nav.orbit(step / 0.008, 0);
            else if (code === 'Numpad6') nav.orbit(-step / 0.008, 0);
            else if (code === 'Numpad8') nav.orbit(0, -step / 0.008);
            else if (code === 'Numpad2') nav.orbit(0, step / 0.008);
            else if (code === 'NumpadAdd' || code === 'Equal') nav.zoom(1 / 1.2, null);
            else if (code === 'NumpadSubtract' || code === 'Minus') nav.zoom(1.2, null);
            else if (code === 'Home' || code === 'NumpadDecimal' || code === 'Period' || code === 'KeyF') this.frame();
            else if (code === 'Escape' && this.callbacks.onPick) this.callbacks.onPick(null);
            else handled = false;
            if (handled) event.preventDefault();
        });
    }

    doubleAt(clientX, clientY) {
        const hit = this.pick(clientX, clientY);
        if (hit) this.nav.pivot(hit.point);
        else this.frame();
    }

    hover(event) {
        if (!this.callbacks.onHover || !this.meshes.length) return;
        const hit = this.pick(event.clientX, event.clientY);
        const rect = this.host.getBoundingClientRect();
        this.callbacks.onHover(hit ? hit.instance : null, event.clientX - rect.left, event.clientY - rect.top);
    }

    hideHover() {
        if (this.callbacks.onHover) this.callbacks.onHover(null, 0, 0);
    }

    mountGizmo() {
        const gizmo = document.createElement('canvas');
        gizmo.className = 'sv-gizmo';
        gizmo.width = 96;
        gizmo.height = 96;
        gizmo.setAttribute('aria-hidden', 'true');
        this.host.appendChild(gizmo);
        this.gizmo = gizmo;
        this.gizmoAxes = [];
        let drag = null;
        gizmo.addEventListener('pointerdown', event => {
            event.preventDefault();
            try { gizmo.setPointerCapture(event.pointerId); } catch (error) { }
            drag = { x: event.clientX, y: event.clientY, moved: 0 };
        });
        gizmo.addEventListener('pointermove', event => {
            if (!drag) return;
            const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            drag.x = event.clientX;
            drag.y = event.clientY;
            drag.moved += Math.abs(dx) + Math.abs(dy);
            if (drag.moved > 3) this.nav.orbit(dx, dy);
        });
        gizmo.addEventListener('pointerup', event => {
            if (drag && drag.moved <= 3) {
                const rect = gizmo.getBoundingClientRect();
                const x = (event.clientX - rect.left) * (96 / rect.width), y = (event.clientY - rect.top) * (96 / rect.height);
                const reach = event.pointerType === 'mouse' ? 11 : 18;
                const hit = this.gizmoAxes.filter(axis => Math.hypot(axis.x - x, axis.y - y) < reach).sort((a, b) => b.depth - a.depth)[0];
                if (hit) this.nav.lookFrom(hit.vector);
            }
            drag = null;
        });
    }

    drawGizmo() {
        const context = this.gizmo.getContext('2d');
        const camera = this.camera;
        const { THREE } = this;
        context.clearRect(0, 0, 96, 96);
        const style = getComputedStyle(this.host);
        const text = style.getPropertyValue('--sv-gizmo-text').trim() || '#fff';
        const axes = [
            { label: 'E', vector: [1, 0, 0], color: '#e5484d' },
            { label: 'W', vector: [-1, 0, 0], color: '#e5484d', dim: true },
            { label: 'U', vector: [0, 1, 0], color: '#46a758' },
            { label: 'D', vector: [0, -1, 0], color: '#46a758', dim: true },
            { label: 'S', vector: [0, 0, 1], color: '#3e7bfa' },
            { label: 'N', vector: [0, 0, -1], color: '#3e7bfa', dim: true }
        ];
        const inverse = camera.quaternion.clone().invert();
        this.gizmoAxes = axes.map(axis => {
            const v = new THREE.Vector3(...axis.vector).applyQuaternion(inverse);
            return { ...axis, x: 48 + v.x * 32, y: 48 - v.y * 32, depth: v.z };
        }).sort((a, b) => a.depth - b.depth);
        for (const axis of this.gizmoAxes) {
            if (!axis.dim) {
                context.strokeStyle = axis.color;
                context.lineWidth = 2;
                context.beginPath();
                context.moveTo(48, 48);
                context.lineTo(axis.x, axis.y);
                context.stroke();
            }
            context.globalAlpha = axis.dim ? 0.55 : 1;
            context.fillStyle = axis.color;
            context.beginPath();
            context.arc(axis.x, axis.y, axis.dim ? 8 : 9, 0, Math.PI * 2);
            context.fill();
            context.globalAlpha = 1;
            context.fillStyle = axis.dim ? text : '#fff';
            context.font = '10px "Minecraft Seven", system-ui, sans-serif';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(axis.label, axis.x, axis.y + 0.5);
        }
    }
}
