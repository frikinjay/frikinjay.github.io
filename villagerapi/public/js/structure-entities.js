import { vanillaUrl, fetchJson, imageSource, frameOf } from './mc-assets.js';
import { quadOf, affine, DYES, canvasTexture } from './structure-models.js';
import { plain, TAG } from './structure-core.js';

const { chain, translate, scale, rotX, rotY, rotZ, apply, DEG } = affine;
const ASSETS = '26.3';
const MODELS_URL = new URL('../data/entity-models.json', import.meta.url).href;
const LEVELS = ['stone', 'iron', 'gold', 'emerald', 'diamond'];
const CAT_TYPES = ['tabby', 'black', 'red', 'siamese', 'british_shorthair', 'calico', 'persian', 'ragdoll', 'white', 'jellie', 'all_black'];
const HORSE_COLORS = ['white', 'creamy', 'chestnut', 'brown', 'black', 'gray', 'darkbrown'];
const HORSE_MARKINGS = [null, 'white', 'whitefield', 'whitedots', 'blackdots'];
const DYE_ORDER = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const TEXT_COLORS = {
    white: 0xffffff, orange: 0xff681f, magenta: 0xff00ff, light_blue: 0x9ac0cd, yellow: 0xffff00, lime: 0xbfff00, pink: 0xff69b4, gray: 0x808080,
    light_gray: 0xd3d3d3, cyan: 0x00ffff, purple: 0xa020f0, blue: 0x0000ff, brown: 0x8b4513, green: 0x00ff00, red: 0xff0000, black: 0x000000
};
const ARMOR = /^minecraft:(leather|chainmail|iron|golden|diamond|netherite|copper)_(helmet|chestplate|leggings|boots)$/;
const SLOT_OF = { helmet: 'head', chestplate: 'chest', leggings: 'legs', boots: 'feet' };
const HEAD_PITCH = new Set(['villager', 'zombie_villager', 'iron_golem', 'allay', 'cat', 'cow', 'pig', 'sheep', 'piglin', 'piglin_brute']);

let models = null;
const loadModels = () => (models ||= fetchJson(MODELS_URL).then(data => data || {}));
const texture = path => vanillaUrl(ASSETS, `textures/${path}.png`);
const idPath = value => String(value || '').replace(/^minecraft:/, '');

function modelQuads(model, matrix, url, options = {}) {
    const out = [];
    const walk = (node, parent) => {
        const override = options.poses && options.poses[node.name];
        const [x, y, z, rx0, ry0, rz0, sx, sy, sz] = node.pose;
        const [rx, ry, rz] = override || [rx0, ry0, rz0];
        const visible = options.visible && node.name in options.visible ? options.visible[node.name] : node.visible;
        if (!visible) return;
        const m = chain(parent, translate(x / 16, y / 16, z / 16), rotZ(rz), rotY(ry), rotX(rx), scale(sx, sy, sz));
        for (const q of node.quads) {
            const points = [0, 1, 2, 3].map(i => apply(m, [q[i * 5] / 16, q[i * 5 + 1] / 16, q[i * 5 + 2] / 16]).map(v => v * 16));
            const uv = [0, 1, 2, 3].map(i => [q[i * 5 + 3], q[i * 5 + 4]]);
            out.push(quadOf(points, uv, url, { ao: false, layer: options.layer || null, color: options.color ?? -1 }));
        }
        for (const child of node.children) walk(child, m);
    };
    walk(model.root, matrix);
    return out;
}

const HATS = {
    type: { desert: 'full', snow: 'full' },
    profession: { butcher: 'partial', farmer: 'full', fisherman: 'full', fletcher: 'full', librarian: 'full', shepherd: 'full' }
};

function isBaby(data) {
    return (Number(data.Age) || 0) < 0 || data.IsBaby === 1 || data.IsBaby === true;
}

function equipment(data) {
    const out = {};
    if (data.equipment && typeof data.equipment === 'object') Object.assign(out, data.equipment);
    if (Array.isArray(data.ArmorItems)) ['feet', 'legs', 'chest', 'head'].forEach((slot, i) => { if (!out[slot] && data.ArmorItems[i] && data.ArmorItems[i].id) out[slot] = data.ArmorItems[i]; });
    if (Array.isArray(data.HandItems)) ['mainhand', 'offhand'].forEach((slot, i) => { if (!out[slot] && data.HandItems[i] && data.HandItems[i].id) out[slot] = data.HandItems[i]; });
    return out;
}

function woolColor(index) {
    const name = DYE_ORDER[Number(index) & 15] || 'white';
    if (name === 'white') return 0xe6e6e6;
    const c = DYES[name];
    return (Math.floor(((c >> 16) & 255) * 0.75) << 16) | (Math.floor(((c >> 8) & 255) * 0.75) << 8) | Math.floor((c & 255) * 0.75);
}

function variantOf(data, fallback) {
    return idPath(data.variant || fallback);
}

const POSE_DEFAULTS = { Head: [0, 0, 0], Body: [0, 0, 0], LeftArm: [-10, 0, -10], RightArm: [-15, 0, 10], LeftLeg: [-1, 0, -1], RightLeg: [1, 0, 1] };
const POSE_PARTS = { Head: 'head', Body: 'body', LeftArm: 'left_arm', RightArm: 'right_arm', LeftLeg: 'left_leg', RightLeg: 'right_leg' };

export async function entityModel(entity) {
    const all = await loadModels();
    const data = plain(TAG.COMPOUND, entity.nbt);
    const id = idPath(entity.id);
    const rotation = Array.isArray(data.Rotation) ? data.Rotation.map(Number) : [0, 0];
    const yaw = rotation[0] || 0, pitch = rotation[1] || 0;
    const baby = isBaby(data);
    const layers = [];
    const notes = [];
    const add = (modelId, path, extra = {}) => { if (all[modelId]) layers.push({ model: all[modelId], url: texture(path), ...extra }); };
    let pitchModel = HEAD_PITCH.has(id);
    switch (id) {
        case 'villager':
        case 'zombie_villager': {
            const base = baby ? `${id}_baby` : id;
            add(base, `entity/${id}/${base}`);
            const info = data.VillagerData || {};
            const type = idPath(info.type || 'plains');
            const profession = idPath(info.profession || 'none');
            const typeUrl = texture(`entity/${id}/${baby ? 'baby' : 'type'}/${type}`);
            const professionUrl = texture(`entity/${id}/profession/${profession}`);
            const typeHat = baby ? 'none' : HATS.type[type] || 'none';
            const professionHat = HATS.profession[profession] || 'none';
            const typeHatVisible = professionHat === 'none' || (professionHat === 'partial' && typeHat !== 'full');
            layers.push({ model: all[typeHatVisible ? base : `${base}_no_hat`], url: typeUrl, layer: 'overlay1' });
            if (profession !== 'none' && !baby) {
                layers.push({ model: all[base], url: professionUrl, layer: 'overlay2' });
                if (profession !== 'nitwit') {
                    const level = LEVELS[Math.min(5, Math.max(1, Number(info.level) || 1)) - 1];
                    layers.push({ model: all[base], url: texture(`entity/${id}/profession_level/${level}`), layer: 'overlay3' });
                }
            }
            break;
        }
        case 'iron_golem': add('iron_golem', 'entity/iron_golem/iron_golem'); break;
        case 'allay': add('allay', 'entity/allay/allay'); break;
        case 'cat': {
            const variant = data.variant ? idPath(data.variant) : CAT_TYPES[Number(data.CatType) || 0] || 'tabby';
            add(baby ? 'cat_baby' : 'cat', `entity/cat/cat_${variant}${baby ? '_baby' : ''}`);
            break;
        }
        case 'cow': {
            const variant = variantOf(data, 'temperate');
            add(baby ? 'cow_baby' : variant === 'warm' ? 'warm_cow' : variant === 'cold' ? 'cold_cow' : 'cow', `entity/cow/cow_${variant}${baby ? '_baby' : ''}`);
            break;
        }
        case 'pig': {
            const variant = variantOf(data, 'temperate');
            add(baby ? 'pig_baby' : variant === 'cold' ? 'cold_pig' : 'pig', `entity/pig/pig_${variant}${baby ? '_baby' : ''}`);
            break;
        }
        case 'horse': {
            const value = Number(data.Variant) || 0;
            const color = HORSE_COLORS[value & 255] || 'white';
            const marking = HORSE_MARKINGS[(value >> 8) & 255];
            const model = baby ? 'horse_baby' : 'horse';
            add(model, `entity/horse/horse_${color}${baby ? '_baby' : ''}`);
            if (marking) add(model, `entity/horse/horse_markings_${marking}${baby ? '_baby' : ''}`, { layer: 'overlay1' });
            break;
        }
        case 'sheep': {
            add(baby ? 'sheep_baby' : 'sheep', `entity/sheep/sheep${baby ? '_baby' : ''}`);
            const color = woolColor(data.Color);
            if (!data.Sheared) {
                if (!baby && (Number(data.Color) || 0) !== 0) add('sheep_wool_undercoat', 'entity/sheep/sheep_wool_undercoat', { layer: 'overlay1', color });
                add(baby ? 'sheep_baby_wool' : 'sheep_wool', `entity/sheep/sheep_wool${baby ? '_baby' : ''}`, { layer: 'overlay2', color });
            }
            break;
        }
        case 'camel': add(baby ? 'camel_baby' : 'camel', `entity/camel/camel${baby ? '_baby' : ''}`); break;
        case 'piglin': add(baby ? 'piglin_baby' : 'piglin', `entity/piglin/piglin${baby ? '_baby' : ''}`); break;
        case 'piglin_brute': add('piglin_brute', 'entity/piglin/piglin_brute'); break;
        case 'hoglin': add(baby ? 'hoglin_baby' : 'hoglin', `entity/hoglin/hoglin${baby ? '_baby' : ''}`); break;
        case 'armor_stand': {
            if (data.Invisible) break;
            const pose = data.Pose || {};
            const poses = {};
            for (const [key, part] of Object.entries(POSE_PARTS)) {
                const value = Array.isArray(pose[key]) ? pose[key].map(Number) : POSE_DEFAULTS[key];
                poses[part] = value.map(v => (Number(v) || 0) * DEG);
            }
            const body = poses.body;
            for (const stick of ['right_body_stick', 'left_body_stick', 'shoulder_stick']) poses[stick] = body;
            poses.base_plate = [0, -yaw * DEG, 0];
            const visible = { left_arm: Boolean(data.ShowArms), right_arm: Boolean(data.ShowArms), base_plate: !data.NoBasePlate };
            const small = Boolean(data.Small);
            add(small ? 'armor_stand_small' : 'armor_stand', 'entity/armorstand/armorstand', { poses, visible });
            if (!small) {
                const gear = equipment(data);
                for (const slot of ['feet', 'legs', 'chest', 'head']) {
                    const match = gear[slot] && ARMOR.exec(String(gear[slot].id));
                    if (!match || SLOT_OF[match[2]] !== slot) continue;
                    const material = match[1] === 'golden' ? 'gold' : match[1];
                    const folder = slot === 'legs' ? 'humanoid_leggings' : 'humanoid';
                    add(`armor_stand_armor_${slot}`, `entity/equipment/${folder}/${material}`, { poses, color: material === 'leather' ? 0xa06540 : -1 });
                }
            }
            pitchModel = false;
            break;
        }
        default:
            return null;
    }
    if (!layers.length) return { quads: [], notes };
    const gear = equipment(data);
    if (id !== 'armor_stand' && (gear.mainhand || gear.offhand)) notes.push('held items');
    if (id !== 'armor_stand' && ['head', 'chest', 'legs', 'feet'].some(slot => gear[slot])) notes.push('worn armor');
    const [ex, ey, ez] = entity.pos;
    const cell = [Math.floor(ex), Math.floor(ey), Math.floor(ez)];
    const matrix = chain(translate(ex - cell[0], ey - cell[1], ez - cell[2]), rotY((180 - yaw) * DEG), scale(-1, -1, 1), translate(0, -1.501, 0));
    const quads = [];
    for (const layer of layers) {
        if (!layer.model) continue;
        const poses = { ...(layer.poses || {}) };
        if (pitchModel && pitch) {
            const head = layer.model.root.children.find(child => child.name === 'head');
            if (head) poses.head = [head.pose[3] + pitch * DEG, head.pose[4], head.pose[5]];
        }
        quads.push(...modelQuads(layer.model, matrix, layer.url, { ...layer, poses }));
    }
    return { quads, cell, notes };
}

export async function bookQuads(path, props) {
    const all = await loadModels();
    const url = texture('entity/enchantment/enchanting_table_book');
    if (path === 'lectern') {
        const clockwise = { north: 'east', east: 'south', south: 'west', west: 'north' }[props.facing] || 'east';
        const yRot = { south: 0, west: 90, north: 180, east: 270 }[clockwise];
        return modelQuads(all.book_lectern, chain(translate(0.5, 1.0625, 0.5), rotY(-yRot * DEG), rotZ(67.5 * DEG), translate(0, -0.125, 0)), url);
    }
    return modelQuads(all.book_closed, chain(translate(0.5, 0.85, 0.5), rotZ(80 * DEG)), url);
}

let font = null;
function loadFont() {
    if (!font) {
        font = imageSource(texture('font/ascii')).then(({ image, info }) => {
            if (!image) return null;
            const canvas = frameOf(image, info, 0);
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
            const cell = canvas.width / 16;
            const widths = new Array(256).fill(0);
            for (let c = 0; c < 256; c++) {
                const ox = (c % 16) * cell, oy = Math.floor(c / 16) * cell;
                let right = -1;
                for (let x = 0; x < cell; x++) for (let y = 0; y < cell; y++) if (pixels.data[((oy + y) * canvas.width + ox + x) * 4 + 3] > 0) right = Math.max(right, x);
                widths[c] = c === 32 ? 4 * cell / 8 : right + 2;
            }
            return { pixels, cell, widths };
        }).catch(() => null);
    }
    return font;
}

function textOf(value) {
    if (typeof value === 'string') {
        try { return textOf(JSON.parse(value)); } catch (error) { return value; }
    }
    if (Array.isArray(value)) return value.map(textOf).join('');
    if (value && typeof value === 'object') return String(value.text ?? value.translate ?? '') + (Array.isArray(value.extra) ? value.extra.map(textOf).join('') : '');
    return value == null ? '' : String(value);
}

const advance = (f, code) => (code < 256 ? f.widths[code] : f.widths[63]) * 8 / f.cell;

function drawText(f, lines, width, lineHeight, color, outline) {
    const pad = 2;
    const w = width + pad * 2, h = lineHeight * 4 + pad * 2;
    const scaleUp = 4;
    const canvas = document.createElement('canvas');
    canvas.width = w * scaleUp;
    canvas.height = h * scaleUp;
    const context = canvas.getContext('2d');
    const image = context.createImageData(canvas.width, canvas.height);
    const plot = (px, py, rgb) => {
        for (let dy = 0; dy < scaleUp; dy++) for (let dx = 0; dx < scaleUp; dx++) {
            const x = Math.round(px * scaleUp) + dx, y = Math.round(py * scaleUp) + dy;
            if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
            const i = (y * canvas.width + x) * 4;
            image.data[i] = (rgb >> 16) & 255; image.data[i + 1] = (rgb >> 8) & 255; image.data[i + 2] = rgb & 255; image.data[i + 3] = 255;
        }
    };
    const unit = 8 / f.cell;
    const glyphs = (line, ox, oy, rgb) => {
        let x = ox;
        for (const ch of line) {
            const code = ch.codePointAt(0);
            const c = code < 256 ? code : 63;
            const gx = (c % 16) * f.cell, gy = Math.floor(c / 16) * f.cell;
            for (let yy = 0; yy < f.cell; yy++) for (let xx = 0; xx < f.cell; xx++) {
                if (f.pixels.data[((gy + yy) * f.pixels.width + gx + xx) * 4 + 3] > 0) plot(x + xx * unit, oy + yy * unit, rgb);
            }
            x += advance(f, c);
        }
    };
    lines.forEach((line, i) => {
        const lineWidth = [...line].reduce((sum, ch) => sum + advance(f, ch.codePointAt(0)), 0);
        const ox = pad + (width - lineWidth) / 2, oy = pad + i * lineHeight;
        if (outline !== null) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) glyphs(line, ox + dx, oy + dy, outline);
        glyphs(line, ox, oy, color);
    });
    context.putImageData(image, 0, 0);
    return { canvas, w, h, pad };
}

function fit(f, text, max) {
    let out = '', width = 0;
    for (const ch of text) {
        const step = advance(f, ch.codePointAt(0));
        if (width + step > max + 1) break;
        out += ch;
        width += step;
    }
    return out;
}

const SIGN = /^minecraft:(.+?)_(wall_)?(hanging_)?sign$/;

export async function signTextQuads(name, props, nbt) {
    const match = SIGN.exec(name);
    if (!match || !nbt) return [];
    const f = await loadFont();
    if (!f) return [];
    const data = plain(TAG.COMPOUND, nbt);
    const wall = Boolean(match[2]), hanging = Boolean(match[3]);
    const angle = wall ? { south: 0, west: 90, north: 180, east: 270 }[props.facing] ?? 0 : (Number(props.rotation) || 0) * 22.5;
    const lineHeight = hanging ? 9 : 10, maxWidth = hanging ? 60 : 90;
    const quads = [];
    for (const [side, back] of [['front_text', false], ['back_text', true]]) {
        const text = data[side];
        if (!text || !Array.isArray(text.messages)) continue;
        const lines = text.messages.slice(0, 4).map(line => fit(f, textOf(line), maxWidth));
        if (!lines.some(line => line.trim())) continue;
        const dye = TEXT_COLORS[String(text.color || 'black')] ?? 0;
        const glowing = Boolean(text.has_glowing_text);
        const dark = dye === 0 && glowing ? 0xf0ebcc : (Math.floor(((dye >> 16) & 255) * 0.4) << 16) | (Math.floor(((dye >> 8) & 255) * 0.4) << 8) | Math.floor((dye & 255) * 0.4);
        const color = glowing ? dye : dark;
        const outline = glowing && dye === 0 ? dark : null;
        const drawn = drawText(f, lines, maxWidth, lineHeight, color, outline);
        const key = canvasTexture(`text:${name}|${side}|${JSON.stringify(lines)}|${color}|${outline}`, drawn.canvas);
        let m;
        if (hanging) {
            m = chain(translate(0.5, 0.9375, 0.5), rotY(-angle * DEG), translate(0, -0.3125, 0), back ? rotY(Math.PI) : affine.IDENTITY, translate(0, -0.32, 0.073), scale(0.0140625, -0.0140625, 0.0140625));
        } else {
            m = chain(translate(0.5, 0.5, 0.5), rotY(-angle * DEG), wall ? translate(0, -0.3125, -0.4375) : affine.IDENTITY, back ? rotY(Math.PI) : affine.IDENTITY,
                translate(0, 0.33333334, 0.046666667), scale(0.010416667, -0.010416667, 0.010416667));
        }
        const top = -2 * lineHeight - drawn.pad, left = -maxWidth / 2 - drawn.pad;
        const corners = [[left, top], [left + drawn.w, top], [left + drawn.w, top + drawn.h], [left, top + drawn.h]];
        const points = corners.map(([x, y]) => apply(m, [x, y, 0]).map(v => v * 16));
        const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
        const options = { ao: false, shade: false, emission: glowing ? 15 : 0, layer: 'overlay1' };
        quads.push(quadOf(points, uv, key, options), quadOf(points.slice().reverse(), uv.slice().reverse(), key, options));
    }
    return quads;
}
