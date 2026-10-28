/* Browser-local Nightreign save editor. The write path stays disabled until
   a supported game version and in-game round trip have been verified. */
const EDITOR_EMPTY = 0xffffffff;
// The fixed layout has not been validated against an authorized game save and
// in-game round trip. Keep the write path closed until that evidence exists.
const EDITOR_WRITE_ENABLED = false;
const EDITOR_STATE_COUNT = 5120;
const EDITOR_ENTRY_COUNT = 3065;
const EDITOR_STATE_SIZE = {0:8,8:88,9:16,11:8,12:80};

function editorWriteU32(data, offset, value) {
  new DataView(data.buffer, data.byteOffset, data.byteLength).setUint32(offset, value >>> 0, true);
}
function editorReadU16(data, offset) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(offset, true);
}
function editorWordArrayBytes(wordArray) {
  const out = new Uint8Array(wordArray.sigBytes);
  for (let i=0; i<out.length; i++) out[i] = (wordArray.words[i>>>2] >>> (24-(i%4)*8)) & 255;
  return out;
}
function editorEntryMeta(raw, index) {
  const pos = 64 + index*32;
  if (pos+32>raw.length || !startsWithAt(raw, ENTRY_MAGIC, pos)) throw new Error(`存档条目 ${index} 格式不符`);
  const size = readUint32LE(raw,pos+8), offset = readUint32LE(raw,pos+16);
  if (size<32 || offset+size>raw.length || (size-16)%16!==0) throw new Error(`存档条目 ${index} 长度异常`);
  return {size,offset,iv:raw.slice(offset,offset+16)};
}
function editorLoadoutLayout(data, relicOffsets) {
  let cursor=0x10;
  for(let i=0;i<EDITOR_STATE_COUNT;i++){
    if(cursor+8>data.length)throw new Error('遗物状态区不完整');
    const handle=readUint32LE(data,cursor),type=handle>>>28,size=EDITOR_STATE_SIZE[type]||8;
    if(cursor+size>data.length)throw new Error('遗物状态区结构不匹配');
    if(type===12&&handle)relicOffsets.set(handle,cursor);
    cursor+=size;
  }
  const itemEntries=cursor+0x94+0x5b8+4;
  const loadout=itemEntries+EDITOR_ENTRY_COUNT*14+0x21a;
  if(loadout+20>data.length || editorReadU16(data,loadout)!==0xc2)throw new Error('未识别到供具装配区');
  const chunkSize=readUint32LE(data,loadout+4),heroes=editorReadU16(data,loadout+10);
  const universal=editorReadU16(data,loadout+12),heroVessels=editorReadU16(data,loadout+14);
  if(heroes!==10||universal>12||heroVessels>120||chunkSize<20||loadout+8+chunkSize>data.length)throw new Error('供具装配区结构不匹配');
  const vesselOffsets=new Map(),heroTypes=new Set();
  cursor=loadout+20;
  for(let h=0;h<heroes;h++){
    if(cursor+8+universal*28>loadout+8+chunkSize)throw new Error('渡夜者供具数据不完整');
    const heroType=data[cursor];heroTypes.add(heroType);cursor+=8;
    for(let i=0;i<universal;i++,cursor+=28){
      const vesselId=readUint32LE(data,cursor);
      vesselOffsets.set(`${heroType}:${vesselId}`,cursor+4);
    }
  }
  for(let i=0;i<heroVessels;i++,cursor+=28){
    if(cursor+28>loadout+8+chunkSize)throw new Error('角色供具数据不完整');
    const vesselId=readUint32LE(data,cursor),heroType=Math.floor(vesselId/1000);
    if(heroTypes.has(heroType))vesselOffsets.set(`${heroType}:${vesselId}`,cursor+4);
  }
  return {relicOffsets,vesselOffsets};
}

function createSaveEditor(arrayBuffer) {
  // Keep a read-only view of the original bytes; edits are staged in decrypted copies.
  const raw=new Uint8Array(arrayBuffer),entryMeta=new Map(),fullEntries=new Map(),cleanEntries=new Map();
  if(!startsWithAt(raw,[0x42,0x4e,0x44,0x34],0))throw new Error('仅支持 PC 版 BND4 .sl2 存档');
  for(const index of [0,10]){
    const meta=editorEntryMeta(raw,index);
    const full=decryptAES(meta.iv,raw.slice(meta.offset+16,meta.offset+meta.size));
    if(full.length!==meta.size-16)throw new Error('存档条目解密长度不符');
    entryMeta.set(index,meta);fullEntries.set(index,full);cleanEntries.set(index,full.slice(4));
  }
  const relicOffsets=new Map(),layout=editorLoadoutLayout(cleanEntries.get(0),relicOffsets);
  const profile=cleanEntries.get(10);
  if(readUint32LE(profile,0)!==303)throw new Error('全局档案版本不匹配');
  const dirty=new Set();
  return {
    relicCount:relicOffsets.size,
    readVessel(heroType,vesselId){
      const offset=layout.vesselOffsets.get(`${heroType}:${vesselId}`);
      if(offset===undefined)return null;
      const data=cleanEntries.get(0);return Array.from({length:6},(_,i)=>readUint32LE(data,offset+i*4));
    },
    readRelic(handle){
      const offset=relicOffsets.get(handle>>>0);if(offset===undefined)return null;
      const data=cleanEntries.get(0);
      return {effects:[0x10,0x14,0x18].map(x=>readUint32LE(data,offset+x)),curses:[0x38,0x3c,0x40].map(x=>readUint32LE(data,offset+x))};
    },
    setRelic(handle,effects,curses){
      if(!EDITOR_WRITE_ENABLED)throw new Error('存档写回尚未完成格式兼容性与游戏内验收，当前仅支持只读解析');
      const offset=relicOffsets.get(handle>>>0);
      if(offset===undefined)throw new Error('这件遗物不在可编辑的物品状态区');
      if(effects.length!==3||curses.length!==3)throw new Error('遗物词条数量不符');
      const data=cleanEntries.get(0);
      effects.forEach((value,i)=>editorWriteU32(data,offset+0x10+i*4,value));
      curses.forEach((value,i)=>editorWriteU32(data,offset+0x38+i*4,value));
      dirty.add(0);
    },
    setVessel(heroType,vesselId,handles){
      if(!EDITOR_WRITE_ENABLED)throw new Error('存档写回尚未完成格式兼容性与游戏内验收，当前仅支持只读解析');
      const offset=layout.vesselOffsets.get(`${heroType}:${vesselId}`);
      if(offset===undefined)throw new Error('存档中没有这一角色的指定供具');
      if(handles.length!==6||new Set(handles.filter(Boolean)).size!==handles.filter(Boolean).length)throw new Error('装配中有重复遗物');
      if(handles.some(handle=>handle!==0&&!relicOffsets.has(handle>>>0)))throw new Error('装配包含存档中不存在的遗物');
      handles.forEach((handle,i)=>editorWriteU32(cleanEntries.get(0),offset+i*4,handle));
      dirty.add(0);
    },
    get hasChanges(){return dirty.size>0},
    originalBytes(){return raw.slice()},
    exportBytes(){
      if(!EDITOR_WRITE_ENABLED)throw new Error('存档写回尚未完成格式兼容性与游戏内验收，禁止导出修改后的存档');
      if(!dirty.size)throw new Error('尚无暂存的存档修改');
      const output=raw.slice();
      for(const index of dirty){
        const full=fullEntries.get(index).slice(),clean=cleanEntries.get(index),meta=entryMeta.get(index);
        full.set(clean,4);
        const checksumOffset=full.length-28;
        const digest=CryptoJS.MD5(CryptoJS.lib.WordArray.create(full.slice(4,checksumOffset)));
        full.set(editorWordArrayBytes(digest),checksumOffset);
        const encrypted=CryptoJS.AES.encrypt(CryptoJS.lib.WordArray.create(full),DS2_KEY_PARSED,{iv:CryptoJS.lib.WordArray.create(meta.iv),mode:CryptoJS.mode.CBC,padding:CryptoJS.pad.NoPadding});
        const bytes=editorWordArrayBytes(encrypted.ciphertext);
        if(bytes.length!==meta.size-16)throw new Error('重新加密后的长度不符');
        output.set(bytes,meta.offset+16);
      }
      return output;
    }
  };
}
