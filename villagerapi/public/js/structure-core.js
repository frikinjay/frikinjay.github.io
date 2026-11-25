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
    return {
        blocks,
        errors,
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
    const { blocks, rename, replaceFinalStates } = readMapping(data);
    const swaps = new Map();
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
        const changed = swapBlocks(structure.root, blocks, replaceFinalStates, swaps);
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
            finalState: finalState === undefined ? null : text(finalState)
        });
    }
    return { size, palettes: lists, blocks };
}
