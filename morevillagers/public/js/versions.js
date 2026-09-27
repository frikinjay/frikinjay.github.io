'use strict';

const VillagerPackVersions = {
    '26.3': {
        id: '26.3',
        label: 'Minecraft 26.3',
        packMcmeta: (description) => ({
            pack: {
                pack_format: 48,
                min_format: 38,
                max_format: 1000,
                supported_formats: [38, 1000],
                description
            }
        }),
        itemDefinitions: true,
        babyTextures: true,
        lootRandomSequence: true,
        legacyLangKeys: false,
        docs: 'https://github.com/frikinjay/villagerapi/blob/main/DOCUMENTATION_26_1.md'
    },
    '1.21.1': {
        id: '1.21.1',
        label: 'Minecraft 1.21.1',
        packMcmeta: (description) => ({
            pack: {
                pack_format: 48,
                supported_formats: { min_inclusive: 34, max_inclusive: 48 },
                description
            }
        }),
        itemDefinitions: false,
        babyTextures: false,
        lootRandomSequence: false,
        legacyLangKeys: true,
        docs: 'https://github.com/frikinjay/villagerapi/blob/main/DOCUMENTATION_1_21_1.md'
    }
};
