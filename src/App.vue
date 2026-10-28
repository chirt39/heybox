<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import OverviewPage from './pages/OverviewPage.vue';
import EnemiesPage from './pages/EnemiesPage.vue';
import RelicsPage from './pages/RelicsPage.vue';
import RecordsPage from './pages/RecordsPage.vue';
import BuildsPage from './pages/BuildsPage.vue';
import SourcesPage from './pages/SourcesPage.vue';
import EffectsPage from './pages/EffectsPage.vue';

const labels = {
  overview: '圆桌厅堂',
  enemies: '图鉴',
  relics: '遗物仪式',
  records: '日志',
  builds: '遗物装配',
  effects: '词条图鉴',
  sources: '资料说明',
};
const currentView = ref(location.hash.slice(1) in labels ? location.hash.slice(1) : 'overview');
const sidebarOpen = ref(false);
const scriptsReady = ref(false);
const loadError = ref(false);
const classicScriptVersions = typeof __CLASSIC_SCRIPT_VERSIONS__ === 'undefined' ? null : __CLASSIC_SCRIPT_VERSIONS__;
const catalogJsonVersions = typeof __CATALOG_JSON_VERSIONS__ === 'undefined' ? null : __CATALOG_JSON_VERSIONS__;

function setView(view, updateUrl = true, restoreScrollY = null) {
  const nextView = view in labels ? view : 'overview';
  const changed = nextView !== currentView.value;
  if (updateUrl && changed) {
    history.replaceState({ ...history.state, view: currentView.value, scrollY: window.scrollY }, '', location.href);
  }
  currentView.value = nextView;
  if (updateUrl && location.hash !== `#${nextView}`) {
    if (changed) history.pushState({ ...history.state, view: nextView, scrollY: 0 }, '', `#${nextView}`);
    else history.replaceState({ ...history.state, view: nextView, scrollY: window.scrollY }, '', `#${nextView}`);
  }
  closeMobileNavigation(true);
  if (restoreScrollY !== null) {
    nextTick(() => window.scrollTo({ top: restoreScrollY, behavior: 'auto' }));
  } else if (changed || updateUrl) {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    window.scrollTo({ top: 0, behavior });
  }
}

function closeMobileNavigation(returnFocus = false) {
  if (!sidebarOpen.value) return;
  sidebarOpen.value = false;
  if (returnFocus) nextTick(() => document.getElementById('mobile-menu')?.focus());
}

function handleGlobalKeydown(event) {
  if (event.key !== 'Escape' || !sidebarOpen.value) return;
  event.preventDefault();
  closeMobileNavigation(true);
}

function handleShellClick(event) {
  if (event.target.closest('#mobile-menu')) {
    sidebarOpen.value = !sidebarOpen.value;
    return;
  }
  const hashLink = event.target.closest('a[href^="#"]');
  if (hashLink && !hashLink.matches('[data-view], [data-go]')) {
    const view = hashLink.getAttribute('href').slice(1);
    if (view in labels) {
      event.preventDefault();
      setView(view);
      return;
    }
  }
  const target = event.target.closest('[data-view], [data-go]');
  if (!target) return;
  const view = target.dataset.view || target.dataset.go;
  if (typeof window.navigateTo === 'function') window.navigateTo(view);
  else setView(view);
}

function handleNavigation(event) {
  setView(event.detail?.view);
}

function handleHashChange() {
  if (location.hash === '#main-content') return;
  setView(location.hash.slice(1), false);
}

function handlePopState(event) {
  if (location.hash === '#main-content') {
    const view = event.state?.view in labels ? event.state.view : currentView.value;
    setView(view, false, Number.isFinite(event.state?.scrollY) ? event.state.scrollY : 0);
    return;
  }
  setView(location.hash.slice(1), false, Number.isFinite(event.state?.scrollY) ? event.state.scrollY : 0);
}

function loadClassicScript(file) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `/${file}`;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`${file} 加载失败`));
    document.body.append(script);
  });
}

onMounted(async () => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState({ ...history.state, view: currentView.value, scrollY: window.scrollY }, '', location.href);
  if (!classicScriptVersions) {
    console.error('动态脚本版本配置缺失，页面功能无法启动。');
    loadError.value = true;
    return;
  }
  if (!catalogJsonVersions || typeof catalogJsonVersions !== 'object') {
    console.error('图鉴数据版本配置缺失，页面功能无法启动。');
    loadError.value = true;
    return;
  }
  window.NIGHTREIGN_CATALOG_VERSIONS = catalogJsonVersions;
  for (const [file, version] of Object.entries(classicScriptVersions)) {
    if (!version) {
      window.NIGHTREIGN_AI_API_BASE = window.NIGHTREIGN_AI_API_BASE || '';
      console.warn('AI API 配置脚本缺失，已使用当前站点默认 API 地址。');
      continue;
    }
    try {
      await loadClassicScript(`${file}?v=${version}`);
    } catch {
      if (file === 'ai-config.js') {
        window.NIGHTREIGN_AI_API_BASE = window.NIGHTREIGN_AI_API_BASE || '';
        console.warn('AI API 配置脚本未加载，将使用当前站点默认 API 地址；若 AI 服务不可用，对话界面会显示错误。');
        continue;
      }
      loadError.value = true;
      return;
    }
  }
  window.addEventListener('nightreign:navigate', handleNavigation);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handlePopState);
  document.addEventListener('keydown', handleGlobalKeydown);
  scriptsReady.value = true;
});

onUnmounted(() => {
  window.removeEventListener('nightreign:navigate', handleNavigation);
  window.removeEventListener('hashchange', handleHashChange);
  window.removeEventListener('popstate', handlePopState);
  document.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <main v-if="loadError" class="app-load-error" role="alert" tabindex="-1">
    <h1>页面未能完整加载</h1>
    <p>必要功能暂时无法启动，请刷新页面重试。</p>
  </main>
  <div v-else class="app-shell" :inert="!scriptsReady" :aria-busy="!scriptsReady" @click="handleShellClick">
    <a class="skip-link" href="#main-content">跳转到主要内容</a>
    <aside id="mobile-navigation" class="sidebar" :class="{ open: sidebarOpen }" aria-label="主导航">
      <a class="brand" href="#overview" aria-label="渡夜图鉴首页">
        <img class="brand-image" src="/nightreign-banner.png" alt="ELDEN RING NIGHTREIGN" />
        <span class="brand-caption">渡夜图鉴</span>
      </a>
      <div class="side-divider"></div>
      <p class="side-label">探索</p>
      <nav class="nav-list">
        <button class="nav-link" :class="{ active: currentView === 'overview' }" :aria-current="currentView === 'overview' ? 'page' : null" data-view="overview"><img class="nav-icon" src="/nav-icons/roundtable.webp" alt="" />圆桌厅堂</button>
        <button class="nav-link" :class="{ active: currentView === 'enemies' }" :aria-current="currentView === 'enemies' ? 'page' : null" data-view="enemies"><img class="nav-icon" src="/nav-icons/bestiary.webp" alt="" />图鉴 <b id="nav-enemy-count">—</b></button>
        <button class="nav-link" :class="{ active: currentView === 'relics' }" :aria-current="currentView === 'relics' ? 'page' : null" data-view="relics"><img class="nav-icon" src="/nav-icons/relic-rite.png" alt="" />遗物仪式</button>
        <button class="nav-link" :class="{ active: currentView === 'records' }" :aria-current="currentView === 'records' ? 'page' : null" data-view="records"><img class="nav-icon" src="/nav-icons/journal.png" alt="" />日志</button>
        <button class="nav-link" :class="{ active: currentView === 'builds' }" :aria-current="currentView === 'builds' ? 'page' : null" data-view="builds"><img class="nav-icon" src="/nav-icons/relic-equip.png" alt="" />遗物装配</button>
        <button class="nav-link" :class="{ active: currentView === 'effects' }" :aria-current="currentView === 'effects' ? 'page' : null" data-view="effects"><img class="nav-icon" src="/nav-icons/sources.png" alt="" />词条图鉴</button>
        <button class="nav-link" :class="{ active: currentView === 'sources' }" :aria-current="currentView === 'sources' ? 'page' : null" data-view="sources"><img class="nav-icon" src="/nav-icons/sources.png" alt="" />资料说明</button>
      </nav>
      <div class="side-bottom"><span class="pulse-dot"></span> 离线资料 · 本地解析<br /><small>存档始终留在你的浏览器中</small></div>
    </aside>

    <main id="main-content" class="main" tabindex="-1">
      <header class="topbar">
        <button id="mobile-menu" class="icon-button" type="button" :aria-label="sidebarOpen ? '关闭导航' : '打开导航'" :aria-expanded="sidebarOpen" aria-controls="mobile-navigation">☰</button>
        <span class="breadcrumb">ELDEN RING NIGHTREIGN <span>/</span> <b>{{ labels[currentView] }}</b></span>
        <div class="topbar-tools">
          <span class="topbar-right">非官方玩家工具 <i></i> 数据快照</span>
          <button id="feedback-suggestion-open" class="button ghost topbar-feedback" type="button">向我提建议</button>
        </div>
      </header>
      <div class="content">
        <OverviewPage :active="currentView === 'overview'" />
        <EnemiesPage :active="currentView === 'enemies'" />
        <RelicsPage :active="currentView === 'relics'" />
        <RecordsPage :active="currentView === 'records'" />
        <BuildsPage :active="currentView === 'builds'" />
        <EffectsPage :active="currentView === 'effects'" />
        <SourcesPage :active="currentView === 'sources'" />
      </div>
      <footer>渡夜图鉴 · 玩家制作的非官方工具</footer>
      <div id="feedback-background-status" class="feedback-background-status" role="status" aria-live="polite" aria-relevant="additions text"></div>
    </main>
  </div>
</template>
