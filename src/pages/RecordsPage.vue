<script setup>
defineProps({ active: Boolean });
</script>

<template>
<section id="view-records" class="view" :class="{ active }">
          <div class="page-intro"><p class="eyebrow">BATTLE RECORDS / LOCAL SAVE</p><h1>日志</h1><p>读取存档后，在此查看游戏内概要、渡夜者使用次数、夜王战绩、累计数据与深层区域纪录。数据仅在浏览器内解析。</p></div>
          <div id="records-empty" class="note-panel"><span class="note-icon">▣</span><div><strong>等待存档</strong><p>先在“遗物仪式”选择 NR0000.sl2。</p><button class="text-link button-link" data-go="relics">前往解析存档 ↗</button></div></div>
          <div id="records-panel" class="record-dashboard" hidden>
            <section class="record-panel"><header class="record-header"><span class="record-emblem" aria-hidden="true">♜</span><div><p class="eyebrow">RECORD / OVERVIEW</p><h2>战斗记录－概要</h2></div></header><div id="record-overview" class="record-list"></div></section>
            <div class="record-grid two"><section class="record-panel"><header class="record-header"><span class="record-emblem" aria-hidden="true">Ⅰ</span><div><p class="eyebrow">NIGHTFARERS</p><h2>渡夜者使用次数</h2></div></header><div id="record-characters" class="record-list"></div></section><section class="record-panel"><header class="record-header"><span class="record-emblem" aria-hidden="true">Ⅱ</span><div><p class="eyebrow">NIGHTLORDS</p><h2>夜王战绩</h2></div></header><div id="record-nightlords" class="record-list"></div></section></div>
            <section class="record-panel"><header class="record-header"><span class="record-emblem" aria-hidden="true">Ⅲ</span><div><p class="eyebrow">ALL EXPEDITIONS</p><h2>战斗记录－累计</h2></div></header><div class="record-grid two"><div><h3 class="record-subtitle">累计数据</h3><div id="record-total" class="record-list"></div></div><div><h3 class="record-subtitle">最高纪录</h3><div id="record-peak" class="record-list"></div></div></div></section>
            <section class="record-panel"><header class="record-header"><span class="record-emblem" aria-hidden="true">Ⅳ</span><div><p class="eyebrow">DEEP NIGHT</p><h2>战斗记录（深层区域）</h2></div></header><div class="record-grid two"><div><h3 class="record-subtitle">累计数据</h3><div id="record-deep-total" class="record-list"></div></div><div><h3 class="record-subtitle">最高纪录</h3><div id="record-deep-peak" class="record-list"></div></div></div></section>
            <p id="record-method" class="record-method"></p>
          </div>
        </section>
</template>
