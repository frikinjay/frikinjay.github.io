// Reads model geometry straight from Minecraft's client code, the way mcsrc (github.com/FabricMC/mcsrc) does:
// the client jar is downloaded from Mojang after the player accepts the EULA, and classes are decompiled in the browser with Vineflower.
const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const EULA_KEY = 'mcsrc-eula-accepted';
const CACHE = 'villagerapi-minecraft-jars-v1';
const SOURCE_PREFIX = 'mcsrc-source-v1:';
const jars = new Map();

export function eulaAccepted() {
    try { return localStorage.getItem(EULA_KEY) === '1'; } catch (error) { return false; }
}

export function askEula() {
    if (eulaAccepted()) return Promise.resolve(true);
    return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.className = 'eula-dialog';
        dialog.innerHTML = `
            <h2>Minecraft EULA</h2>
            <p>To show models exactly as they are in the game, this page downloads the official Minecraft client from Mojang and decompiles the parts it needs in your browser, like <a href="https://github.com/FabricMC/mcsrc" target="_blank" rel="noreferrer">mcsrc</a> does. Nothing is uploaded anywhere.</p>
            <p>I agree to the Minecraft <a href="https://www.minecraft.net/en-us/eula" target="_blank" rel="noreferrer">EULA</a> before using this feature.</p>
            <div class="eula-actions"><button type="button" class="link" data-eula="no">Not Now</button><button type="button" class="button small" data-eula="yes">I Agree</button></div>`;
        document.body.appendChild(dialog);
        dialog.addEventListener('click', e => {
            const choice = e.target.closest('[data-eula]');
            if (!choice) return;
            const yes = choice.dataset.eula === 'yes';
            if (yes) { try { localStorage.setItem(EULA_KEY, '1'); } catch (error) { /* ignore */ } }
            dialog.close(); dialog.remove(); resolve(yes);
        });
        dialog.addEventListener('cancel', () => { dialog.remove(); resolve(false); });
        dialog.showModal();
    });
}

function screen(text) {
    let el = document.getElementById('decompiler');
    if (!el) {
        el = document.createElement('div');
        el.id = 'decompiler';
        el.setAttribute('role', 'status');
        el.innerHTML = '<strong>DECOMPILING...</strong><span></span>';
    }
    el.querySelector('strong').textContent = screen.title || 'DECOMPILING...';
    const host = document.querySelector('dialog[open]') || document.body;
    if (el.parentNode !== host) host.appendChild(el);
    el.querySelector('span').textContent = text || '';
    el.classList.add('visible');
}
function hideScreen() {
    const el = document.getElementById('decompiler');
    if (el) el.classList.remove('visible');
}

async function loadZip() {
    if (window.JSZip) return window.JSZip;
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
    return window.JSZip;
}

async function download(url, label) {
    const cache = 'caches' in window ? await caches.open(CACHE) : null;
    const cached = cache && await cache.match(url);
    if (cached) return cached.arrayBuffer();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const total = Number(response.headers.get('content-length')) || 0;
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); received += value.length;
        screen(`${label} ${total ? Math.round(received / total * 100) + '%' : Math.round(received / 1048576) + ' MB'}`);
    }
    const blob = new Blob(chunks);
    if (cache) await cache.put(url, new Response(blob));
    return blob.arrayBuffer();
}

export async function clientJar(version) {
    if (jars.has(version)) return jars.get(version);
    const promise = (async () => {
        screen('Finding Minecraft ' + version);
        const manifest = await (await fetch(MANIFEST)).json();
        const entry = manifest.versions.find(v => v.id === version);
        if (!entry) throw new Error(`Minecraft ${version} is not in Mojang's version list`);
        const info = await (await fetch(entry.url)).json();
        const data = await download(info.downloads.client.url, `Downloading Minecraft ${version}`);
        screen('Reading the client jar');
        const zip = await (await loadZip()).loadAsync(data);
        let mappings = null;
        if (info.downloads.client_mappings) {
            screen.title = 'REMAPPING...';
            screen('Downloading Mojang mappings');
            const text = new TextDecoder().decode(await download(info.downloads.client_mappings.url, 'Downloading Mojang mappings'));
            screen('Reading Mojang mappings');
            mappings = parseMappings(text);
        }
        return { zip, obfuscated: !!mappings, mappings };
    })();
    jars.set(version, promise);
    promise.catch(() => jars.delete(version));
    return promise;
}

export async function findClasses(version, pattern) {
    const { zip, mappings } = await clientJar(version);
    if (mappings) return [...mappings.toObf.keys()].filter(name => !name.includes('$') && pattern.test(name + '.class'));
    return Object.keys(zip.files).filter(path => path.endsWith('.class') && !path.includes('$') && pattern.test(path)).map(path => path.slice(0, -6));
}

export async function decompileClass(version, className) {
    const key = SOURCE_PREFIX + version + ':' + className;
    try { const cached = localStorage.getItem(key); if (cached) return cached; } catch (error) { /* ignore */ }
    const { zip, mappings } = await clientJar(version);
    screen(className.split('/').pop());
    const { decompile } = await import('./vendor/vf/vf.js');
    const remapped = new Map();
    const provide = async name => {
        if (!mappings) { const file = zip.file(name + '.class'); return file ? file.async('uint8array') : null; }
        if (remapped.has(name)) return remapped.get(name);
        const obf = mappings.toObf.get(name) || name;
        const file = zip.file(obf + '.class');
        screen.title = 'REMAPPING...'; screen(name.split('/').pop());
        const bytes = file ? await remapClass(await file.async('uint8array'), mappings, zip) : null;
        screen.title = 'DECOMPILING...'; screen(className.split('/').pop());
        remapped.set(name, bytes);
        return bytes;
    };
    if (mappings) screen('Remapping ' + className.split('/').pop());
    const result = await decompile([className], { source: provide });
    const source = result[className] || Object.values(result)[0] || '';
    try { localStorage.setItem(key, source); } catch (error) { /* storage full: keep in memory only */ }
    return source;
}

function splitTop(text, separator = ',') {
    const out = []; let depth = 0, quote = false, start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"' && text[i - 1] !== '\\') quote = !quote;
        if (quote) continue;
        if (c === '(' || c === '{' || c === '[') depth++;
        else if (c === ')' || c === '}' || c === ']') depth--;
        else if (c === separator && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
    }
    const last = text.slice(start).trim();
    if (last) out.push(last);
    return out;
}

function methods(source) {
    const out = {};
    const re = /(?:public|private|protected)?\s*static\s+[\w.<>]+\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
    let m;
    while ((m = re.exec(source))) {
        let depth = 1, i = re.lastIndex;
        while (i < source.length && depth) { if (source[i] === '{') depth++; else if (source[i] === '}') depth--; i++; }
        out[m[1]] = { params: m[2], body: source.slice(re.lastIndex, i - 1) };
    }
    return out;
}

function evaluate(expr, vars) {
    let e = String(expr).trim();
    e = e.replace(/\((?:float|double|int)\)\s*/g, '').replace(/Mth\.PI|Math\.PI/g, String(Math.PI)).replace(/Mth\.HALF_PI/g, String(Math.PI / 2));
    e = e.replace(/(\d+(?:\.\d+)?)[FfDdLl]\b/g, '$1');
    e = e.replace(/\b[A-Za-z_$][\w$]*\b/g, name => (typeof vars[name] === 'number' ? `(${vars[name]})` : name));
    if (!/^[\d\s.+\-*/()eE]*$/.test(e)) return NaN;
    try { return Number(Function(`return (${e});`)()); } catch (error) { return NaN; }
}

function parseCubes(chain, vars, builders) {
    const cubes = [];
    let u = 0, v = 0, mirror = false;
    const base = chain.match(/^([A-Za-z_$][\w$]*)\s*(?:\.|$)/);
    if (base && builders[base[1]]) cubes.push(...builders[base[1]].map(c => ({ ...c })));
    const re = /\.(texOffs|addBox|mirror)\s*\(/g;
    let m;
    while ((m = re.exec(chain))) {
        let depth = 1, i = re.lastIndex;
        while (depth && i < chain.length) { if (chain[i] === '(') depth++; else if (chain[i] === ')') depth--; i++; }
        const args = splitTop(chain.slice(re.lastIndex, i - 1));
        re.lastIndex = i;
        if (m[1] === 'texOffs') { u = evaluate(args[0], vars); v = evaluate(args[1], vars); }
        else if (m[1] === 'mirror') mirror = args.length ? args[0] !== 'false' : true;
        else {
            const nums = args.filter(a => !/^".*"$/.test(a));
            const [x, y, z, w, h, d] = nums.slice(0, 6).map(a => evaluate(a, vars));
            let grow = 0, cubeMirror = mirror;
            for (const extra of nums.slice(6)) {
                const deform = extra.match(/CubeDeformation\s*\(([^)]*)\)/);
                if (deform) grow = evaluate(splitTop(deform[1])[0], vars);
                else if (extra === 'true' || extra === 'false') cubeMirror = extra === 'true';
                else if (vars[extra] && typeof vars[extra] === 'object') grow = vars[extra].grow;
            }
            if ([x, y, z, w, h, d].every(Number.isFinite)) cubes.push({ x, y, z, w, h, d, u, v, grow: Number.isFinite(grow) ? grow : 0, mirror: cubeMirror });
        }
    }
    return cubes;
}

function parsePose(text, vars) {
    const call = String(text || '').trim().match(/PartPose\.(\w+)\s*\(([\s\S]*)\)$/);
    if (!call) return { offset: [0, 0, 0], rotation: [0, 0, 0] };
    const a = splitTop(call[2]).map(x => evaluate(x, vars));
    if (call[1] === 'offset') return { offset: a.slice(0, 3), rotation: [0, 0, 0] };
    if (call[1] === 'rotation') return { offset: [0, 0, 0], rotation: a.slice(0, 3) };
    return { offset: a.slice(0, 3), rotation: a.slice(3, 6) };
}

export function parseModel(source, preferred = []) {
    const all = methods(source);
    const names = Object.keys(all).filter(n => /addOrReplaceChild/.test(all[n].body) || /MeshDefinition|LayerDefinition/.test(all[n].body));
    const pick = preferred.map(p => names.find(n => p.test(n))).find(Boolean) || names.find(n => /createBodyLayer/.test(n)) || names[0];
    if (!pick) return null;
    const parts = [];
    let textureSize = [64, 64];
    const run = name => {
        const method = all[name];
        if (!method) return;
        const vars = {}, partVars = {}, builders = {};
        for (const statement of splitTop(method.body, ';')) {
            const s = statement.replace(/\s+/g, ' ').trim();
            const assign = s.match(/^(?:[\w.<>]+ )?([A-Za-z_$][\w$]*) = ([\s\S]+)$/);
            const expr = assign ? assign[2] : s.replace(/^return /, '');
            const size = expr.match(/LayerDefinition\.create\(\s*[^,]+,\s*([^,]+),\s*([^)]+)\)/);
            if (size) textureSize = [evaluate(size[1], vars), evaluate(size[2], vars)];
            if (/\.getRoot\(\)/.test(expr) && assign) { partVars[assign[1]] = 'root'; if (!/^[\w$]+\.getRoot/.test(expr)) { const h = expr.match(/^([\w$]+)\(/); if (h && all[h[1]]) run(h[1]); } continue; }
            const helper = expr.match(/^([A-Za-z_$][\w$]*)\(([^()]*)\)$/);
            if (helper && all[helper[1]] && helper[1] !== name) { run(helper[1]); if (assign) partVars[assign[1]] = 'root'; continue; }
            const child = expr.match(/^([A-Za-z_$][\w$]*)\.addOrReplaceChild\(([\s\S]+)\)$/);
            if (child) {
                const args = splitTop(child[2]);
                const partName = (args[0] || '').replace(/^"|"$/g, '');
                const parent = partVars[child[1]] || child[1];
                const part = { name: partName, parent: parent === 'root' ? null : parent, cubes: parseCubes(args[1] || '', vars, builders), pose: parsePose(args[2], vars) };
                const index = parts.findIndex(p => p.name === partName);
                if (index >= 0) parts[index] = part; else parts.push(part);
                if (assign) partVars[assign[1]] = partName;
                continue;
            }
            if (assign && /CubeListBuilder/.test(expr)) { builders[assign[1]] = parseCubes(expr, vars, builders); continue; }
            if (assign && /new CubeDeformation\(/.test(expr)) { vars[assign[1]] = { grow: evaluate(expr.match(/CubeDeformation\(([^,)]*)/)[1], vars) }; continue; }
            if (assign) { const value = evaluate(expr, vars); if (Number.isFinite(value)) vars[assign[1]] = value; }
        }
    };
    run(pick);
    return parts.length ? { parts, textureSize, method: pick } : null;
}

export function toElements(model, entityBox, withPivot) {
    const byName = Object.fromEntries(model.parts.map(p => [p.name, p]));
    const chain = part => { const list = []; for (let p = part; p; p = p.parent ? byName[p.parent] : null) list.unshift(p); return list; };
    const sum = list => list.reduce((acc, p) => acc.map((v, i) => v + (p.pose.offset[i] || 0)), [0, 0, 0]);
    const elements = [], groups = [];
    const su = 64 / model.textureSize[0], sv = 64 / model.textureSize[1];
    for (const part of model.parts) {
        if (!part.cubes.length) continue;
        const parents = chain(part), offset = sum(parents);
        const rotated = [...parents].reverse().find(p => p.pose.rotation.some(r => Math.abs(r) > 1e-6));
        const group = { name: part.name, elements: [], boxes: [] };
        for (const c of part.cubes) {
            let element = entityBox(c.x + offset[0], c.y + offset[1], c.z + offset[2], c.w, c.h, c.d, c.u * su, c.v * sv, c.grow);
            if (c.mirror) {
                const f = element.faces;
                [f.east, f.west] = [f.west, f.east];
                for (const face of Object.values(f)) face.uv = [face.uv[2], face.uv[1], face.uv[0], face.uv[3]];
            }
            if (rotated) {
                const r = rotated.pose.rotation, abs = r.map(Math.abs), i = abs.indexOf(Math.max(...abs));
                element = withPivot(element, sum(chain(rotated)), ['x', 'y', 'z'][i], r[i]);
            }
            group.elements.push(elements.length);
            group.boxes.push([c.u, c.v, c.w, c.h, c.d]);
            elements.push(element);
        }
        groups.push(group);
    }
    return { elements, groups, textureSize: model.textureSize };
}

const MODEL_CLASSES = {
    villager: { classes: [/\/VillagerModel\.class$/], prefer: [/^createBodyModel$/, /^createBodyLayer$/] },
    zombie: { classes: [/\/ZombieVillagerModel\.class$/], prefer: [/^createBodyLayer$/] },
    baby: { classes: [/\/BabyVillagerModel\.class$/, /\/VillagerModel\.class$/], prefer: [/[Bb]aby/, /^createBodyLayer$/], baby: true },
    baby_zombie: { classes: [/\/BabyZombieVillagerModel\.class$/, /\/ZombieVillagerModel\.class$/], prefer: [/[Bb]aby/, /^createBodyLayer$/], baby: true }
};

// Loads a villager model from the game's own code; resolves null when declined or unavailable.
export async function villagerModel(kind, version, entityBox, withPivot) {
    const spec = MODEL_CLASSES[kind];
    if (!spec || !(await askEula())) return null;
    try {
        screen.title = 'DECOMPILING...';
        await clientJar(version);
        screen.title = 'DECOMPILING...';
        for (const pattern of spec.classes) {
            for (const className of await findClasses(version, pattern)) {
                const source = await decompileClass(version, className);
                const isBabyClass = /Baby/.test(className);
                const parsed = parseModel(source, isBabyClass ? [/^createBodyLayer$/, /[Bb]aby/] : spec.prefer);
                if (!parsed) continue;
                if (spec.baby && !isBabyClass && !/[Bb]aby/.test(parsed.method)) continue;
                return toElements(parsed, entityBox, withPivot);
            }
        }
        return null;
    } catch (error) {
        console.warn('Could not read the model from Minecraft', error);
        if (window.Site) window.Site.toast('Could not load the model from Minecraft, using the built-in one', 'error');
        return null;
    } finally {
        hideScreen();
    }
}


/* ---------- Mojang mappings and class remapping (for obfuscated versions such as 1.21.1) ---------- */

// Parses ProGuard-style client mappings. Member lines are kept per class and parsed only when a class is remapped.
export function parseMappings(text) {
    const toObf = new Map(), toNamed = new Map(), lines = new Map();
    let current = null;
    for (const line of text.split('\n')) {
        if (!line || line[0] === '#') continue;
        if (line[0] !== ' ') {
            const m = line.match(/^(\S+) -> (\S+):$/);
            if (!m) { current = null; continue; }
            const named = m[1].replace(/\./g, '/'), obf = m[2].replace(/\./g, '/');
            toObf.set(named, obf); toNamed.set(obf, named);
            current = [];
            lines.set(obf, current);
        } else if (current) current.push(line.trim());
    }
    return { toObf, toNamed, lines, members: new Map() };
}

const PRIMITIVES = { void: 'V', boolean: 'Z', byte: 'B', char: 'C', short: 'S', int: 'I', long: 'J', float: 'F', double: 'D' };
function typeDesc(type, toObf) {
    let dims = '';
    while (type.endsWith('[]')) { dims += '['; type = type.slice(0, -2); }
    if (PRIMITIVES[type]) return dims + PRIMITIVES[type];
    const named = type.replace(/\./g, '/');
    return dims + 'L' + (toObf ? toObf.get(named) || named : named) + ';';
}

// Member names of one obfuscated class: key "obfName obfDescriptor" -> named name.
function members(mappings, obf) {
    if (mappings.members.has(obf)) return mappings.members.get(obf);
    const map = new Map();
    for (const line of mappings.lines.get(obf) || []) {
        const m = line.match(/^(?:\d+:\d+:)?(\S+) ([^\s(]+)(?:\(([^)]*)\))?(?::\d+:\d+)? -> (\S+)$/);
        if (!m) continue;
        const [, type, name, args, obfName] = m;
        const desc = args === undefined ? typeDesc(type, mappings.toObf)
            : '(' + (args ? args.split(',').map(a => typeDesc(a, mappings.toObf)).join('') : '') + ')' + typeDesc(type, mappings.toObf);
        map.set(obfName + ' ' + desc, name);
    }
    mappings.members.set(obf, map);
    return map;
}

function remapDesc(desc, mappings) {
    return desc.replace(/L([^;]+);/g, (all, name) => 'L' + (mappings.toNamed.get(name) || name) + ';');
}

// Rewrites a class file's constant pool with Mojang names. New UTF-8 and NameAndType entries are appended,
// so shared entries are never changed in place.
export async function remapClass(bytes, mappings, zip) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint16(8);
    const pool = [null];
    const decoder = new TextDecoder();
    let offset = 10;
    for (let i = 1; i < count; i++) {
        const tag = bytes[offset];
        const start = offset;
        switch (tag) {
            case 1: { const len = view.getUint16(offset + 1); pool.push({ tag, start, text: decoder.decode(bytes.subarray(offset + 3, offset + 3 + len)) }); offset += 3 + len; break; }
            case 3: case 4: pool.push({ tag, start }); offset += 5; break;
            case 5: case 6: pool.push({ tag, start }, null); offset += 9; i++; break;
            case 7: case 8: case 16: case 19: case 20: pool.push({ tag, start, a: view.getUint16(offset + 1) }); offset += 3; break;
            case 15: pool.push({ tag, start }); offset += 4; break;
            default: pool.push({ tag, start, a: view.getUint16(offset + 1), b: view.getUint16(offset + 3) }); offset += 5;
        }
    }
    const rest = bytes.subarray(offset);
    const utf = i => pool[i] && pool[i].text;
    const extra = [];
    let next = count;
    const addUtf = text => { extra.push({ tag: 1, text }); return next++; };
    const addNat = (name, desc) => { extra.push({ tag: 12, a: name, b: desc }); return next++; };
    const patch = [];

    // Member references: remap name and descriptor using the owner's (or a superclass's) mappings.
    const superOf = new Map();
    const lookup = async (owner, name, desc) => {
        for (let cls = owner, depth = 0; cls && depth < 12; depth++) {
            const found = members(mappings, cls).get(name + ' ' + desc);
            if (found) return found;
            if (!superOf.has(cls)) superOf.set(cls, await superName(zip, cls));
            cls = superOf.get(cls);
        }
        return null;
    };
    for (let i = 1; i < pool.length; i++) {
        const entry = pool[i];
        if (!entry || (entry.tag !== 9 && entry.tag !== 10 && entry.tag !== 11)) continue;
        const owner = utf(pool[entry.a].a), nat = pool[entry.b];
        const name = utf(nat.a), desc = utf(nat.b);
        const named = name.startsWith('<') ? name : (await lookup(owner, name, desc)) || name;
        const newDesc = remapDesc(desc, mappings);
        if (named !== name || newDesc !== desc) patch.push([entry.start + 3, addNat(addUtf(named), addUtf(newDesc))]);
    }
    // Class names, descriptors in NameAndType / method types, and this class's own members.
    const replaceUtf = new Map();
    for (let i = 1; i < pool.length; i++) {
        const entry = pool[i];
        if (!entry) continue;
        if (entry.tag === 7) {
            const name = utf(entry.a);
            const named = name.startsWith('[') ? remapDesc(name, mappings) : mappings.toNamed.get(name);
            if (named && named !== name) patch.push([entry.start + 1, addUtf(named)]);
        } else if (entry.tag === 16) {
            const desc = utf(entry.a), named = remapDesc(desc, mappings);
            if (named !== desc) patch.push([entry.start + 1, addUtf(named)]);
        }
    }
    const thisClass = utf(pool[view.getUint16(offset + 2)].a);
    const own = members(mappings, thisClass);
    let p = 6;
    const fieldsAndMethods = [];
    const interfaces = new DataView(rest.buffer, rest.byteOffset, rest.byteLength).getUint16(6);
    p = 8 + interfaces * 2;
    const rv = new DataView(rest.buffer, rest.byteOffset, rest.byteLength);
    for (let table = 0; table < 2; table++) {
        const n = rv.getUint16(p); p += 2;
        for (let k = 0; k < n; k++) {
            fieldsAndMethods.push(p);
            const attrs = rv.getUint16(p + 6); p += 8;
            for (let a = 0; a < attrs; a++) p += 6 + rv.getUint32(p + 2);
        }
    }
    const restPatch = [];
    for (const at of fieldsAndMethods) {
        const nameIndex = rv.getUint16(at + 2), descIndex = rv.getUint16(at + 4);
        const name = utf(nameIndex), desc = utf(descIndex);
        const named = name.startsWith('<') ? name : own.get(name + ' ' + desc) || name;
        const newDesc = remapDesc(desc, mappings);
        if (named !== name) restPatch.push([at + 2, addUtf(named)]);
        if (newDesc !== desc) restPatch.push([at + 4, addUtf(newDesc)]);
    }
    // Drop generic Signature attributes' obfuscated names by leaving them; Vineflower falls back to descriptors.

    const encoder = new TextEncoder();
    const extraBytes = [];
    for (const e of extra) {
        if (e.tag === 1) { const b = encoder.encode(e.text); extraBytes.push(Uint8Array.of(1, b.length >> 8, b.length & 255), b); }
        else extraBytes.push(Uint8Array.of(12, e.a >> 8, e.a & 255, e.b >> 8, e.b & 255));
    }
    const head = bytes.slice(0, offset);
    const hv = new DataView(head.buffer);
    hv.setUint16(8, next);
    for (const [at, index] of patch) hv.setUint16(at, index);
    const tail = rest.slice();
    const tv = new DataView(tail.buffer);
    for (const [at, index] of restPatch) tv.setUint16(at, index);
    const size = extraBytes.reduce((n, b) => n + b.length, 0);
    const out = new Uint8Array(head.length + size + tail.length);
    out.set(head, 0);
    let o = head.length;
    for (const b of extraBytes) { out.set(b, o); o += b.length; }
    out.set(tail, o);
    return out;
}

const superCache = new Map();
function superName(zip, obf) {
    // Reads only the superclass name from a class file header; cached per class.
    if (!superCache.has(obf)) {
        const file = zip && zip.file(obf + '.class');
        superCache.set(obf, file ? file.async('uint8array').then(readSuper).catch(() => null) : Promise.resolve(null));
    }
    return superCache.get(obf);
}
function readSuper(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint16(8), pool = [null], decoder = new TextDecoder();
    let offset = 10;
    for (let i = 1; i < count; i++) {
        const tag = bytes[offset];
        if (tag === 1) { const len = view.getUint16(offset + 1); pool.push(decoder.decode(bytes.subarray(offset + 3, offset + 3 + len))); offset += 3 + len; }
        else if (tag === 5 || tag === 6) { pool.push(null, null); offset += 9; i++; }
        else if (tag === 7) { pool.push({ c: view.getUint16(offset + 1) }); offset += 3; }
        else { pool.push(null); offset += tag === 15 ? 4 : (tag === 8 || tag === 16 || tag === 19 || tag === 20) ? 3 : 5; }
    }
    const superIndex = view.getUint16(offset + 4);
    return superIndex && pool[superIndex] ? pool[pool[superIndex].c] : null;
}
