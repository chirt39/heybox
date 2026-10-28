"""Build the local, auditable Nightreign RAG corpus from project data."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DOCS = ROOT / "docs"
OUTPUT = Path(__file__).resolve().parent / "knowledge_base" / "nightreign_knowledge.jsonl"

CHARACTER_ZH = {
    "追跡者": "追踪者", "守護者": "守护者", "鉄の目": "铁之眼", "レディ": "女爵",
    "無頼漢": "无赖", "復讐者": "复仇者", "隠者": "隐士", "執行者": "执行者",
    "学者": "学者", "葬儀屋": "送葬者",
}
VESSEL_ZH = {
    "urn": "器皿", "goblet": "杯盅", "chalice": "高脚杯", "sootCoveredUrn": "熏黑的器皿",
    "sealedUrn": "封印的器皿", "decrepitGoblet": "破旧的杯盅", "forgottenGoblet": "被遗忘的杯盅",
    "sacredErdtreeGrail": "黄金树圣杯", "spiritTreeGrail": "灵魂树圣杯",
    "giantTreeGrail": "巨人树圣杯", "scadutreeGrail": "幽影树圣杯",
}
COLOR_ZH = {"Red": "红", "Blue": "蓝", "Yellow": "黄", "Green": "绿", "Any": "任意"}


def load_public(name: str) -> Any:
    return json.loads((PUBLIC / name).read_text(encoding="utf-8"))


def compact(value: Any) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, float):
        return f"{value:g}"
    if isinstance(value, str) and value.casefold() == "immune":
        return "免疫"
    if isinstance(value, str) and value.casefold() == "no":
        return "否"
    if isinstance(value, str) and value.casefold() == "yes":
        return "是"
    return str(value)


def add(records: list[dict[str, Any]], category: str, title: str, content: str,
        source: str, keywords: list[str] | None = None, record_id: str | None = None) -> None:
    content = re.sub(r"\s+", " ", content).strip()
    if not content:
        return
    records.append({
        "id": record_id or f"{category}:{len(records) + 1}",
        "category": category,
        "title": title.strip(),
        "content": content,
        "source": source,
        "keywords": " ".join(filter(None, [title, *(keywords or [])])),
    })


def build() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    # Enemy list: retain every available column, with damage reduction converted
    # to the effective damage multiplier used by the site's enemy viewer.
    enemy_data = load_public("enemy-data.json")
    enemy_columns = enemy_data.get("columns", [])
    enemy_id_counts: dict[str, int] = {}
    for row in enemy_data.get("rows", []):
        values = {col.get("k", ""): row[i] for i, col in enumerate(enemy_columns) if i < len(row)}
        name, enemy_id = compact(values.get("name")), compact(values.get("id"))
        enemy_id_counts[enemy_id] = enemy_id_counts.get(enemy_id, 0) + 1
        record_id = f"enemy:{enemy_id}" if enemy_id_counts[enemy_id] == 1 else f"enemy:{enemy_id}:{enemy_id_counts[enemy_id]}"
        fields: list[str] = []
        damage_values: list[tuple[str, float]] = []
        for col in enemy_columns:
            key = col.get("k", "")
            label = col.get("label", key)
            value = values.get(key)
            if value in (None, ""):
                continue
            if col.get("group") == "伤害倍率":
                try:
                    multiplier = round(1 - float(value) / 100, 3)
                    damage_values.append((label.removeprefix("伤害·"), multiplier))
                except (TypeError, ValueError):
                    fields.append(f"{label}：{value}")
            else:
                fields.append(f"{label}：{value}")
        if damage_values:
            fields.append("实际伤害倍率（由图鉴原始减伤率换算，倍率越高受到的伤害越高）：" +
                          "、".join(f"{label}×{value:g}" for label, value in damage_values))
            highest = max(value for _, value in damage_values)
            fields.append("最高伤害倍率/弱点类型：" + "、".join(label for label, value in damage_values if value == highest) + f" ×{highest:g}")
        title = f"敌人图鉴｜{name}｜ID {enemy_id}"
        add(records, "enemy", title, title + "｜" + "；".join(fields), "public/enemy-data.json",
            [name, enemy_id, "敌人 怪物 Boss 首领 弱点 伤害倍率 抗性 属性"], record_id)

    # Boss/field scaling table, including HP, poise and status multipliers.
    scale = enemy_data.get("scale", {})
    scale_columns = scale.get("columns", [])
    for index, row in enumerate(scale.get("rows", [])):
        values = [f"{label}：{compact(value)}" for label, value in zip(scale_columns, row) if value not in (None, "")]
        title = f"首领与敌人倍率｜{compact(row[0]) if row else '未知'}｜{compact(row[1]) if len(row) > 1 else ''}"
        add(records, "enemy_scale", title, title + "｜" + "；".join(values), "public/enemy-data.json → scale",
            ["首领 Boss 夜王 HP 生命值 人数倍率 韧性 异常抗性", *[compact(v) for v in row[:3]]], f"enemy-scale:{index + 1}")

    # All item data, keeping original names and keys for reliable search.
    item_data = load_public("items_data.json")
    for item_id, item in item_data.get("items", {}).items():
        parts = [f"物品ID：{item_id}", f"内部键：{item.get('key', '')}", f"类型：{item.get('type', '')}"]
        if item.get("name_zh"):
            parts.append(f"中文名：{item['name_zh']}")
        if item.get("name_ja"):
            parts.append(f"日文名：{item['name_ja']}")
        if item.get("name_en"):
            parts.append(f"英文名：{item['name_en']}")
        if item.get("color"):
            parts.append(f"颜色：{COLOR_ZH.get(item['color'], item['color'])}")
        title = item.get("name_zh") or item.get("name_en") or item.get("key") or f"物品 {item_id}"
        add(records, "item", f"物品｜{title}", "｜".join(parts), "public/items_data.json",
            [item_id, item.get("key", ""), item.get("name_en", ""), item.get("name_ja", ""), "道具 武器 装备"], f"item:{item_id}")

    # All effect IDs: merge QuickRef translations, curated Chinese definitions,
    # and the original EN/JP source fields without dropping any source details.
    effect_data = load_public("effects_data.json").get("effects", {})
    effect_zh = load_public("effect_names_zh.json")
    quickref = load_public("quickref_effects_zh.json").get("mappings", {})
    rules = load_public("relic_rule_effects.json").get("definitions", {})
    effect_glossary = load_public("effect_encyclopedia.json")
    glossary_labels = {group["id"]: group["label"] for group in effect_glossary.get("categories", [])}
    glossary_sources = {group["id"]: group["sourceFile"] for group in effect_glossary.get("categories", [])}
    glossary_by_id: dict[str, list[str]] = {}
    for entry in effect_glossary.get("entries", []):
        effect_id = str(entry["id"])
        category = entry["category"]
        label = glossary_labels[category]
        glossary_by_id.setdefault(effect_id, []).append(label)
        fields = [f"词条ID：{effect_id}", f"词条中文名：{entry['name']}", f"所属类别：{label}"]
        for field_label, value in (("类型", entry.get("type")), ("说明", entry.get("explanation")),
                                   ("叠加规则", entry.get("stackability")), ("负面词条", entry.get("buffType"))):
            if value:
                fields.append(f"{field_label}：{value}")
        add(records, "effect", f"遗物词条｜{entry['name']}｜{label}", "｜".join(fields),
            f"public/effect_encyclopedia.json → {glossary_sources[category]}",
            [effect_id, entry["name"], label, entry.get("type", ""), entry.get("explanation", "")],
            f"effect-glossary:{category}:{effect_id}")
    for effect_id, entry in effect_data.items():
        translation = effect_zh.get(str(effect_id), {})
        quick = quickref.get(str(effect_id), {})
        rule = rules.get(str(effect_id), {})
        name = (translation.get("name_zh") or quick.get("name_zh") or rule.get("name")
                or entry.get("name_en") or entry.get("key", ""))
        detail = (quick.get("explanation_zh") or rule.get("explanation")
                  or translation.get("category_zh") or entry.get("stackNotes") or "")
        translation_category = translation.get("category_zh", "")
        if translation_category and re.search(r"[+＋%％]\s*\d|\d\s*[+＋%％]", translation_category):
            translation_category = ""
        fields = [f"词条ID：{effect_id}", f"词条中文名：{name}"]
        for label, value in (
            ("类别", quick.get("category_zh") or rule.get("type") or translation_category),
            ("说明", detail),
            ("叠加规则", translation.get("stackability_zh") or quick.get("stackability_zh") or rule.get("stackability")),
            ("关联物品或补充说明", translation.get("explanation_zh")),
            ("所属类别", "、".join(dict.fromkeys(glossary_by_id.get(str(effect_id), [])))),
            ("生效模式", "、".join(rule.get("modes", []))),
            ("英文名", entry.get("name_en")), ("日文名", entry.get("name_ja")),
            ("内部键", entry.get("key")), ("原始叠加备注", entry.get("stackNotes")),
        ):
            if value:
                fields.append(f"{label}：{value}")
        title = f"遗物词条｜{name}"
        add(records, "effect", title, "｜".join(fields), "public/effects_data.json + Chinese translation files",
            [effect_id, entry.get("name_en", ""), entry.get("name_ja", ""), entry.get("key", ""), name, detail,
             *glossary_by_id.get(str(effect_id), [])], f"effect:{effect_id}")

    # Include curated rule definitions even if not present in effects_data.
    for effect_id, rule in rules.items():
        if effect_id in effect_data:
            continue
        title = f"遗物词条｜{rule.get('name', effect_id)}"
        content = "｜".join(filter(None, [f"词条ID：{effect_id}", f"名称：{rule.get('name', '')}",
                                           f"类型：{rule.get('type', '')}", f"说明：{rule.get('explanation', '')}",
                                           f"叠加：{rule.get('stackability', '')}", f"生效：{'、'.join(rule.get('modes', []))}"]))
        add(records, "effect", title, content, "public/relic_rule_effects.json",
            [effect_id, rule.get("name", ""), rule.get("explanation", ""), "遗物词条"], f"effect-rule:{effect_id}")

    # Relic catalog includes source pages for traceability.
    for key, item in load_public("relic_catalog_zh.json").get("items", {}).items():
        name = item.get("name_zh") or key
        content = "｜".join(filter(None, [f"遗物名称：{name}", f"内部键：{key}", f"类别：{item.get('category', '')}",
                                           f"来源页面：{item.get('source_page', '')}"]))
        add(records, "relic", f"遗物图鉴｜{name}", content, "public/relic_catalog_zh.json",
            [key, name, item.get("category", ""), "遗物 圣遗物"], f"relic:{key}")

    vessels = load_public("vessels_data.json")
    for character_key, details in vessels.get("characters", {}).items():
        character = CHARACTER_ZH.get(character_key, character_key)
        name_en = details.get("nameEn", "")
        vessels_list = details.get("vessels", {})
        names = [_vessel_name(key, character) for key in vessels_list]
        title = f"渡夜者｜{character}"
        add(records, "character", title, f"{title}｜英文名：{name_en}｜专属供具共 {len(names)} 个：{'、'.join(names)}",
            "public/vessels_data.json", [character_key, character, name_en, "角色 渡夜者 专属供具"], f"character:{character_key}")
        for vessel_key, vessel in vessels_list.items():
            normal = _slot_colors(vessel.get("normalSlots", []))
            deep = _slot_colors(vessel.get("deepSlots", []))
            vessel_name = _vessel_name(vessel_key, character)
            title = f"角色供具｜{character}｜{vessel_name}"
            content = f"{title}｜普通遗物槽位：{normal}｜深夜遗物槽位：{deep}｜注意普通与深夜槽位配置分别计算。"
            add(records, "vessel", title, content, "public/vessels_data.json",
                [character_key, character, name_en, vessel_key, vessel_name, "供具 槽位 普通 深夜 颜色"],
                f"vessel:{character_key}:{vessel_key}")
    for vessel in vessels.get("universalVessels", []):
        key = vessel.get("key", "")
        name = VESSEL_ZH.get(key, key)
        title = f"通用供具｜{name}"
        content = f"{title}｜英文名：{vessel.get('nameEn', '')}｜普通遗物槽位：{_slot_colors(vessel.get('normalSlots', []))}｜深夜遗物槽位：{_slot_colors(vessel.get('deepSlots', []))}"
        add(records, "vessel", title, content, "public/vessels_data.json",
            [key, name, vessel.get("nameEn", ""), "通用供具 槽位 普通 深夜"], f"universal-vessel:{key}")

    # Enemy portraits make the image map searchable by enemy ID.
    for enemy_id, image_path in load_public("enemy-image-map.json").items():
        add(records, "enemy_image", f"敌人图片映射｜ID {enemy_id}", f"敌人ID：{enemy_id}｜本地图片：{image_path}",
            "public/enemy-image-map.json", [enemy_id, "敌人 图片 头像"], f"enemy-image:{enemy_id}")

    # Only the explicit game knowledge file belongs in the assistant's corpus.
    # Project requirements, architecture notes and old decisions are not game facts.
    filename = "NIGHTREIGN_KNOWLEDGE.md"
    path = DOCS / filename
    if path.exists():
        text = re.sub(r"<!--.*?-->", "", path.read_text(encoding="utf-8"), flags=re.DOTALL)
        sections = re.split(r"(?m)^##\s+", text)
        for section in sections[1:]:
            lines = section.strip().splitlines()
            if not lines:
                continue
            title = lines[0].strip()
            body = "\n".join(lines[1:]).strip()
            if not title or not body or title == "资料标题":
                continue
            add(records, "manual_knowledge", f"补充游戏资料｜{title}", f"{title}\n{body}",
                f"docs/{filename}", [title, "玩家补充资料 黑夜君临"], f"manual:{title}")

    return records


def _vessel_name(key: str, character: str = "") -> str:
    if key in {"sacredErdtreeGrail", "spiritTreeGrail", "giantTreeGrail", "scadutreeGrail"}:
        return VESSEL_ZH.get(key, key)
    label = VESSEL_ZH.get(key, key)
    prefixes = {"sootCoveredUrn": "熏黑的", "sealedUrn": "封印的", "decrepitGoblet": "破旧的", "forgottenGoblet": "被遗忘的"}
    if key in prefixes:
        return f"{prefixes[key]}{character}{'器皿' if 'Urn' in key else '杯盅'}"
    return f"{character}{label}" if character else label


def _slot_colors(colors: list[str]) -> str:
    return "/".join(COLOR_ZH.get(color, "未知") for color in colors)


def main() -> None:
    records = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="\n") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"已生成 {OUTPUT.relative_to(ROOT)}：{len(records)} 条记录")
    counts: dict[str, int] = {}
    for record in records:
        counts[record["category"]] = counts.get(record["category"], 0) + 1
    for category, count in sorted(counts.items()):
        print(f"  {category}: {count}")


if __name__ == "__main__":
    main()
