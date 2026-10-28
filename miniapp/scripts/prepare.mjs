import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const miniappRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = resolve(miniappRoot, '..');
const generatedSource = join(miniappRoot, '.generated-src');
const generatedPublic = join(miniappRoot, '.generated-public');
const miniappIcon = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const miniappQuickNav = [
  ['enemies', '图鉴', '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20"/><path d="M9 7h7M9 10h7"/>'],
  ['relics', '遗物仪式', '<path d="m12 2.8 8.8 9.2-8.8 9.2L3.2 12z"/><path d="M12 7.2 16.6 12 12 16.8 7.4 12z"/>'],
  ['records', '远征日志', '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>'],
  ['builds', '遗物装配', '<path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z"/>'],
  ['effects', '词条图鉴', '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/>'],
  ['sources', '资料说明', '<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 0 1 4.6 1c0 1.7-2.3 2.1-2.3 3.8M12 17h.01"/>'],
].map(([view, label, paths]) => `<button type="button" data-go="${view}">${miniappIcon(paths)}<b>${label}</b><span class="heybox-home-nav-arrow" aria-hidden="true">↗</span></button>`).join('');

async function replaceGeneratedDirectory(source, destination, filter) {
  const withinMiniapp = relative(miniappRoot, destination);
  if (!withinMiniapp || withinMiniapp.startsWith('..') || isAbsolute(withinMiniapp)) {
    throw new Error('拒绝清理小程序目录之外的路径：' + destination);
  }
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, filter });
}

function safePublicAsset(source) {
  const name = source.toLowerCase();
  return !(/\.sl2(?:\.|$)/.test(name) || /\.html?$/.test(name) || /(?:^|[\\/])\.env(?:\.|$)/.test(name));
}

async function rewriteVue(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteVue(filename);
    } else if (entry.isFile() && entry.name.endsWith('.vue')) {
      const original = await readFile(filename, 'utf8');
      let updated = original.replace(/\bsrc="\/([^"]+)"/g, (_match, asset) => ':src="hbAsset(\'' + asset + '\')"');
      if (updated !== original) {
        updated = updated.replace('</script>', 'const hbAsset = name => import.meta.env.BASE_URL + name;\n</script>');
      }
      if (entry.name === 'App.vue') {
        updated = updated.replace(/script\.src = [^;]+;/, 'script.src = import.meta.env.BASE_URL + file;');
      }
      if (entry.name === 'OverviewPage.vue') {
        updated = updated.replace('<section class="home-agent panel">', '<section class="heybox-home-shortcuts" aria-labelledby="heybox-shortcuts-title"><div class="heybox-home-nav-heading"><div><p class="eyebrow">EXPEDITION ROUTES</p><h2 id="heybox-shortcuts-title">快速入口</h2></div><span>功能一览</span></div><nav class="heybox-home-nav" aria-label="快速导航">' + miniappQuickNav + '</nav></section>\n<section class="home-agent panel">');
      }
      if (entry.name === 'RelicsPage.vue') {
        updated = updated.replace(/<p class="hint">遗物中文名与图标对照[\s\S]*?<\/p>/, '');
      }
      updated = updated.replaceAll('存档始终留在你的浏览器中', '存档只在当前设备解析');
      updated = updated.replaceAll('文件只在当前浏览器内解析', '文件只在当前设备解析');
      updated = updated.replaceAll('仅在浏览器内调整', '仅在当前设备预览');
      await writeFile(filename, updated);
    }
  }
}

await replaceGeneratedDirectory(resolve(siteRoot, 'src'), generatedSource);
await replaceGeneratedDirectory(resolve(siteRoot, 'public'), generatedPublic, safePublicAsset);
await rewriteVue(generatedSource);

const publicStyle = join(generatedPublic, 'style.css');
const style = await readFile(publicStyle, 'utf8');
await writeFile(publicStyle, style.replace(/^@import url\('https:\/\/fonts\.googleapis\.com\/[^\n]+\n/m, ''));

const apiBase = (process.env.VITE_NIGHTREIGN_API_BASE || '').trim();
if (apiBase) {
  const url = new URL(apiBase);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_NIGHTREIGN_API_BASE 必须是 HTTPS 域名，不含路径、查询或凭据。');
  }
}
await writeFile(join(generatedPublic, 'ai-config.js'), 'window.NIGHTREIGN_AI_API_BASE = ' + JSON.stringify(apiBase) + ';\n');

const siteApp = join(generatedPublic, 'app.js');
const appCode = await readFile(siteApp, 'utf8');
const importHook = `
window.nightreignLoadTransfer = function (payload) {
  if (!state.items || !state.effects) throw new Error('图鉴资料尚未载入，请稍后再试。');
  const parsed = window.NightreignSaveTransfer.expand(payload, state.items, state.effects);
  state.saveEditor = null;
  state.saveFileName = null;
  invalidateBuildResults();
  showSave(parsed);
  state.equipped = { normal: [null, null, null], deep: [null, null, null] };
  state.selectedRelicIndex = null;
  renderBuildWorkspace();
  try { sessionStorage.setItem('nightreign-parsed-save-v2', JSON.stringify(parsed)); } catch (_) {}
  setSaveStatus('已从当前设备导入 ' + parsed.relics.length + ' 件遗物及战绩。原始存档未上传。');
};
`;
await writeFile(siteApp, appCode.replaceAll('存档在浏览器本地解析', '存档在当前设备本地解析') + importHook);

console.log('小程序已同步站点页面与静态资料。');
