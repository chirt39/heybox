const icon = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const tabs = [
  ['overview', '首页', icon('<path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>')],
  ['enemies', '图鉴', icon('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20"/><path d="M9 7h7M9 10h7"/>')],
  ['relics', '遗物', icon('<path d="m12 2.8 8.8 9.2-8.8 9.2L3.2 12z"/><path d="M12 7.2 16.6 12 12 16.8 7.4 12z"/>')],
  ['builds', '配装', icon('<path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z"/><path d="M7 8h.01M17 8h.01M7 18h.01M17 18h.01"/>')],
];

const moreTabs = [
  ['records', '远征日志', '回看远征战绩与经历', icon('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>')],
  ['effects', '词条图鉴', '查找遗物词条与效果', icon('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/>')],
  ['sources', '资料说明', '查看数据来源与提交反馈', icon('<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 0 1 4.6 1c0 1.7-2.3 2.1-2.3 3.8M12 17h.01"/>')],
];

function navigate(view) {
  window.dispatchEvent(new CustomEvent('nightreign:navigate', { detail: { view } }));
}

export function setupMobileNav() {
  const nav = document.createElement('nav');
  nav.className = 'heybox-mobile-nav';
  nav.setAttribute('aria-label', '主导航');
  nav.innerHTML = [
    ...tabs.map(([view, label, svg]) => `<button type="button" data-view="${view}"><span class="heybox-nav-icon">${svg}</span><small>${label}</small></button>`),
    `<button type="button" id="heybox-more-toggle" aria-expanded="false" aria-haspopup="dialog" aria-controls="heybox-more-sheet"><span class="heybox-nav-icon">${icon('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>')}</span><small>更多</small></button>`,
  ].join('');

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'heybox-more-backdrop';
  backdrop.setAttribute('aria-label', '关闭更多功能');
  backdrop.hidden = true;

  const sheet = document.createElement('section');
  sheet.id = 'heybox-more-sheet';
  sheet.className = 'heybox-more-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'heybox-more-title');
  sheet.hidden = true;
  sheet.innerHTML = `<div class="heybox-sheet-handle" aria-hidden="true"></div><header class="heybox-sheet-heading"><div><p>EXPEDITION INDEX</p><h2 id="heybox-more-title">更多功能</h2></div><button type="button" class="heybox-sheet-close" aria-label="关闭更多功能">${icon('<path d="m6 6 12 12M18 6 6 18"/>')}</button></header><div class="heybox-more-links">${moreTabs.map(([view, label, detail, svg]) => `<button type="button" data-view="${view}"><span class="heybox-more-icon">${svg}</span><span class="heybox-more-copy"><b>${label}</b><small>${detail}</small></span><span class="heybox-more-arrow" aria-hidden="true">${icon('<path d="m9 18 6-6-6-6"/>')}</span></button>`).join('')}</div>`;

  document.body.append(backdrop, sheet, nav);

  const toggle = nav.querySelector('#heybox-more-toggle');
  const closeButton = sheet.querySelector('.heybox-sheet-close');
  let closeTimer;
  let openFrame;
  let focusBeforeOpen = null;

  const closeSheet = ({ restoreFocus = true } = {}) => {
    if (sheet.hidden) return;
    sheet.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('heybox-more-open');
    clearTimeout(closeTimer);
    cancelAnimationFrame(openFrame);
    closeTimer = window.setTimeout(() => {
      sheet.hidden = true;
      backdrop.hidden = true;
      if (restoreFocus && focusBeforeOpen?.isConnected) focusBeforeOpen.focus();
    }, 220);
  };

  const openSheet = () => {
    clearTimeout(closeTimer);
    focusBeforeOpen = toggle;
    sheet.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add('heybox-more-open');
    toggle.setAttribute('aria-expanded', 'true');
    openFrame = window.requestAnimationFrame(() => {
      sheet.classList.add('is-open');
      backdrop.classList.add('is-open');
      closeButton.focus({ preventScroll: true });
    });
  };

  const syncActive = () => {
    const page = document.querySelector('.view.active')?.id?.replace('view-', '');
    const active = page || location.hash.slice(1);
    for (const button of nav.querySelectorAll('[data-view]')) {
      if (button.dataset.view === active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    const moreIsActive = moreTabs.some(([view]) => view === active);
    if (moreIsActive) toggle.setAttribute('aria-current', 'page');
    else toggle.removeAttribute('aria-current');
    for (const button of sheet.querySelectorAll('[data-view]')) {
      if (button.dataset.view === active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  };

  for (const button of [...nav.querySelectorAll('[data-view]'), ...sheet.querySelectorAll('[data-view]')]) {
    button.addEventListener('click', () => {
      closeSheet();
      navigate(button.dataset.view);
    });
  }

  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') closeSheet();
    else openSheet();
  });
  closeButton.addEventListener('click', () => closeSheet());
  backdrop.addEventListener('click', () => closeSheet());

  document.addEventListener('keydown', event => {
    if (sheet.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...sheet.querySelectorAll('button:not([disabled])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('nightreign:navigate', syncActive);
  window.addEventListener('hashchange', syncActive);
  window.addEventListener('popstate', syncActive);
  const app = document.querySelector('#app');
  if (app) new MutationObserver(syncActive).observe(app, { subtree: true, attributes: true, attributeFilter: ['class'] });
  syncActive();
}
