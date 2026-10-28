import hbSDK from '@heybox/hb-sdk';

const maximumBytes = 8 * 1024 * 1024;
const maximumCombinedBytes = 64 * 1024 * 1024;
const chunkNamePattern = /^(.+\.sl2)\.(\d{3,})-of-(\d{3,})\.part$/i;

function errorText(error) {
  if (error?.code === 'FILE_PICKER_CANCELLED') return '已取消文件选择。';
  if (['METHOD_FORBIDDEN', 'METHOD_NOT_FOUND'].includes(error?.code)) return '当前小黑盒客户端未开放文件选择，请升级至 1.3.396 或更新版本后重试。';
  if (['PERMISSION_NOT_IN_SNAPSHOT', 'PERMISSION_DENIED'].includes(error?.code)) return '小程序文件访问权限未开放，请检查小黑盒开放平台中的文件系统权限。';
  if (error?.code === 'USER_GESTURE_REQUIRED') return '系统未识别到有效点击，请直接点击导入按钮重试。';
  return error?.message || String(error);
}

async function readSaveParts(files, hint) {
  if (!Array.isArray(files) || files.length < 2) {
    throw new Error('请选择同一存档的全部 .part 分片；分片文件名应类似 NR0000.sl2.001-of-002.part。');
  }

  const parts = files.map(file => {
    const match = typeof file?.name === 'string' ? file.name.match(chunkNamePattern) : null;
    if (!match) throw new Error('分片名称不符合格式。请用本机切片工具生成，并一次选择同一目录中的全部 .part 文件。');
    return { file, saveName: match[1], index: Number(match[2]), count: Number(match[3]), size: 0 };
  });

  const saveName = parts[0].saveName;
  if (parts.some(part => part.saveName.toLowerCase() !== saveName.toLowerCase())) {
    throw new Error('不能混选不同存档的分片，请重新选择同一存档的一整组文件。');
  }
  const expectedCount = parts[0].count;
  if (!Number.isSafeInteger(expectedCount) || expectedCount !== parts.length || parts.some(part => part.count !== expectedCount)) {
    throw new Error('分片未选完整。请重新选择同一目录中的全部分片。');
  }

  parts.sort((left, right) => left.index - right.index);
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index].index !== index + 1) {
      throw new Error('分片序号重复或不连续。请重新选择从 001 开始的全部分片，不要漏选。');
    }
  }

  let totalBytes = 0;
  for (const part of parts) {
    const stat = await part.file.stat();
    if (!Number.isSafeInteger(stat.size) || stat.size <= 0) {
      throw new Error(`分片 ${part.file.name} 的文件大小无效。`);
    }
    if (stat.size > maximumBytes) {
      throw new Error(`分片 ${part.file.name} 超过小黑盒单文件 8 MiB 读取上限，请按每片 7 MiB 重新切片。`);
    }
    part.size = stat.size;
    totalBytes += stat.size;
  }

  if (totalBytes > maximumCombinedBytes) {
    throw new Error('分片总大小超过当前设备 64 MiB 的端内拼接上限。');
  }

  let combined;
  try {
    combined = new Uint8Array(totalBytes);
  } catch {
    throw new Error('当前设备可用内存不足，无法拼接此存档。');
  }

  let offset = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    hint.textContent = `正在本地读取分片 ${index + 1}/${parts.length}…`;
    const bytes = await part.file.readBytes();
    if (bytes.byteLength !== part.size) {
      throw new Error(`分片 ${part.file.name} 读取不完整，请重新选择分片。`);
    }
    combined.set(bytes, offset);
    offset += bytes.byteLength;
  }

  return { name: saveName, bytes: combined };
}

export async function parseSave(name, bytes, hint, successMessage = '存档已在当前设备解析；原文件未修改，也没有上传。', source = 'local') {
  if (typeof window.readSave !== 'function') throw new Error('存档解析器尚未载入，请稍后再试。');
  const isWholeBuffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  const buffer = isWholeBuffer ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const saveFile = {
    name,
    size: buffer.byteLength,
    source,
    slice: (start, end) => ({ arrayBuffer: async () => buffer.slice(start, end) }),
    arrayBuffer: async () => buffer,
  };
  hint.textContent = '正在当前设备解析存档…';
  await window.readSave(saveFile);
  const saveStatus = document.querySelector('#save-status');
  if (saveStatus?.classList.contains('error')) throw new Error(saveStatus.textContent || '存档解析失败。');
  hint.textContent = successMessage;
}

export function setupLocalSave() {
  const zone = document.querySelector('#drop-zone');
  if (!zone) return;
  zone.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'heybox-local-save panel';
  panel.innerHTML = '<strong>从当前设备读取</strong><ol class="heybox-save-steps"><li>小于等于 8 MiB：直接选择 .sl2 存档。</li><li>更大的存档：先在电脑用本机切片工具按每片 7 MiB 切分；手机端将所有 .part 文件放到可访问的位置，再一次多选同一组分片。</li><li>最多拼接 64 MiB。只在本机拼接与解析，不修改原档、不上传。</li></ol><div class="heybox-save-actions"><button type="button" id="heybox-pick-sl2" disabled>直接导入 .sl2</button><button type="button" id="heybox-pick-chunks" disabled>导入存档分片</button><button type="button" id="heybox-pick-json" disabled>导入本地 JSON</button></div><p class="hint" id="heybox-save-hint" role="status" aria-live="polite">正在连接小黑盒文件能力…</p>';
  zone.after(panel);

  const direct = panel.querySelector('#heybox-pick-sl2');
  const chunks = panel.querySelector('#heybox-pick-chunks');
  const local = panel.querySelector('#heybox-pick-json');
  const hint = panel.querySelector('#heybox-save-hint');
  let handshakeReady = false;
  let pickerPending = false;

  function updatePickerButtons() {
    const disabled = !handshakeReady || pickerPending;
    direct.disabled = disabled;
    chunks.disabled = disabled;
    local.disabled = disabled;
  }

  function openPicker(mode, options) {
    if (!handshakeReady || pickerPending) return;
    pickerPending = true;
    hint.classList.remove('is-error');
    hint.textContent = '正在打开小黑盒系统文件选择器…';
    updatePickerButtons();

    try {
      const filesPromise = hbSDK.files.pickFiles(options);
      void receive(mode, filesPromise).finally(() => {
        pickerPending = false;
        updatePickerButtons();
      });
    } catch (error) {
      hint.textContent = errorText(error);
      hint.classList.toggle('is-error', error?.code !== 'FILE_PICKER_CANCELLED');
      pickerPending = false;
      updatePickerButtons();
    }
  }

  hbSDK.onHandshakeStateChange(state => {
    handshakeReady = state.status === 'ready';
    updatePickerButtons();
    hint.textContent = handshakeReady ? '仅在当前设备读取与解析，不修改原文件。' : state.status === 'failed' ? '小黑盒文件能力连接失败，请重新打开小程序。' : '正在连接小黑盒文件能力…';
    hint.classList.toggle('is-error', state.status === 'failed');
  });

  async function receive(mode, filesPromise) {
    try {
      const files = await filesPromise;
      if (!files?.length) return;

      if (mode === 'chunks') {
        const parsed = await readSaveParts(files, hint);
        await parseSave(parsed.name, parsed.bytes, hint);
        return;
      }

      const [file] = files;
      const stat = await file.stat();
      if (stat.size > maximumBytes) {
        throw new Error(mode === 'sl2' ? '此存档超过 8 MiB。请在电脑用本机切片工具按每片 7 MiB 切分，再选择全部 .part 分片导入。' : '导出数据超过 8 MiB，暂时无法导入。');
      }

      hint.textContent = '正在当前设备读取文件…';
      const bytes = await file.readBytes();
      if (bytes.byteLength > maximumBytes) throw new Error('文件超过小黑盒单文件 8 MiB 读取上限。');

      if (mode === 'sl2') {
        await parseSave(file.name, bytes, hint);
      } else {
        if (typeof window.nightreignLoadTransfer !== 'function') throw new Error('图鉴资料尚未载入，请稍后再试。');
        const payload = JSON.parse(new TextDecoder().decode(bytes));
        window.nightreignLoadTransfer(payload);
        hint.textContent = '本地遗物与战绩导入完成。';
      }
    } catch (error) {
      hint.textContent = errorText(error);
      hint.classList.toggle('is-error', error?.code !== 'FILE_PICKER_CANCELLED');
    }
  }

  direct.addEventListener('click', () => openPicker('sl2', { mode: 'read', accept: ['.sl2'] }));
  chunks.addEventListener('click', () => openPicker('chunks', { mode: 'read', accept: ['.part'], multiple: true }));
  local.addEventListener('click', () => openPicker('json', { mode: 'read', accept: ['.json'] }));
}
