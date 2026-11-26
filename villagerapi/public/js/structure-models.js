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
    copper_chest: 'copper', exposed_copper_chest: 'copper_exposed', weathered_copper_chest: 'copper_weathered', oxidized_copper_chest: 'copper_oxidized',
    waxed_copper_chest: 'copper', waxed_exposed_copper_chest: 'copper_exposed', waxed_weathered_copper_chest: 'copper_weathered', waxed_oxidized_copper_chest: 'copper_oxidized'
};
const YAW = { south: 0, west: 90, north: 180, east: 270 };
const DYES = {
    white: 0xf9fffe, orange: 0xf9801d, magenta: 0xc74ebd, light_blue: 0x3ab3da, yellow: 0xfed83d, lime: 0x80c71f, pink: 0xf38baa, gray: 0x474f52,
    light_gray: 0x9d9d97, cyan: 0x169c9c, purple: 0x8932b8, blue: 0x3c44aa, brown: 0x835432, green: 0x5e7c16, red: 0xb02e26, black: 0x1d1d21
};
const BANNER = /^(.+?)_(wall_)?banner$/;
const ALWAYS_WET = /^(water|bubble_column|seagrass|tall_seagrass|kelp|kelp_plant)$/;
const ALIASES = { chain: 'iron_chain', iron_chain: 'chain', grass: 'short_grass', short_grass: 'grass' };

export const DEFAULT_TINTS = { grass: 0x91bd59, foliage: 0x77ab2f, dry: 0x7b5334, water: 0x3f76e4 };

const G = ['grass'], F = ['foliage'];
const TINT_LAYERS = {
    large_fern: G, tall_grass: G, fern: G, short_grass: G, grass: G, potted_fern: G, bush: G, grass_block: G, sugar_cane: G,
    pink_petals: [null, 'grass'], wildflowers: [null, 'grass'],
    spruce_leaves: [0x619961], birch_leaves: [0x80a755],
    oak_leaves: F, jungle_leaves: F, acacia_leaves: F, dark_oak_leaves: F, vine: F, mangrove_leaves: F,
    leaf_litter: ['dry'], water_cauldron: ['water'], water: ['water'], bubble_column: ['water'],
    redstone_wire: ['redstone'], attached_melon_stem: [0xe0c71c], attached_pumpkin_stem: [0xe0c71c],
    melon_stem: ['stem'], pumpkin_stem: ['stem'], lily_pad: [0x208030]
};

export function tintFor(name, props, colors, index = 0) {
    const { ns, path } = splitId(name);
    const biome = colors || DEFAULT_TINTS;
    if (ns === 'minecraft') {
        const banner = BANNER.exec(path);
        if (banner && banner[1] in DYES) return DYES[banner[1]];
        const layers = TINT_LAYERS[path];
        const layer = layers ? layers[index] : null;
        if (typeof layer === 'number') return layer;
        if (layer === 'grass' || layer === 'foliage' || layer === 'water') return biome[layer];
        if (layer === 'dry') return biome.dry ?? DEFAULT_TINTS.dry;
        if (layer === 'stem') {
            const age = Number(props.age) || 0;
            return ((age * 32) << 16) | ((255 - age * 8) << 8) | (age * 4);
        }
        if (layer === 'redstone') {
            const f = (Number(props.power) || 0) / 15;
            const r = f * 0.6 + (f > 0 ? 0.4 : 0.3);
            const g = Math.min(1, Math.max(0, f * f * 0.7 - 0.5));
            const b = Math.min(1, Math.max(0, f * f * 0.6 - 0.7));
            return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
        }
        return 0xffffff;
    }
    if (/water/.test(path)) return biome.water;
    return /leaves|vine|leaf/.test(path) ? biome.foliage : biome.grass;
}

const LIGHT = {
    torch: 14, wall_torch: 14, soul_torch: 10, soul_wall_torch: 10, copper_torch: 14, copper_wall_torch: 14,
    lantern: 15, soul_lantern: 10, glowstone: 15, sea_lantern: 15, jack_o_lantern: 15, shroomlight: 15,
    ochre_froglight: 15, verdant_froglight: 15, pearlescent_froglight: 15, beacon: 15, conduit: 15, end_rod: 14,
    fire: 15, soul_fire: 10, lava: 15, magma_block: 3, crying_obsidian: 10, glow_lichen: 7, brewing_stand: 1,
    enchanting_table: 7, ender_chest: 7, amethyst_cluster: 5, large_amethyst_bud: 4, medium_amethyst_bud: 2, small_amethyst_bud: 1,
    end_portal: 15, end_gateway: 15, nether_portal: 11, sculk_catalyst: 6, brown_mushroom: 1, end_portal_frame: 1, dragon_egg: 1,
    lava_cauldron: 15, sculk_sensor: 1, calibrated_sculk_sensor: 1, firefly_bush: 2
};
const BULBS = { exposed: 12, weathered: 8, oxidized: 4 };
const TRIAL_SPAWNER = { waiting_for_players: 4, active: 8, waiting_for_reward_ejection: 8, ejecting_reward: 8 };
const VAULT = { inactive: 6, active: 12, unlocking: 12, ejecting: 12 };
const NO_OCCLUSION = new Set(('mangrove_roots glass straw_bed moving_piston spawner ladder ice iron_bars iron_chain chain glass_pane lily_pad brewing_stand '
    + 'cauldron dragon_egg cocoa shelf_mushroom beacon hopper slime_block barrier light end_rod chorus_plant chorus_flower frosted_ice turtle_egg '
    + 'sniffer_egg dried_ghast sea_pickle conduit bamboo lantern soul_lantern campfire soul_campfire test_instance_block honey_block amethyst_cluster '
    + 'tinted_glass powder_snow pointed_dripstone sulfur_spike azalea flowering_azalea frogspawn decorated_pot trial_spawner vault pale_moss_carpet').split(' '));
const NO_OCCLUSION_PATTERN = /(_leaves|_door|_trapdoor|_skull|_head|_glass|_glass_pane|copper_lantern)$/;
const SHAPE_LIGHT = /(_stairs|_shelf)$|^(snow|farmland|dirt_path|grass_path|daylight_detector|enchanting_table|end_portal_frame|lectern|sculk_sensor|calibrated_sculk_sensor|sculk_shrieker|stonecutter)$/;
const SKYLIGHT_ALWAYS = /^(bamboo|vine|hanging_moss|pale_moss_carpet|(.*_)?glass)$/;
const DAMPEN_ONE = /(_leaves|shulker_box)$|^chorus_plant$/;
const FACE_TANGENTS = [[0, 2], [0, 2], [0, 1], [0, 1], [2, 1], [2, 1]];
const NO_COLLISION = new Set(('air oak_sapling spruce_sapling birch_sapling jungle_sapling acacia_sapling cherry_sapling dark_oak_sapling pale_oak_sapling mangrove_propagule poplar_sapling water lava powered_rail detector_rail cobweb short_grass grass fern dead_bush bush red_shrub short_dry_grass tall_dry_grass seagrass tall_seagrass dandelion golden_dandelion torchflower poppy blue_orchid allium azure_bluet red_tulip orange_tulip white_tulip pink_tulip oxeye_daisy cornflower wither_rose lily_of_the_valley brown_mushroom red_mushroom torch wall_torch fire soul_fire redstone_wire wheat rail lever redstone_torch redstone_wall_torch cactus_flower sugar_cane soul_torch soul_wall_torch copper_torch copper_wall_torch nether_portal attached_pumpkin_stem attached_melon_stem pumpkin_stem melon_stem vine glow_lichen resin_clump nether_wart end_portal tripwire_hook tripwire carrots potatoes activator_rail sunflower lilac rose_bush peony tall_grass large_fern torchflower_crop pitcher_crop pitcher_plant beetroots end_gateway structure_void kelp kelp_plant tube_coral brain_coral bubble_coral fire_coral horn_coral tube_coral_fan brain_coral_fan bubble_coral_fan fire_coral_fan horn_coral_fan tube_coral_wall_fan brain_coral_wall_fan bubble_coral_wall_fan fire_coral_wall_fan horn_coral_wall_fan void_air cave_air bubble_column scaffolding sweet_berry_bush warped_fungus warped_roots nether_sprouts crimson_fungus weeping_vines weeping_vines_plant twisting_vines twisting_vines_plant crimson_roots sculk_vein cave_vines cave_vines_plant spore_blossom pink_petals wildflowers leaf_litter big_dripleaf_stem small_dripleaf hanging_roots frogspawn pale_hanging_moss open_eyeblossom closed_eyeblossom firefly_bush').split(' '));
const NO_COLLISION_PATTERN = /(_sapling|_button|_banner|_wall_fan|_coral_fan)$/;
const FORCE_SOLID = /(_sign|_pressure_plate|_fence|_fence_gate|chain|lantern|lightning_rod|amethyst_cluster|amethyst_bud)$|^(cobweb|moving_piston|cake|turtle_egg|dried_ghast|conduit|bamboo_sapling|bamboo|bell|sculk_vein|pointed_dripstone|sulfur_spike)$|^dead_.*coral/;
const FORCE_NOT_SOLID = /^(ladder|snow|end_rod|chorus_plant|chorus_flower|azalea|flowering_azalea|big_dripleaf)$/;

function solidShape(ns, path, parts) {
    if (ns === 'minecraft') {
        if (FORCE_SOLID.test(path)) return true;
        if (FORCE_NOT_SOLID.test(path) || NO_COLLISION.has(path) || NO_COLLISION_PATTERN.test(path)) return false;
    }
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (const options of parts) {
        const option = options[0];
        if (!option) continue;
        for (const quad of option.quads) {
            for (let i = 0; i < 12; i++) {
                const axis = i % 3;
                low[axis] = Math.min(low[axis], quad.p[i]);
                high[axis] = Math.max(high[axis], quad.p[i]);
            }
        }
    }
    if (!(high[0] > low[0])) return false;
    const size = [0, 1, 2].map(axis => Math.min(1, high[axis]) - Math.max(0, low[axis]));
    return (size[0] + size[1] + size[2]) / 3 >= 0.7291666666666666 || size[1] >= 1;
}

export function lightOf(name, props) {
    const { ns, path } = splitId(name);
    if (ns !== 'minecraft') return /lantern|torch|lamp|glowstone|froglight/.test(path) && props.lit !== 'false' ? 14 : 0;
    if (path === 'light') return Number(props.level) || 0;
    if (/^(furnace|blast_furnace|smoker)$/.test(path)) return props.lit === 'true' ? 13 : 0;
    if (path === 'campfire') return props.lit === 'true' ? 15 : 0;
    if (path === 'soul_campfire') return props.lit === 'true' ? 10 : 0;
    if (/redstone_(wall_)?torch$/.test(path)) return props.lit === 'true' ? 7 : 0;
    if (path === 'redstone_lamp') return props.lit === 'true' ? 15 : 0;
    if (/copper_bulb$/.test(path)) {
        if (props.lit !== 'true') return 0;
        const stage = /^(?:waxed_)?(exposed|weathered|oxidized)_/.exec(path);
        return stage ? BULBS[stage[1]] : 15;
    }
    if (/copper_lantern$/.test(path)) return 15;
    if (/candle_cake$/.test(path)) return props.lit === 'true' ? 3 : 0;
    if (path === 'trial_spawner') return TRIAL_SPAWNER[props.trial_spawner_state] || 0;
    if (path === 'vault') return VAULT[props.vault_state] ?? 6;
    if (path === 'redstone_ore' || path === 'deepslate_redstone_ore') return props.lit === 'true' ? 9 : 0;
    if (/candle$/.test(path) && path !== 'candle_cake') return props.lit === 'true' ? 3 * (Number(props.candles) || 1) : 0;
    if (path === 'sea_pickle') return props.waterlogged === 'true' ? 3 + 3 * (Number(props.pickles) || 1) : 0;
    if (path === 'cave_vines' || path === 'cave_vines_plant') return props.berries === 'true' ? 14 : 0;
    if (path === 'respawn_anchor') return Math.floor((Number(props.charges) || 0) / 4 * 15);
    return LIGHT[path] || 0;
}

function source(version) {
    if (!version) return { id: 'current', url: (ns, path) => assetUrl(ns, path) };
    return { id: version, url: (ns, path) => (ns === 'minecraft' ? vanillaUrl(version, path) : assetUrl(ns, path)) };
}

const textures = new Map();

export function textureInfo(url) {
    if (url === MISSING) return Promise.resolve(missingTexture());
    if (url.startsWith('portal:')) {
        if (!textures.has(url)) {
            const [, layers, version] = url.split(':');
            const src = source(version);
            const paths = ['textures/entity/end_portal/end_portal.png', 'textures/entity/end_portal.png'];
            if (/^1\./.test(version)) paths.reverse();
            textures.set(url, Promise.all([
                textureInfo(src.url('minecraft', 'textures/environment/end_sky.png')),
                textureInfo(src.url('minecraft', paths[0])).then(info => info || textureInfo(src.url('minecraft', paths[1])))
            ]).then(([sky, stars]) => (sky && stars ? { url, layer: 'portal', layers: Number(layers), sky, stars, info: null } : null)));
        }
        return textures.get(url);
    }
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
        color: options.color ?? -1,
        ao: options.ao !== false,
        emission: options.emission || 0,
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
        const emission = Math.max(0, Math.min(15, Number(element.light_emission) || 0));
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
                emission,
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

function sherdTexture(src, item, side) {
    const { ns, path } = splitId(String(item || 'minecraft:brick'));
    const match = /^(.+)_pottery_sherd$/.exec(path);
    return match ? src.url(ns, `textures/entity/decorated_pot/${match[1]}_pottery_pattern.png`) : side;
}

function potQuads(src, props, sherds) {
    const base = src.url('minecraft', 'textures/entity/decorated_pot/decorated_pot_base.png');
    const side = src.url('minecraft', 'textures/entity/decorated_pot/decorated_pot_side.png');
    const neck = pose([...cube(0, 0, 4, 17, 4, 8, 3, 8, 32, [0, 0, 0], '', -0.1), ...cube(0, 5, 5, 20, 5, 6, 1, 6, 32, [0, 0, 0], '', 0.2)], [0, 37, 16], Math.PI);
    const plane = cube(-14, 13, 0, 0, 0, 14, 0, 14, 32, [0, 0, 0]);
    const ends = [...pose(plane, [1, 16, 1]), ...pose(plane, [1, 0, 1])];
    const sidePlane = cube(1, 0, 0, 0, 0, 14, 16, 0, 16, [0, 0, 0], 'down up west east south');
    const faces = [
        ['back', pose(sidePlane, [15, 16, 1], 0, 0, Math.PI)],
        ['left', pose(sidePlane, [1, 16, 1], 0, -Math.PI / 2, Math.PI)],
        ['right', pose(sidePlane, [15, 16, 15], 0, Math.PI / 2, Math.PI)],
        ['front', pose(sidePlane, [1, 16, 15], Math.PI)]
    ];
    const yaw = (YAW[props.facing] ?? 180) - 180;
    return [...entityQuads([...neck, ...ends], base, yaw), ...faces.flatMap(([name, polygons]) => entityQuads(polygons, sherdTexture(src, sherds && sherds[name], side), yaw))];
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

function bannerQuads(src, path, props, patterns) {
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
    const make = (polygons, texture, tint, color) => place(polygons).map(polygon => makeQuad(polygon.points, polygon.uv, texture, { ao: false, tint, color }));
    const layers = (patterns || []).slice(0, 16).map((layer, i) => {
        const grow = 0.02 + (i + 1) * 0.015;
        const polygons = cube(0, 0, -10 - grow, -grow, -2 - grow, 20 + grow * 2, 40 + grow * 2, 1 + grow * 2, 64, flagOffset);
        const { ns, path: id } = splitId(String(layer.pattern || ''));
        return make(polygons, src.url(ns, `textures/entity/banner/${id}.png`), -1, DYES[layer.color] ?? DYES.white);
    });
    return [...make([...body, ...flag], base, -1), ...make(cloth, pattern, 0), ...layers.flat()];
}

export function cushionQuads(color, yaw, offset) {
    const texture = source(null).url('minecraft', `textures/entity/cushion/${color in DYES ? color : 'white'}_cushion.png`);
    const angle = Math.PI - yaw * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return cube(0, 0, -8, 0, -8, 16, 4, 16, 64, [0, 0, 0], '', -0.005).map(polygon => {
        const points = polygon.points.map(([x, y, z]) => {
            const ry = -(y - 4), rz = -z;
            return [offset[0] + x * cos + rz * sin, offset[1] + ry, offset[2] - x * sin + rz * cos];
        });
        return makeQuad(points, polygon.uv, texture, { ao: false });
    });
}

function bellQuads(src) {
    const texture = src.url('minecraft', 'textures/entity/bell/bell_body.png');
    return entityQuads([...cube(0, 0, -3, -6, -3, 6, 7, 6, 32, [8, 12, 8]), ...cube(0, 13, 4, 4, 4, 8, 2, 8, 32, [0, 0, 0])], texture, 0);
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function mul(a, b) {
    const out = new Array(12);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
        out[9 + r] = a[r * 3] * b[9] + a[r * 3 + 1] * b[10] + a[r * 3 + 2] * b[11] + a[9 + r];
    }
    return out;
}

const translate = (x, y, z) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
const scale = (x, y = x, z = x) => [x, 0, 0, 0, y, 0, 0, 0, z, 0, 0, 0];
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c, 0, 0, 0]; };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c, 0, 0, 0]; };
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1, 0, 0, 0]; };
const chain = (...matrices) => matrices.reduce(mul, IDENTITY);
const apply = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z + m[9], m[3] * x + m[4] * y + m[5] * z + m[10], m[6] * x + m[7] * y + m[8] * z + m[11]];
const DEG = Math.PI / 180;

function part(offset, cubes, children = [], rotation = [0, 0, 0], size = 1) {
    return { offset, cubes, children, rotation, size };
}

function box(u, v, x, y, z, w, h, d, grow = 0, mirror = false) {
    return { u, v, x, y, z, w, h, d, grow, mirror };
}

function modelQuads(root, matrix, texture, width, height = width) {
    const out = [];
    const walk = (node, parent) => {
        const [rx, ry, rz] = node.rotation;
        const m = chain(parent, translate(node.offset[0] / 16, node.offset[1] / 16, node.offset[2] / 16), rotZ(rz), rotY(ry), rotX(rx), scale(node.size));
        for (const c of node.cubes) {
            for (const polygon of cube(c.u, c.v, c.x, c.y, c.z, c.w, c.h, c.d, width, [0, 0, 0], '', c.grow, height)) {
                let points = polygon.points, uv = polygon.uv;
                if (c.mirror) {
                    const sum = c.x * 2 + c.w;
                    points = points.map(([x, y, z]) => [sum - x, y, z]).reverse();
                    uv = uv.slice().reverse();
                }
                out.push(makeQuad(points.map(p => apply(m, [p[0] / 16, p[1] / 16, p[2] / 16]).map(value => value * 16)), uv, texture, { ao: false }));
            }
        }
        for (const child of node.children) walk(child, m);
    };
    walk(root, matrix);
    return out;
}

const DIRECTION_ROTATION = {
    down: rotX(Math.PI), up: IDENTITY, north: chain(rotX(Math.PI / 2), rotZ(Math.PI)), south: rotX(Math.PI / 2),
    west: chain(rotX(Math.PI / 2), rotZ(Math.PI / 2)), east: chain(rotX(Math.PI / 2), rotZ(-Math.PI / 2))
};
const OPPOSITE = { north: 'south', south: 'north', west: 'east', east: 'west' };
const STEP = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

function shulkerQuads(src, path, props) {
    const color = /^(.+)_shulker_box$/.exec(path);
    const texture = src.url('minecraft', `textures/entity/shulker/shulker${color ? `_${color[1]}` : ''}.png`);
    const root = part([0, 0, 0], [], [
        part([0, 24, 0], [box(0, 0, -8, -16, -8, 16, 12, 16)]),
        part([0, 24, 0], [box(0, 28, -8, -8, -8, 16, 8, 16)])
    ]);
    const m = chain(translate(0.5, 0.5, 0.5), scale(0.9995), DIRECTION_ROTATION[props.facing] || IDENTITY, scale(1, -1, -1), translate(0, -1, 0));
    return modelQuads(root, m, texture, 64);
}

const SKULLS = {
    skeleton: ['skeleton/skeleton', 'mob'], wither_skeleton: ['skeleton/wither_skeleton', 'mob'], creeper: ['creeper/creeper', 'mob'],
    zombie: ['zombie/zombie', 'humanoid'], player: ['player/slim/steve', 'humanoid'], piglin: ['piglin/piglin', 'piglin'], dragon: ['enderdragon/dragon', 'dragon']
};
const SKULL = /^(skeleton|wither_skeleton|creeper|zombie|player|piglin|dragon)_(wall_)?(skull|head)$/;

function skullQuads(src, path, props) {
    const [, type, wall] = SKULL.exec(path);
    const [file, kind] = SKULLS[type];
    const texture = src.url('minecraft', `textures/entity/${file}.png`);
    let root, width = 64, height = 64;
    if (kind === 'dragon') {
        const jaw = part([0, 4, -8], [box(176, 65, -6, 0, -16, 12, 4, 16)], [], [0.2, 0, 0]);
        root = part([0, -7.986666 * 0.75, 0], [
            box(176, 44, -6, -1, -24, 12, 5, 16), box(112, 30, -8, -8, -10, 16, 16, 16),
            box(0, 0, -5, -12, -4, 2, 4, 6, 0, true), box(112, 0, -5, -3, -22, 2, 2, 4, 0, true),
            box(0, 0, 3, -12, -4, 2, 4, 6), box(112, 0, 3, -3, -22, 2, 2, 4)
        ], [jaw], [0, 0, 0], 0.75);
        width = height = 256;
    } else if (kind === 'piglin') {
        root = part([0, 0, 0], [box(0, 0, -5, -8, -4, 10, 8, 8), box(31, 1, -2, -4, -5, 4, 4, 1), box(2, 4, 2, -2, -5, 1, 2, 1), box(2, 0, -3, -2, -5, 1, 2, 1)], [
            part([4.5, -6, 0], [box(51, 6, 0, 0, -2, 1, 5, 4)], [], [0, 0, -0.7]),
            part([-4.5, -6, 0], [box(39, 6, -1, 0, -2, 1, 5, 4)], [], [0, 0, 0.7])
        ]);
    } else {
        const cubes = [box(0, 0, -4, -8, -4, 8, 8, 8)];
        if (kind === 'humanoid') cubes.push(box(32, 0, -4, -8, -4, 8, 8, 8, 0.25));
        else height = 32;
        root = part([0, 0, 0], cubes);
    }
    let m;
    if (wall) {
        const facing = props.facing in STEP ? props.facing : 'north';
        const [sx, sz] = STEP[facing];
        m = chain(translate(0.5 - sx * 0.25, 0.25, 0.5 - sz * 0.25), rotY(-(YAW[OPPOSITE[facing]]) * DEG), scale(-1, -1, 1));
    } else {
        m = chain(translate(0.5, 0, 0.5), rotY(-(Number(props.rotation) || 0) * 22.5 * DEG), scale(-1, -1, 1));
    }
    return modelQuads(root, m, texture, width, height);
}

function conduitQuads(src) {
    const texture = src.url('minecraft', 'textures/entity/conduit/base.png');
    return modelQuads(part([0, 0, 0], [box(0, 0, -3, -3, -3, 6, 6, 6)]), translate(0.5, 0.5, 0.5), texture, 32, 16);
}

const GOLEM_HEAD = (y, z = 0, rodY = -9, knobY = -13, grow = 0.015) => [
    box(0, 0, -4, -5 + y, -5 + z, 8, 5, 10, grow), box(56, 0, -1, -2 + y, -6 + z, 2, 3, 2),
    box(37, 8, -1, rodY, -1 + z, 2, 4, 2, -0.015), box(37, 0, -2, knobY, -2 + z, 4, 4, 4, -0.015)
];
const GOLEM_POSES = {
    standing: () => part([0, 0, 0], [], [
        part([0, -5, 0], [box(0, 15, -4, -6, -3, 8, 6, 6)], [
            part([0, -6, 0], GOLEM_HEAD(0)),
            part([-4, -6, 0], [box(36, 16, -3, -1, -2, 3, 10, 4)]),
            part([4, -6, 0], [box(50, 16, 0, -1, -2, 3, 10, 4)])
        ]),
        part([0, -5, 0], [box(0, 27, -4, 0, -2, 4, 5, 4)]),
        part([0, -5, 0], [box(16, 27, 0, 0, -2, 4, 5, 4)])
    ], [0, 0, Math.PI]),
    running: () => part([0, 0, 0], [], [
        part([-1.064, -5, 0], [], [
            part([1.1, 0.1, 0.7], [box(0, 15, -4.02, -6.116, -3.5, 8, 6, 6)], [], [0.1204, -0.0064, -0.0779]),
            part([0.7, -5.6, -1.8], [box(0, 0, -4, -5.1, -5, 8, 5, 10), box(56, 0, -1.02, -2.1, -6, 2, 3, 2), box(37, 8, -1.02, -9.1, -1, 2, 4, 2, -0.015), box(37, 0, -2, -13.1, -2, 4, 4, 4, -0.015)]),
            part([-4, -6, 0], [], [part([0.7, -0.248, -1.62], [box(36, 16, -3.052, -1.11, -2.036, 3, 10, 4)], [], [1.0036, 0, 0])]),
            part([4, -6, 0], [], [part([0.732, 0, 0], [box(50, 16, 0.032, -1.1, -2, 3, 10, 4)], [], [-0.8715, -0.0535, -0.0449])])
        ]),
        part([-3.064, -5, 0], [], [part([1.048, 0, -0.9], [box(0, 27, -1.856, -0.1, -1.09, 4, 5, 4)], [], [-0.8727, 0, 0])]),
        part([0.936, -5, 0], [], [part([1, 0, 0], [box(16, 27, -2.088, -0.1, -2, 4, 5, 4)], [], [0.7854, 0, 0])])
    ], [0, 0, Math.PI]),
    sitting: () => part([0, 0, 0], [], [
        part([0, -3, 2.325], [box(3, 19, -3, -4, -4.525, 6, 1, 6), box(0, 15, -4, -3, -3.525, 8, 6, 6)], [
            part([0, -1, -4.325], [box(3, 18, -4, -3, -2.2, 8, 6, 3)], [], [0, 0, -3.1416]),
            part([0, -6, -0.2], [box(37, 8, -1, -7, -3.3, 2, 4, 2, -0.015), box(37, 0, -2, -11, -4.3, 4, 4, 4, -0.015), box(0, 0, -4, -3, -7.325, 8, 5, 10), box(56, 0, -1, 0, -8.325, 2, 3, 2)]),
            part([-4, -5.6, -1.8], [], [part([0, 0.0893, 0.1198], [box(36, 16, -3.075, -0.9733, -1.9966, 3, 10, 4)], [], [-1.0472, 0, 0])], [0.4363, 0, 0]),
            part([4, -5.6, -1.7], [], [part([0, -0.0015, -0.0808], [box(50, 16, 0.075, -1.0443, -1.8997, 3, 10, 4)], [], [-1.0472, 0, 0])], [0.4363, 0, 0])
        ]),
        part([-2.1, -2.1, -2.075], [], [part([0.05, -1.9, 1.075], [box(0, 27, -2, 0.975, 0, 4, 5, 4)], [], [-1.5708, 0, 0])]),
        part([2, -2, -2.075], [], [part([0.05, -2, 1.075], [box(16, 27, -2, 0.975, 0, 4, 5, 4)], [], [-1.5708, 0, 0])])
    ], [0, 0, Math.PI]),
    star: () => part([0, 0, 0], [], [
        part([0, -5, 0], [box(0, 15, -4, -6, -3, 8, 6, 6)], [
            part([0, -6, 0], GOLEM_HEAD(0, 0, -9, -13, 0)),
            part([-4, -6, 0], [], [part([1, 1, 0], [box(36, 16, -1.5, -5, -2, 3, 10, 4)], [], [0, 0, 1.9199])]),
            part([4, -6, 0], [], [part([-1, 1, 0], [box(50, 16, -1.5, -5, -2, 3, 10, 4)], [], [0, 0, -1.9199])])
        ]),
        part([-3, -5, 0], [], [part([0.35, 2, 0.01], [box(0, 27, -2, -2.5, -2, 4, 5, 4)], [], [0, 0, 0.2618])]),
        part([1, -5, 0], [], [part([1.65, 2, 0], [box(16, 27, -2, -2.5, -2, 4, 5, 4)], [], [0, 0, -0.2618])])
    ], [0, 0, Math.PI])
};

function golemQuads(src, path, props) {
    const stage = /^(?:waxed_)?(exposed|weathered|oxidized)_/.exec(path);
    const texture = src.url('minecraft', `textures/entity/copper_golem/copper_golem${stage ? `_${stage[1]}` : ''}.png`);
    const facing = props.facing in STEP ? props.facing : 'north';
    const root = (GOLEM_POSES[props.copper_golem_pose] || GOLEM_POSES.standing)();
    return modelQuads(root, chain(translate(0.5, 0, 0.5), rotY(-(YAW[OPPOSITE[facing]]) * DEG)), texture, 64);
}

function portalQuads(path) {
    const gateway = path === 'end_gateway';
    const from = [0, gateway ? 0 : 6, 0], to = [16, gateway ? 16 : 12, 16];
    const texture = `portal:${gateway ? 16 : 15}:${currentVersion()}`;
    return DIRS.filter(face => gateway || face === 'up' || face === 'down').map(face => {
        const points = corners(face, from, to);
        return makeQuad([points[0], points[3], points[2], points[1]], [[0, 0], [0, 1], [1, 1], [1, 0]], texture, { cull: gateway ? DIRS.indexOf(face) : -1, ao: false, shade: false });
    });
}

export function fluidTextures(kind) {
    const src = source(null);
    return {
        still: src.url('minecraft', `textures/block/${kind}_still.png`),
        flow: src.url('minecraft', `textures/block/${kind}_flow.png`),
        overlay: kind === 'water' ? src.url('minecraft', 'textures/block/water_overlay.png') : null
    };
}

export const quadOf = makeQuad;
export const affine = { chain, translate, scale, rotX, rotY, rotZ, apply, IDENTITY, DEG };
export { DYES };

export function canvasTexture(key, canvas) {
    if (!textures.has(key)) textures.set(key, Promise.resolve({ url: key, image: canvas, info: null, canvas, layer: 'cutout' }));
    return key;
}

const states = new Map();

export function blockExtra(name, data) {
    if (!data) return null;
    const { ns, path } = splitId(name);
    if (ns !== 'minecraft') return null;
    if (BANNER.test(path) && Array.isArray(data.patterns) && data.patterns.length) {
        return { patterns: data.patterns.map(layer => ({ pattern: String(layer.pattern || ''), color: String(layer.color || 'white') })) };
    }
    if (path === 'decorated_pot' && data.sherds) {
        const raw = data.sherds;
        const id = value => (value && typeof value === 'object' ? value.id : value);
        const sherds = Array.isArray(raw)
            ? { back: raw[0], left: raw[1], right: raw[2], front: raw[3] }
            : { back: id(raw.back), left: id(raw.left), right: id(raw.right), front: id(raw.front) };
        for (const key of Object.keys(sherds)) if (!sherds[key]) delete sherds[key];
        return Object.keys(sherds).length ? { sherds } : null;
    }
    return null;
}

export function stateKey(name, props) {
    const keys = Object.keys(props).sort();
    return keys.length ? `${name}[${keys.map(key => `${key}=${props[key]}`).join(',')}]` : name;
}

export function bakeState(name, props, extra = null) {
    const key = `${currentVersion()}|${stateKey(name, props)}${extra ? JSON.stringify(extra) : ''}`;
    if (!states.has(key)) {
        const promise = bake(name, props, extra).catch(error => {
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
        water: false, light: 0, problem: reason, selfCull: false, solid: true, dampen: 15, masks: null, emissive: false
    };
}

function fullCube(url) {
    return DIRS.map(face => {
        const points = corners(face, [0, 0, 0], [16, 16, 16]);
        return makeQuad([points[0], points[3], points[2], points[1]], [[0, 0], [0, 1], [1, 1], [1, 0]], url, { cull: DIRS.indexOf(face) });
    });
}

async function bake(name, props, extra) {
    const { ns, path } = splitId(name);
    const water = props.waterlogged === 'true' || (ns === 'minecraft' && ALWAYS_WET.test(path));
    const light = lightOf(name, props);
    const base = {
        name, parts: [], full: false, opaque: false, shade: 1, ao: light === 0, water, light, problem: null,
        selfCull: ns === 'minecraft' && SELF_CULLING.test(path), glass: ns === 'minecraft' && GLASS.test(path),
        solid: false, dampen: water && !SKYLIGHT_ALWAYS.test(path) ? 1 : 0, masks: null,
        emissive: ns === 'minecraft' && path === 'magma_block'
    };
    if (ns === 'minecraft' && INVISIBLE.has(path)) return base;
    if (ns === 'minecraft' && (path === 'water' || path === 'bubble_column')) return { ...base, dampen: 1 };
    if (ns === 'minecraft' && path === 'lava') return { ...base, dampen: 1, fluid: 'lava', parts: [] };

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

    const book = ns === 'minecraft' && ((path === 'lectern' && props.has_book === 'true') || path === 'enchanting_table');
    const entityModel = ns === 'minecraft' && (/(^|_)shulker_box$/.test(path) || SKULL.test(path) || path === 'conduit' || path === 'end_portal' || path === 'end_gateway' || /copper_golem_statue$/.test(path));
    const special = ns === 'minecraft' && (path in CHESTS || path === 'bell' || path === 'decorated_pot' || BANNER.test(path) || entityModel);
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
    if (ns === 'minecraft' && path === 'decorated_pot') parts.push([{ weight: 1, quads: potQuads(current, props, extra && extra.sherds) }]);
    if (ns === 'minecraft' && BANNER.test(path)) parts.push([{ weight: 1, quads: bannerQuads(current, path, props, extra && extra.patterns) }]);
    if (entityModel) {
        let quads;
        if (/(^|_)shulker_box$/.test(path)) quads = shulkerQuads(current, path, props);
        else if (SKULL.test(path)) quads = skullQuads(current, path, props);
        else if (path === 'conduit') quads = conduitQuads(current);
        else if (path === 'end_portal' || path === 'end_gateway') quads = portalQuads(path);
        else quads = golemQuads(current, path, props);
        parts.push([{ weight: 1, quads }]);
    }
    if (book) {
        const { bookQuads } = await import('./structure-entities.js');
        parts.push([{ weight: 1, quads: await bookQuads(path, props) }]);
    }
    const quadCount = parts.reduce((sum, options) => sum + (options[0] ? options[0].quads.length : 0), 0);
    if (quadCount === 0) return { ...base, problem: 'unsupported' };

    const info = result && result.info;
    let full = Boolean(info && info.full);
    let opaque = Boolean(info && info.opaque);
    if (!full && !entityModel && parts.length && faceMasks(parts).every(mask => mask === 0xffff)) {
        const boundary = parts.flatMap(options => (options[0] ? options[0].quads : [])).filter(quad => quad.cull >= 0);
        const infos = await Promise.all([...new Set(boundary.map(quad => quad.texture))].map(textureInfo));
        if (infos.every(item => item && item.layer === 'opaque')) { full = true; opaque = true; }
    }
    const vanilla = ns === 'minecraft';
    const solid = opaque && !(vanilla && (NO_OCCLUSION.has(path) || NO_OCCLUSION_PATTERN.test(path)));
    let dampen;
    if (solid || (vanilla && path === 'tinted_glass')) dampen = 15;
    else if (vanilla && DAMPEN_ONE.test(path)) dampen = 1;
    else if (vanilla && SKYLIGHT_ALWAYS.test(path)) dampen = 0;
    else dampen = water || full ? 1 : 0;
    const shaped = vanilla && !solid && (SHAPE_LIGHT.test(path) || (/_slab$/.test(path) && props.type !== 'double'));
    return {
        ...base,
        parts,
        full,
        opaque,
        solid: solid || dampen === 15,
        dampen,
        masks: shaped ? faceMasks(parts) : null,
        motion: full || opaque || solidShape(ns, path, parts),
        shade: full && !base.glass ? 0.2 : 1,
        ao: base.ao && (!info || info.ao)
    };
}

function faceMasks(parts) {
    const masks = [0, 0, 0, 0, 0, 0];
    for (const options of parts) {
        const option = options[0];
        if (!option) continue;
        for (const quad of option.quads) {
            const dir = quad.dir;
            const axis = dir < 2 ? 1 : dir < 4 ? 2 : 0;
            const plane = dir % 2 === 1 ? 1 : 0;
            let onPlane = true;
            for (let i = 0; i < 4; i++) if (Math.abs(quad.p[i * 3 + axis] - plane) > 1e-4) onPlane = false;
            if (!onPlane) continue;
            const [ta, tb] = FACE_TANGENTS[dir];
            let a0 = 1, a1 = 0, b0 = 1, b1 = 0;
            for (let i = 0; i < 4; i++) {
                const a = quad.p[i * 3 + ta], b = quad.p[i * 3 + tb];
                a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
            }
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    if (a0 <= i / 4 + 1e-4 && a1 >= (i + 1) / 4 - 1e-4 && b0 <= j / 4 + 1e-4 && b1 >= (j + 1) / 4 - 1e-4) masks[dir] |= 1 << (i * 4 + j);
                }
            }
        }
    }
    return masks;
}

