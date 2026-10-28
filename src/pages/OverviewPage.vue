<script setup>
defineProps({ active: Boolean });
</script>

<template>
<section id="view-overview" class="view" :class="{ active }">
          <div class="hero"><div class="hero-content"><p class="eyebrow">NIGHTFARER EXPEDITION · LIMVELD</p><h1>黑夜还没有<br><em>结束</em></h1><p class="hero-copy">选择渡夜者，探索宁姆韦德，在远征尽头迎战夜王。查阅敌人资料、解析遗物，并为下一场出击整备装配。</p><div class="hero-actions"><button class="button primary" data-go="relics">解析遗物存档 <span>↗</span></button><button class="button ghost" data-go="enemies">查阅敌人图鉴 <span>→</span></button></div></div><div class="hero-caption">LIMVELD · THREE-DAY EXPEDITION</div></div>
          <section class="home-agent panel">
            <div class="home-agent-heading"><div><p class="eyebrow">NIGHTREIGN GUIDE</p><h2>黑夜君临助手</h2><p>帮渡夜者解答黑夜君临问题。</p></div></div>
            <p id="agent-transport-warning" class="agent-transport-warning" role="alert" hidden>AI 助手只会通过安全连接发送问题与相关数据。请使用 HTTPS 页面和 HTTPS API；本机开发可让页面与 API 都通过 localhost、127.0.0.1 或 [::1] 访问。当前连接不安全，问答、历史记忆读取/清除和配装请求已禁用。</p>
            <div id="agent-chat-log" class="agent-chat-log" role="log" aria-live="polite" aria-label="助手对话记录"><p class="agent-empty">你好，我会判断你的问题是查阅资料还是请求配装。配装时我会在对话中确认角色、供具、普通或深夜范围及配装目标；信息不清楚时会先询问。配装只使用已读取存档中的遗物。</p></div>
            <form id="agent-chat-form" class="agent-chat-form">
              <label class="agent-question-label" for="agent-question">你的问题</label>
              <textarea id="agent-question" name="question" minlength="2" maxlength="400" required aria-describedby="agent-status" placeholder="例如：追踪者的专属词条有哪些？／请只用普通遗物，为复仇者搭配偏输出的装配。"></textarea>
              <div class="agent-chat-actions"><span id="agent-question-count">0 / 400 字</span><button id="agent-send" class="button primary" type="submit">发送</button></div>
            </form>
            <p id="agent-status" class="hint" role="status" aria-live="polite">配装时只使用已读取的本机存档遗物；角色、供具或范围不明确时会先向你确认。</p>
            <div class="agent-memory-tools"><button id="agent-memory-clear-open" class="agent-memory-clear-open" type="button" aria-haspopup="dialog" aria-controls="agent-memory-clear-dialog">清除已保存对话记忆</button><span>只删除助手保存的问答，不影响本机存档。</span></div>
            <div id="agent-build-result" hidden></div>
            <button id="agent-apply-build" class="button primary" type="button" hidden>应用配装到装配预览</button>
          </section>
          <dialog id="agent-memory-clear-dialog" class="agent-memory-dialog" aria-labelledby="agent-memory-clear-title" aria-describedby="agent-memory-clear-description">
            <section class="agent-memory-dialog-content">
              <p class="eyebrow">MEMORY SETTINGS</p>
              <h2 id="agent-memory-clear-title">清除已保存对话记忆</h2>
              <p id="agent-memory-clear-description">这会删除此浏览器会话保存在服务端的助手问答，并清空当前页面的对话记录。遗物存档和装配内容不会受影响。</p>
              <p id="agent-memory-clear-warning" class="agent-memory-clear-warning" hidden>此操作无法撤销。确定要永久清除此会话的已保存对话记忆吗？</p>
              <p id="agent-memory-clear-status" class="agent-memory-clear-status" role="status" aria-live="polite" tabindex="-1"></p>
              <div class="agent-memory-dialog-actions"><button id="agent-memory-clear-cancel" class="button ghost" type="button">取消</button><button id="agent-memory-clear-next" class="button ghost" type="button">继续</button><button id="agent-memory-clear-confirm" class="button primary" type="button" hidden>永久清除记忆</button></div>
            </section>
          </dialog>
          <dialog id="feedback-dialog" class="feedback-dialog" aria-labelledby="feedback-title">
            <form id="feedback-form" class="feedback-form">
              <div class="feedback-form-heading"><div><p class="eyebrow">ROUNDtable MESSAGE</p><h2 id="feedback-title">向窝反馈</h2></div><button id="feedback-cancel" class="button ghost" type="button">关闭</button></div>
              <p id="feedback-kind-label" class="feedback-kind-label"></p>
              <p class="feedback-privacy-note">提交内容由站点维护者查看；邮箱为选填项。只有勾选后，本轮问答才会随反馈提交。反馈及随附问答最多保留 90 天。</p>
              <label class="feedback-label" for="feedback-message">补充说明</label>
              <textarea id="feedback-message" name="message" minlength="2" maxlength="4000" required placeholder="告诉我们哪里不准确，或描述你的建议。"></textarea>
              <label class="feedback-label" for="feedback-email">邮箱（可选，便于后续联系）</label>
              <input id="feedback-email" name="email" type="email" maxlength="254" autocomplete="email" spellcheck="false" placeholder="name@example.com">
              <label id="feedback-context-option" class="feedback-context-option" hidden>
                <input id="feedback-include-context" type="checkbox">
                <span>附上当前这一轮的问题与回答（默认不附）</span>
              </label>
              <div id="feedback-context-preview" class="feedback-context-preview" hidden>
                <p><strong>本轮问题</strong><span id="feedback-question-preview"></span></p>
                <p><strong>助手回答</strong><span id="feedback-answer-preview"></span></p>
              </div>
              <p id="feedback-transport-warning" class="feedback-context-preview" role="alert" hidden>公网反馈需要使用 HTTPS 页面和 HTTPS API，当前连接不安全，已禁用提交。请改用 HTTPS；本机 localhost、127.0.0.1 或 [::1] 开发访问可使用 HTTP。HTTP 公网主站仍可浏览。</p>
              <div class="feedback-form-actions"><span id="feedback-status" role="status" aria-live="polite"></span><button id="feedback-submit" class="button primary" type="submit">提交反馈</button></div>
            </form>
          </dialog>
          <div class="section-heading"><div><p class="eyebrow">EXPEDITION DESK</p><h2>远征控制台</h2></div><p>从情报到配装，一处完成</p></div>
          <div class="feature-grid"><button class="feature-card" data-go="enemies"><img class="feature-icon-image" src="/nav-icons/bestiary.webp" alt=""><div><span class="card-kicker">01 / BESTIARY</span><h3>图鉴</h3><p>浏览敌人分类与遭遇资料，查看生命值、魔火雷圣倍率和异常抗性。</p><span class="text-link">查阅图鉴 ↗</span></div></button><button class="feature-card" data-go="relics"><img class="feature-icon-image" src="/nav-icons/relic-rite.png" alt=""><div><span class="card-kicker">02 / RELIC RITE</span><h3>遗物仪式</h3><p>解析本地游戏存档，筛选角色拥有的遗物与全部词条。</p><span class="text-link">读取存档 ↗</span></div></button><button class="feature-card" data-go="builds"><img class="feature-icon-image" src="/nav-icons/relic-equip.png" alt=""><div><span class="card-kicker">03 / RELIC EQUIPMENT</span><h3>遗物装配</h3><p>选择渡夜者与器皿，从已拥有的遗物中装配并查看组合效果。</p><span class="text-link">开始装配 ↗</span></div></button></div>
          <div class="note-panel"><span class="note-icon">i</span><div><strong>关于资料完整度</strong><p>敌人属性与抗性来自社区整理数据。遭遇位置仅显示可核对的信息；部分敌人的刷新点和场景可能不完整。</p></div></div>
        </section>
</template>
