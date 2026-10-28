"""从用户指定的 Biligame 遗物总览生成静态中文名与图标映射。

只接受显式名称映射；Wiki 顺序变化或新增条目不会自动配错图。
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
IMAGE_DIR = DIST / "relic-images"
SOURCE_URL = "https://wiki.biligame.com/nightreign/%E9%81%97%E7%89%A9%E6%80%BB%E8%A7%88"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; NightreignAtlas/1.0)", "Referer": SOURCE_URL}
SUPPLEMENTAL = {
    "oldPocketwatch": {
        "name_zh": "老旧怀表",
        "category": "特殊遗物",
        "source_page": "https://5gamers.com/zh-CN/elden-ring-nightreign/item/old-pocketwatch",
        "source_image": "https://img.5gamers.com/elden-ring-nightreign/item-old-pocketwatch.png",
    },
    "fellOmenFetish": {
        "name_zh": "恶兆妖鬼的诅咒物",
        "category": "特殊遗物",
        "source_page": "https://5gamers.com/zh-CN/elden-ring-nightreign/item/fell-omen-fetish",
        "source_image": "https://img.5gamers.com/elden-ring-nightreign/item-fell-omen-fetish.png",
    },
}

# 与 ERN_RelicForge items_data.json 的 item.key 精确对照。
EXCLUSIVE = {
    "深灰色砥石": "slateWhetstone", "银色泪滴": "silverTear",
    "追踪者的耳环": "theWyldersEarring", "碎裂的魔女胸针": "crackedWitchsBrooch",
    "石桩": "stoneStake", "套书的第三册": "thirdVolume",
    "魔女胸针": "witchsBrooch", "裂开的封蜡": "crackedSealingWax",
    "圣律刀": "edgeOfOrder", "祝福铁币": "blessedIronCoin",
    "头冠的徽章": "crownMedal", "金色露珠": "goldenDew",
    "断裂编绳": "tornBraidedCord", "黑爪项链": "blackClawNecklace",
    "肮脏相框": "besmirchedFrame", "小型化妆工具": "smallMakeupBrush",
    "老旧袖珍画": "oldPortrait", "似骨石": "boneLikeStone",
    "黑夜痕迹": "vestigeOfNight", "受赐福的花": "blessedFlowers",
    "黄金嫩芽": "goldenSprout", "清净泪滴": "cleansingTear",
    "记录“致继承人”": "noteMyDearSuccessor", "玻璃项链": "glassNecklace",
    "单眼镜的皮革袋": "leatherMonocleCase",
}
NIGHTLORD = {
    "野兽的黑夜": "nightOfTheBeast", "爵的黑夜": "nightOfTheBaron",
    "智的黑夜": "nightOfTheWise", "深海的黑夜": "nightOfTheFathom",
    "魔的黑夜": "nightOfTheDemon", "猎人的黑夜": "nightOfTheChampion",
    "雾霾的黑夜": "nightOfTheMiasma", "王的黑夜": "nightOfTheLord",
    "安定者的遗志": "theWillOfTheBalancers", "废弃物之夜": "theNightOfDregs",
}
EVERDARK = {
    "野兽的暗夜": "darkNightOfTheBeast", "爵的暗夜": "darkNightOfTheBaron",
    "智的暗夜": "darkNightOfTheWise", "深海的暗夜": "darkNightOfTheFathom",
    "魔的暗夜": "darkNightOfTheDemon", "猎人的暗夜": "darkNightOfTheChampion",
    "雾霾的暗夜": "darkNightOfTheMiasma", "安定的遗志": "theWillOfTheBalance",
}

QUALITY = {"细腻": "Delicate", "端正": "Polished", "辽阔": "Grand"}
SCENE = {"幽静": "Tranquil", "水滴": "Drizzly", "光耀": "Luminous", "火燃": "Burning"}


def key_for(name: str, category: str) -> str | None:
    if category == "角色专属":
        return EXCLUSIVE.get(name)
    if category == "黑夜王":
        return NIGHTLORD.get(name)
    if category == "永夜王":
        return EVERDARK.get(name)
    if category in ("随机", "深夜"):
        for quality_zh, quality_en in QUALITY.items():
            for scene_zh, scene_en in SCENE.items():
                expected = f"{quality_zh}的{scene_zh}{'暗淡' if category == '深夜' else ''}情景"
                if name == expected:
                    return f"{'deep' if category == '深夜' else ''}{quality_en}{scene_en}Scene" if category == "深夜" else f"{quality_en.lower()}{scene_en}Scene"
    return None


def original_image(thumbnail: str) -> str:
    # MediaWiki 缩略图路径中的原文件路径，保留相同文件名与散列。
    return thumbnail.replace("/thumb/", "/", 1).split("/30px-", 1)[0]


def fetch_image(record: dict) -> tuple[str, int]:
    headers = HEADERS if record["source_page"].startswith("https://wiki.biligame.com/") else {"User-Agent": HEADERS["User-Agent"]}
    response = requests.get(record["source_image"], headers=headers, timeout=30)
    response.raise_for_status()
    if not response.headers.get("Content-Type", "").startswith("image/png"):
        raise ValueError(f"Unexpected image type for {record['name_zh']}")
    target = IMAGE_DIR / f"{record['key']}.png"
    target.write_bytes(response.content)
    return record["key"], len(response.content)


def main() -> None:
    response = requests.get(SOURCE_URL, headers=HEADERS, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.content, "html.parser")
    container = soup.select_one(".BOX-2-1")
    if container is None:
        raise RuntimeError("Wiki overview structure changed")
    sections = container.find_all("div", class_="BOX-N", recursive=False)
    categories = ["角色专属", "黑夜王", "永夜王", "随机", "深夜"]
    if len(sections) != len(categories):
        raise RuntimeError("Wiki category count changed")

    catalog: dict[str, dict] = {}
    unpaired: list[str] = []
    for section, category in zip(sections, categories):
        for box in section.select(".BOX-AN-25"):
            label = box.select_one(".BOX-AN2")
            image = box.select_one("img")
            anchor = box.select_one("a[href]")
            if not label or not image or not anchor:
                continue
            name = label.get_text(strip=True)
            key = key_for(name, category)
            if key is None:
                unpaired.append(name)
                continue
            if key in catalog:
                raise RuntimeError(f"Duplicate catalog key: {key}")
            catalog[key] = {
                "key": key,
                "name_zh": name,
                "category": category,
                "image": f"./relic-images/{key}.png",
                "source_page": urljoin(SOURCE_URL, anchor["href"]),
                "source_image": original_image(image["src"]),
            }

    if len(catalog) != 67:
        raise RuntimeError(f"Biligame mapping changed: {len(catalog)} entries")
    for key, extra in SUPPLEMENTAL.items():
        if key in catalog:
            raise RuntimeError(f"Supplemental key duplicates Biligame: {key}")
        catalog[key] = {"key": key, "image": f"./relic-images/{key}.png", **extra}

    item_data = json.loads((DIST / "items_data.json").read_text("utf-8"))["items"]
    relic_keys = {v["key"] for v in item_data.values() if v.get("type") in {"Relic", "DeepRelic", "UniqueRelic"}}
    unknown_keys = sorted(relic_keys - catalog.keys())
    unexpected_keys = sorted(catalog.keys() - relic_keys)
    if unexpected_keys:
        raise RuntimeError(f"Catalog keys absent from item data: {unexpected_keys}")
    if len(catalog) != 69 or unknown_keys:
        raise RuntimeError(f"Mapping changed: {len(catalog)} mapped, {unknown_keys} unmatched")

    IMAGE_DIR.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(fetch_image, rec) for rec in catalog.values()]
        total_bytes = sum(f.result()[1] for f in as_completed(futures))
    output = {
        "source": SOURCE_URL,
        "supplemental_sources": [entry["source_page"] for entry in SUPPLEMENTAL.values()],
        "source_updated": "2025-12-30",
        "mapped_key_count": len(catalog),
        "unmapped_keys": unknown_keys,
        "overview_items_without_catalog_key": unpaired,
        "items": catalog,
    }
    (DIST / "relic_catalog_zh.json").write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"mapped={len(catalog)} unmatched={unknown_keys} images={len(futures)} bytes={total_bytes}")


if __name__ == "__main__":
    main()
