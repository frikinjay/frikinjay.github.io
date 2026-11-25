'use strict';
(function () {
    const el = (tag, attrs = {}, ...children) => {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (v === undefined || v === null || v === false) continue;
            if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
        }
        children.flat().forEach(c => c !== null && c !== undefined && e.append(c instanceof Node ? c : document.createTextNode(String(c))));
        return e;
    };
    const fire = (input, ...types) => types.forEach(t => input.dispatchEvent(new Event(t, { bubbles: true })));
    let open = null;
    let lastClosed = 0;
    const closeOpen = () => { if (open) { open.close(); lastClosed = performance.now(); } };
    document.addEventListener('mousedown', e => { if (open && !open.panel.contains(e.target) && !open.owner.contains(e.target)) closeOpen(); }, true);
    window.addEventListener('resize', closeOpen);
    document.addEventListener('scroll', e => { if (open && !open.panel.contains(e.target)) closeOpen(); }, true);
    function place(panel, anchor, minWidth) {
        const host = anchor.closest('dialog[open]') || document.body;
        host.append(panel);
        const r = anchor.getBoundingClientRect();
        panel.style.minWidth = `${Math.max(minWidth || 0, r.width)}px`;
        const below = window.innerHeight - r.bottom, h = panel.offsetHeight;
        const top = below >= Math.min(h, 320) + 8 || below > r.top ? r.bottom + 4 : r.top - h - 4;
        panel.style.top = `${Math.max(8, top)}px`;
        panel.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - panel.offsetWidth - 8)}px`;
    }

    function enhanceSelect(select) {
        if (select._ts || select.multiple || select.size > 1 || select.closest('[data-native-controls]')) return;
        const label = el('span', { class: 'ts-label' });
        const button = el('button', { type: 'button', class: 'ts-button', 'aria-haspopup': 'listbox' }, label, el('span', { class: 'ts-chevron', 'aria-hidden': 'true' }));
        select._ts = { button, sync };
        select.classList.add('ts-native');
        select.tabIndex = -1;
        select.after(button);
        for (const c of select.classList) if (c !== 'ts-native') button.classList.add(c);
        function sync() {
            const opt = select.options[select.selectedIndex];
            label.textContent = opt ? opt.textContent : '';
            button.title = label.textContent;
            button.disabled = select.disabled;
            button.hidden = select.hidden;
        }
        sync();
        button.addEventListener('click', () => (open && open.owner === button ? closeOpen() : openList()));
        button.addEventListener('keydown', e => {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
        });
        function openList() {
            closeOpen();
            const panel = el('div', { class: 'ts-panel', role: 'listbox' });
            const items = [];
            const list = el('div', { class: 'ts-list' });
            const add = (opt, group) => {
                const row = el('button', { type: 'button', class: 'ts-option' + (opt.selected ? ' selected' : ''), role: 'option', 'aria-selected': opt.selected ? 'true' : 'false', disabled: opt.disabled },
                    opt.textContent);
                row.addEventListener('click', () => choose(opt.index));
                items.push({ row, text: (opt.textContent + ' ' + opt.value + ' ' + (group || '')).toLowerCase() });
                list.append(row);
            };
            for (const child of select.children) {
                if (child.tagName === 'OPTGROUP') { list.append(el('p', { class: 'ts-group', text: child.label })); [...child.children].forEach(o => add(o, child.label)); }
                else if (child.tagName === 'OPTION') add(child);
            }
            const search = select.options.length > 12 ? el('input', { type: 'search', class: 'ts-search', placeholder: 'Search...' }) : null;
            if (search) {
                search.addEventListener('input', () => {
                    const q = search.value.trim().toLowerCase();
                    items.forEach(i => { i.row.hidden = !!q && !i.text.includes(q); });
                    list.querySelectorAll('.ts-group').forEach(g => { let n = g.nextElementSibling, any = false; while (n && !n.classList.contains('ts-group')) { if (!n.hidden) any = true; n = n.nextElementSibling; } g.hidden = !any; });
                    focusIndex(items.findIndex(i => !i.row.hidden));
                });
                panel.append(search);
            }
            panel.append(list);
            let active = Math.max(0, select.selectedIndex);
            const visible = () => items.map((i, k) => [i, k]).filter(([i]) => !i.row.hidden && !i.row.disabled).map(([, k]) => k);
            function focusIndex(k) {
                if (k < 0) return;
                items.forEach(i => i.row.classList.remove('active'));
                active = k;
                items[k].row.classList.add('active');
                items[k].row.scrollIntoView({ block: 'nearest' });
            }
            panel.addEventListener('keydown', e => {
                const vis = visible(), at = vis.indexOf(active);
                if (e.key === 'ArrowDown') { e.preventDefault(); focusIndex(vis[Math.min(vis.length - 1, at + 1)] ?? vis[0]); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); focusIndex(vis[Math.max(0, at - 1)] ?? vis[0]); }
                else if (e.key === 'Enter') { e.preventDefault(); if (items[active] && !items[active].row.hidden) choose(active); }
                else if (e.key === 'Escape') { e.preventDefault(); closeOpen(); button.focus(); }
                else if (!search && e.key.length === 1) { const k = items.findIndex(i => i.text.startsWith(e.key.toLowerCase())); if (k >= 0) focusIndex(k); }
            });
            function choose(index) {
                closeOpen();
                if (select.selectedIndex !== index) { select.selectedIndex = index; sync(); fire(select, 'input', 'change'); }
                button.focus();
            }
            place(panel, button);
            open = { panel, owner: button, close: () => { panel.remove(); button.classList.remove('open'); open = null; lastClosed = performance.now(); } };
            button.classList.add('open');
            focusIndex(active);
            (search || items[active]?.row || panel).focus({ preventScroll: true });
        }
    }

    const recent = (() => { try { return JSON.parse(localStorage.getItem('ui-recent-colours') || '[]'); } catch (e) { return []; } })();
    const remember = hex => { const i = recent.indexOf(hex); if (i >= 0) recent.splice(i, 1); recent.unshift(hex); recent.length = Math.min(recent.length, 16); try { localStorage.setItem('ui-recent-colours', JSON.stringify(recent)); } catch (e) {} };
    const toRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const toHex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
    function rgbToHsv([r, g, b]) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let hue = 0;
        if (d) hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [(hue * 60 + 360) % 360, max ? d / max : 0, max];
    }
    function hsvToRgb([hue, s, v]) {
        const c = v * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = v - c;
        const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
        return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    }
    function enhanceColor(input) {
        if (input._tc || input.closest('[data-native-controls]')) return;
        const swatch = el('button', { type: 'button', class: 'tc-swatch', 'aria-label': 'Choose a colour' }, el('span'));
        input._tc = { swatch, sync };
        input.classList.add('tc-native');
        input.tabIndex = -1;
        input.after(swatch);
        function sync() { swatch.firstChild.style.background = input.value; swatch.title = input.value; swatch.disabled = input.disabled; }
        sync();
        swatch.addEventListener('click', () => (open && open.owner === swatch ? closeOpen() : openPicker()));
        function openPicker() {
            closeOpen();
            let hsv = rgbToHsv(toRgb(input.value || '#ffffff'));
            const size = 176;
            const wheel = el('canvas', { class: 'tc-wheel', width: size, height: size });
            const dot = el('span', { class: 'tc-dot' });
            const value = el('input', { type: 'range', class: 'tc-value', min: 0, max: 100, step: 1, 'aria-label': 'Brightness' });
            const hex = el('input', { type: 'text', class: 'tc-hex', spellcheck: 'false', maxlength: 7, 'aria-label': 'Hex colour' });
            const preview = el('span', { class: 'tc-preview' });
            const recentBox = el('div', { class: 'tc-recent' });
            const panel = el('div', { class: 'tc-panel' }, el('div', { class: 'tc-wheel-wrap' }, wheel, dot), el('label', { class: 'tc-row' }, el('span', { text: 'Brightness' }), value),
                el('div', { class: 'tc-row' }, preview, hex), recentBox);
            const drawWheel = () => {
                const g = wheel.getContext('2d'), img = g.createImageData(size, size), r0 = size / 2;
                for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                    const dx = x - r0 + 0.5, dy = y - r0 + 0.5, d = Math.sqrt(dx * dx + dy * dy) / r0, i = (y * size + x) * 4;
                    if (d > 1) { img.data[i + 3] = 0; continue; }
                    const [r, gg, b] = hsvToRgb([(Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, d, hsv[2]]);
                    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = d > 0.985 ? 255 * (1 - d) / 0.015 : 255;
                }
                g.putImageData(img, 0, 0);
            };
            const show = (fromHex) => {
                const color = toHex(hsvToRgb(hsv));
                const a = hsv[0] * Math.PI / 180, r = hsv[1] * size / 2;
                dot.style.left = `${size / 2 + Math.cos(a) * r}px`; dot.style.top = `${size / 2 + Math.sin(a) * r}px`;
                dot.style.background = color; preview.style.background = color;
                value.value = Math.round(hsv[2] * 100);
                value.style.setProperty('--tc-top', toHex(hsvToRgb([hsv[0], hsv[1], 1])));
                if (!fromHex) hex.value = color;
                return color;
            };
            const commit = color => { if (input.value !== color) { input.value = color; sync(); fire(input, 'input'); } };
            const pickAt = e => {
                const r = wheel.getBoundingClientRect(), dx = e.clientX - r.left - size / 2, dy = e.clientY - r.top - size / 2;
                hsv = [(Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, Math.min(1, Math.sqrt(dx * dx + dy * dy) / (size / 2)), hsv[2] || 1];
                if (!hsv[2]) hsv[2] = 1;
                drawWheel(); commit(show());
            };
            let dragging = false;
            wheel.addEventListener('pointerdown', e => { dragging = true; wheel.setPointerCapture(e.pointerId); pickAt(e); });
            wheel.addEventListener('pointermove', e => dragging && pickAt(e));
            wheel.addEventListener('pointerup', () => { dragging = false; fire(input, 'change'); remember(input.value); });
            value.addEventListener('input', () => { hsv[2] = value.value / 100; drawWheel(); commit(show()); });
            value.addEventListener('change', () => { fire(input, 'change'); remember(input.value); });
            hex.addEventListener('input', () => {
                const v = hex.value.trim().replace(/^([^#])/, '#$1');
                if (/^#[0-9a-f]{6}$/i.test(v)) { hsv = rgbToHsv(toRgb(v)); drawWheel(); show(true); commit(v.toLowerCase()); }
            });
            hex.addEventListener('change', () => { fire(input, 'change'); remember(input.value); show(); });
            hex.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { closeOpen(); swatch.focus(); } });
            recent.forEach(c => recentBox.append(el('button', { type: 'button', class: 'tc-recent-swatch', style: `background:${c}`, title: c, onclick: () => { hsv = rgbToHsv(toRgb(c)); drawWheel(); commit(show()); fire(input, 'change'); } })));
            recentBox.hidden = !recent.length;
            drawWheel(); show();
            place(panel, swatch, 208);
            open = { panel, owner: swatch, close: () => { panel.remove(); open = null; lastClosed = performance.now(); } };
            hex.focus({ preventScroll: true }); hex.select();
        }
    }

    for (const [proto, prop, key] of [[HTMLSelectElement.prototype, 'value', '_ts'], [HTMLSelectElement.prototype, 'selectedIndex', '_ts'], [HTMLInputElement.prototype, 'value', '_tc']]) {
        const d = Object.getOwnPropertyDescriptor(proto, prop);
        Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get() { return d.get.call(this); },
            set(v) { d.set.call(this, v); if (this[key]) this[key].sync(); } });
    }
    const fill = r => { const min = Number(r.min || 0), max = Number(r.max || 100); r.style.setProperty('--p', `${((Number(r.value) - min) / ((max - min) || 1)) * 100}%`); };
    document.addEventListener('input', e => { if (e.target.matches && e.target.matches('input[type="range"]')) fill(e.target); }, true);
    const scan = root => {
        if (root.nodeType !== 1) return;
        if (root.matches('input[type="range"]')) fill(root);
        root.querySelectorAll('input[type="range"]').forEach(fill);
        if (root.matches('select')) enhanceSelect(root); else if (root.matches('input[type="color"]')) enhanceColor(root); else if (root.matches('input[list]')) enhanceSuggest(root);
        root.querySelectorAll('input[list]').forEach(enhanceSuggest);
        root.querySelectorAll('select').forEach(enhanceSelect);
        root.querySelectorAll('input[type="color"]').forEach(enhanceColor);
    };
    new MutationObserver(records => {
        for (const r of records) {
            r.addedNodes.forEach(scan);
            if (r.type === 'childList' && r.target.tagName === 'SELECT' && r.target._ts) r.target._ts.sync();
            if (r.type === 'childList' && r.target.tagName === 'OPTGROUP' && r.target.parentElement && r.target.parentElement._ts) r.target.parentElement._ts.sync();
            if (r.type === 'attributes' && r.target._ts) r.target._ts.sync();
            if (r.type === 'attributes' && r.target._tc) r.target._tc.sync();
            if (r.type === 'attributes' && r.attributeName === 'list' && r.target.tagName === 'INPUT' && r.target.getAttribute('list')) {
                if (r.target._sg) { r.target._sg.listId = r.target.getAttribute('list'); r.target.removeAttribute('list'); } else enhanceSuggest(r.target);
            }
            r.removedNodes.forEach(n => {
                if (n.nodeType !== 1) return;
                [n, ...n.querySelectorAll('select, input[type="color"]')].forEach(x => { const t = x._ts || x._tc; const node = t && (t.button || t.swatch); if (node && node.isConnected && !x.isConnected) node.remove(); });
            });
        }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'list'] });
    const start = () => scan(document.body);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    function popup({ title, message, ok = 'OK', cancel = 'Cancel', danger = false, input = null, alertOnly = false }) {
        return new Promise(resolve => {
            const field = input !== null ? el('input', { type: 'text', class: 'ui-popup-input', value: input.value || '', placeholder: input.placeholder || '' }) : null;
            const okButton = el('button', { type: 'button', class: `button small${danger ? ' danger' : ''}`, text: ok });
            const cancelButton = alertOnly ? null : el('button', { type: 'button', class: 'button small secondary', text: cancel });
            const dialog = el('dialog', { class: 'ui-popup', role: alertOnly ? 'alertdialog' : 'dialog' },
                title ? el('h3', { text: title }) : null, el('p', { text: message }), field, el('div', { class: 'ui-popup-actions' }, cancelButton, okButton));
            let done = false;
            const finish = value => { if (done) return; done = true; dialog.close(); dialog.remove(); resolve(value); };
            okButton.addEventListener('click', () => finish(field ? field.value : alertOnly ? undefined : true));
            if (cancelButton) cancelButton.addEventListener('click', () => finish(field ? null : false));
            dialog.addEventListener('cancel', e => { e.preventDefault(); finish(field ? null : alertOnly ? undefined : false); });
            dialog.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); okButton.click(); }
            });
            document.body.append(dialog);
            dialog.showModal();
            (field || okButton).focus();
            if (field) field.select();
        });
    }
    const confirmPopup = (message, options = {}) => popup({ ...options, message });
    const alertPopup = (message, options = {}) => popup({ ...options, message, alertOnly: true });
    const promptPopup = (message, value = '', options = {}) => popup({ ok: 'OK', ...options, message, input: { value, placeholder: options.placeholder } });

    function orbit(canvas, o) {
        let mode = null, lastX = 0, lastY = 0, moved = 0;
        canvas.style.touchAction = 'none';
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        canvas.addEventListener('pointerdown', e => {
            e.preventDefault();
            if (canvas.focus) canvas.focus({ preventScroll: true });
            canvas.setPointerCapture(e.pointerId);
            lastX = e.clientX; lastY = e.clientY; moved = 0;
            const paints = o.paintsWithLeft && o.paintsWithLeft();
            if (e.button === 0 && e.altKey) mode = 'orbit';
            else if ((e.button === 0 && e.shiftKey && !paints) || e.button === 1) mode = 'pan';
            else if (e.button === 2) mode = paints ? 'orbit' : 'pan';
            else if (e.button === 0 && o.toolDown && o.toolDown(e)) mode = 'tool';
            else mode = 'orbit';
        });
        canvas.addEventListener('pointermove', e => {
            if (!mode) { if (o.hover) o.hover(e); return; }
            const dx = e.clientX - lastX, dy = e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
            if (mode === 'tool') o.toolMove && o.toolMove(e);
            else if (mode === 'orbit') o.orbit(dx, dy);
            else o.pan(dx, dy);
        });
        const end = e => {
            if (mode === 'tool') o.toolUp && o.toolUp(e);
            else if (mode === 'orbit' && moved < 4 && o.click) o.click(e);
            mode = null;
        };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', () => { if (mode === 'tool' && o.toolUp) o.toolUp(null); mode = null; });
        canvas.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); o.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1, e); }, { passive: false });
        canvas.addEventListener('dblclick', e => { if (!o.blankAt || o.blankAt(e)) { if (o.reset) o.reset(); } else if (o.dblclick) o.dblclick(e); });
    }
    const orbitHelp = paint => (paint ? 'Left: paint · right-drag: rotate · middle-drag: pan · scroll: zoom · double-click: reset view'
        : 'Drag: rotate · right-drag or Shift+drag: pan · scroll: zoom · double-click: reset view');

    function guard(dialog, { dirty = () => false, save = null, closed = null } = {}) {
        let asking = false;
        const requestClose = async () => {
            if (asking) return;
            if (dirty()) {
                asking = true;
                const discard = await confirmPopup('Your changes in this editor haven\'t been saved.', { title: 'Discard Changes?', ok: 'Discard', danger: true, cancel: 'Keep Editing' });
                asking = false;
                if (!discard) return;
            }
            dialog.close();
            if (closed) closed();
        };
        dialog.addEventListener('cancel', e => { e.preventDefault(); if (open) { closeOpen(); return; } if (performance.now() - lastClosed < 250) return; requestClose(); });
        dialog.addEventListener('keydown', e => {
            e.stopPropagation();
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && save) { e.preventDefault(); save(); }
        });
        dialog.addEventListener('wheel', e => {
            for (let n = e.target; n && n !== dialog; n = n.parentElement) {
                const s = getComputedStyle(n);
                if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return;
                if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            }
            e.preventDefault();
        }, { passive: false });
        return requestClose;
    }
    const typing = e => { const t = e.target; return !!t && (t.isContentEditable || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'button'].includes(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'); };

    function enhanceSuggest(input) {
        if (input._sg || input.type === 'hidden') return;
        const listId = input.getAttribute('list');
        if (!listId) return;
        input._sg = { listId };
        input.removeAttribute('list');
        input.setAttribute('autocomplete', 'off');
        let items = [], active = -1;
        const options = () => { const dl = document.getElementById(input._sg.listId); return dl ? [...dl.options].map(o => ({ value: o.value, label: o.label && o.label !== o.value ? o.label : o.textContent && o.textContent !== o.value ? o.textContent : '' })) : []; };
        const rank = (o, q) => {
            const v = o.value.toLowerCase(), l = (o.label || '').toLowerCase(), path = v.includes(':') ? v.split(':')[1] : v;
            if (!q) return 1;
            if (v === q || path === q) return 0;
            if (path.startsWith(q) || v.startsWith(q)) return 1;
            if (path.split(/[/_.]/).some(w => w.startsWith(q)) || l.split(/\s+/).some(w => w.startsWith(q))) return 2;
            if (v.includes(q) || l.includes(q)) return 3;
            return -1;
        };
        const choose = i => {
            const o = items[i];
            if (!o) return;
            input.value = o.value;
            closeOpen();
            fire(input, 'input', 'change');
            input.focus();
        };
        const setActive = i => {
            if (!open || open.owner !== input) return;
            active = i;
            open.panel.querySelectorAll('.ts-option').forEach((row, k) => row.classList.toggle('active', k === i));
            const row = open.panel.querySelectorAll('.ts-option')[i];
            if (row) row.scrollIntoView({ block: 'nearest' });
        };
        const show = () => {
            const q = input.value.trim().toLowerCase();
            items = options().map(o => [o, rank(o, q)]).filter(([, r]) => r >= 0).sort((a, b) => a[1] - b[1] || a[0].value.length - b[0].value.length).slice(0, 60).map(([o]) => o);
            if (open && open.owner === input) open.close();
            if (!items.length || (items.length === 1 && items[0].value === input.value)) return;
            closeOpen();
            const list = el('div', { class: 'ts-list' }, items.map((o, i) => {
                const row = el('button', { type: 'button', class: 'ts-option ts-suggest', role: 'option', tabindex: '-1' }, el('span', { text: o.value }), o.label ? el('small', { text: o.label }) : null);
                row.addEventListener('mousedown', e => { e.preventDefault(); choose(i); });
                return row;
            }));
            const panel = el('div', { class: 'ts-panel', role: 'listbox' }, list);
            place(panel, input, 220);
            open = { panel, owner: input, close: () => { panel.remove(); open = null; lastClosed = performance.now(); } };
            active = -1;
        };
        input.addEventListener('focus', show);
        input.addEventListener('input', e => { if (e.isTrusted) show(); });
        input.addEventListener('blur', () => setTimeout(() => { if (open && open.owner === input && document.activeElement !== input) closeOpen(); }, 120));
        input.addEventListener('keydown', e => {
            const showing = open && open.owner === input;
            if (e.key === 'ArrowDown') { e.preventDefault(); if (!showing) show(); else setActive(Math.min(items.length - 1, active + 1)); }
            else if (e.key === 'ArrowUp' && showing) { e.preventDefault(); setActive(Math.max(0, active - 1)); }
            else if ((e.key === 'Enter' || e.key === 'Tab') && showing && active >= 0) { e.preventDefault(); choose(active); }
            else if (e.key === 'Escape' && showing) { e.preventDefault(); e.stopPropagation(); closeOpen(); }
        });
    }

    const PLAYER_KEY = 'contentapi-preview-player';
    const playerListeners = new Set();
    const player = {
        get() {
            let v = {};
            try { v = JSON.parse(localStorage.getItem(PLAYER_KEY) || localStorage.getItem('contentapi-display-viewer') || '{}') || {}; } catch (error) { v = {}; }
            return { slim: !!v.slim, username: v.username || '', skinData: v.skinData || null };
        },
        set(changes) {
            const next = { ...player.get(), ...changes };
            try { localStorage.setItem(PLAYER_KEY, JSON.stringify(next)); } catch (error) {}
            playerListeners.forEach(fn => { try { fn(next); } catch (error) { console.warn(error); } });
            return next;
        },
        skinUrl(p = player.get()) {
            if (p.skinData) return p.skinData;
            if (p.username) return `https://mc-heads.net/skin/${encodeURIComponent(p.username)}`;
            return `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/26.3/assets/minecraft/textures/entity/player/${p.slim ? 'slim/alex' : 'wide/steve'}.png`;
        },
        onChange(fn) { playerListeners.add(fn); return () => playerListeners.delete(fn); },
        controls() {
            const p = player.get();
            const name = el('input', { type: 'text', class: 'ui-player-name', placeholder: 'Minecraft username', spellcheck: 'false', value: p.username });
            const arms = el('select', {}, el('option', { value: '' }, 'Classic Arms (Steve)'), el('option', { value: '1' }, 'Slim Arms (Alex)'));
            arms.value = p.slim ? '1' : '';
            const file = el('input', { type: 'file', accept: 'image/png', hidden: true });
            name.addEventListener('change', () => player.set({ username: name.value.trim(), skinData: null }));
            arms.addEventListener('change', () => player.set({ slim: !!arms.value }));
            file.addEventListener('change', () => { const f = file.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => player.set({ skinData: r.result }); r.readAsDataURL(f); file.value = ''; });
            const reset = el('button', { type: 'button', class: 'button small secondary', text: 'Default Skin', onclick: () => { name.value = ''; player.set({ username: '', skinData: null }); } });
            return el('div', { class: 'ui-player' }, el('label', { class: 'te-field' }, 'Player Skin', name), el('label', { class: 'button small secondary file-button' }, 'Upload Skin', file), reset, el('label', { class: 'te-field' }, 'Arms', arms));
        }
    };

    window.UIControls = { enhanceSelect, enhanceColor, close: closeOpen, confirm: confirmPopup, alert: alertPopup, prompt: promptPopup, orbit, orbitHelp, guard, typing, player };
})();
