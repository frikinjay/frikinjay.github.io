(function () {
    'use strict';

    var MAX_WAIT = 10000;
    var loader = document.getElementById('loader');
    var pending = [];
    var hidden = false;

    function hideLoader() {
        if (hidden || !loader) return;
        hidden = true;
        document.documentElement.classList.remove('is-loading');
        loader.classList.add('done');
    }

    function showLoader() {
        if (!loader) return;
        hidden = false;
        document.documentElement.classList.add('is-loading');
        loader.classList.remove('done');
    }

    function ready(promise) {
        if (promise && typeof promise.then === 'function') {
            pending.push(promise.catch(function (error) { console.error(error); }));
        }
        return promise;
    }

    var pageLoaded = new Promise(function (resolve) {
        if (document.readyState === 'complete') resolve();
        else window.addEventListener('load', resolve, { once: true });
    });
    var fontsLoaded = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();

    function settle() {
        var count = pending.length;
        Promise.all(pending).then(function () {
            if (pending.length !== count) settle();
            else hideLoader();
        });
    }

    Promise.all([pageLoaded, fontsLoaded]).then(function () {
        window.setTimeout(settle, 0);
    });
    window.setTimeout(hideLoader, MAX_WAIT);

    window.addEventListener('pageshow', function (event) {
        if (event.persisted) hideLoader();
    });

    document.addEventListener('click', function (event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        var link = event.target.closest && event.target.closest('a[href]');
        if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

        var url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;

        event.preventDefault();
        showLoader();
        window.setTimeout(function () { window.location.href = url.href; }, 60);
    });

    function toast(message, type) {
        var host = document.querySelector('.toasts');
        if (!host) {
            host = document.createElement('div');
            host.className = 'toasts';
            host.setAttribute('role', 'status');
            host.setAttribute('aria-live', 'polite');
            document.body.appendChild(host);
        }
        var element = document.createElement('div');
        element.className = 'toast' + (type ? ' ' + type : '');
        element.textContent = message;
        host.appendChild(element);
        window.setTimeout(function () {
            element.classList.add('out');
            window.setTimeout(function () { element.remove(); }, 260);
        }, 3200);
    }

    var TIP_COLORS = {
        white: '#ffffff', yellow: '#ffff55', aqua: '#55ffff', light_purple: '#ff55ff', gray: '#aaaaaa',
        dark_gray: '#555555', blue: '#5555ff', green: '#55ff55', red: '#ff5555', gold: '#ffaa00'
    };
    var tipElement = null;
    var tipOwner = null;
    var tipTimer = 0;

    function shadowOf(hex) {
        var value = parseInt(hex.slice(1), 16);
        var r = ((value >> 16) & 0xfc) >> 2;
        var g = ((value >> 8) & 0xfc) >> 2;
        var b = (value & 0xfc) >> 2;
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    function tipLine(text, color, className) {
        var line = document.createElement('div');
        var hex = TIP_COLORS[color] || TIP_COLORS.white;
        line.className = className || 'mc-tooltip-line';
        line.textContent = text;
        line.style.color = hex;
        line.style.textShadow = '2px 2px 0 ' + shadowOf(hex);
        return line;
    }

    function readTip(element) {
        var raw = element.getAttribute('data-tip');
        if (!raw) return null;
        try {
            var data = JSON.parse(raw);
            return typeof data === 'string' ? { name: data, color: 'white', lines: [] } : data;
        } catch (error) {
            return { name: raw, color: 'white', lines: [] };
        }
    }

    function showTip(element, x, y) {
        var data = readTip(element);
        if (!data || !data.name) return;
        if (!tipElement) {
            tipElement = document.createElement('div');
            tipElement.className = 'mc-tooltip';
            tipElement.setAttribute('aria-hidden', 'true');
            document.body.appendChild(tipElement);
        }
        if (tipOwner !== element) {
            tipElement.textContent = '';
            tipElement.appendChild(tipLine(data.name, data.color, 'mc-tooltip-line mc-tooltip-title'));
            (data.lines || []).forEach(function (line) {
                tipElement.appendChild(tipLine(line.text, line.color));
            });
            tipOwner = element;
        }
        tipElement.classList.add('visible');
        moveTip(x, y);
    }

    function moveTip(x, y) {
        if (!tipElement) return;
        var width = tipElement.offsetWidth;
        var height = tipElement.offsetHeight;
        var left = x + 12;
        var top = y - 12 - 4;
        if (left + width > window.innerWidth - 4) left = Math.max(4, x - 16 - width);
        if (top + height > window.innerHeight - 4) top = window.innerHeight - 4 - height;
        if (top < 4) top = 4;
        tipElement.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    }

    function hideTip() {
        if (tipElement) tipElement.classList.remove('visible');
        tipOwner = null;
        window.clearTimeout(tipTimer);
    }

    document.addEventListener('pointerover', function (event) {
        if (event.pointerType === 'touch') return;
        var target = event.target.closest && event.target.closest('[data-tip]');
        if (target) showTip(target, event.clientX, event.clientY);
    });
    document.addEventListener('pointermove', function (event) {
        if (!tipOwner || event.pointerType === 'touch') return;
        if (!tipOwner.contains(event.target)) { hideTip(); return; }
        moveTip(event.clientX, event.clientY);
    }, { passive: true });
    document.addEventListener('pointerout', function (event) {
        if (!tipOwner || event.pointerType === 'touch') return;
        if (!event.relatedTarget || !tipOwner.contains(event.relatedTarget)) hideTip();
    });
    document.addEventListener('pointerdown', function (event) {
        var target = event.target.closest && event.target.closest('[data-tip]');
        if (event.pointerType === 'touch' && target) {
            var rect = target.getBoundingClientRect();
            showTip(target, rect.left + rect.width / 2, rect.top);
            window.clearTimeout(tipTimer);
            tipTimer = window.setTimeout(hideTip, 2500);
        } else if (!target) {
            hideTip();
        }
    });
    window.addEventListener('scroll', function () { if (tipOwner) hideTip(); }, { passive: true });

    window.Site = { toast: toast, ready: ready, showLoader: showLoader, hideLoader: hideLoader };
})();
