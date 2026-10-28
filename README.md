# 渡夜图鉴

黑夜君临的非官方网站，提供怪物参数查询、浏览器本地 `.sl2` 遗物解析与基于已拥有遗物的组合推荐。

## 项目重新整理

本仓库以 2026-10-17 恢复的线上 v41 文件为初始基线；该版本的页面内容与先前 v36 回退目标一致。原有功能保留，准确性与完整度按需求文档逐项验收，不以“已存在代码”代替验证。当前网站仍由 Sites 发布；GitHub 作为后续协作的主仓库，发布同步流程见 [路线图](docs/ROADMAP.md)。

从 [项目状态](docs/STATUS.md) 和 [项目需求](docs/REQUIREMENTS.md) 开始阅读；[架构](docs/ARCHITECTURE.md)、[数据来源](docs/DATA.md)、[评分规则](docs/SCORING.md)、[质量与验收](docs/QUALITY.md)、[任务与阶段](docs/ROADMAP.md)、[对话分工](docs/WORKSTREAMS.md) 和 [决策记录](docs/DECISIONS.md) 分别说明各专项工作。协作规则见 [AGENTS.md](AGENTS.md)。

## 数据范围

- 敌人：1,725 条参数记录；生命值、伤害倍率、异常状态抗性等来自 [夜之数据 Wiki](https://yanweiyuan3.github.io/nightreign-wiki/#/overview)。同名 Boss 表能匹配时显示遭遇类别。原资料没有逐只怪物的完整掉落和位置清单；本站将缺失值明确标成“未收录”。
- 存档：解析功能与推荐算法基于 [ERN_RelicForge](https://github.com/cetusk/ERN_RelicForge) 的 MIT 开源实现。所有解析与计算在访客浏览器中完成；本站没有接收存档的后端接口。
- 中文词条：优先参考夜之数据 Wiki，缺失项参考 [NightreignQuickRef](https://xxiixi.github.io/NightreignQuickRef/) 的公开资料。未映射的词条仍显示原文和 ID。
- 遗物中文名与图标：对照 [Biligame 遗物总览](https://wiki.biligame.com/nightreign/%E9%81%97%E7%89%A9%E6%80%BB%E8%A7%88)，以 `item.key` 建立 67 种遗物的一一对应。总览未列出 `oldPocketwatch` 与 `fellOmenFetish`；这两件的中文名及图标分别补充自 [5gamers 老旧怀表](https://5gamers.com/zh-CN/elden-ring-nightreign/item/old-pocketwatch) 与 [5gamers 恶兆妖鬼的诅咒物](https://5gamers.com/zh-CN/elden-ring-nightreign/item/fell-omen-fetish)，共对应 69 种遗物。图标素材来源链接保存在 `public/relic_catalog_zh.json` 中。
- 组合页：解析结果在当前浏览器标签页的会话存储中保留，刷新后仍能查看；可随时清除。供具中文类型参照[游民星空供具资料](https://www.gamersky.com/handbook/202506/1937870.shtml)。点击左侧槽位后，右侧只显示类型和颜色匹配的遗物；点击遗物即可装配，也可拖拽。普通槽位位于深夜槽位上方，预览和推荐不会修改原存档。遗物列表可按页码跳转。
- 遗物展示：使用存档的原始词条分组与顺序；深夜遗物的负面词条紧跟同组主词条。角色选择器的图像来自 [Biligame 渡夜者资料](https://wiki.biligame.com/nightreign/%E6%B8%A1%E5%A4%9C%E8%80%85%E6%80%BB%E8%A7%88)，隐士图像来自 [Bandai Namco 官方角色页](https://en.bandainamcoent.eu/elden-ring/elden-ring-nightreign/characters)。站点标识使用用户提供的图片。
- 遗物筛选：支持关键字、词条类型、普通／深夜和颜色。词条类型以 NightreignQuickRef 的分类为准，优先按效果 ID 匹配；同效果的其他等级按唯一效果键或名称匹配，剩余词条使用明确的中文名称规则分类，无法可靠分类的列入“其他／未分类”。普通模式包含独特遗物。

## 推荐评分

以下是网站当前的推荐评分策略，供筛选组合使用，并非游戏内伤害或收益公式；最终权重仍待玩家验收。必选、偏好、加分可参考 100／10／1 设置，实际按流派规则中填写的权重计分；排除项每出现一次扣除其规则权重，并使方案不满足全部条件。先按必选覆盖排序，再比较分数。同一件遗物命中两个不同目标词条时，每一对额外加 5。可叠加词条每次计完整权重；条件叠加词条第一次计完整权重，之后每个有效重复计 70%；不可叠加词条最多计一次。用户设置的“有效次数”限制可叠加和条件叠加的计分次数，不会让不可叠加词条重复得分。没有设为排除项的负面词条不会自动扣分。装配预览的“匹配分”只计算目标词条是否出现，是简化指标，与推荐分不同。

## 运行

前端使用 Vue 3、JavaScript 和 Vite 7.3.7。需要 Node.js 20.19+ 或 22.12+；Node.js 18 不受支持，可能因缺少 `crypto.hash` 导致启动失败。运行以下命令前，先在项目根目录安装锁文件指定的依赖：

```sh
npm ci
```

启动本地开发服务器：

```sh
npm run dev
```

生成生产静态文件到 Sites 使用的 `dist` 目录：

```sh
npm run build
```

也可以用任意 HTTP 静态文件服务托管构建后的 `dist`；直接双击 `index.html` 可能因浏览器文件读取限制无法加载 JSON。Ubuntu 服务器可参考 [公网 IP + Nginx 静态部署指南](docs/UBUNTU_STATIC_DEPLOY.md)。当前迁移保留原有浏览器端功能脚本，页面交互将继续逐步迁入 Vue 组件。

## 许可与归属

ERN_RelicForge 的 MIT 许可见 `public/ERN_RelicForge_LICENSE.txt`；NightreignQuickRef 的 GPLv3 许可见 `public/NightreignQuickRef_LICENSE.txt`。游戏名称与相关商标归各自权利人所有。本站为玩家制作的非官方工具。

请勿将个人存档、解析出的收藏 JSON 或 Steam ID 加入公开静态资源目录。

若需要刷新遗物图鉴素材：安装 `requests` 与 `beautifulsoup4`，运行 `python scripts/sync_relic_catalog.py`。该脚本对映射数量和缺失项做显式校验，页面结构变化时会停止生成。
