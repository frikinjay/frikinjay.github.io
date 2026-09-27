(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
        var panels = Array.prototype.slice.call(document.querySelectorAll('[role="tabpanel"]'));
        var search = document.getElementById('search');
        var list = document.getElementById('professions');
        var empty = document.getElementById('no-results');
        var current = tabs[0] ? tabs[0].getAttribute('aria-controls') : null;
        var timer = 0;

        function select(id, focus) {
            current = id;
            tabs.forEach(function (tab) {
                var active = tab.getAttribute('aria-controls') === id;
                tab.setAttribute('aria-selected', active ? 'true' : 'false');
                tab.tabIndex = active ? 0 : -1;
                if (active) {
                    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    if (focus) tab.focus();
                }
            });
            if (search.value) {
                search.value = '';
            }
            render();
            if (history.replaceState) history.replaceState(null, '', '#' + id);
        }

        function render() {
            var query = search.value.trim().toLowerCase();
            list.classList.toggle('searching', !!query);
            var found = 0;

            panels.forEach(function (panel) {
                if (!query) {
                    panel.hidden = panel.id !== current;
                    panel.querySelectorAll('.trade, .level').forEach(function (el) { el.hidden = false; });
                    return;
                }

                var nameMatch = panel.getAttribute('data-name').indexOf(query) !== -1;
                var inPanel = 0;
                panel.querySelectorAll('.level').forEach(function (level) {
                    var inLevel = 0;
                    level.querySelectorAll('.trade').forEach(function (trade) {
                        var match = nameMatch || trade.getAttribute('data-search').indexOf(query) !== -1;
                        trade.hidden = !match;
                        if (match) inLevel++;
                    });
                    level.hidden = inLevel === 0;
                    inPanel += inLevel;
                });
                panel.hidden = inPanel === 0;
                found += inPanel;
            });

            empty.hidden = !query || found > 0;
        }

        tabs.forEach(function (tab, index) {
            tab.addEventListener('click', function () { select(tab.getAttribute('aria-controls')); });
            tab.addEventListener('keydown', function (event) {
                var next = null;
                if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
                if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
                if (next) {
                    event.preventDefault();
                    select(next.getAttribute('aria-controls'), true);
                }
            });
        });

        search.addEventListener('input', function () {
            window.clearTimeout(timer);
            timer = window.setTimeout(render, 80);
        });

        var hash = (window.location.hash || '').slice(1);
        if (hash && document.getElementById(hash)) current = hash;
        select(current);
    });
})();
