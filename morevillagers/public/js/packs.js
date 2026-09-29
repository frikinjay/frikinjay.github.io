const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function init() {
    const grid = document.getElementById('pack-grid');
    const search = document.getElementById('pack-search');
    const empty = document.getElementById('no-packs');
    const response = await fetch('./packs/index.json').catch(() => null);
    const packs = response && response.ok ? (await response.json()).packs || [] : [];

    grid.innerHTML = packs.map(pack => `
        <a class="pack-card" href="./pack?id=${encodeURIComponent(pack.id)}" data-search="${escape([pack.name, pack.id, pack.author, pack.description].join(' ').toLowerCase())}">
            <span class="pack-icon">${pack.icon ? `<img src="./${escape(pack.icon)}" alt="" width="64" height="64" loading="lazy">` : ''}</span>
            <span class="pack-info">
                <strong>${escape(pack.name)}</strong>
                <span>${escape(pack.description)}</span>
                <small>${[pack.version && 'v' + pack.version, pack.author && 'by ' + pack.author, 'Minecraft ' + (pack.minecraft || '26.3'), `${pack.professions.length} professions`].filter(Boolean).map(escape).join(' · ')}</small>
            </span>
        </a>`).join('');

    const filter = () => {
        const query = search.value.trim().toLowerCase();
        let shown = 0;
        grid.querySelectorAll('.pack-card').forEach(card => {
            const match = !query || card.dataset.search.includes(query);
            card.hidden = !match;
            if (match) shown++;
        });
        empty.hidden = shown > 0;
    };
    search.addEventListener('input', filter);
    filter();
}

window.Site.ready(init());
