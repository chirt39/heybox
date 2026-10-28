<script setup>
defineProps({ active: Boolean });
</script>

<template>
<section id="view-sources" class="view" :class="{ active }"><div class="page-intro"><p class="eyebrow">SOURCES / METHODOLOGY</p><h1>资料与方法</h1><p>公开每一类资料的来源，并说明哪些数据暂时缺失。</p></div><div class="source-grid"><article class="source-card"><span class="card-kicker">SAVE PARSER / OPTIMIZER</span><h3>存档解析与推荐算法</h3><p>浏览器内的存档解密、遗物识别、槽位与组合计算基于 ERN_RelicForge 的开源实现，按 MIT 许可使用。</p><a href="https://github.com/cetusk/ERN_RelicForge" target="_blank" rel="noopener noreferrer">ERN_RelicForge ↗</a></article><article class="source-card"><span class="card-kicker">CHINESE EFFECT NAMES</span><h3>中文词条</h3><p>中文名称和说明优先参考夜之数据 Wiki，缺失项补充 NightreignQuickRef。仍未对应的词条显示英文或日文与 ID；QuickRef 数据按原项目 GPLv3 许可标注。</p><a href="https://xxiixi.github.io/NightreignQuickRef/" target="_blank" rel="noopener noreferrer">NightreignQuickRef ↗</a></article></div></section>
</template>
