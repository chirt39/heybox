import hbSDK from '@heybox/hb-sdk';
import { parseSave } from './local-save.js';

const apiBase = (import.meta.env.VITE_NIGHTREIGN_API_BASE || '').trim();
const chunkBytes = 2 * 1024 * 1024;
const maximumBytes = 64 * 1024 * 1024;

function endpoint(path) {
  if (!apiBase && import.meta.env.PROD) {
    throw new Error('Steam 云存档服务尚未配置，请稍后再试。');
  }
  return new URL(path, apiBase || location.origin).href;
}

async function request(path, data, method = 'POST') {
  try {
    const response = await hbSDK.network.request({
      url: endpoint(path),
      method,
      ...(data ? { data } : {}),
      timeout: 35_000,
    });
    return response.data;
  } catch (error) {
    const detail = error?.response?.data?.detail || error?.data?.detail;
    if (typeof detail === 'string') throw new Error(detail);
    if (error?.code === 'PERMISSION_NOT_DECLARED' || error?.code === 'PERMISSION_DENIED') {
      throw new Error('小程序网络权限未获批准，请在小黑盒开放平台申请 Network 权限并加入 API 域名。');
    }
    throw new Error(error?.message || 'Steam 云存档服务暂时不可用，请稍后重试。');
  }
}

function formatSize(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KiB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatTimestamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  const date = new Date(number * 1000);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false });
}

function decodeBase64Chunk(encoded, target, offset, expectedLength) {
  if (typeof encoded !== 'string') throw new Error('云存档分段数据格式无效。');
  let binary;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error('云存档分段无法解码，请重新下载。');
  }
  if (binary.length !== expectedLength) throw new Error('云存档分段大小不匹配，请重新下载。');
  for (let index = 0; index < binary.length; index += 1) {
    target[offset + index] = binary.charCodeAt(index);
  }
}

export function setupSteamCloud() {
  const zone = document.querySelector('#drop-zone');
  if (!zone || document.querySelector('#heybox-steam-cloud')) return;

  const sidebarPrivacy = document.querySelector('.side-bottom small');
  if (sidebarPrivacy) sidebarPrivacy.textContent = '本机文件不上传；Steam 云导入经临时转发';
  const relicIntro = document.querySelector('#view-relics .page-intro');
  if (relicIntro) {
    const eyebrow = relicIntro.querySelector('.eyebrow');
    const description = relicIntro.querySelector('p:last-child');
    if (eyebrow) eyebrow.textContent = 'RELIC VAULT / LOCAL + STEAM CLOUD';
    if (description) description.textContent = '可从本机导入，或授权读取 Steam 云端 .sl2；解析都在当前设备完成。';
  }

  const panel = document.createElement('section');
  panel.id = 'heybox-steam-cloud';
  panel.className = 'heybox-steam-cloud panel';
  panel.innerHTML = [
    '<div class="heybox-steam-cloud-heading"><div><span class="eyebrow">STEAM CLOUD / READ ONLY</span><h2>从 Steam 云存档导入</h2><p>登录 Steam 后读取《黑夜君临》的云端 .sl2，再在当前设备解析遗物和战绩。</p></div><span class="heybox-steam-cloud-mark" aria-hidden="true">↗</span></div>',
    '<div class="heybox-steam-cloud-actions"><button class="button primary" type="button" data-steam-start>登录 Steam 并同步</button><button class="button" type="button" data-steam-check hidden>我已授权，检查状态</button><a class="button" data-steam-authorize target="_blank" rel="noopener noreferrer" hidden>前往 Steam 授权</a><button class="button" type="button" data-steam-refresh hidden>刷新云存档列表</button><button class="button" type="button" data-steam-clear hidden>结束并清除临时会话</button></div>',
    '<p class="heybox-steam-cloud-status" data-steam-status role="status" aria-live="polite">正在检查 Steam 云存档服务…</p>',
    '<div class="heybox-steam-cloud-files" data-steam-files hidden></div>',
    '<p class="heybox-steam-cloud-privacy">隐私说明：Steam 密码只由 Steam 页面处理。用户授权令牌和所选云存档会经项目后端短暂转发到本设备；后端仅在内存中处理，不写入数据库或日志，存档由本设备现有解析器读取。只读 Steam 云文件，不修改云端存档；不收集联系方式。会话最长保留 10 分钟，可随时结束。</p>',
  ].join('');
  const localPanel = document.querySelector('.heybox-local-save');
  if (localPanel) localPanel.before(panel);
  else zone.after(panel);

  const status = panel.querySelector('[data-steam-status]');
  const fileList = panel.querySelector('[data-steam-files]');
  const startButton = panel.querySelector('[data-steam-start]');
  const checkButton = panel.querySelector('[data-steam-check]');
  const authorizeLink = panel.querySelector('[data-steam-authorize]');
  const refreshButton = panel.querySelector('[data-steam-refresh]');
  const clearButton = panel.querySelector('[data-steam-clear]');
  let sessionId = '';
  let files = [];
  let busy = false;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function setBusy(value) {
    busy = value;
    startButton.disabled = value;
    checkButton.disabled = value;
    refreshButton.disabled = value;
    clearButton.disabled = value;
    fileList.querySelectorAll('button').forEach(button => { button.disabled = value; });
  }

  function renderFiles() {
    fileList.replaceChildren();
    fileList.hidden = files.length === 0;
    if (!files.length) return;
    const heading = document.createElement('h3');
    heading.textContent = '可导入的云存档';
    fileList.append(heading);
    for (const file of files) {
      const row = document.createElement('article');
      row.className = 'heybox-steam-file';
      const info = document.createElement('div');
      info.className = 'heybox-steam-file-info';
      const name = document.createElement('strong');
      name.textContent = file.name;
      const details = document.createElement('small');
      const timestamp = formatTimestamp(file.timestamp);
      details.textContent = [formatSize(file.size), timestamp].filter(Boolean).join(' · ');
      info.append(name, details);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button primary';
      button.textContent = file.size > maximumBytes ? '超过 64 MiB' : '下载并解析';
      button.disabled = file.size > maximumBytes;
      button.addEventListener('click', () => void importFile(file));
      row.append(info, button);
      fileList.append(row);
    }
  }

  async function loadFiles() {
    if (!sessionId) throw new Error('请先登录 Steam。');
    setBusy(true);
    setStatus('正在读取 Steam 云存档清单…');
    try {
      const result = await request('/api/steam/cloud/files', { session_id: sessionId });
      files = Array.isArray(result.files) ? result.files.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && Number.isSafeInteger(item.size) && item.name.toLowerCase().endsWith('.sl2')) : [];
      renderFiles();
      refreshButton.hidden = false;
      clearButton.hidden = false;
      startButton.hidden = true;
      checkButton.hidden = true;
      authorizeLink.hidden = true;
      setStatus(files.length ? `找到 ${files.length} 个 .sl2 云存档。选择一个下载，文件将在本设备解析。` : 'Steam 云端没有找到 .sl2 存档。请确认游戏已启用 Steam 云同步。');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file) {
    if (!sessionId || busy) return;
    if (typeof window.readSave !== 'function') {
      setStatus('存档解析器尚未载入，请稍后再试。', true);
      return;
    }
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > maximumBytes) {
      setStatus('此云存档大小无效或超过 64 MiB。', true);
      return;
    }
    setBusy(true);
    setStatus(`正在从 Steam 云端读取 ${file.name}…`);
    try {
      const bytes = new Uint8Array(file.size);
      for (let offset = 0; offset < file.size; offset += chunkBytes) {
        const length = Math.min(chunkBytes, file.size - offset);
        const result = await request('/api/steam/cloud/download-chunk', {
          session_id: sessionId,
          file_id: file.id,
          offset,
          length,
        });
        if (result.offset !== offset || result.total_size !== file.size || result.chunk_size !== length) {
          throw new Error('Steam 返回的云存档分段信息不匹配，请重试。');
        }
        decodeBase64Chunk(result.data, bytes, offset, length);
        setStatus(`正在接收云存档 ${Math.min(offset + length, file.size).toLocaleString('zh-CN')} / ${file.size.toLocaleString('zh-CN')} 字节…`);
      }
      setStatus('已接收云存档，正在本设备解析…');
      await parseSave(file.name, bytes, status, 'Steam 云存档已在本设备解析；云端文件未修改。', 'steam-cloud');
      status.classList.remove('is-error');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  startButton.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    setStatus('正在建立 Steam 授权会话…');
    try {
      const result = await request('/api/steam/cloud/sessions', {});
      if (typeof result.session_id !== 'string' || typeof result.authorize_url !== 'string') {
        throw new Error('Steam 授权服务返回内容无效。');
      }
      sessionId = result.session_id;
      authorizeLink.href = result.authorize_url;
      startButton.hidden = true;
      authorizeLink.hidden = false;
      checkButton.hidden = false;
      clearButton.hidden = false;
      setStatus('授权会话已建立。点击“前往 Steam 授权”，完成后返回小程序检查状态。');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  checkButton.addEventListener('click', async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    setStatus('正在检查 Steam 授权…');
    try {
      const result = await request('/api/steam/cloud/session', { session_id: sessionId });
      if (result.status === 'authorized') {
        await loadFiles();
      } else if (result.status === 'pending') {
        setStatus('还没有收到授权结果。请先在 Steam 页面确认授权，再返回检查。');
      } else {
        throw new Error(result.message || 'Steam 授权未完成，请重新登录。');
      }
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  refreshButton.addEventListener('click', () => void loadFiles());
  clearButton.addEventListener('click', async () => {
    const currentSession = sessionId;
    sessionId = '';
    files = [];
    renderFiles();
    authorizeLink.hidden = true;
    checkButton.hidden = true;
    refreshButton.hidden = true;
    clearButton.hidden = true;
    startButton.hidden = false;
    try {
      if (currentSession) await request('/api/steam/cloud/session/revoke', { session_id: currentSession });
      setStatus('已清除本小程序内的 Steam 临时会话。');
    } catch (error) {
      setStatus(`本机已清除会话；服务端会话将在 10 分钟内自动过期。${error.message}`, true);
    }
  });

  if (!apiBase && import.meta.env.PROD) {
    startButton.disabled = true;
    setStatus('Steam 云存档服务尚未配置，请先设置小程序 API 域名。', true);
    return;
  }

  request('/api/steam/cloud/config', undefined, 'GET')
    .then(config => {
      if (config.enabled) {
        setStatus(`服务已就绪。Steam 授权后可读取 ${config.game_name} 的云存档。`);
      } else {
        startButton.disabled = true;
        setStatus(config.message || 'Steam OAuth 尚未配置。', true);
      }
    })
    .catch(error => {
      setStatus(`${error.message} 可点击“登录 Steam 并同步”重试。`, true);
    });
}
