<script setup>
defineProps({ active: Boolean });
</script>

<template>
  <section id="view-effects" class="view" :class="{ active }">
    <div class="page-intro">
      <p class="eyebrow">NIGHTREIGN / RELIC EFFECTS</p>
      <h1>词条图鉴</h1>
      <p>按局外、局内、深夜局外和深夜局内查找词条，查看效果说明与叠加信息。<a href="https://github.com/xxiixi/NightreignQuickRef/tree/3e23450094c18125ae5665927ed240b18189a040/src/data/zh-CN" target="_blank" rel="noreferrer">查看 NightreignQuickRef 中文资料 ↗</a></p>
    </div>
    <div class="effect-encyclopedia panel">
      <div class="effect-encyclopedia-categories" role="group" aria-label="词条所属类别">
        <button type="button" data-effect-category="all" aria-pressed="true">全部词条 <span></span></button>
        <button type="button" data-effect-category="normal-outside" aria-pressed="false">局外 <span></span></button>
        <button type="button" data-effect-category="normal-inside" aria-pressed="false">局内 <span></span></button>
        <button type="button" data-effect-category="deep-outside" aria-pressed="false">深夜局外 <span></span></button>
        <button type="button" data-effect-category="deep-inside" aria-pressed="false">深夜局内 <span></span></button>
      </div>
      <div class="effect-encyclopedia-toolbar">
        <label class="search-field"><span>⌕</span><input id="effect-encyclopedia-search" type="search" placeholder="搜索词条名称、说明或编号" aria-label="搜索遗物词条"></label>
        <select id="effect-encyclopedia-type" aria-label="按词条类型筛选"><option value="all">全部类型</option></select>
        <span id="effect-encyclopedia-count" class="result-count" aria-live="polite">正在载入词条…</span>
      </div>
      <div id="effect-encyclopedia-pagination" class="pagination effect-encyclopedia-pagination" aria-label="词条图鉴页数" hidden></div>
      <div id="effect-encyclopedia-list" class="effect-encyclopedia-list" aria-live="polite"></div>
      <p class="hint">分类与说明按 NightreignQuickRef 的四份原始词条表保留。同一编号若出现在多个表中，会分别显示。</p>
    </div>
  </section>
</template>
