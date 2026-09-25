VillagerPackGeneratorBase.registerVersion('1.21.1', {
    label: 'Minecraft 1.21.1',
    packMcmeta: (description) => ({
        pack: {
            pack_format: 48,
            supported_formats: { min_inclusive: 0, max_inclusive: 1000 },
            description
        }
    }),
    itemDefinitions: false,
    babyTextures: false,
    lootRandomSequence: false,
    neoforgeBiomeDataMap: false,
    legacyLangKeys: true
});
