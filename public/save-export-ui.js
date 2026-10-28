(function () {
  'use strict';
  function mount() {
    const dashboard = document.querySelector('#relic-dashboard');
    if (!dashboard || document.querySelector('#export-miniapp-save')) return false;
    const button = document.createElement('button');
    button.id = 'export-miniapp-save';
    button.type = 'button';
    button.className = 'button';
    button.textContent = '导出小程序本地数据';
    button.title = '导出遗物与战绩，不包含原始存档或账号标识';
    button.hidden = dashboard.hidden;
    dashboard.before(button);
    new MutationObserver(() => { button.hidden = dashboard.hidden; }).observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
    button.addEventListener('click', () => {
      try {
        const payload = window.NightreignSaveTransfer.compact(state.save);
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        if (blob.size > window.NightreignSaveTransfer.maximumBytes) throw new Error('导出数据超过小程序 8 MiB 上限。');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'nightreign-local-transfer.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setSaveStatus('已导出遗物与战绩，可在小程序本地导入；原始存档没有上传。');
      } catch (error) {
        setSaveStatus(error.message || String(error), true);
      }
    });
    return true;
  }
  if (!mount()) {
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
