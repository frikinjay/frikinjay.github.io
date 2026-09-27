(function () {
    'use strict';

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

    window.Site = { toast: toast };
})();
