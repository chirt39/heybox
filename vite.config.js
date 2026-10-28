import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

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
const stylesheetFiles = ['style.css', 'game-ui.css'];
const classicScriptVersions = Object.fromEntries(classicScriptFiles.map((file) => {
  const path = fileURLToPath(new URL(`./public/${file}`, import.meta.url));
  if (!existsSync(path)) {
    if (file === 'ai-config.js') {
      console.warn(`[classic scripts] Optional public/${file} is missing; AI will use the same-origin API address.`);
      return [file, null];
    }
    throw new Error(`[classic scripts] Required public/${file} is missing; cannot generate its SHA-256 cache key.`);
  }
  const content = readFileSync(path);
  return [file, createHash('sha256').update(content).digest('hex').slice(0, 12)];
}));
const catalogJsonVersions = Object.fromEntries(catalogJsonFiles.map((file) => {
  const path = fileURLToPath(new URL(`./public/${file}`, import.meta.url));
  if (!existsSync(path)) {
    throw new Error(`[catalog JSON] Required public/${file} is missing; cannot generate its SHA-256 cache key.`);
  }
  const content = readFileSync(path);
  return [file, createHash('sha256').update(content).digest('hex').slice(0, 12)];
}));
const stylesheetVersions = Object.fromEntries(stylesheetFiles.map((file) => {
  const path = fileURLToPath(new URL(`./public/${file}`, import.meta.url));
  if (!existsSync(path)) {
    throw new Error(`[stylesheets] Required public/${file} is missing; cannot generate its SHA-256 cache key.`);
  }
  const content = readFileSync(path);
  return [file, createHash('sha256').update(content).digest('hex').slice(0, 12)];
}));

const stylesheetCacheKeyPlugin = {
  name: 'stylesheet-content-cache-keys',
  transformIndexHtml(html) {
    return html.replace(
      /(<link\b[^>]*\bhref=["'])\/(style\.css|game-ui\.css)(?:\?[^"']*)?(["'][^>]*>)/gi,
      (_match, prefix, file, suffix) => `${prefix}/${file}?v=${stylesheetVersions[file]}${suffix}`,
    );
  },
};

export default defineConfig({
  plugins: [vue(), stylesheetCacheKeyPlugin],
  publicDir: 'public',
  define: {
    __CLASSIC_SCRIPT_VERSIONS__: JSON.stringify(classicScriptVersions),
    __CATALOG_JSON_VERSIONS__: JSON.stringify(catalogJsonVersions),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
