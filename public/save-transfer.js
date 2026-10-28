(function () {
  'use strict';
  const kind = 'nightreign-local-transfer';
  const maximumBytes = 8 * 1024 * 1024;
  const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
  function compact(parsed) {
    if (!parsed || !Array.isArray(parsed.relics)) throw new Error('请先读取存档。');
    return {
      kind, version: 1,
      relics: parsed.relics.map(relic => ({
        id: relic.id, itemId: relic.itemId, sortKey: relic.sortKey || 0,
        effects: (relic.effects || []).map(group => group.map(effect => effect.id)),
      })),
      battleRecords: parsed.battleRecords || null,
    };
  }
  function validate(payload) {
    if (!payload || payload.kind !== kind || payload.version !== 1 || !Array.isArray(payload.relics) || payload.relics.length > 100000) {
      throw new Error('这不是受支持的渡夜图鉴本地导出文件。');
    }
    if (Object.hasOwn(payload, 'characterName')) throw new Error('导出文件不能包含角色名称。');
    for (const relic of payload.relics) {
      if (!integer(relic.id) || !integer(relic.itemId) || !integer(relic.sortKey) || !Array.isArray(relic.effects) || relic.effects.length > 16 ||
        relic.effects.some(group => !Array.isArray(group) || group.length > 8 || group.some(id => !integer(id)))) {
        throw new Error('遗物数据格式错误。');
      }
    }
    const records = payload.battleRecords;
    if (records !== null && records !== undefined) {
      if (!records || typeof records !== 'object' || Array.isArray(records)) throw new Error('战绩数据格式错误。');
      const check = (value, depth) => {
        if (depth > 5) throw new Error('战绩数据层级过深。');
        if (value === null) return;
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 0xffffffff) return;
        if (typeof value === 'string' && value.length <= 100) return;
        if (Array.isArray(value) && value.length <= 100) { value.forEach(item => check(item, depth + 1)); return; }
        if (typeof value === 'object' && Object.keys(value).length <= 100) {
          for (const [key, item] of Object.entries(value)) {
            if (key.length > 80 || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('战绩字段格式错误。');
            check(item, depth + 1);
          }
          return;
        }
        throw new Error('战绩字段格式错误。');
      };
      check(records, 0);
    }
    return payload;
  }
  function expand(payload, itemsData, effectsData) {
    validate(payload);
    const items = itemsData?.items || {};
    const effects = effectsData?.effects || {};
    const relics = payload.relics.map(row => {
      const item = items[row.itemId];
      if (!item) throw new Error('导出文件中的遗物不在当前图鉴资料中。');
      return {
        id: row.id, itemId: row.itemId, sortKey: row.sortKey,
        itemKey: item.key || String(row.itemId),
        itemNameEn: item.name_en || item.key || String(row.itemId),
        itemNameJa: item.name_ja || item.name_en || item.key || String(row.itemId),
        itemColor: item.color || null, itemType: item.type || null,
        effects: row.effects.map(group => group.map(id => {
          const effect = effects[id];
          if (!effect) throw new Error('导出文件中的词条不在当前图鉴资料中。');
          return { id, key: effect.key || String(id), name_en: effect.name_en || effect.key || String(id), name_ja: effect.name_ja || effect.name_en || effect.key || String(id) };
        })),
      };
    });
    setCoordinates(relics, items);
    return { file: 'local-transfer', characterName: '', totalRelics: relics.length, relics, battleRecords: payload.battleRecords || null };
  }
  window.NightreignSaveTransfer = { kind, maximumBytes, compact, validate, expand };
})();
