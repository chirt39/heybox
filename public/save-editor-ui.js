/* Read-only save status and backup controls. Write-back awaits format and
   in-game round-trip validation for an authorized save version. */
const SAVE_EDITOR_WRITE_ENABLED=false;
const saveEditBar=document.createElement('section');
saveEditBar.id='save-edit-bar';saveEditBar.className='save-edit-bar';saveEditBar.hidden=true;
saveEditBar.innerHTML='<div><span class="card-kicker">SAVE WORKSHOP / 存档工坊</span><h2>存档写回尚未验收</h2><p>当前仅支持只读解析。固定偏移与档案标记尚不能证明存档版本兼容，暂不提供词条或供具修改与导出。</p><strong id="save-edit-state">只读模式</strong></div><div class="save-edit-actions"><button type="button" class="button ghost" id="save-backup">下载原始备份</button></div>';
$('#relic-dashboard').before(saveEditBar);

const vesselEditor=document.createElement('div');
vesselEditor.id='vessel-editor';vesselEditor.className='vessel-editor';vesselEditor.hidden=true;
vesselEditor.innerHTML='<button type="button" class="button ghost" id="vessel-load">读取此供具的原有装配</button><button type="button" class="button ghost" id="vessel-stage">将当前装配暂存到导出文件</button><span id="vessel-edit-status" role="status"></span>';
$('.loadout-layout').before(vesselEditor);

const relicDialog=document.createElement('dialog');
relicDialog.id='relic-edit-dialog';relicDialog.className='relic-edit-dialog';
relicDialog.innerHTML='<form id="relic-edit-form"><header><div><span class="card-kicker">RELIC EDITOR</span><h2 id="relic-edit-title">编辑遗物词条</h2><p id="relic-edit-subtitle"></p></div><button type="button" id="relic-edit-close" aria-label="关闭">×</button></header><p class="hint">搜索中文名或 ID 选择词条。负面词条保持在对应正面词条下方。</p><div id="relic-edit-rows"></div><datalist id="editor-positive-options"></datalist><datalist id="editor-curse-options"></datalist><p id="relic-edit-status" class="hint" role="status"></p><footer><button type="button" class="button ghost" id="relic-edit-cancel">取消</button><button type="submit" class="button primary">暂存词条修改</button></footer></form>';
document.body.append(relicDialog);

function editorSetStatus(message,error=false){
  $('#save-edit-state').textContent=message;
  $('#save-edit-state').classList.toggle('error',error);
  const exportButton=$('#save-export');if(exportButton)exportButton.disabled=!state.saveEditor?.hasChanges;
}
function renderSaveEditorUi(){
  const available=!!state.saveEditor;
  saveEditBar.hidden=!available;vesselEditor.hidden=true;
  if(!available){if(relicDialog.open)relicDialog.close();return}
  editorSetStatus(SAVE_EDITOR_WRITE_ENABLED?(state.saveEditor.hasChanges?'已暂存修改，可下载新存档':'尚无修改'):'只读模式 · 写回未验收');
}
function decorateRelicEditorCards(rows){
  if(!state.saveEditor||!SAVE_EDITOR_WRITE_ENABLED)return;
  $$('#relic-list article.relic-card').forEach((card,index)=>{
    const relic=rows[index];if(!relic||!state.saveEditor.readRelic(relic.id))return;
    const button=document.createElement('button');button.type='button';button.className='relic-edit-button';
    button.dataset.editRelic=String(relic.id);button.textContent='编辑词条 ↗';
    card.append(button);
  });
}
function editorTierAllowed(id,deep,curse){
  if(curse)return id>=6800000&&id<7000000;
  if(id>0&&id<1000000)return true;
  return deep?id>=6000000&&id<6800000:id>=7000000&&id<8000000;
}
function editorEffectLabel(id){
  if(id===EDITOR_EMPTY)return '';
  const data=state.effects?.effects?.[id];
  return `${effectName({...data,id})} #${id}`;
}
function editorPopulateOptions(deep){
  const all=Object.entries(state.effects?.effects||{});
  const toOptions=(curse)=>all.filter(([id])=>editorTierAllowed(Number(id),deep,curse)).map(([id])=>`<option value="${esc(editorEffectLabel(Number(id)))}"></option>`).join('');
  $('#editor-positive-options').innerHTML=toOptions(false);
  $('#editor-curse-options').innerHTML=deep?toOptions(true):'';
}
let editingRelic=null;
function openRelicEditor(handle){
  const relic=state.save?.relics.find(r=>r.id===handle),fields=state.saveEditor?.readRelic(handle);
  if(!relic||!fields)return;
  editingRelic=relic;
  const deep=relicType(relic)==='DeepRelic';editorPopulateOptions(deep);
  $('#relic-edit-title').textContent=relicName(relic);
  $('#relic-edit-subtitle').textContent=`${deep?'深夜':'普通'} · ${colorZh[relic.itemColor]||relic.itemColor}色 · 实例 #${handle}`;
  $('#relic-edit-rows').innerHTML=Array.from({length:3},(_,i)=>`<div class="relic-edit-pair"><span class="relic-edit-index">${i+1}</span><label>正面词条<input data-positive="${i}" list="editor-positive-options" autocomplete="off" value="${esc(editorEffectLabel(fields.effects[i]))}" placeholder="留空则移除此词条"></label>${deep?`<label>对应负面词条<input data-curse="${i}" list="editor-curse-options" autocomplete="off" value="${esc(editorEffectLabel(fields.curses[i]))}" placeholder="可留空"></label>`:''}</div>`).join('');
  $('#relic-edit-status').textContent='';relicDialog.showModal();
}
function editorParseEffect(input,deep,curse){
  const value=input.trim();if(!value)return EDITOR_EMPTY;
  const id=Number((value.match(/#(\d+)\s*$/)||[])[1]||(/^\d+$/.test(value)?value:NaN));
  if(!Number.isInteger(id)||!state.effects.effects[id]||!editorTierAllowed(id,deep,curse))throw new Error(`词条“${value}”不能放在此位置`);
  return id;
}
$('#relic-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-edit-relic]');if(button)openRelicEditor(Number(button.dataset.editRelic));
});
$('#relic-edit-close').addEventListener('click',()=>relicDialog.close());
$('#relic-edit-cancel').addEventListener('click',()=>relicDialog.close());
$('#relic-edit-form').addEventListener('submit',event=>{
  event.preventDefault();if(!editingRelic||!state.saveEditor)return;
  try{
    const deep=relicType(editingRelic)==='DeepRelic';
    const current=state.saveEditor.readRelic(editingRelic.id);
    const positives=$$('#relic-edit-rows [data-positive]').map(input=>editorParseEffect(input.value,deep,false));
    const curses=deep?$$('#relic-edit-rows [data-curse]').map(input=>editorParseEffect(input.value,true,true)):current.curses;
    const filled=positives.filter(x=>x!==EDITOR_EMPTY);
    if(filled.length!==new Set(filled).size)throw new Error('同一件遗物不能重复选择相同的正面词条');
    if(editingRelic.itemId>=1000000){
      const heroes=new Set(filled.map(id=>(state.effects.effects[id]?.name_en||'').match(/^\[([^\]]+)\]/)?.[1]).filter(Boolean));
      if(heroes.size>1)throw new Error('随机遗物不能混用不同渡夜者的专属词条');
    }
    if(curses.some((x,i)=>x!==EDITOR_EMPTY&&positives[i]===EDITOR_EMPTY))throw new Error('负面词条必须跟在对应的正面词条后面');
    const usedCurses=curses.filter(x=>x!==EDITOR_EMPTY);
    if(usedCurses.length!==new Set(usedCurses).size)throw new Error('同一件遗物不能重复选择相同的负面词条');
    state.saveEditor.setRelic(editingRelic.id,positives,curses);
    editingRelic.effects=positives.map((id,i)=>id===EDITOR_EMPTY?null:[id,...(curses[i]===EDITOR_EMPTY?[]:[curses[i]])].map(effectId=>({id:effectId,key:state.effects.effects[effectId]?.key||String(effectId),...state.effects.effects[effectId]}))).filter(Boolean);
    invalidateBuildResults();renderRelicCategoryOptions();filterRelics();renderBuildWorkspace();renderEffectOptions();
    editorSetStatus(`已暂存 ${relicName(editingRelic)} 的词条修改`);relicDialog.close();
  }catch(error){$('#relic-edit-status').textContent=error.message}
});

const EDITOR_UNIVERSAL_VESSELS={sacredErdtreeGrail:19000,spiritTreeGrail:19001,giantTreeGrail:19002,scadutreeGrail:19010};
function editorSelectedVessel(){
  const character=$('#character-select').value,key=$('#vessel-select').value;
  const heroType=Object.keys(state.vessels.characters).indexOf(character)+1;
  const vesselId=EDITOR_UNIVERSAL_VESSELS[key]??heroType*1000+Object.keys(state.vessels.characters[character].vessels).indexOf(key);
  if(heroType<1||vesselId<0)throw new Error('无法识别当前角色或供具');
  return {heroType,vesselId};
}
$('#vessel-load').addEventListener('click',()=>{
  try{
    if(!state.saveEditor)throw new Error('请重新上传原始存档');
    const {heroType,vesselId}=editorSelectedVessel(),handles=state.saveEditor.readVessel(heroType,vesselId);
    if(!handles)throw new Error('该供具在存档中不存在');
    const indices=handles.map(handle=>handle?state.save.relics.findIndex(r=>r.id===handle):null);
    if(indices.some(index=>index===-1))throw new Error('供具包含尚未识别的遗物，不能安全载入');
    state.equipped={normal:indices.slice(0,3),deep:indices.slice(3)};
    renderBuildWorkspace();$('#vessel-edit-status').textContent='已载入此供具的原有装配，可继续调整。';
  }catch(error){$('#vessel-edit-status').textContent=error.message}
});
$('#vessel-stage').addEventListener('click',()=>{
  try{
    if(!state.saveEditor)throw new Error('请重新上传原始存档');
    const {heroType,vesselId}=editorSelectedVessel(),previous=state.saveEditor.readVessel(heroType,vesselId);
    if(!previous)throw new Error('该供具在存档中不存在');
    for(const group of ['normal',...($('#build-mode').value==='combined'?['deep']:[])])for(let i=0;i<3;i++){
      const index=state.equipped[group][i];if(index!==null&&!canEquip(index,group,i))throw new Error(`${group==='normal'?'普通':'深夜'}第 ${i+1} 槽的遗物与供具不匹配`);
    }
    const toHandle=index=>index===null?0:state.save.relics[index].id;
    const handles=[...state.equipped.normal.map(toHandle),...($('#build-mode').value==='combined'?state.equipped.deep.map(toHandle):previous.slice(3))];
    state.saveEditor.setVessel(heroType,vesselId,handles);
    const message=`已暂存 ${vesselName($('#vessel-select').value,$('#character-select').value)} 的装配，下载新存档后生效。`;
    $('#vessel-edit-status').textContent=message;editorSetStatus(message);
  }catch(error){$('#vessel-edit-status').textContent=error.message}
});
function editorDownload(bytes,name){
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('#save-backup').addEventListener('click',()=>{
  if(state.saveEditor)editorDownload(state.saveEditor.originalBytes(),(state.saveFileName||'NR0000.sl2').replace(/\.sl2$/i,'.backup.sl2'));
});
const saveExportButton=$('#save-export');
if(saveExportButton)saveExportButton.addEventListener('click',()=>{
  try{
    const bytes=state.saveEditor.exportBytes();
    editorDownload(bytes,(state.saveFileName||'NR0000.sl2').replace(/\.sl2$/i,'.edited.sl2'));
    editorSetStatus('已下载修改后的存档副本；原始文件仍未改变。');
  }catch(error){editorSetStatus(`导出失败：${error.message}`,true)}
});
renderSaveEditorUi();
