#!/usr/bin/env python3
"""
Scans every structure .nbt file in the current folder (and its subfolders) and writes
block_replacements.json with every block used, each mapped to itself.

Edit the right-hand side of the mappings to swap blocks, then run villager_palette_apply.py.
Running this again keeps the edits already in block_replacements.json and only adds new blocks.

Block properties are ignored here: when a block is swapped, its properties (facing, half, ...)
are kept, so swap blocks for blocks that use the same properties (stairs for stairs, slabs for slabs).

Usage: python villager_palette_scan.py [folder]
No extra packages are needed.
"""
import gzip
import io
import json
import os
import struct
import sys

OUTPUT_FOLDER = "generated_structures"
MAPPING_FILE = "block_replacements.json"

TAG_END, TAG_BYTE, TAG_SHORT, TAG_INT, TAG_LONG, TAG_FLOAT, TAG_DOUBLE = 0, 1, 2, 3, 4, 5, 6
TAG_BYTE_ARRAY, TAG_STRING, TAG_LIST, TAG_COMPOUND, TAG_INT_ARRAY, TAG_LONG_ARRAY = 7, 8, 9, 10, 11, 12

_FIXED = {TAG_BYTE: ">b", TAG_SHORT: ">h", TAG_INT: ">i", TAG_LONG: ">q", TAG_FLOAT: ">f", TAG_DOUBLE: ">d"}


class Compound:
    """Ordered NBT compound: a list of [name_bytes, tag_type, value]."""

    def __init__(self, entries=None):
        self.entries = entries if entries is not None else []

    def get(self, name, tag_type=None):
        key = name.encode("utf-8")
        for entry_name, entry_type, value in self.entries:
            if entry_name == key and (tag_type is None or entry_type == tag_type):
                return value
        return None

    def set_string(self, name, text):
        key = name.encode("utf-8")
        for entry in self.entries:
            if entry[0] == key and entry[1] == TAG_STRING:
                entry[2] = text.encode("utf-8")
                return


class NbtList:
    def __init__(self, element_type, items):
        self.element_type = element_type
        self.items = items


def _read_exact(stream, size):
    data = stream.read(size)
    if len(data) != size:
        raise EOFError("Unexpected end of NBT data")
    return data


def _read_payload(stream, tag_type):
    if tag_type in _FIXED:
        fmt = _FIXED[tag_type]
        return struct.unpack(fmt, _read_exact(stream, struct.calcsize(fmt)))[0]
    if tag_type == TAG_BYTE_ARRAY:
        length = struct.unpack(">i", _read_exact(stream, 4))[0]
        return _read_exact(stream, length)
    if tag_type == TAG_STRING:
        length = struct.unpack(">H", _read_exact(stream, 2))[0]
        return _read_exact(stream, length)
    if tag_type == TAG_LIST:
        element_type = struct.unpack(">b", _read_exact(stream, 1))[0]
        length = struct.unpack(">i", _read_exact(stream, 4))[0]
        return NbtList(element_type, [_read_payload(stream, element_type) for _ in range(length)])
    if tag_type == TAG_COMPOUND:
        entries = []
        while True:
            child_type = struct.unpack(">b", _read_exact(stream, 1))[0]
            if child_type == TAG_END:
                return Compound(entries)
            name_length = struct.unpack(">H", _read_exact(stream, 2))[0]
            name = _read_exact(stream, name_length)
            entries.append([name, child_type, _read_payload(stream, child_type)])
    if tag_type == TAG_INT_ARRAY:
        length = struct.unpack(">i", _read_exact(stream, 4))[0]
        return list(struct.unpack(">%di" % length, _read_exact(stream, 4 * length)))
    if tag_type == TAG_LONG_ARRAY:
        length = struct.unpack(">i", _read_exact(stream, 4))[0]
        return list(struct.unpack(">%dq" % length, _read_exact(stream, 8 * length)))
    raise ValueError("Unknown NBT tag type %d" % tag_type)


def _write_payload(stream, tag_type, value):
    if tag_type in _FIXED:
        stream.write(struct.pack(_FIXED[tag_type], value))
    elif tag_type == TAG_BYTE_ARRAY:
        stream.write(struct.pack(">i", len(value)))
        stream.write(value)
    elif tag_type == TAG_STRING:
        stream.write(struct.pack(">H", len(value)))
        stream.write(value)
    elif tag_type == TAG_LIST:
        element_type = value.element_type if value.items else (value.element_type or TAG_END)
        stream.write(struct.pack(">b", element_type))
        stream.write(struct.pack(">i", len(value.items)))
        for item in value.items:
            _write_payload(stream, element_type, item)
    elif tag_type == TAG_COMPOUND:
        for name, child_type, child in value.entries:
            stream.write(struct.pack(">b", child_type))
            stream.write(struct.pack(">H", len(name)))
            stream.write(name)
            _write_payload(stream, child_type, child)
        stream.write(struct.pack(">b", TAG_END))
    elif tag_type == TAG_INT_ARRAY:
        stream.write(struct.pack(">i", len(value)))
        stream.write(struct.pack(">%di" % len(value), *value))
    elif tag_type == TAG_LONG_ARRAY:
        stream.write(struct.pack(">i", len(value)))
        stream.write(struct.pack(">%dq" % len(value), *value))
    else:
        raise ValueError("Unknown NBT tag type %d" % tag_type)


def read_nbt_file(path):
    """Returns (root_name, root_compound, was_gzipped)."""
    with open(path, "rb") as handle:
        raw = handle.read()
    gzipped = raw[:2] == b"\x1f\x8b"
    data = gzip.decompress(raw) if gzipped else raw
    stream = io.BytesIO(data)
    root_type = struct.unpack(">b", _read_exact(stream, 1))[0]
    if root_type != TAG_COMPOUND:
        raise ValueError("Root tag is not a compound")
    name_length = struct.unpack(">H", _read_exact(stream, 2))[0]
    root_name = _read_exact(stream, name_length)
    return root_name, _read_payload(stream, TAG_COMPOUND), gzipped


def write_nbt_file(path, root_name, root, gzipped):
    stream = io.BytesIO()
    stream.write(struct.pack(">b", TAG_COMPOUND))
    stream.write(struct.pack(">H", len(root_name)))
    stream.write(root_name)
    _write_payload(stream, TAG_COMPOUND, root)
    data = stream.getvalue()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(gzip.compress(data, mtime=0) if gzipped else data)


def text(value):
    return value.decode("utf-8", errors="replace") if isinstance(value, (bytes, bytearray)) else str(value)


def palettes(root):
    """Yields every palette list in a structure (single palette or multiple palettes)."""
    palette = root.get("palette", TAG_LIST)
    if palette is not None:
        yield palette
    multiple = root.get("palettes", TAG_LIST)
    if multiple is not None:
        for item in multiple.items:
            if isinstance(item, NbtList):
                yield item


def palette_block_key(entry):
    """26.x uses "id", older versions use "Name"."""
    for key in ("id", "Name"):
        if entry.get(key, TAG_STRING) is not None:
            return key
    return None


def jigsaw_nbts(root):
    blocks = root.get("blocks", TAG_LIST)
    if blocks is None:
        return
    for block in blocks.items:
        if isinstance(block, Compound):
            nbt = block.get("nbt", TAG_COMPOUND)
            if nbt is not None and nbt.get("final_state", TAG_STRING) is not None:
                yield nbt


def split_block_state(state):
    """"minecraft:grass_block[snowy=false]" -> ("minecraft:grass_block", "[snowy=false]")."""
    for index, char in enumerate(state):
        if char in "[{":
            return state[:index], state[index:]
    return state, ""


def find_structures(folder, skip_folder):
    for directory, subdirectories, files in os.walk(folder):
        subdirectories[:] = sorted(d for d in subdirectories if os.path.abspath(os.path.join(directory, d)) != skip_folder)
        for name in sorted(files):
            if name.endswith(".nbt"):
                yield os.path.join(directory, name)


def main():
    folder = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    skip_folder = os.path.abspath(os.path.join(folder, OUTPUT_FOLDER))
    mapping_path = os.path.join(folder, MAPPING_FILE)

    usage = {}
    final_states = {}
    scanned = 0
    failed = []

    for path in find_structures(folder, skip_folder):
        try:
            _, root, _ = read_nbt_file(path)
        except Exception as error:
            failed.append((path, error))
            continue
        scanned += 1
        seen_in_file = set()

        for palette in palettes(root):
            for entry in palette.items:
                if not isinstance(entry, Compound):
                    continue
                key = palette_block_key(entry)
                if key is None:
                    continue
                block = text(entry.get(key, TAG_STRING))
                seen_in_file.add(block)

        for nbt in jigsaw_nbts(root):
            block, _ = split_block_state(text(nbt.get("final_state", TAG_STRING)))
            final_states[block] = final_states.get(block, 0) + 1
            seen_in_file.add(block)

        for block in seen_in_file:
            usage[block] = usage.get(block, 0) + 1

    existing = {}
    replace_final_states = True
    rename = {}
    if os.path.exists(mapping_path):
        with open(mapping_path, "r", encoding="utf-8") as handle:
            previous = json.load(handle)
        existing = previous.get("blocks", {})
        replace_final_states = previous.get("replace_jigsaw_final_states", True)
        rename = previous.get("rename_files", {})

    blocks = {}
    for block in sorted(set(usage) | set(existing)):
        blocks[block] = existing.get(block, block)

    output = {
        "replace_jigsaw_final_states": replace_final_states,
        "rename_files": rename,
        "blocks": blocks,
        "used_in_files": {block: usage.get(block, 0) for block in sorted(usage)},
    }

    with open(mapping_path, "w", encoding="utf-8") as handle:
        json.dump(output, handle, indent=2)
        handle.write("\n")

    new_blocks = [block for block in usage if block not in existing]
    print("Scanned %d structure file(s) in %s" % (scanned, folder))
    print("Found %d block type(s), %d new since the last scan" % (len(usage), len(new_blocks)))
    if final_states:
        print("Jigsaw final states: %s" % ", ".join("%s (%d)" % item for item in sorted(final_states.items())))
    print("Wrote %s" % mapping_path)
    for path, error in failed:
        print("Could not read %s: %s" % (path, error))


if __name__ == "__main__":
    main()
