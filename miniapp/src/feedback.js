import hbSDK from '@heybox/hb-sdk';

const apiBase = (import.meta.env.VITE_NIGHTREIGN_API_BASE || '').trim();

function feedbackUrl() {
  if (!apiBase && import.meta.env.PROD) {
    throw new Error('反馈服务尚未配置，请稍后再试。');
  }
  return new URL('/api/feedback', apiBase || location.origin).href;
}

export function setupFeedback() {
  const sources = document.querySelector('#view-sources');
  if (!sources || sources.querySelector('#heybox-feedback')) return;

  const panel = document.createElement('section');
  panel.id = 'heybox-feedback';
  panel.className = 'heybox-feedback panel';
  panel.innerHTML = [
    '<div><h2>反馈与建议</h2><p>欢迎指出资料错误或提出改进建议。反馈匿名提交，不需要账号或联系方式。</p></div>',
    '<form id="heybox-feedback-form">',
    '<label for="heybox-feedback-type">反馈类型</label>',
    '<select id="heybox-feedback-type" name="type"><option value="answer_issue">资料或回答有误</option><option value="suggestion">功能建议</option></select>',
    '<label for="heybox-feedback-comment">反馈内容</label>',
    '<textarea id="heybox-feedback-comment" name="comment" minlength="5" maxlength="2000" required placeholder="请描述遇到的问题或希望改进的地方"></textarea>',
    '<p class="heybox-feedback-privacy">仅发送本次填写的文字与反馈类型；不发送存档、遗物清单、联系方式或 AI 对话。反馈由项目管理员查看，保存 90 天后删除。</p>',
    '<button class="button primary" type="submit">提交匿名反馈</button>',
    '<p id="heybox-feedback-status" role="status" aria-live="polite"></p>',
    '</form>',
  ].join('');
  sources.append(panel);

  const form = panel.querySelector('form');
  const submit = form.querySelector('[type="submit"]');
  const status = panel.querySelector('#heybox-feedback-status');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const comment = form.elements.comment.value.trim();
    if (comment.length < 5 || comment.length > 2000) {
      status.textContent = '请填写 5 至 2000 字的反馈内容。';
      return;
    }
    submit.disabled = true;
    status.textContent = '正在提交…';
    try {
      const response = await hbSDK.network.request({
        url: feedbackUrl(),
        method: 'POST',
        data: { type: form.elements.type.value, comment },
        headers: { 'content-type': 'application/json' },
        timeout: 8000,
      });
      if (response.data?.status !== 'received') throw new Error('反馈服务返回内容异常。');
      form.reset();
      status.textContent = '已收到反馈，感谢你帮助改进渡夜图鉴。';
    } catch (error) {
      const detail = error?.response?.data?.detail;
      status.textContent = typeof detail === 'string' ? detail : (error?.message || '暂时无法提交，请稍后重试。');
    } finally {
      submit.disabled = false;
    }
  });
}
