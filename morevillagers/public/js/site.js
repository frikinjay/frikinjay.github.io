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

    window.Site = { toast: toast, ready: ready, showLoader: showLoader, hideLoader: hideLoader };
})();
