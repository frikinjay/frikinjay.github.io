export const MAPPING_FILE = 'block_replacements.json';
export const BLOCK_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

const END = 0, BYTE = 1, SHORT = 2, INT = 3, LONG = 4, FLOAT = 5, DOUBLE = 6;
const BYTE_ARRAY = 7, STRING = 8, LIST = 9, COMPOUND = 10, INT_ARRAY = 11, LONG_ARRAY = 12;
export const TAG = { END, BYTE, SHORT, INT, LONG, FLOAT, DOUBLE, BYTE_ARRAY, STRING, LIST, COMPOUND, INT_ARRAY, LONG_ARRAY };

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

export function text(bytes) {
    if (typeof bytes === 'string') return bytes;
    if (!bytes) return '';
    if (bytes.length < 64) {
        let ascii = true;
        for (let i = 0; i < bytes.length; i++) if (bytes[i] > 127) { ascii = false; break; }
        if (ascii) return String.fromCharCode.apply(null, bytes);
    }
    return decoder.decode(bytes);
}

class Reader {
    constructor(bytes) {
        this.bytes = bytes;
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.at = 0;
    }

    take(size) {
        if (this.at + size > this.bytes.length) throw new Error('Unexpected end of NBT data');
        const start = this.at;
        this.at += size;
        return start;
    }

    byte() { return this.view.getInt8(this.take(1)); }
    short() { return this.view.getInt16(this.take(2)); }
    int() { return this.view.getInt32(this.take(4)); }
    ushort() { return this.view.getUint16(this.take(2)); }
    slice(size) { const start = this.take(size); return this.bytes.slice(start, start + size); }

    length(unit) {
        const count = this.int();
        if (count < 0 || count * unit > this.bytes.length - this.at) throw new Error('Bad NBT array length');
        return count;
    }

    payload(type) {
        switch (type) {
            case BYTE: return this.byte();
            case SHORT: return this.short();
            case INT: return this.int();
            case LONG: return this.slice(8);
            case FLOAT: return this.slice(4);
            case DOUBLE: return this.slice(8);
            case BYTE_ARRAY: return this.slice(this.length(1));
            case STRING: return this.slice(this.ushort());
            case INT_ARRAY: return this.slice(this.length(4) * 4);
            case LONG_ARRAY: return this.slice(this.length(8) * 8);
            case LIST: {
                const elementType = this.byte();
                const count = this.length(elementType === END ? 0 : 1);
                const items = new Array(count);
                for (let i = 0; i < count; i++) items[i] = this.payload(elementType);
                return { elementType, items };
            }
            case COMPOUND: {
                const entries = [];
                for (;;) {
                    const childType = this.byte();
                    if (childType === END) return { entries };
                    const raw = this.slice(this.ushort());
                    entries.push({ name: text(raw), raw, type: childType, value: this.payload(childType) });
                }
            }
            default: throw new Error(`Unknown NBT tag type ${type}`);
        }
    }
}

class Writer {
    constructor() {
        this.bytes = new Uint8Array(1 << 16);
        this.view = new DataView(this.bytes.buffer);
        this.at = 0;
    }

    room(size) {
        if (this.at + size <= this.bytes.length) return;
        let next = this.bytes.length * 2;
        while (next < this.at + size) next *= 2;
        const grown = new Uint8Array(next);
        grown.set(this.bytes.subarray(0, this.at));
        this.bytes = grown;
        this.view = new DataView(grown.buffer);
    }

    byte(value) { this.room(1); this.view.setInt8(this.at, value); this.at += 1; }
    short(value) { this.room(2); this.view.setInt16(this.at, value); this.at += 2; }
    ushort(value) { this.room(2); this.view.setUint16(this.at, value); this.at += 2; }
    int(value) { this.room(4); this.view.setInt32(this.at, value); this.at += 4; }
    raw(bytes) { this.room(bytes.length); this.bytes.set(bytes, this.at); this.at += bytes.length; }

    payload(type, value) {
        switch (type) {
            case BYTE: return this.byte(value);
            case SHORT: return this.short(value);
            case INT: return this.int(value);
            case LONG: case FLOAT: case DOUBLE: return this.raw(value);
            case BYTE_ARRAY: this.int(value.length); return this.raw(value);
            case INT_ARRAY: this.int(value.length / 4); return this.raw(value);
            case LONG_ARRAY: this.int(value.length / 8); return this.raw(value);
            case STRING: this.ushort(value.length); return this.raw(value);
            case LIST: {
                const elementType = value.items.length ? value.elementType : (value.elementType || END);
                this.byte(elementType);
                this.int(value.items.length);
                for (const item of value.items) this.payload(elementType, item);
                return undefined;
            }
            case COMPOUND: {
                for (const entry of value.entries) {
                    this.byte(entry.type);
                    this.ushort(entry.raw.length);
                    this.raw(entry.raw);
                    this.payload(entry.type, entry.value);
                }
                return this.byte(END);
            }
            default: throw new Error(`Unknown NBT tag type ${type}`);
        }
    }

    result() { return this.bytes.slice(0, this.at); }
}

async function pipe(bytes, stream) {
    const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await response.arrayBuffer());
}

export const isGzip = bytes => bytes.length > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b;
export const gunzip = bytes => pipe(bytes, new DecompressionStream('gzip'));
export const gzip = bytes => pipe(bytes, new CompressionStream('gzip'));

export function parseNbt(bytes) {
    const reader = new Reader(bytes);
    if (reader.byte() !== COMPOUND) throw new Error('Root tag is not a compound');
    const rootName = reader.slice(reader.ushort());
    return { rootName, root: reader.payload(COMPOUND) };
}

export function writeNbt(rootName, root) {
    const writer = new Writer();
    writer.byte(COMPOUND);
    writer.ushort(rootName.length);
    writer.raw(rootName);
    writer.payload(COMPOUND, root);
    return writer.result();
}

export async function readStructure(bytes) {
    const gzipped = isGzip(bytes);
    const data = gzipped ? await gunzip(bytes) : bytes;
    return { ...parseNbt(data), gzipped };
}

export async function writeStructure(structure) {
    const data = writeNbt(structure.rootName, structure.root);
    return structure.gzipped ? gzip(data) : data;
}

export function get(compound, name, type) {
    if (!compound || !compound.entries) return undefined;
    for (const entry of compound.entries) {
        if (entry.name === name && (type === undefined || entry.type === type)) return entry.value;
    }
    return undefined;
}

export function setString(compound, name, value) {
    for (const entry of compound.entries) {
        if (entry.name === name && entry.type === STRING) {
            entry.value = encoder.encode(value);
            return;
        }
    }
}

export function palettes(root) {
    const out = [];
    const single = get(root, 'palette', LIST);
    if (single) out.push(single);
    const multiple = get(root, 'palettes', LIST);
    if (multiple) for (const item of multiple.items) if (item && item.items) out.push(item);
    return out;
}

export function paletteKey(entry) {
    if (get(entry, 'id', STRING) !== undefined) return 'id';
    if (get(entry, 'Name', STRING) !== undefined) return 'Name';
    return null;
}

export function jigsawData(root) {
    const out = [];
    const blocks = get(root, 'blocks', LIST);
    if (!blocks) return out;
    for (const block of blocks.items) {
        const nbt = block && block.entries ? get(block, 'nbt', COMPOUND) : undefined;
        if (nbt && get(nbt, 'final_state', STRING) !== undefined) out.push(nbt);
    }
    return out;
}

export function splitState(state) {
    for (let i = 0; i < state.length; i++) {
        if (state[i] === '[' || state[i] === '{') return [state.slice(0, i), state.slice(i)];
    }
    return [state, ''];
}

export function scan(structures, previous = null) {
    const usage = new Map();
    const finalStates = new Map();
    for (const { root } of structures) {
        const seen = new Set();
        for (const palette of palettes(root)) {
            for (const entry of palette.items) {
                const key = entry && entry.entries ? paletteKey(entry) : null;
                if (key) seen.add(text(get(entry, key, STRING)));
            }
        }
        for (const nbt of jigsawData(root)) {
            const [block] = splitState(text(get(nbt, 'final_state', STRING)));
            finalStates.set(block, (finalStates.get(block) || 0) + 1);
            seen.add(block);
        }
        for (const block of seen) usage.set(block, (usage.get(block) || 0) + 1);
    }

    const existing = (previous && previous.blocks) || {};
    const names = [...new Set([...usage.keys(), ...Object.keys(existing)])].sort();
    const sortedUsage = [...usage.keys()].sort();
    return {
        mapping: {
            replace_jigsaw_final_states: previous && 'replace_jigsaw_final_states' in previous ? previous.replace_jigsaw_final_states : true,
            rename_files: (previous && previous.rename_files) || {},
            blocks: Object.fromEntries(names.map(name => [name, name in existing ? existing[name] : name])),
            ...(previous && previous.block_nbt && Object.keys(previous.block_nbt).length ? { block_nbt: { ...previous.block_nbt } } : {}),
            used_in_files: Object.fromEntries(sortedUsage.map(name => [name, usage.get(name)]))
        },
        finalStates: Object.fromEntries([...finalStates.keys()].sort().map(name => [name, finalStates.get(name)])),
        newBlocks: sortedUsage.filter(name => !(name in existing))
    };
}

export function readMapping(data) {
    const blocks = {};
    const errors = [];
    for (const [from, to] of Object.entries((data && data.blocks) || {})) {
        const target = String(to || '').trim();
        if (!target || target === from) continue;
        if (!BLOCK_ID.test(target)) { errors.push({ from, to: target }); continue; }
        blocks[from] = target;
    }
    const nbt = {};
    const nbtErrors = [];
    for (const [from, value] of Object.entries((data && data.block_nbt) || {})) {
        const source = String(value ?? '').trim();
        if (!source) continue;
        try {
            const parsed = parseSnbt(source);
            if (parsed.type !== COMPOUND) throw new Error('Block data must be a compound in { }');
            nbt[from] = parsed.value;
        } catch (error) {
            nbtErrors.push({ from, message: error.message });
        }
    }
    return {
        blocks,
        errors,
        nbt,
        nbtErrors,
        replaceFinalStates: Boolean(data && 'replace_jigsaw_final_states' in data ? data.replace_jigsaw_final_states : true),
        rename: (data && data.rename_files) || {}
    };
}

export function outputPath(path, rename) {
    const slash = path.lastIndexOf('/');
    const folder = slash === -1 ? '' : path.slice(0, slash + 1);
    let name = path.slice(slash + 1);
    for (const [from, to] of Object.entries(rename || {})) if (from) name = name.split(from).join(to);
    return folder + name;
}

export function swapBlocks(root, blocks, replaceFinalStates, swaps = new Map()) {
    let changed = false;
    for (const palette of palettes(root)) {
        for (const entry of palette.items) {
            const key = entry && entry.entries ? paletteKey(entry) : null;
            if (!key) continue;
            const block = text(get(entry, key, STRING));
            if (Object.hasOwn(blocks, block)) {
                setString(entry, key, blocks[block]);
                swaps.set(block, (swaps.get(block) || 0) + 1);
                changed = true;
            }
        }
    }
    if (replaceFinalStates) {
        for (const nbt of jigsawData(root)) {
            const [block, rest] = splitState(text(get(nbt, 'final_state', STRING)));
            if (Object.hasOwn(blocks, block)) {
                setString(nbt, 'final_state', blocks[block] + rest);
                swaps.set(block, (swaps.get(block) || 0) + 1);
                changed = true;
            }
        }
    }
    return changed;
}

export async function applyMapping(files, data) {
    const { blocks, rename, replaceFinalStates, nbt } = readMapping(data);
    const swaps = new Map();
    const nbtCounts = new Map();
    const nbtSkipped = new Map();
    const targets = new Map();
    const failed = [];
    const output = [];
    let changedFiles = 0;

    for (const file of files) {
        let structure;
        try {
            structure = await readStructure(file.bytes);
        } catch (error) {
            failed.push({ path: file.path, reason: error.message });
            continue;
        }
        const edited = mergeBlockNbt(structure.root, nbt, nbtCounts, nbtSkipped);
        const changed = swapBlocks(structure.root, blocks, replaceFinalStates, swaps) || edited;
        const target = outputPath(file.path, rename);
        if (targets.has(target)) {
            failed.push({ path: file.path, reason: `renaming makes it overwrite ${targets.get(target)}` });
            continue;
        }
        targets.set(target, file.path);
        output.push({ path: target, bytes: await writeStructure(structure), changed });
        if (changed) changedFiles++;
    }

    return {
        files: output,
        changedFiles,
        swaps: [...swaps.keys()].sort().map(block => ({ from: block, to: blocks[block], count: swaps.get(block) })),
        unused: Object.keys(blocks).filter(block => !swaps.has(block)).sort(),
        nbt: [...nbtCounts.keys()].sort().map(block => ({ block, count: nbtCounts.get(block) })),
        nbtUnused: Object.keys(nbt).filter(block => !nbtCounts.has(block) && !nbtSkipped.has(block)).sort(),
        nbtSkipped: [...nbtSkipped.keys()].sort().map(block => ({ block, count: nbtSkipped.get(block) })),
        failed
    };
}

function properties(entry) {
    const compound = get(entry, 'properties', COMPOUND) || get(entry, 'Properties', COMPOUND);
    const out = {};
    if (compound) for (const item of compound.entries) if (item.type === STRING) out[item.name] = text(item.value);
    return out;
}

export function parseState(state) {
    const [name, rest] = splitState(state);
    const props = {};
    const match = /^\[([^\]]*)\]/.exec(rest);
    if (match) {
        for (const pair of match[1].split(',')) {
            const index = pair.indexOf('=');
            if (index > 0) props[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
        }
    }
    return { name: name.includes(':') ? name : `minecraft:${name}`, props };
}

export function structureView(root) {
    const sizeList = get(root, 'size', LIST);
    const size = sizeList ? sizeList.items.map(Number) : [0, 0, 0];
    const lists = palettes(root).map(palette => palette.items.map(entry => {
        const key = entry && entry.entries ? paletteKey(entry) : null;
        return key ? { name: text(get(entry, key, STRING)), props: properties(entry) } : { name: 'minecraft:air', props: {} };
    }));
    const blocks = [];
    const list = get(root, 'blocks', LIST);
    for (const block of (list ? list.items : [])) {
        const pos = get(block, 'pos', LIST);
        const state = get(block, 'state', INT);
        if (!pos || state === undefined) continue;
        const nbt = get(block, 'nbt', COMPOUND);
        const finalState = nbt ? get(nbt, 'final_state', STRING) : undefined;
        blocks.push({
            x: pos.items[0], y: pos.items[1], z: pos.items[2], state,
            finalState: finalState === undefined ? null : text(finalState),
            nbt: nbt || null
        });
    }
    const entities = [];
    const entityList = get(root, 'entities', LIST);
    for (const entity of (entityList ? entityList.items : [])) {
        const pos = get(entity, 'pos', LIST);
        const nbt = get(entity, 'nbt', COMPOUND);
        if (!pos || !nbt || pos.items.length < 3) continue;
        const at = pos.items.map(raw => (raw instanceof Uint8Array && raw.length === 8 ? new DataView(raw.buffer, raw.byteOffset, 8).getFloat64(0) : Number(raw)));
        const id = get(nbt, 'id', STRING);
        entities.push({ id: id === undefined ? '' : text(id), pos: at, nbt });
    }
    return { size, palettes: lists, blocks, entities };
}

function mutf8(bytes) {
    let out = '';
    let chunk = [];
    for (let i = 0; i < bytes.length;) {
        const a = bytes[i];
        let code;
        if (a < 0x80) { code = a; i += 1; }
        else if ((a & 0xe0) === 0xc0 && i + 1 < bytes.length) { code = ((a & 0x1f) << 6) | (bytes[i + 1] & 0x3f); i += 2; }
        else if ((a & 0xf0) === 0xe0 && i + 2 < bytes.length) { code = ((a & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f); i += 3; }
        else if ((a & 0xf8) === 0xf0 && i + 3 < bytes.length) {
            const point = ((a & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
            chunk.push(0xd800 + ((point - 0x10000) >> 10), 0xdc00 + ((point - 0x10000) & 0x3ff));
            i += 4;
            continue;
        } else { code = 0xfffd; i += 1; }
        chunk.push(code);
        if (chunk.length > 4096) { out += String.fromCharCode.apply(null, chunk); chunk = []; }
    }
    return out + String.fromCharCode.apply(null, chunk);
}

export function toMutf8(value) {
    const out = [];
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code >= 1 && code < 0x80) out.push(code);
        else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        else out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
    if (out.length > 65535) throw new Error('Text is longer than NBT allows');
    return new Uint8Array(out);
}

export const nbtText = mutf8;

const PLAIN = /^[A-Za-z0-9._+-]+$/;
const INTEGER = /^[-+]?[0-9]+([bBsSlLiI]?)$/;
const DECIMAL = /^[-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?([fFdD]?)$/;
const SPECIAL = /^([-+]?)(NaN|Infinity)([fFdD])$/;

function quote(value) {
    const mark = value.includes('"') && !value.includes("'") ? "'" : '"';
    let out = mark;
    for (const c of value) {
        if (c === '\\' || c === mark) out += '\\' + c;
        else if (c === '\n') out += '\\n';
        else if (c === '\t') out += '\\t';
        else if (c === '\r') out += '\\r';
        else if (c < ' ') out += '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
        else out += c;
    }
    return out + mark;
}

function bits(bytes, size) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, size);
    return size === 4 ? view.getFloat32(0) : size === 8 && bytes.length === 8 ? view.getFloat64(0) : 0;
}

function decimal(value, single) {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
    if (Object.is(value, -0)) return '-0.0';
    let out = String(value);
    if (single) {
        for (let digits = 1; digits <= 9; digits++) {
            const candidate = value.toPrecision(digits);
            if (Math.fround(Number(candidate)) === value) { out = String(Number(candidate)); break; }
        }
    }
    return /[.eEn]/.test(out) ? out : out + '.0';
}

export function printSnbt(type, value) {
    switch (type) {
        case BYTE: return `${value}b`;
        case SHORT: return `${value}s`;
        case INT: return String(value);
        case LONG: return `${new DataView(value.buffer, value.byteOffset, 8).getBigInt64(0)}L`;
        case FLOAT: return decimal(bits(value, 4), true) + 'f';
        case DOUBLE: return decimal(bits(value, 8), false) + 'd';
        case STRING: return quote(mutf8(value));
        case BYTE_ARRAY: return `[B;${[...value].map(v => `${(v << 24) >> 24}b`).join(',')}]`;
        case INT_ARRAY: {
            const view = new DataView(value.buffer, value.byteOffset, value.length);
            const items = [];
            for (let i = 0; i < value.length; i += 4) items.push(view.getInt32(i));
            return `[I;${items.join(',')}]`;
        }
        case LONG_ARRAY: {
            const view = new DataView(value.buffer, value.byteOffset, value.length);
            const items = [];
            for (let i = 0; i < value.length; i += 8) items.push(`${view.getBigInt64(i)}L`);
            return `[L;${items.join(',')}]`;
        }
        case LIST: return `[${value.items.map(item => printSnbt(value.elementType, item)).join(',')}]`;
        case COMPOUND: return `{${value.entries.map(entry => {
            const name = mutf8(entry.raw);
            return `${PLAIN.test(name) ? name : quote(name)}:${printSnbt(entry.type, entry.value)}`;
        }).join(',')}}`;
        default: throw new Error(`Unknown NBT tag type ${type}`);
    }
}

function fixed(size, write) {
    const bytes = new Uint8Array(size);
    write(new DataView(bytes.buffer));
    return bytes;
}

const RANGE = { [BYTE]: [-128, 127, 'a byte'], [SHORT]: [-32768, 32767, 'a short'], [INT]: [-2147483648, 2147483647, 'an int'] };

function integerTag(type, big, at) {
    if (type === LONG) {
        if (big < -(2n ** 63n) || big > 2n ** 63n - 1n) throw new Error(`Number at ${at} is too big for a long`);
        return { type, value: fixed(8, view => view.setBigInt64(0, big)) };
    }
    const [min, max, label] = RANGE[type];
    if (big < BigInt(min) || big > BigInt(max)) throw new Error(`Number at ${at} doesn’t fit in ${label} (${min} to ${max})`);
    return { type, value: Number(big) };
}

function bareValue(token, at) {
    if (token === 'true' || token === 'false') return { type: BYTE, value: token === 'true' ? 1 : 0 };
    let match = INTEGER.exec(token);
    if (match) {
        const suffix = match[1].toLowerCase();
        const digits = suffix ? token.slice(0, -1) : token;
        return integerTag(suffix === 'b' ? BYTE : suffix === 's' ? SHORT : suffix === 'l' ? LONG : INT, BigInt(digits.replace(/^\+/, '')), at);
    }
    match = DECIMAL.exec(token);
    if (match && /[0-9]/.test(token)) {
        const suffix = match[1].toLowerCase();
        const number = Number(suffix ? token.slice(0, -1) : token);
        if (suffix === 'f') {
            if (!Number.isFinite(Math.fround(number))) throw new Error(`Number at ${at} is too big for a float`);
            return { type: FLOAT, value: fixed(4, view => view.setFloat32(0, number)) };
        }
        if (!Number.isFinite(number)) throw new Error(`Number at ${at} is too big for a double`);
        return { type: DOUBLE, value: fixed(8, view => view.setFloat64(0, number)) };
    }
    match = SPECIAL.exec(token);
    if (match) {
        const number = match[2] === 'NaN' ? NaN : match[1] === '-' ? -Infinity : Infinity;
        return match[3].toLowerCase() === 'f'
            ? { type: FLOAT, value: fixed(4, view => view.setFloat32(0, number)) }
            : { type: DOUBLE, value: fixed(8, view => view.setFloat64(0, number)) };
    }
    return { type: STRING, value: toMutf8(token) };
}

export function parseSnbt(source) {
    let at = 0;
    const where = () => `position ${at + 1}`;
    const fail = message => { throw new Error(`${message} at ${where()}`); };
    const space = () => { while (at < source.length && /\s/.test(source[at])) at++; };
    const expect = char => { space(); if (source[at] !== char) fail(`Expected ${char}`); at++; };

    const quoted = () => {
        const mark = source[at++];
        let out = '';
        while (at < source.length) {
            const c = source[at++];
            if (c === mark) return out;
            if (c !== '\\') { out += c; continue; }
            const e = source[at++];
            if (e === undefined) break;
            if (e === '\\' || e === '"' || e === "'") out += e;
            else if (e === 'n') out += '\n';
            else if (e === 't') out += '\t';
            else if (e === 'r') out += '\r';
            else if (e === 'b') out += '\b';
            else if (e === 'f') out += '\f';
            else if (e === 's') out += ' ';
            else if (e === 'x' || e === 'u' || e === 'U') {
                const size = e === 'x' ? 2 : e === 'u' ? 4 : 8;
                const hex = source.slice(at, at + size);
                if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== size) fail('Bad escape');
                at += size;
                out += String.fromCodePoint(parseInt(hex, 16));
            } else { at--; fail(`Unknown escape \\${e}`); }
        }
        return fail('Text is missing its closing quote');
    };

    const bare = () => {
        const start = at;
        while (at < source.length && /[A-Za-z0-9._+-]/.test(source[at])) at++;
        if (start === at) fail(source[at] === undefined ? 'Unexpected end' : `Unexpected ${source[at]}`);
        return source.slice(start, at);
    };

    const key = () => {
        space();
        return source[at] === '"' || source[at] === "'" ? quoted() : bare();
    };

    const array = (kind, startAt) => {
        const target = kind === 'B' ? BYTE : kind === 'I' ? INT : LONG;
        const bytes = [];
        space();
        if (source[at] === ']') { at++; }
        else {
            for (;;) {
                const item = value();
                if (item.type > LONG || item.type < BYTE) fail(`[${kind};] arrays only take whole numbers`);
                const big = item.type === LONG ? new DataView(item.value.buffer).getBigInt64(0) : BigInt(item.value);
                bytes.push(integerTag(target, big, `item ${bytes.length + 1} of the array at position ${startAt + 1}`));
                space();
                if (source[at] === ',') { at++; space(); if (source[at] === ']') { at++; break; } continue; }
                if (source[at] === ']') { at++; break; }
                fail('Expected , or ]');
            }
        }
        const unit = target === BYTE ? 1 : target === INT ? 4 : 8;
        const out = new Uint8Array(bytes.length * unit);
        const view = new DataView(out.buffer);
        bytes.forEach((item, i) => {
            if (target === BYTE) view.setInt8(i, item.value);
            else if (target === INT) view.setInt32(i * 4, item.value);
            else out.set(item.value, i * 8);
        });
        return { type: target === BYTE ? BYTE_ARRAY : target === INT ? INT_ARRAY : LONG_ARRAY, value: out };
    };

    const value = () => {
        space();
        const c = source[at];
        if (c === '{') {
            at++;
            const entries = [];
            const names = new Set();
            space();
            if (source[at] === '}') { at++; return { type: COMPOUND, value: { entries } }; }
            for (;;) {
                const name = key();
                if (names.has(name)) fail(`${name} is set twice`);
                names.add(name);
                expect(':');
                const item = value();
                entries.push({ name, raw: toMutf8(name), type: item.type, value: item.value });
                space();
                if (source[at] === ',') { at++; space(); if (source[at] === '}') { at++; break; } continue; }
                if (source[at] === '}') { at++; break; }
                if (source[at] === ':') fail('Text with a colon, like "minecraft:beef", needs quotes');
                fail('Expected , or }');
            }
            return { type: COMPOUND, value: { entries } };
        }
        if (c === '[') {
            const startAt = at;
            at++;
            space();
            const prefix = /^([BIL])\s*;/.exec(source.slice(at, at + 8));
            if (prefix) { at += prefix[0].length; return array(prefix[1], startAt); }
            const items = [];
            let elementType = END;
            if (source[at] === ']') { at++; return { type: LIST, value: { elementType, items } }; }
            for (;;) {
                const itemAt = at;
                const item = value();
                if (items.length && item.type !== elementType) { at = itemAt; fail('Lists can’t mix different kinds of values'); }
                elementType = item.type;
                items.push(item.value);
                space();
                if (source[at] === ',') { at++; space(); if (source[at] === ']') { at++; break; } continue; }
                if (source[at] === ']') { at++; break; }
                if (source[at] === ':') fail('Text with a colon, like "minecraft:beef", needs quotes');
                fail('Expected , or ]');
            }
            return { type: LIST, value: { elementType, items } };
        }
        if (c === '"' || c === "'") return { type: STRING, value: toMutf8(quoted()) };
        const start = at;
        return bareValue(bare(), `position ${start + 1}`);
    };

    const result = value();
    space();
    if (at < source.length) fail('Unexpected text after the end');
    return result;
}

function cloneTag(type, value) {
    if (type === COMPOUND) return { entries: value.entries.map(entry => ({ name: entry.name, raw: entry.raw.slice(), type: entry.type, value: cloneTag(entry.type, entry.value) })) };
    if (type === LIST) return { elementType: value.elementType, items: value.items.map(item => cloneTag(value.elementType, item)) };
    return value instanceof Uint8Array ? value.slice() : value;
}

export function mergeCompound(target, patch) {
    for (const entry of patch.entries) {
        const existing = target.entries.find(item => item.name === entry.name);
        if (existing && existing.type === COMPOUND && entry.type === COMPOUND) mergeCompound(existing.value, entry.value);
        else if (existing) { existing.type = entry.type; existing.value = cloneTag(entry.type, entry.value); }
        else target.entries.push({ name: entry.name, raw: entry.raw.slice(), type: entry.type, value: cloneTag(entry.type, entry.value) });
    }
    return target;
}

export function paletteNames(root) {
    return palettes(root).map(palette => palette.items.map(entry => {
        const key = entry && entry.entries ? paletteKey(entry) : null;
        return key ? text(get(entry, key, STRING)) : null;
    }));
}

export function mergeBlockNbt(root, patches, counts = new Map(), skipped = new Map()) {
    if (!patches || !Object.keys(patches).length) return false;
    const names = paletteNames(root);
    const list = get(root, 'blocks', LIST);
    let changed = false;
    for (const block of (list ? list.items : [])) {
        const state = get(block, 'state', INT);
        if (state === undefined || !block.entries) continue;
        const here = [...new Set(names.map(palette => palette[state]))];
        const hit = here.filter(name => name && Object.hasOwn(patches, name));
        if (!hit.length) continue;
        if (here.length > 1) {
            for (const name of hit) skipped.set(name, (skipped.get(name) || 0) + 1);
            continue;
        }
        const name = hit[0];
        let nbt = get(block, 'nbt', COMPOUND);
        if (!nbt) {
            nbt = { entries: [] };
            block.entries.push({ name: 'nbt', raw: encoder.encode('nbt'), type: COMPOUND, value: nbt });
        }
        mergeCompound(nbt, patches[name]);
        counts.set(name, (counts.get(name) || 0) + 1);
        changed = true;
    }
    return changed;
}

export function plain(type, value) {
    switch (type) {
        case LONG: return Number(new DataView(value.buffer, value.byteOffset, 8).getBigInt64(0));
        case FLOAT: return bits(value, 4);
        case DOUBLE: return bits(value, 8);
        case STRING: return mutf8(value);
        case LIST: return value.items.map(item => plain(value.elementType, item));
        case COMPOUND: return Object.fromEntries(value.entries.map(entry => [entry.name, plain(entry.type, entry.value)]));
        case BYTE_ARRAY: return [...value].map(v => (v << 24) >> 24);
        case INT_ARRAY: { const view = new DataView(value.buffer, value.byteOffset, value.length); const out = []; for (let i = 0; i < value.length; i += 4) out.push(view.getInt32(i)); return out; }
        case LONG_ARRAY: { const view = new DataView(value.buffer, value.byteOffset, value.length); const out = []; for (let i = 0; i < value.length; i += 8) out.push(Number(view.getBigInt64(i))); return out; }
        default: return value;
    }
}
