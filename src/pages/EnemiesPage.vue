<script setup>
defineProps({ active: Boolean });
</script>

<template>
<section id="view-enemies" class="view" :class="{ active }">
          <div class="page-intro"><p class="eyebrow">BESTIARY / MONSTER ARCHIVE</p><h1>图鉴</h1><p>按名称、分类、区域或遭遇 ID 筛选敌人，比较生命值、伤害倍率与异常状态抗性。</p></div>
          <div class="toolbar"><label class="search-field"><span>⌕</span><input id="enemy-search" type="search" placeholder="搜索怪物名称、ID 或分类" autocomplete="off"></label><select id="enemy-filter" aria-label="怪物分类"><option value="all">全部敌人</option></select><select id="enemy-area" aria-label="出现区域与遭遇"><option value="all">全部区域 / 遭遇</option></select><span class="result-count" id="enemy-count">载入中…</span></div>
          <div class="enemy-layout"><div class="enemy-list-column"><div class="enemy-list" id="enemy-list" aria-label="怪物列表"></div><div id="enemy-pagination" class="pagination enemy-pagination" aria-label="怪物页数" hidden></div></div><article class="enemy-detail" id="enemy-detail"><div class="empty-state"><span>⚔</span><h3>选择一名敌人</h3><p>属性、抗性和可核对的出现位置会显示在这里。</p></div></article></div>
        </section>
</template>
