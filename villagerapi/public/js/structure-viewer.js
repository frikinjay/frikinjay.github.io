import { DIRS, VEC, FACE_SHADE, MISSING, bakeState, textureInfo, tintFor, waterQuads, stateKey } from './structure-models.js';
import { parseState } from './structure-core.js';

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

const curve = level => { const f = level / 15; return f / (4 - 3 * f); };

function lightColor(sky, block, night) {
    const s = curve(sky) * (night ? 0.18 : 1);
    const b = curve(block);
    let r = s * (night ? 0.75 : 1) + b;
    let g = s * (night ? 0.8 : 1) + b * ((b * 0.6 + 0.4) * 0.6 + 0.4);
    let bl = s + b * (b * b * 0.6 + 0.4);
    const finish = value => {
        let c = Math.min(1, value * 0.96 + 0.03);
        const lifted = 1 - Math.pow(1 - c, 4);
        c = c + (lifted - c) * 0.5;
        return Math.min(1, Math.max(0.05, c * 0.96 + 0.75 * 0.04));
    };
    return [finish(r), finish(g), finish(bl)];
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
        this.shade = new Float32Array(cells).fill(1);
        this.water = new Uint8Array(cells);
        this.kind = new Int32Array(cells).fill(-1);
        this.sky = null;
        this.block = null;
    }

    at(x, y, z) {
        if (x < -1 || y < -1 || z < -1 || x > this.sx || y > this.sy || z > this.sz) return -1;
        return ((x + 1) * this.py + (y + 1)) * this.pz + (z + 1);
    }
}

function computeLight(grid, emitters) {
    const cells = grid.opaque.length;
    const sky = new Uint8Array(cells);
    const block = new Uint8Array(cells);
    const queue = new Int32Array(cells * 2);
    const flood = (levels, seeds) => {
        let head = 0, tail = 0;
        for (const cell of seeds) queue[tail++] = cell;
        while (head < tail) {
            const cell = queue[head++];
            const level = levels[cell];
            if (level <= 1) continue;
            const z = cell % grid.pz;
            const y = Math.floor(cell / grid.pz) % grid.py;
            const x = Math.floor(cell / (grid.pz * grid.py));
            for (const [dx, dy, dz] of VEC) {
                const nx = x + dx, ny = y + dy, nz = z + dz;
                if (nx < 0 || ny < 0 || nz < 0 || nx >= grid.sx + 2 || ny >= grid.py || nz >= grid.pz) continue;
                const next = (nx * grid.py + ny) * grid.pz + nz;
                if (grid.opaque[next]) continue;
                const value = level - 1 - (grid.water[next] ? 1 : 0);
                if (value > levels[next]) {
                    levels[next] = value;
                    if (tail < queue.length) queue[tail++] = next;
                }
            }
        }
    };
    const skySeeds = [];
    for (let x = 0; x < grid.sx + 2; x++) {
        for (let z = 0; z < grid.pz; z++) {
            let level = 15;
            for (let y = grid.py - 1; y >= 0; y--) {
                const cell = (x * grid.py + y) * grid.pz + z;
                if (grid.opaque[cell]) level = 0;
                else if (grid.water[cell] && level > 0) level -= 1;
                const edge = x === 0 || z === 0 || x === grid.sx + 1 || z === grid.pz - 1 || y === grid.py - 1;
                sky[cell] = edge && !grid.opaque[cell] ? 15 : level;
                if (sky[cell] > 1) skySeeds.push(cell);
            }
        }
    }
    flood(sky, skySeeds);
    const blockSeeds = [];
    for (const [cell, level] of emitters) {
        if (level > block[cell]) block[cell] = level;
        blockSeeds.push(cell);
    }
    flood(block, blockSeeds);
    grid.sky = sky;
    grid.block = block;
}

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
        let fromJigsaw = false;
        if (name === 'minecraft:jigsaw' && !options.showJigsaws && block.finalState) {
            ({ name, props } = parseState(block.finalState));
            fromJigsaw = true;
        }
        const keyName = fromJigsaw ? name : original;
        const swap = options.swaps && options.swaps[name];
        if (swap && (!fromJigsaw || options.swapFinalStates)) name = swap;
        const id = stateKey(name, props);
        if (!unique.has(id)) unique.set(id, { name, props, index: unique.size });
        instances.push({ block: i, x: block.x, y: block.y, z: block.z, state: unique.get(id), key: options.keyOf ? options.keyOf(keyName) : -1, original: keyName, shown: name });
    }

    const states = [...unique.values()];
    const baked = await Promise.all(states.map(state => bakeState(state.name, state.props)));
    if (options.isStale && options.isStale()) return null;
    const water = await waterQuads();

    const urls = new Set();
    for (const result of baked) for (const part of result.parts) for (const option of part) for (const quad of option.quads) urls.add(quad.texture);
    if (baked.some(result => result.water)) for (const quad of water) urls.add(quad.texture);
    const infos = new Map();
    await Promise.all([...urls].map(async url => infos.set(url, (await textureInfo(url)) || (await textureInfo(MISSING)))));
    if (options.isStale && options.isStale()) return null;

    const grid = new Grid([sx, sy, sz]);
    const emitters = [];
    for (const instance of instances) {
        const cell = grid.at(instance.x, instance.y, instance.z);
        if (cell < 0) continue;
        const result = baked[instance.state.index];
        instance.cell = cell;
        if (result.opaque) grid.opaque[cell] = 1;
        grid.shade[cell] = result.shade;
        if (result.water) grid.water[cell] = 1;
        grid.kind[cell] = instance.state.index;
        if (result.light > 0) emitters.push([cell, result.light]);
    }
    const lighting = options.lighting && options.lighting !== 'off';
    if (lighting) computeLight(grid, emitters);
    const night = options.lighting === 'night';

    const buckets = new Map();
    const bucketFor = (url, forced) => {
        const info = infos.get(url);
        const layer = forced || info.layer;
        const id = `${layer}|${info.url}`;
        if (!buckets.has(id)) buckets.set(id, { info, layer, pos: [], uv: [], shade: [], key: [], index: [], owners: [], centers: [] });
        return buckets.get(id);
    };

    const shadeAt = (x, y, z) => { const c = grid.at(x, y, z); return c < 0 ? 1 : grid.shade[c]; };
    const permeable = (x, y, z) => { const c = grid.at(x, y, z); return c < 0 || !grid.opaque[c]; };
    const lightAt = (x, y, z, fallback) => {
        const c = grid.at(x, y, z);
        if (c < 0) return [15, 0];
        if (grid.opaque[c]) return fallback;
        return [grid.sky[c], grid.block[c]];
    };

    const faceSample = (x, y, z, dir, cubic, useAo) => {
        const [dx, dy, dz] = VEC[dir];
        const bx = cubic ? x + dx : x, by = cubic ? y + dy : y, bz = cubic ? z + dz : z;
        const [axisA, axisB] = TANGENTS[dir];
        const offset = (axis, sign) => [axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0];
        const center = cubic ? shadeAt(bx, by, bz) : shadeAt(x, y, z);
        const centerLight = lighting ? lightAt(x + dx, y + dy, z + dz, lightAt(x, y, z, [0, 0])) : null;
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
                const la = lightAt(ax, ay, az, centerLight);
                const lb = lightAt(cx, cy, cz, centerLight);
                const lc = open ? lightAt(ox, oy, oz, centerLight) : la;
                lights.push([(la[0] + lb[0] + lc[0] + centerLight[0]) / 4, (la[1] + lb[1] + lc[1] + centerLight[1]) / 4]);
            }
        }
        return { values, lights, axisA, axisB };
    };

    const flatLight = (x, y, z, dir) => {
        const [dx, dy, dz] = VEC[dir];
        return lightAt(x + dx, y + dy, z + dz, lightAt(x, y, z, [0, 0]));
    };

    let quadCount = 0;
    const emit = (quad, instance, tint, useAo, result) => {
        const { x, y, z } = instance;
        let cubic = false;
        if (useAo || lighting) {
            const axis = quad.dir < 2 ? 1 : quad.dir < 4 ? 2 : 0;
            const v0 = quad.p[axis], v1 = quad.p[3 + axis], v2 = quad.p[6 + axis], v3 = quad.p[9 + axis];
            if (v0 === v1 && v1 === v2 && v2 === v3) {
                const positive = quad.dir % 2 === 1;
                cubic = (positive ? v0 > 0.9999 : v0 < 0.0001) || result.shade === 0.2;
            }
        }
        const sample = useAo || lighting ? faceSample(x, y, z, quad.dir, cubic, useAo) : null;
        const flat = lighting && !sample ? flatLight(x, y, z, quad.dir) : null;
        const directional = quad.shade ? FACE_SHADE[quad.shadeDir] : 1;
        const tr = ((tint >> 16) & 255) / 255, tg = ((tint >> 8) & 255) / 255, tb = (tint & 255) / 255;
        const bucket = bucketFor(quad.texture, quad.layer);
        const base = bucket.pos.length / 3;
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
                if (lighting) {
                    let skyLevel = 0, blockLevel = 0;
                    for (let k = 0; k < 4; k++) { skyLevel += sample.lights[k][0] * w[k]; blockLevel += sample.lights[k][1] * w[k]; }
                    light = lightColor(skyLevel, Math.max(blockLevel, result.light), night);
                }
            } else if (flat) {
                light = lightColor(flat[0], Math.max(flat[1], result.light), night);
            }
            const s = directional * ao;
            bucket.shade.push(s * tr * light[0], s * tg * light[1], s * tb * light[2]);
            bucket.key.push(instance.key);
        }
        bucket.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
        bucket.owners.push(instance.block);
        bucket.centers.push(x + cx / 4, y + cy / 4, z + cz / 4);
        quadCount++;
    };

    const problems = new Map();
    let shown = 0;
    for (const instance of instances) {
        if (instance.cell === undefined) continue;
        const result = baked[instance.state.index];
        const { x, y, z } = instance;
        if (result.problem) problems.set(instance.shown, result.problem);
        if (result.parts.length || result.water) shown++;
        const smooth = options.smooth !== false && result.ao;
        let tint = null;
        result.parts.forEach((options2, partIndex) => {
            const option = choose(options2, x, y, z, partIndex);
            for (const quad of option.quads) {
                if (quad.cull >= 0) {
                    const [dx, dy, dz] = VEC[quad.cull];
                    const next = grid.at(x + dx, y + dy, z + dz);
                    if (next >= 0 && grid.opaque[next]) continue;
                    if (next >= 0 && result.selfCull && grid.kind[next] === instance.state.index) continue;
                }
                if (quad.tint >= 0 && tint === null) tint = tintFor(instance.state.name, instance.state.props, options.biome);
                emit(quad, instance, quad.tint >= 0 ? tint : 0xffffff, smooth && quad.ao, result);
            }
        });
        if (result.water) {
            const waterTint = tintFor('minecraft:water', {}, options.biome);
            for (const quad of water) {
                const [dx, dy, dz] = VEC[quad.cull];
                const next = grid.at(x + dx, y + dy, z + dz);
                if (next >= 0 && (grid.water[next] || (grid.opaque[next] && quad.cull !== 1))) continue;
                emit(quad, instance, waterTint, false, result);
            }
        }
    }

    return { buckets, instances, problems, quadCount, shown };
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
        const material = new THREE.ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                map: { value: this.texture(info) },
                alphaCut: { value: layer === 'cutout' ? 0.1 : layer === 'translucent' ? 0.004 : -1 },
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
        const order = { opaque: 0, cutout: 1, translucent: 2 };
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
        this.refreshHelpers();
        this.applyHighlight();
        if (options.frame) this.frame();
        const used = new Set(this.meshes.map(mesh => mesh.material.uniforms.map.value));
        this.active = this.animated.filter(item => used.has(item.texture));
        this.lastSort = null;
        this.updateTicker();
        this.requestRender();
        return { problems: result.problems, quads: result.quadCount, shown: result.shown };
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
        this.nav.target.set(0, sy / 2, 0);
        const radius = Math.max(1, Math.hypot(sx, sy, sz) / 2);
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
