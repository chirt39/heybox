import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { miniappManifest } from '@heybox/hb-sdk/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const miniappRoot = dirname(fileURLToPath(import.meta.url));
const generatedPublic = resolve(miniappRoot, '.generated-public');
const classicScriptFiles = [
  'crypto-js.min.js',
  'relic-parser.js',
  'save-editor.js',
  'ai-config.js',
  'app.js',
  'save-editor-ui.js',
];
const catalogJsonFiles = [
  'enemy-data.json',
  'items_data.json',
  'effects_data.json',
  'quickref_effects_zh.json',
  'effect_names_zh.json',
  'vessels_data.json',
  'relic_catalog_zh.json',
  'relic_rule_effects.json',
  'effect_encyclopedia.json',
];

function createVersionMap(files, group) {
  return Object.fromEntries(files.map(file => {
    const path = resolve(generatedPublic, file);
    if (!existsSync(path)) {
      throw new Error(`[${group}] 缺少 .generated-public/${file}，无法生成资源版本号。`);
    }
    const version = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
    return [file, version];
  }));
}

const classicScriptVersions = createVersionMap(classicScriptFiles, 'classic scripts');
const catalogJsonVersions = createVersionMap(catalogJsonFiles, 'catalog JSON');

export default defineConfig({
  base: './',
  publicDir: resolve(miniappRoot, '.generated-public'),
  plugins: [vue(), miniappManifest()],
  define: {
    __CLASSIC_SCRIPT_VERSIONS__: JSON.stringify(classicScriptVersions),
    __CATALOG_JSON_VERSIONS__: JSON.stringify(catalogJsonVersions),
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
});
