import { createApp } from 'vue';
import App from '../.generated-src/App.vue';
import { setupFeedback } from './feedback.js';
import { setupLocalSave } from './local-save.js';
import { setupSteamCloud } from './steam-cloud.js';
import { setupMobileNav } from './mobile-nav.js';
import './styles.css';

document.body.classList.add('heybox-miniapp');
createApp(App).mount('#app');
setupFeedback();
setupLocalSave();
setupSteamCloud();
setupMobileNav();
