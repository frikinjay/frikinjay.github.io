const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function init() {
    const grid = document.getElementById('pack-grid');
    const search = document.getElementById('pack-search');
    const empty = document.getElementById('no-packs');
    const response = await fetch('./packs/index.json').catch(() => null);
    const packs = response && response.ok ? (await response.json()).packs || [] : [];

    grid.innerHTML = packs.map((pack, index) => {
        const counts = [[pack.professions, 'professions'], [pack.types, 'villager types']].filter(([list]) => list && list.length).map(([list, label]) => `<b>${list.length}</b> ${list.length === 1 ? label.replace(/s$/, '') : label}`);
        const tags = [...counts, pack.version && escape('v' + pack.version), escape('Minecraft ' + (pack.minecraft || '26.3'))].filter(Boolean);
        return `
        <a class="pack-card" href="./pack/${encodeURIComponent(pack.id)}" data-search="${escape([pack.name, pack.id, pack.author, pack.description].join(' ').toLowerCase())}">
            <span class="pack-card-head">
                <span class="pack-icon">${pack.icon ? `<img src="./${escape(pack.icon)}" alt="" width="64" height="64"${index ? ' loading="lazy"' : ''}>` : ''}</span>
                <span class="pack-title"><strong>${escape(pack.name)}</strong>${pack.author ? `<span>by ${escape(pack.author)}</span>` : ''}</span>
            </span>
            ${pack.description ? `<span class="pack-desc">${escape(pack.description)}</span>` : ''}
            <span class="pack-tags">${tags.map(tag => `<span>${tag}</span>`).join('')}</span>
        </a>`;
    }).join('');

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
