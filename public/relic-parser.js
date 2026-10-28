/**
 * Elden Ring Nightreign Save File Relic Parser - JavaScript Version
 * Extracts relic information from .sl2 save files in the browser.
 * Port of src/relic_parser.py
 */

// === Constants ===
const DS2_KEY_HEX = '18f6326605bd178a5524523ac0a0c609';
const DS2_KEY_PARSED = CryptoJS.enc.Hex.parse(DS2_KEY_HEX);
const IV_SIZE = 0x10;
const BND4_HEADER_LEN = 64;
const BND4_ENTRY_HEADER_LEN = 32;
const SLOT_SIZE_FULL = 80;
const SLOT_SIZE_SMALL = 16;
const EMPTY_EFFECT = 0xFFFFFFFF;
const BND4_MAGIC = [0x42, 0x4E, 0x44, 0x34];

const VALID_B3_VALUES = new Set([0x80, 0x83, 0x81, 0x82, 0x84, 0x85]);
const VALID_B4_VALUES = new Set([0x80, 0x90, 0xc0]);
const SLOT_SIZE_MAP = { 0xc0: SLOT_SIZE_FULL, 0x90: SLOT_SIZE_SMALL, 0x80: SLOT_SIZE_FULL };

// Expected entry header magic bytes
const ENTRY_MAGIC = [0x40, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff];

// Character name search pattern: hex "27000046414345"
const NAME_PATTERN = [0x27, 0x00, 0x00, 0x46, 0x41, 0x43, 0x45];

// === Helper Functions ===

/**
 * Read a little-endian 24-bit unsigned integer from Uint8Array
 */
function readUint24LE(data, offset) {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
}

/**
 * Read a little-endian 32-bit unsigned integer from Uint8Array
 */
function readUint32LE(data, offset) {
  return (data[offset] | (data[offset + 1] << 8) |
          (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

/**
 * Read a little-endian 16-bit unsigned integer from Uint8Array
 */
function readUint16LE(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}

/**
 * Check if data starts with the given pattern at the given offset
 */
function startsWithAt(data, pattern, offset) {
  if (offset + pattern.length > data.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (data[offset + i] !== pattern[i]) return false;
  }
  return true;
}

/**
 * Find a byte pattern in data starting from offset
 * Returns the position or -1 if not found
 */
function findPattern(data, pattern, startOffset) {
  const len = data.length;
  const patLen = pattern.length;
  const searchEnd = len - patLen;
  for (let i = startOffset; i <= searchEnd; i++) {
    let match = true;
    for (let j = 0; j < patLen; j++) {
      if (data[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Convert hex string to byte array
 */
function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

// === AES-CBC Decryption ===

/**
 * Decrypt AES-CBC encrypted data
 * @param {Uint8Array} iv - 16-byte initialization vector
 * @param {Uint8Array} encryptedPayload - encrypted data
 * @returns {Uint8Array} decrypted data
 */
function decryptAES(iv, encryptedPayload) {
  const key = DS2_KEY_PARSED;
  const ivWords = CryptoJS.lib.WordArray.create(iv);
  const ciphertext = CryptoJS.lib.WordArray.create(encryptedPayload);

  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: ciphertext },
    key,
    {
      iv: ivWords,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.NoPadding,
    }
  );

  // Convert WordArray to Uint8Array
  const words = decrypted.words;
  const sigBytes = decrypted.sigBytes;
  const result = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    result[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return result;
}

// === BND4 Entry Processing ===

/**
 * Validate the fixed BND4 header, entry table, and declared metadata end.
 * The header's 64-bit HeadersEnd field must fit the parser's 32-bit entry
 * offsets and include the complete directory table.
 * @param {Uint8Array} header - at least one BND4 header
 * @param {number} fileSize - total input byte length
 * @returns {{numEntries:number, headersEnd:number}}
 */
function validateBND4DirectoryBounds(header, fileSize) {
  if (header.length < BND4_HEADER_LEN) {
    throw new Error('存档文件头不完整，请选择完整的 .sl2 文件。');
  }
  if (!startsWithAt(header, BND4_MAGIC, 0)) {
    throw new Error('文件标记不匹配，请选择有效的 PC 版 .sl2 存档。');
  }

  const numEntries = readUint32LE(header, 12);
  const entryTableEnd = BND4_HEADER_LEN + BND4_ENTRY_HEADER_LEN * numEntries;
  if (entryTableEnd > fileSize) {
    throw new Error('存档条目表不完整，请选择完整的 .sl2 文件。');
  }

  const headersEnd = readUint32LE(header, 40);
  const headersEndHigh = readUint32LE(header, 44);
  if (headersEndHigh !== 0 || headersEnd < entryTableEnd || headersEnd > fileSize) {
    throw new Error('存档目录边界无效，请确认文件完整且格式受支持。');
  }

  return {numEntries, headersEnd};
}

/**
 * Validate the BND4 structure using only a small prefix read, before the caller
 * allocates the complete file buffer.
 * @param {File|Blob} file - user-selected local save file
 */
async function validateSaveFileHeader(file) {
  const header = new Uint8Array(await file.slice(0, BND4_HEADER_LEN).arrayBuffer());
  validateBND4DirectoryBounds(header, file.size);
}

/**
 * Decrypt a BND4 save file
 * @param {ArrayBuffer} arrayBuffer - raw file data
 * @returns {Array} array of BND4 entry objects with clean_data
 */
function decryptSaveFile(arrayBuffer) {
  const raw = new Uint8Array(arrayBuffer);
  const {numEntries, headersEnd} = validateBND4DirectoryBounds(raw, raw.length);
  const entries = [];

  for (let i = 0; i < numEntries; i++) {
    const pos = BND4_HEADER_LEN + BND4_ENTRY_HEADER_LEN * i;

    if (pos + BND4_ENTRY_HEADER_LEN > raw.length) {
      console.warn(`File too small to read entry #${i} header`);
      break;
    }

    // Check entry header magic
    if (!startsWithAt(raw, ENTRY_MAGIC, pos)) {
      console.warn(`Entry header #${i} does not match expected magic - skipping`);
      continue;
    }

    const entrySize = readUint32LE(raw, pos + 8);
    const entryDataOffset = readUint32LE(raw, pos + 16);

    // Validity checks
    if (entrySize <= 0 || entrySize > 1000000000) {
      console.warn(`Entry #${i} has invalid size: ${entrySize} - skipping`);
      continue;
    }

    // The entry stores a 16-byte IV followed by non-empty AES-CBC ciphertext.
    // Reject missing or partial ciphertext blocks before passing bytes to CryptoJS.
    if (entrySize < IV_SIZE * 2 || (entrySize - IV_SIZE) % IV_SIZE !== 0) {
      console.warn(`Entry #${i} has invalid encrypted payload length - skipping`);
      continue;
    }

    if (entryDataOffset < headersEnd || entryDataOffset >= raw.length ||
        entryDataOffset + entrySize > raw.length) {
      console.warn(`Entry #${i} has invalid data offset: ${entryDataOffset} - skipping`);
      continue;
    }

    try {
      const encryptedData = raw.slice(entryDataOffset, entryDataOffset + entrySize);
      const iv = encryptedData.slice(0, IV_SIZE);
      const encryptedPayload = encryptedData.slice(IV_SIZE);

      const decryptedRaw = decryptAES(iv, encryptedPayload);
      // Skip first 4 bytes of decrypted data
      const cleanData = decryptedRaw.slice(4);

      entries.push({
        index: i,
        name: `USERDATA_${String(i).padStart(2, '0')}`,
        cleanData: cleanData,
      });
    } catch (e) {
      console.warn(`Error processing entry #${i}:`, e);
      continue;
    }
  }

  return entries;
}

// === Character Name Extraction ===

/**
 * Extract character name from BND4 entries
 * @param {Array} entries - BND4 entries
 * @returns {string} character name
 */
function getCharacterName(entries) {
  for (const entry of entries) {
    const data = entry.cleanData;
    const patternPos = findPattern(data, NAME_PATTERN, 0);

    if (patternPos !== -1) {
      const nameOffset = patternPos - 51;
      if (nameOffset < 0) continue;

      // Find proper UTF-16LE null terminator
      const searchEnd = Math.min(nameOffset + 200, data.length - 1);
      for (let i = nameOffset; i < searchEnd; i++) {
        if (data[i] === 0 && data[i + 1] === 0) {
          // Check alignment
          if ((i - nameOffset) % 2 === 0) {
            const nameBytes = data.slice(nameOffset, i);
            try {
              const decoder = new TextDecoder('utf-16le');
              return decoder.decode(nameBytes);
            } catch (e) {
              return 'Unknown';
            }
          }
        }
      }
    }
  }

  return 'Unknown';
}

// === Relic Parsing ===

/**
 * Parse relics from a decrypted entry
 * @param {Uint8Array} entryData - decrypted entry data
 * @param {Set} validItems - set of valid item IDs
 * @param {Set} validEffects - set of valid effect IDs
 * @returns {Array} array of relic objects
 */
function parseRelicsFromEntry(entryData, validItems, validEffects) {
  const dataLength = entryData.length;
  const potentialSlots = [];
  const searchLimit = dataLength - 4;

  // First pass: find potential relic slots
  for (let pos = 0; pos < searchLimit; pos++) {
    const b3 = entryData[pos + 2];
    const b4 = entryData[pos + 3];

    if (VALID_B3_VALUES.has(b3) && VALID_B4_VALUES.has(b4)) {
      const slotSize = SLOT_SIZE_MAP[b4];
      if (!slotSize || pos + slotSize > dataLength) continue;

      // Extract IDs
      const relicId = readUint32LE(entryData, pos);
      const itemId = readUint24LE(entryData, pos + 4);

      // Validate item ID
      if (!validItems.has(itemId)) continue;

      // Extract effect IDs
      const effectKeys = [
        readUint32LE(entryData, pos + 16),
        readUint32LE(entryData, pos + 20),
        readUint32LE(entryData, pos + 24),
        readUint32LE(entryData, pos + 28),
      ];

      // Validate effects
      let allValid = true;
      let validCount = 0;
      for (const effId of effectKeys) {
        if (effId !== EMPTY_EFFECT) {
          if (!validEffects.has(effId)) {
            allValid = false;
            break;
          }
          validCount++;
        }
      }

      if (!allValid || validCount === 0) continue;

      // Extract debuff keys
      const debuffKeys = [
        readUint32LE(entryData, pos + 56),
        readUint32LE(entryData, pos + 60),
        readUint32LE(entryData, pos + 64),
        readUint32LE(entryData, pos + 68),
      ];

      // Build effects list
      const effects = [];
      for (let idx = 0; idx < effectKeys.length; idx++) {
        const effKey = effectKeys[idx];
        if (effKey !== EMPTY_EFFECT) {
          const debuffKey = debuffKeys[idx];
          if (debuffKey !== EMPTY_EFFECT) {
            effects.push([effKey, debuffKey]);
          } else {
            effects.push([effKey]);
          }
        }
      }

      // Store potential slot
      potentialSlots.push({
        id: relicId,
        itemId: itemId,
        effects: effects,
      });
    }
  }

  // Build sort key index in single O(N) pass
  const sortKeyIndex = new Map();
  const scanEnd = dataLength - 8;
  for (let i = 0; i <= scanEnd; i++) {
    if (entryData[i + 4] === 0x01 && entryData[i + 5] === 0x00 &&
        entryData[i + 6] === 0x00 && entryData[i + 7] === 0x00) {
      const candidateId = readUint32LE(entryData, i);
      if (!sortKeyIndex.has(candidateId)) {
        sortKeyIndex.set(candidateId, i);
      }
    }
  }

  // Second pass: look up sort keys from index (O(1) per relic)
  const relics = [];
  for (const slot of potentialSlots) {
    const sortKeyPos = sortKeyIndex.get(slot.id);
    if (sortKeyPos !== undefined) {
      const sortKey = readUint16LE(entryData, sortKeyPos + 8);
      relics.push({
        id: slot.id,
        itemId: slot.itemId,
        effects: slot.effects,
        sortKey: sortKey,
      });
    }
  }

  // Sort by sort key (descending)
  relics.sort((a, b) => b.sortKey - a.sortKey);
  return relics;
}

// === Coordinate Assignment ===

/**
 * Set coordinates for relics
 * @param {Array} relics - parsed relics
 * @param {Object} itemsData - items data (id -> info)
 * @returns {Array} relics with coordinates set
 */
function setCoordinates(relics, itemsData) {
  // Single pass: separate normal/deep, assign coordinates and color indices
  const normalColorCounters = { Red: 0, Blue: 0, Yellow: 0, Green: 0 };
  const deepColorCounters = { Red: 0, Blue: 0, Yellow: 0, Green: 0 };
  let normalIdx = 0;
  let deepIdx = 0;

  for (const relic of relics) {
    const item = itemsData[relic.itemId];
    const color = item ? item.color || 'Red' : 'Red';
    const isDeep = item && item.type === 'DeepRelic';

    if (isDeep) {
      relic.coordinates = [deepIdx >> 3, deepIdx & 7];
      const colorIdx = deepColorCounters[color];
      relic.coordinatesByColor = [colorIdx >> 3, colorIdx & 7];
      deepColorCounters[color]++;
      deepIdx++;
    } else {
      relic.coordinates = [normalIdx >> 3, normalIdx & 7];
      const colorIdx = normalColorCounters[color];
      relic.coordinatesByColor = [colorIdx >> 3, colorIdx & 7];
      normalColorCounters[color]++;
      normalIdx++;
    }
  }

  return relics;
}

// === Main Parse Function ===

/**
 * Locate the battle-record block using the adjacent character and Nightlord
 * tables. Their numbered rows are stable, while the whole block can move when
 * earlier save sections change size. Offsets below are relative to cleanData.
 */
function findBattleRecordShift(main) {
  if (!main) return null;
  const characterBase = 295401, nightlordDistance = 299941 - characterBase;
  for (let base = 0; base + nightlordDistance + 12 * 9 + 9 < main.length; base++) {
    if (main[base + 8] !== 2 || main[base + nightlordDistance + 8] !== 1) continue;
    let matched = true;
    for (let i = 1; i < 9; i++) {
      if (main[base + 8 + i * 12] !== i + 2 || main[base + nightlordDistance + 8 + i * 12] !== i + 1) {
        matched = false; break;
      }
    }
    if (matched) return base - characterBase;
  }
  return null;
}
function parseBattleRecords(entries) {
  const main = entries.find(entry => entry.index === 0)?.cleanData;
  const profile = entries.find(entry => entry.index === 10)?.cleanData;
  const shift = findBattleRecordShift(main);
  const read = (data, offset) => data && offset >= 0 && offset + 4 <= data.length ? readUint32LE(data, offset) : null;
  const safe = (data, offset, max = 0xffffffff) => {
    const value = read(data, offset);
    return value !== null && value <= max ? value : null;
  };
  const duration = seconds => {
    if (seconds === null || !Number.isFinite(seconds)) return null;
    const whole = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(whole / 3600), minutes = Math.floor(whole % 3600 / 60), secs = whole % 60;
    return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  };
  const at = offset => shift === null ? null : safe(main, offset + shift);
  const rows = (offset, names) => names.map((name, index) => ({name, count: at(offset + index * 12)}));
  const characterNames = ['追踪者','守护者','铁之眼','女爵','无赖','复仇者','隐士','执行者','学者','送葬者'];
  // The save stores the final three in a different order than the page's visual roster.
  const nightlordNames = ['格拉狄乌斯','艾德雷','格诺斯塔','玛利斯','利普拉','弗格尔','卡莉果','布德奇冥','哈尔莫妮亚','史莱格斯'];
  const total = {
    specialTerrain: at(177781), ambushEvents: at(177785), endingsReached: at(177705),
    runesEarned: at(177845), runesSpent: at(177837), darksignsEarned: at(177853), lordProofs: at(177861),
    weapons: at(177817), effectsAndBlessings: at(177809), enemiesDefeated: at(177749),
    strongEnemiesDefeated: at(177753), chestsOpened: at(177757), rescues: at(177801)
  };
  const peak = {
    strongestAttack: at(177789), runesEarned: at(177793), runesSpent: at(177797), runesLost: at(177821),
    specialEffects: at(177813), enemiesDefeated: at(177765), strongEnemiesDefeated: at(177769),
    chestsOpened: at(177773), rescues: at(177805)
  };
  const deepTotal = {
    specialTerrain: at(177941), ambushEvents: at(177945), runesEarned: at(178005), runesSpent: at(177997),
    darksignsEarned: at(178013), lordProofs: at(178021), weapons: at(177977), effectsAndBlessings: at(177969),
    enemiesDefeated: at(177909), strongEnemiesDefeated: at(177913), variantEnemiesDefeated: at(177985),
    chestsOpened: at(177917), rescues: at(177961)
  };
  // Deep of Night progression lives in the global profile (entry 10), not in
  // the battle-record table. The profile parser removes the 4-byte checksum,
  // so the game's 0x1334 max-rank field is at 0x1330 here. Rank 32 is the
  // highest internal rank; the supplied in-game record displays it as
  // Depth 5 / 9999. Other rank-to-rating values need separate calibration.
  const profileLooksValid = profile && read(profile, 0) === 303;
  const highestDeepRank = profileLooksValid ? safe(profile, 0x1330, 32) : null;
  const deepPeak = {
    strongestAttack: at(177949), runesEarned: at(177953), runesSpent: at(177957),
    runesLost: at(177981), specialEffects: at(177973), enemiesDefeated: at(177925),
    strongEnemiesDefeated: at(177929), variantEnemiesDefeated: at(177989), chestsOpened: at(177933), rescues: at(177965)
  };
  const playSeconds = safe(profile, 0x1984, 100000000);
  const sortieMilliseconds = at(177677);
  return {
    layoutStatus: shift === null ? 'unmapped' : 'mapped',
    playTime: duration(playSeconds),
    sortieTime: sortieMilliseconds === null ? null : duration(sortieMilliseconds / 1000),
    sorties: at(177681), wins: at(177685), winStreak: at(177693), deepWinStreak: at(177701),
    characterUsage: rows(295401, characterNames), nightlordDefeats: rows(299941, nightlordNames),
    total, peak, deepTotal, deepPeak,
    limitations: shift === null ? ['无法可靠定位此存档的战绩表；游玩时间以外的字段尚未解析。'] : [],
    highestDeepRank
  };
}

/**
 * Parse an SL2 save file and return structured relic data
 * @param {ArrayBuffer} arrayBuffer - raw file data
 * @param {Object} itemsData - items data { items: { id: { key, color, type, ... } } }
 * @param {Object} effectsData - effects data { effects: { id: { key, name_en, name_ja, ... } } }
 * @returns {Object} parsed relic data
 */
function parseSaveFile(arrayBuffer, itemsData, effectsData) {
  // Build lookup maps and validation sets in single pass
  const itemsMap = {};
  const validItems = new Set();
  for (const [id, item] of Object.entries(itemsData.items || {})) {
    const numId = parseInt(id);
    itemsMap[numId] = item;
    validItems.add(numId);
  }

  const effectsMap = {};
  const validEffects = new Set();
  for (const [id, effect] of Object.entries(effectsData.effects || {})) {
    const numId = parseInt(id);
    effectsMap[numId] = effect;
    validEffects.add(numId);
  }

  // Decrypt save file
  const entries = decryptSaveFile(arrayBuffer);
  if (entries.length === 0) {
    throw new Error('No BND4 entries found');
  }

  // Get character name
  const characterName = getCharacterName(entries);

  // Relics live in original BND4 Entry 0. decryptSaveFile() may skip malformed
  // entries, so the first successfully decrypted entry is not necessarily 0.
  const entry0 = entries.find(entry => entry.index === 0);
  if (!entry0) {
    throw new Error('存档主要数据条目损坏或缺失，无法读取遗物。');
  }
  const relics = parseRelicsFromEntry(entry0.cleanData, validItems, validEffects);

  // Set coordinates
  setCoordinates(relics, itemsMap);

  // Convert to output format
  const relicsOutput = [];
  for (const relic of relics) {
    const effectsList = [];
    for (const effectGroup of relic.effects) {
      const effectDict = [];
      for (const effId of effectGroup) {
        const effInfo = effectsMap[effId] || {};
        const effNameEn = effInfo.name_en || effInfo.key || `Unknown Effect ${effId}`;
        const effNameJa = effInfo.name_ja || effNameEn;
        const effKey = effInfo.key || String(effId);

        effectDict.push({
          id: effId,
          key: effKey,
          name_en: effNameEn,
          name_ja: effNameJa,
        });
      }
      effectsList.push(effectDict);
    }

    const itemInfo = itemsMap[relic.itemId] || {};
    const itemKey = itemInfo.key || `Unknown Item ${relic.itemId}`;
    const itemNameEn = itemInfo.name_en || itemKey;
    const itemNameJa = itemInfo.name_ja || itemNameEn;

    relicsOutput.push({
      id: relic.id,
      itemId: relic.itemId,
      itemKey: itemKey,
      itemNameEn: itemNameEn,
      itemNameJa: itemNameJa,
      itemColor: itemInfo.color || null,
      itemType: itemInfo.type || null,
      effects: effectsList,
      coordinates: relic.coordinates,
      coordinatesByColor: relic.coordinatesByColor,
      sortKey: relic.sortKey || 0,
    });
  }

  return {
    file: 'uploaded',
    characterName: characterName,
    totalRelics: relicsOutput.length,
    relics: relicsOutput,
    battleRecords: parseBattleRecords(entries),
  };
}
