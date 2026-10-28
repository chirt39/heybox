<script setup>
defineProps({ active: Boolean });
</script>

<template>
<section id="view-relics" class="view" :class="{ active }">
          <div class="page-intro"><p class="eyebrow">RELIC VAULT / LOCAL ONLY</p><h1>遗物仪式</h1><p>读取你的 <code>NR0000.sl2</code>，列出所有遗物及其每条效果。文件只在当前设备内解析。</p></div>
          <label class="drop-zone" id="drop-zone" for="save-file"><span class="drop-icon">◇</span><strong>将存档拖到这里，或点击选择文件</strong><span>支持 .sl2 · 不上传 · 不修改原存档</span><input id="save-file" type="file" accept=".sl2,application/octet-stream" hidden></label>
          <p class="hint">常见路径：<code>AppData/Roaming/Nightreign/SteamID/NR0000.sl2</code>。请在游戏关闭或存档同步完成后读取。</p>
          <div id="save-status" class="status-line" role="status" aria-live="polite">尚未选择存档</div>
          <div id="relic-dashboard" hidden><div class="stat-row"><div class="stat-card"><span>遗物总数</span><strong id="relic-total">0</strong></div><div class="stat-card"><span>普通遗物</span><strong id="relic-normal">0</strong></div><div class="stat-card"><span>深夜遗物</span><strong id="relic-deep">0</strong></div><div class="stat-card"><span>独特遗物</span><strong id="relic-unique">0</strong></div></div><div class="toolbar"><label class="search-field"><span>⌕</span><input id="relic-search" type="search" placeholder="搜索遗物名、词条或 ID"></label><select id="relic-category" aria-label="词条类型"><option value="all">全部词条类型</option></select><select id="relic-type" aria-label="遗物模式"><option value="all">普通 / 深夜</option><option value="normal">普通（含独特）</option><option value="deep">深夜</option></select><select id="relic-color" aria-label="遗物颜色"><option value="all">全部颜色</option><option value="Red">红色</option><option value="Blue">蓝色</option><option value="Yellow">黄色</option><option value="Green">绿色</option><option value="Any">任意色</option></select><span class="result-count" id="relic-count"></span></div><div id="relic-pagination" class="pagination relic-pagination-top" aria-label="遗物页数" hidden></div><div id="relic-list" class="relic-grid"></div></div>
        </section>
</template>
