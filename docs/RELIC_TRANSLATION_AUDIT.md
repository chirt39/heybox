# 遗物词条中文显示核查

日期：2026-10-18。本次只修正显示名称，不修改效果数值、评分或局内／局外资格。

流派候选库 `relic_rule_effects.json` 的 531 个 ID 均已有中文。添加提示此前丢失 ID，导致回退到英文；已保留 ID，并增加同键中文回退。

在 `effects_data.json` 的 6000000–7999999 遗物 ID 范围发现 20 个缺少直接中文映射的记录，补充如下。英文译写项尚未核对官方游戏译名；已有数据的来源与许可记录保持原样。此次未从外站引入资料。

| ID | 本地英文名称 | 显示中文 | 依据 |
| --- | --- | --- | --- |
| 6623200 | Greenspill Crystal Tear In Possession At Start Of Expedition | 出击时，会持有“绿涌结晶露滴” | 本地 effects_data.json 英文名称译写 |
| 7001403 | Physical Attack Up Plus 3 | 提升物理攻击力＋３ | 同键现有中文记录 6001400 |
| 7001409 | Physical Attack Up | 提升物理攻击力 | 同键现有中文记录 7001400 |
| 7006001 | Improved Stance Breaking When Two Handing | 提升双手共持时，造成失去平衡的能力＋１ | 同键现有中文记录 6006000 |
| 7006101 | Improved Stance Breaking When Wielding Two Armaments | 提升双手各持时，造成失去平衡的能力＋１ | 同键现有中文记录 6006100 |
| 7006300 | Improved Affinity Damage Negation | 提升属性减伤率 | 同键现有中文记录 6611100 |
| 7035410 | Gesture Crossed Legs Builds Up Madness | 通过肢体动作“盘腿坐”，能累积发狂量表 | 同键现有中文记录 7035400 |
| 7035510 | Madness Continually Recovers Fp | 引发异常状态发狂后，能持续恢复专注值 | 同键现有中文记录 7035500 |
| 7121001 | Small Pouch In Possession At Start Of Expedition | 出击时，会持有“小型随身包包” | 同键现有中文记录 7121000 |
| 7126001 | Starlight Shards In Possession At Start Of Expedition | 出击时，会持有“星光碎片” | 同键现有中文记录 7126000 |
| 7126002 | Starlight Shards In Possession At Start Of Expedition | 出击时，会持有“星光碎片” | 同键现有中文记录 7126000 |
| 7332500 | Improved Greatbow Attack Power | 提升大弓的攻击力 | 本地 effects_data.json 英文名称译写 |
| 7332600 | Improved Crossbow Attack Power | 提升弩的攻击力 | 本地 effects_data.json 英文名称译写 |
| 7332700 | Improved Ballista Attack Power | 提升弩炮的攻击力 | 本地 effects_data.json 英文名称译写 |
| 7342500 | Hp Restoration Upon Greatbow Attacks | 以大弓攻击时，恢复血量 | 本地 effects_data.json 英文名称译写 |
| 7342600 | Hp Restoration Upon Crossbow Attacks | 以弩攻击时，恢复血量 | 本地 effects_data.json 英文名称译写 |
| 7342700 | Hp Restoration Upon Ballista Attacks | 以弩炮攻击时，恢复血量 | 本地 effects_data.json 英文名称译写 |
| 7352500 | Fp Restoration Upon Greatbow Attacks | 以大弓攻击时，恢复专注值 | 本地 effects_data.json 英文名称译写 |
| 7352600 | Fp Restoration Upon Crossbow Attacks | 以弩攻击时，恢复专注值 | 本地 effects_data.json 英文名称译写 |
| 7352700 | Fp Restoration Upon Ballista Attacks | 以弩炮攻击时，恢复专注值 | 本地 effects_data.json 英文名称译写 |
