# Structure palette tools

Two Python scripts for making block-swapped copies of structure `.nbt` files, for example a badlands version of the desert village. They only need Python 3, no extra packages.

The same tools also run in your browser, with a 3D preview of every structure, at [villagerapi.neoterra.dev/#tools](https://villagerapi.neoterra.dev/#tools). Both use the same `block_replacements.json` format, so mappings work in either.

## 1. Scan

Copy both scripts into the folder with the structures (for example a copy of `data/minecraft/structure/village/desert` taken from the Minecraft jar) and run:

```
python villager_palette_scan.py
```

It reads every `.nbt` file in the folder and its subfolders and writes `block_replacements.json`, listing every block the structures use, each mapped to itself. Block properties are ignored.

## 2. Edit the mappings

Open `block_replacements.json` and change the right-hand side of any block you want swapped:

```json
"blocks": {
  "minecraft:sand": "minecraft:red_sand",
  "minecraft:sandstone_stairs": "minecraft:red_sandstone_stairs"
}
```

- Blocks mapped to themselves are left alone.
- Properties such as `facing` or `half` are kept, so swap stairs for stairs, slabs for slabs, doors for doors, and so on. Properties the new block doesn't have are ignored by Minecraft.
- `replace_jigsaw_final_states` also swaps the block each jigsaw block turns into after generation (for example the sand under village streets). Leave it `true` unless you have a reason not to.
- `rename_files` renames output files, for example `{"desert_": "badlands_"}`. Leave it empty `{}` when making overrides for a VillagerAPI `village_types` folder, because overrides must keep the original file names.
- `block_nbt` sets block entity data (NBT) on every placed copy of a block, written in SNBT, for example `{"minecraft:chest": "{LootTable:\"minecraft:chests/village/village_desert_house\"}"}`. The keys are the original block IDs. Only the website applies it; the scripts keep it but ignore it.
- `used_in_files` just shows how many files use each block. It isn't read by the apply script.

Running the scan again keeps your edits and only adds blocks it hasn't seen before.

## 3. Apply

```
python villager_palette_apply.py
```

It writes the swapped copies to `generated_structures/`, with the same folder layout as the originals. The original files are never changed. It prints every swap it made and any mapping that wasn't used.

## Presets

`presets/` contains ready-made `block_replacements.json` files. Copy one into the folder next to the scripts and run the apply script directly.

- `vanilla_desert_village_to_badlands`: for `data/minecraft/structure/village/desert`. Sandstone becomes red sandstone, jungle wood becomes dark oak, and lime and green accents become orange and red. The output goes into a VillagerAPI `village_types/<folder>/<village name>/` override folder.
- `morevillagers_desert_houses_to_badlands`: for More Villagers' `data/morevillagers/structure/village/desert`. Same swaps, and it renames `desert_*.nbt` to `badlands_*.nbt`. The output goes into a `village_structures/<folder>/houses/` folder.
