"""Snapshot the four NightreignQuickRef relic effect lists for the local glossary.

Run this script only when deliberately updating the upstream snapshot. The site
reads the generated JSON locally and does not fetch GitHub at runtime.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
COMMIT = "3e23450094c18125ae5665927ed240b18189a040"
SOURCE = f"https://github.com/xxiixi/NightreignQuickRef/tree/{COMMIT}/src/data/zh-CN"
RAW_SOURCE = f"https://raw.githubusercontent.com/xxiixi/NightreignQuickRef/{COMMIT}/src/data/zh-CN"
CATEGORIES = (
    ("normal-outside", "局外词条", "outsider_entries_zh-CN.json"),
    ("normal-inside", "局内词条", "in-game_entries_zh-CN.json"),
    ("deep-outside", "深夜局外词条", "deep_night_entries.json"),
    ("deep-inside", "深夜局内词条", "in-game_deep_night_entries.json"),
)


def source_rows(filename: str):
    request = Request(f"{RAW_SOURCE}/{filename}", headers={"User-Agent": "NightreignCompendium"})
    with urlopen(request, timeout=30) as response:
        data = json.load(response)
    if not isinstance(data, list):
        raise ValueError(f"Unexpected source format: {filename}")
    for group in data:
        if not isinstance(group, dict):
            raise ValueError(f"Unexpected entry format: {filename}")
        if "entry_name" in group:
            yield str(group.get("entry_id") or group.get("entry_entry_id")), group
        else:
            for source_id, entry in group.items():
                if not isinstance(entry, dict):
                    raise ValueError(f"Unexpected nested entry: {filename} / {source_id}")
                yield str(source_id), entry


def main() -> None:
    categories = []
    entries = []
    for category, label, filename in CATEGORIES:
        seen = set()
        for effect_id, entry in source_rows(filename):
            if not effect_id.isdecimal() or effect_id in seen or not entry.get("entry_name"):
                raise ValueError(f"Invalid or duplicate effect: {filename} / {effect_id}")
            seen.add(effect_id)
            entries.append({
                "id": effect_id,
                "category": category,
                "name": entry["entry_name"],
                "type": entry.get("entry_type") or "其他",
                "explanation": entry.get("explanation") or "",
                "stackability": entry.get("superposability") or "",
                "buffType": entry.get("buff_type") or "",
            })
        categories.append({"id": category, "label": label, "sourceFile": filename, "count": len(seen)})

    document = {"source": SOURCE, "sourceCommit": COMMIT, "license": "GPL-3.0",
                "categories": categories, "entries": entries}
    output = ROOT / "public" / "effect_encyclopedia.json"
    output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} entries to {output}")


if __name__ == "__main__":
    main()
