import { readFile } from 'node:fs/promises';
import { inflateSync, deflateSync } from 'node:zlib';

const W = 1200;
const H = 630;
const BG = [14, 15, 16];
const GRID = [18, 19, 20];
const PANEL = [22, 22, 23];
const HAIRLINE = [44, 44, 46];
const TEXT = [245, 245, 247];
const SECONDARY = [161, 161, 166];
const ACCENT = [91, 180, 69];

const fonts = JSON.parse(await readFile(new URL('./og-fonts.json', import.meta.url), 'utf8'));
const glyphCache = new Map();

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(bytes) {
    let c = 0xffffffff;
    for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'latin1');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
}

function encodePng(width, height, rgb) {
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 3 + 1)] = 0;
        rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 2;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

function decodePng(buffer) {
    let offset = 8;
    let width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
    let palette = null, alphas = null;
    const parts = [];
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('latin1', offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            depth = data[8];
            colour = data[9];
            interlace = data[12];
        } else if (type === 'PLTE') palette = data;
        else if (type === 'tRNS') alphas = data;
        else if (type === 'IDAT') parts.push(data);
        offset += 12 + length;
    }
    if (interlace) return null;
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colour];
    const bitsPerPixel = channels * depth;
    const stride = Math.ceil(width * bitsPerPixel / 8);
    const step = Math.max(1, bitsPerPixel >> 3);
    const raw = inflateSync(Buffer.concat(parts));
    const lines = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const out = lines.subarray(y * stride, (y + 1) * stride);
        const prev = y ? lines.subarray((y - 1) * stride, y * stride) : null;
        for (let i = 0; i < stride; i++) {
            const a = i >= step ? out[i - step] : 0;
            const b = prev ? prev[i] : 0;
            const c = prev && i >= step ? prev[i - step] : 0;
            let value = row[i];
            if (filter === 1) value += a;
            else if (filter === 2) value += b;
            else if (filter === 3) value += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            out[i] = value & 0xff;
        }
    }
    const sample = (y, index) => {
        const line = lines.subarray(y * stride, (y + 1) * stride);
        if (depth === 8) return line[index];
        if (depth === 16) return line[index * 2];
        const bit = index * depth;
        return (line[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    };
    const scale = depth < 8 && colour !== 3 ? 255 / ((1 << depth) - 1) : 1;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const at = (y * width + x) * 4;
            const base = x * channels;
            let r, g, b, a = 255;
            if (colour === 3) {
                const index = sample(y, x);
                [r, g, b] = [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]];
                if (alphas && index < alphas.length) a = alphas[index];
            } else if (colour === 0 || colour === 4) {
                r = g = b = Math.round(sample(y, base) * scale);
                if (colour === 4) a = sample(y, base + 1);
            } else {
                [r, g, b] = [sample(y, base), sample(y, base + 1), sample(y, base + 2)];
                if (colour === 6) a = sample(y, base + 3);
            }
            rgba[at] = r; rgba[at + 1] = g; rgba[at + 2] = b; rgba[at + 3] = a;
        }
    }
    return { width, height, rgba };
}

class Canvas {
    constructor(width, height, colour) {
        this.width = width;
        this.height = height;
        this.rgb = Buffer.alloc(width * height * 3);
        this.rect(0, 0, width, height, colour);
    }

    blend(x, y, [r, g, b], alpha = 1) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return;
        const at = (y * this.width + x) * 3;
        const keep = 1 - Math.min(1, alpha);
        this.rgb[at] = Math.round(this.rgb[at] * keep + r * (1 - keep));
        this.rgb[at + 1] = Math.round(this.rgb[at + 1] * keep + g * (1 - keep));
        this.rgb[at + 2] = Math.round(this.rgb[at + 2] * keep + b * (1 - keep));
    }

    rect(x0, y0, x1, y1, colour) {
        for (let y = Math.max(0, y0); y < Math.min(this.height, y1); y++) {
            for (let x = Math.max(0, x0); x < Math.min(this.width, x1); x++) this.blend(x, y, colour);
        }
    }

    roundedRect(x0, y0, x1, y1, radius, fill, outline, border = 2) {
        const coverage = (x, y, inset) => {
            const r = radius - inset;
            const left = x0 + inset, top = y0 + inset, right = x1 - inset, bottom = y1 - inset;
            let inside = 0;
            for (let sy = 0; sy < 4; sy++) {
                for (let sx = 0; sx < 4; sx++) {
                    const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4;
                    if (px < left || px > right || py < top || py > bottom) continue;
                    const cx = Math.min(Math.max(px, left + r), right - r), cy = Math.min(Math.max(py, top + r), bottom - r);
                    if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) inside++;
                }
            }
            return inside / 16;
        };
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const outer = coverage(x, y, 0);
                if (!outer) continue;
                const inner = outline ? coverage(x, y, border) : outer;
                if (outline) this.blend(x, y, outline, outer - inner);
                this.blend(x, y, fill, inner);
            }
        }
    }

    image(source, left, top, width, height) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const at = (Math.min(source.height - 1, Math.floor(y * source.height / height)) * source.width + Math.min(source.width - 1, Math.floor(x * source.width / width))) * 4;
                const pixel = source.rgba;
                this.blend(left + x, top + y, [pixel[at], pixel[at + 1], pixel[at + 2]], pixel[at + 3] / 255);
            }
        }
    }

    text(x, top, text, fontName, colour) {
        const font = fonts[fontName];
        const baseline = top + font.ascent;
        let pen = x;
        for (const ch of text) {
            const glyph = font.glyphs[ch] || font.glyphs['?'];
            const [advance, dx, dy, width, height, data] = glyph;
            if (data) {
                const key = fontName + ch;
                if (!glyphCache.has(key)) glyphCache.set(key, inflateSync(Buffer.from(data, 'base64')));
                const bits = glyphCache.get(key);
                for (let gy = 0; gy < height; gy++) {
                    for (let gx = 0; gx < width; gx++) if (bits[gy * width + gx]) this.blend(pen + dx + gx, baseline + dy + gy, colour);
                }
            }
            pen += advance;
        }
        return pen - x;
    }

    measure(text, fontName) {
        const font = fonts[fontName];
        let width = 0;
        for (const ch of text) width += (font.glyphs[ch] || font.glyphs['?'])[0];
        return width;
    }

    png() {
        return encodePng(this.width, this.height, this.rgb);
    }
}

function wrap(canvas, text, fontName, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
        const trial = line ? `${line} ${word}` : word;
        if (line && canvas.measure(trial, fontName) > maxWidth) {
            lines.push(line);
            line = word;
        } else line = trial;
    }
    if (line) lines.push(line);
    return lines;
}

function fit(canvas, text, fontName, maxWidth) {
    if (canvas.measure(text, fontName) <= maxWidth) return text;
    let cut = [...text];
    while (cut.length && canvas.measure(cut.join('').trimEnd() + '…', fontName) > maxWidth) cut.pop();
    return cut.join('').trimEnd() + '…';
}

function clamp(canvas, lines, fontName, maxWidth, count) {
    if (lines.length <= count) return lines.map(line => fit(canvas, line, fontName, maxWidth));
    const kept = lines.slice(0, count);
    kept[count - 1] = fit(canvas, kept[count - 1] + ' ' + lines.slice(count).join(' '), fontName, maxWidth);
    return kept.map(line => fit(canvas, line, fontName, maxWidth));
}

function chip(canvas, x, y, text) {
    const width = canvas.measure(text, 'small') + 40;
    canvas.roundedRect(x, y, x + width, y + 56, 14, PANEL, HAIRLINE);
    const font = fonts.small;
    const glyph = font.glyphs.A;
    const capTop = font.ascent + glyph[2];
    canvas.text(x + 20, Math.round(y + 28 - capTop - glyph[4] / 2), text, 'small', TEXT);
    return x + width + 16;
}

export async function shareCard({ name, description, icon, minecraft, stats }) {
    const canvas = new Canvas(W, H, BG);
    for (let x = 0; x < W; x += 40) canvas.rect(x, 0, x + 1, H, GRID);
    for (let y = 0; y < H; y += 40) canvas.rect(0, y, W, y + 1, GRID);
    canvas.roundedRect(64, 64, W - 64, H - 64, 28, PANEL, HAIRLINE);

    const image = icon ? await readFile(icon).then(decodePng).catch(() => null) : null;
    if (image && image.width && image.height) {
        const largest = Math.max(image.width, image.height);
        const scale = largest <= 256 ? Math.floor(256 / largest) : 256 / largest;
        const width = Math.round(image.width * scale), height = Math.round(image.height * scale);
        canvas.image(image, 128 + Math.round((256 - width) / 2), Math.round((H - height) / 2), width, height);
    }

    const x = image ? 128 + 256 + 64 : 128;
    const room = W - 128 - x;
    const big = canvas.measure(name, 'heading') <= room;
    const titleFont = big ? 'heading' : 'headingSmall';
    const titleLines = big ? [name] : clamp(canvas, wrap(canvas, name, titleFont, room), titleFont, room, 2);
    const descriptionLines = clamp(canvas, wrap(canvas, description, 'body', room), 'body', room, 2);
    const titleStep = big ? 96 : 62;
    const height = 40 + titleLines.length * titleStep + 8 + descriptionLines.length * 44 + 20 + 56;
    let y = Math.max(112, Math.round((H - 90 - height) / 2) + 20);
    canvas.text(x, y, 'VILLAGER PACK', 'small', ACCENT);
    y += 40;
    for (const line of titleLines) { canvas.text(x, y, line, titleFont, TEXT); y += titleStep; }
    y += 8;
    for (const line of descriptionLines) { canvas.text(x, y, line, 'body', SECONDARY); y += 44; }
    y += 20;

    let cx = x;
    for (const text of stats) {
        if (cx + canvas.measure(text, 'small') + 40 > W - 96) break;
        cx = chip(canvas, cx, y, text);
    }

    const site = 'villagerpacks.neoterra.dev';
    canvas.text(128, H - 132, site, 'small', SECONDARY);
    let right = `Minecraft ${minecraft} · Fabric & NeoForge`;
    if (canvas.measure(site, 'small') + 24 + canvas.measure(right, 'small') > W - 256) right = `Minecraft ${minecraft}`;
    canvas.text(W - 128 - canvas.measure(right, 'small'), H - 132, right, 'small', SECONDARY);
    return canvas.png();
}
