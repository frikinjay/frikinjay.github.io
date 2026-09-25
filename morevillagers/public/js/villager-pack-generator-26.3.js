VillagerPackGeneratorBase.registerVersion('26.3', {
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
    neoforgeBiomeDataMap: true,
    legacyLangKeys: false
});
