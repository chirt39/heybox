# 数据来源与核对台账

现有 [README](../README.md) 记录了主要资料来源；本文件将其转成可执行的核对要求。外部网页、截图和表格是证据，不是覆盖游戏版本与全部怪物的保证。

| 数据集 | 当前静态文件／代码 | 现有来源 | 必须核对的事项 |
| --- | --- | --- | --- |
| 怪物属性与抗性 | `public/enemy-data.json` | 夜之数据 Wiki、用户提供的 Boss 倍率表 | ID、同名变体、魔火雷圣倍率、异常抗性、遭遇位置、版本 |
| 遗物基础数据 | `public/items_data.json`、`public/relic_catalog_zh.json` | ERN_RelicForge、Biligame、5gamers | 道具 key、中文名、图片、普通／深夜／独特、专属或夜王类型 |
| 词条与分类 | `public/effects_data.json`、`public/effect_names_zh.json`、`public/quickref_effects_zh.json`、`public/relic_rule_effects.json`、`public/effect_encyclopedia.json` | 夜之数据 Wiki、NightreignQuickRef（图鉴快照固定为提交 `3e23450094c18125ae5665927ed240b18189a040`） | 原始效果 ID、等级、中文文案、局内／局外、深夜局内／深夜局外、负面配对、可叠加性 |
| 器皿 | `public/vessels_data.json` | ERN_RelicForge、人工中文对照 | 槽位顺序、颜色、角色限制 |
| 存档结构与战绩 | `public/relic-parser.js`、`public/save-editor.js` | 当前实现、游戏样本、逆向证据 | 文件版本、字段偏移、类型、数值边界、与游戏画面逐项一致 |
| 图片 | `public/relic-images/`、`public/character-images/`、`public/nav-icons/` | 用户提供与第三方页面 | 一一对应、来源、许可、缺失时的替代图 |

每条新增或修正记录至少登记：稳定 ID、中文显示名、原始值、来源 URL 或本地样本代号、游戏版本、核对日期、核对人、状态（待核对／已核对／有争议）。推断值必须注明推断方法。没有依据时显示“未收录”，不得用 0 冒充缺失值。

## 样本管理

真实存档只在授权的本地核对环境使用，不入 Git、不上传到公开站点或任务附件。需要共享回归用例时，制作最小脱敏样例并记录生成方法。用户截图仅用于字段对照，不用截图中的数值推断其他存档的通用偏移。

## 许可与发布门槛

保留仓库中的 ERN_RelicForge MIT 与 NightreignQuickRef GPLv3 许可文本。第三方图片和数据在 GitHub 再分发前由数据对话与工程对话逐项检查许可或授权；不能确认时，记录缺口并使用可替代素材。资料说明页应链接原始来源并标示数据快照版本。
