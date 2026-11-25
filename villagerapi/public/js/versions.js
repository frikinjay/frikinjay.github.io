'use strict';

const packMcmeta = (description) => ({
    pack: {
        pack_format: 48,
        min_format: 38,
        max_format: 1000,
        supported_formats: [38, 1000],
        description
    }
});

const MODERN_DOCS = 'https://github.com/frikinjay/villagerapi/blob/main/DOCUMENTATION_26_1.md';

const VillagerPackVersions = {
    '26.4': {
        id: '26.4',
        label: '26.4 snapshot',
        game: '26.4-snapshot-9',
        registries: '26.4-snapshot-9',
        assets: '26.3',
        packMcmeta,
        tradeFormat: 'modern',
        randomPotion: true,
        lootModifiers: true,
        itemDefinitions: true,
        babyTextures: true,
        lootRandomSequence: true,
        legacyLangKeys: false,
        wandering: { buying: 2, uncommon: 2, common: 5 },
        villages: true,
        levelReplace: true,
        biomeMappings: 'list',
        docs: MODERN_DOCS
    },
    '26.3': {
        id: '26.3',
        label: '26.3',
        game: '26.3',
        registries: '26.3',
        assets: '26.3',
        packMcmeta,
        tradeFormat: 'modern',
        randomPotion: true,
        lootModifiers: true,
        itemDefinitions: true,
        babyTextures: true,
        lootRandomSequence: true,
        legacyLangKeys: false,
        wandering: { buying: 2, uncommon: 2, common: 5 },
        villages: true,
        levelReplace: true,
        biomeMappings: 'list',
        docs: MODERN_DOCS
    },
    '26.2': {
        id: '26.2',
        label: '26.1.2 / 26.2',
        game: '26.1.2',
        registries: '26.1.2',
        assets: '26.1.2',
        packMcmeta,
        tradeFormat: 'modern',
        randomPotion: true,
        lootModifiers: false,
        itemDefinitions: true,
        babyTextures: true,
        lootRandomSequence: true,
        legacyLangKeys: false,
        wandering: { buying: 2, uncommon: 2, common: 5 },
        villages: false,
        levelReplace: false,
        biomeMappings: 'map',
        docs: MODERN_DOCS
    },
    '1.21.11': {
        id: '1.21.11',
        label: '1.21.11',
        game: '1.21.11',
        registries: '1.21.11',
        assets: '1.21.11',
        packMcmeta,
        tradeFormat: 'modern',
        randomPotion: false,
        lootModifiers: false,
        itemDefinitions: true,
        babyTextures: false,
        lootRandomSequence: true,
        legacyLangKeys: false,
        wandering: { buying: 2, uncommon: 2, common: 5 },
        villages: true,
        levelReplace: true,
        biomeMappings: 'list',
        docs: MODERN_DOCS
    },
    '1.21.1': {
        id: '1.21.1',
        label: '1.21.1',
        game: '1.21.1',
        registries: '1.21.1',
        assets: '1.21.1',
        packMcmeta: (description) => ({
            pack: {
                pack_format: 48,
                supported_formats: { min_inclusive: 34, max_inclusive: 48 },
                description
            }
        }),
        tradeFormat: 'legacy',
        randomPotion: false,
        lootModifiers: false,
        itemDefinitions: false,
        babyTextures: false,
        lootRandomSequence: false,
        legacyLangKeys: true,
        wandering: { buying: 2, uncommon: 1, common: 5 },
        villages: true,
        levelReplace: true,
        biomeMappings: 'list',
        docs: 'https://github.com/frikinjay/villagerapi/blob/main/DOCUMENTATION_1_21_1.md'
    }
};

const DEFAULT_VERSION = '26.3';

function currentVillagerPackVersion() {
    const picker = document.querySelector('[name="mc-version"]');
    return VillagerPackVersions[picker && picker.value] || VillagerPackVersions[DEFAULT_VERSION];
}

window.VillagerPackVersions = VillagerPackVersions;
window.currentVillagerPackVersion = currentVillagerPackVersion;
