/* 渡夜图鉴：浏览器本地存档、图鉴与遗物组合界面。 */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (v) => v == null || v === '' ? '未收录' : typeof v === 'number' ? new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(v) : String(v);
const state = {enemyData:null,enemyMeta:new Map(),enemyMetaLocations:new Set(),enemyMetaCategories:new Set(),items:null,effects:null,zh:null,wikiZh:null,vessels:null,relicCatalog:null,relicRuleEffects:null,effectEncyclopediaData:null,effectEncyclopedia:[],effectEncyclopediaCategory:'all',effectEncyclopediaPage:1,save:null,saveEditor:null,saveFileName:null,enemyFiltered:[],enemyGroups:[],enemyPage:1,enemyPageSize:36,enemySelected:null,enemyUrlId:'',enemyUrlIndex:null,rules:[],ruleProfiles:[],activeRuleProfileId:null,relicFiltered:[],relicPage:1,poolPage:1,selectedEffects:new Map(),worker:null,equipped:{normal:[null,null,null],deep:[null,null,null]},selectedRelicIndex:null,buildResults:[],activeSlot:{group:'normal',index:0},slotFilterActive:false};
const typeLabel = {Relic:'普通',DeepRelic:'深夜',UniqueRelic:'独特'};
const relicColorClasses = Object.freeze({Red:'red',Blue:'blue',Yellow:'yellow',Green:'green',Any:'any'});
const relicColorClass = (relic) => {const key=String(relic?.itemColor||'Any');return `color-${Object.hasOwn(relicColorClasses,key)?relicColorClasses[key]:'any'}`};
const relicColorTag = (relic) => {const key=String(relic?.itemColor||'Any'),label=Object.hasOwn(colorZh,key)?colorZh[key]:'任意';return `<span class="relic-color-tag ${relicColorClass(relic)}"><i aria-hidden="true"></i>${esc(label)}色</span>`};
const RELIC_PAGE_SIZE=36,POOL_PAGE_SIZE=12,EFFECT_ENCYCLOPEDIA_PAGE_SIZE=18;
const characterZh = {'追跡者':'追踪者','守護者':'守护者','鉄の目':'铁之眼','レディ':'女爵','無頼漢':'无赖','復讐者':'复仇者','隠者':'隐士','執行者':'执行者','学者':'学者','葬儀屋':'送葬者'};
const characterImage = {'追跡者':'wylder','守護者':'guardian','鉄の目':'iron-eye','レディ':'duchess','無頼漢':'raider','復讐者':'revenant','隠者':'recluse','執行者':'executor','学者':'scholar','葬儀屋':'undertaker'};
const vesselZh = {urn:'器皿',goblet:'杯盅',chalice:'高脚杯',sootCoveredUrn:'熏黑的器皿',sealedUrn:'封印的器皿',decrepitGoblet:'破旧的杯盅',forgottenGoblet:'被遗忘的杯盅',sacredErdtreeGrail:'黄金树圣杯',spiritTreeGrail:'灵魂树圣杯',giantTreeGrail:'巨人树圣杯',scadutreeGrail:'幽影树圣杯'};
const colorZh = {Red:'红',Blue:'蓝',Yellow:'黄',Green:'绿',Any:'任意'};
function vesselName(key,character){
  if((state.vessels?.universalVessels||[]).some(v=>v.key===key))return vesselZh[key]||key;
  const name=characterZh[character]||character||'渡夜者';
  if(key==='sootCoveredUrn')return `熏黑的${name}器皿`;
  if(key==='sealedUrn')return `封印的${name}器皿`;
  if(key==='decrepitGoblet')return `破旧的${name}杯盅`;
  if(key==='forgottenGoblet')return `被遗忘的${name}杯盅`;
  return `${name}${vesselZh[key]||key}`;
}

function navigate(view){
  if(view==='builds'&&state.save){$('#build-empty').hidden=true;$('#build-workspace').hidden=false;renderBuildWorkspace()}
  window.dispatchEvent(new CustomEvent('nightreign:navigate',{detail:{view}}));
}
window.navigateTo=navigate;

async function loadCatalogs(){
  try{
    const catalogFiles=['enemy-data.json','items_data.json','effects_data.json','quickref_effects_zh.json','effect_names_zh.json','vessels_data.json','relic_catalog_zh.json','relic_rule_effects.json','effect_encyclopedia.json'];
    const catalogVersions=window.NIGHTREIGN_CATALOG_VERSIONS;
    if(!catalogVersions||typeof catalogVersions!=='object')throw new Error('数据版本信息缺失，请刷新页面重试。');
    const catalogs=await Promise.all(catalogFiles.map(async name=>{
      const version=catalogVersions[name];
      if(typeof version!=='string'||! /^[a-f0-9]{12}$/i.test(version))throw new Error(`${name} 的内容哈希缺失或无效，请刷新页面重试。`);
      const response=await fetch(`./${name}?v=${version}`);
      if(!response.ok)throw new Error(name+' 读取失败');
      return response.json();
    }));
    const [enemy,items,effects,zh,wikiZh,vessels,relicCatalog,relicRuleEffects,effectEncyclopediaData]=catalogs;
    Object.assign(state,{enemyData:enemy,items,effects,zh,wikiZh,vessels,relicCatalog,relicRuleEffects,effectEncyclopediaData});
    buildEffectCategoryIndex();
    renderEffectEncyclopedia();
    $('#nav-enemy-count').textContent=enemy.rows.length.toLocaleString('zh-CN');
    buildEnemyMetadata();
    setupEnemyFilters();
    restoreEnemyUrlState();
    filterEnemies(false);
    setupCharacters();
    restoreRules();
    $('#save-status').textContent='资料已就绪，可选择存档。';
    restoreSave();
  }catch(err){$('#enemy-count').textContent='资料载入失败';$('#save-status').textContent='资料载入失败：'+err.message;$('#save-status').classList.add('error')}
}

const bossRe=/boss|首领|夜王|夜之王|夜王者/i;
const enemyCategoryLabels={'夜王':'夜王','夜晚Boss':'夜晚首领','强敌boss':'强敌首领','中boss':'中型首领','小boss':'小型首领','boss':'Boss','封印监牢':'封印监牢','古代封印监牢':'古代封印监牢','特殊':'特殊敌人'};
const enemyFilterOptions=[['all','全部敌人'],['boss','全部首领'],['nightlord','夜王'],['nightboss','夜晚首领'],['fieldboss','野外首领'],['sealed','封印监牢'],['ancient','古代封印监牢'],['special','特殊敌人'],['otherboss','未细分首领'],['other','其他敌人']];
const fieldBossCategories=new Set(['强敌boss','boss','小boss','中boss']);
// Repository evidence: rows 31700020 and 31800020 share the explicit “山顶 遗迹Boss” tag.
// Require a recognized location on the child row and inherit location only, never category.
const enemyLocationOnlyParents=new Map([['白金之子弓手的狼','白金之子弓手']]);
function enemyName(r){return String(r[0]||'未知敌人')}
function isBoss(r){return !enemyLocationOnlyParents.has(normalizeName(enemyName(r)))&&bossRe.test(enemyName(r))}
function enemyGroupName(r){return enemyName(r)}
function buildEnemyMetadata(){
  const map=new Map(),locations=new Set(),categories=new Set();
  for(const row of state.enemyData.scale?.rows||[]){
    const key=normalizeName(row[0]);if(!key)continue;
    if(!map.has(key))map.set(key,[]);
    const category=String(row[2]||''),location=String(row[1]||'');
    map.get(key).push({category,location});
    if(category)categories.add(category);if(location)locations.add(location);
  }
  state.enemyMeta=map;state.enemyMetaLocations=locations;state.enemyMetaCategories=categories;
}
function enemyMetaFor(row){
  const records=state.enemyMeta.get(normalizeName(enemyName(row)))||[];
  const context=[...enemyName(row).matchAll(/\(([^)]*)\)|（([^）]*)）|\[([^\]]*)\]|【([^】]*)】/g)].map(match=>match.slice(1).find(Boolean)||'').join(' ').toLocaleLowerCase();
  const parentName=enemyLocationOnlyParents.get(normalizeName(enemyName(row)));
  if(parentName&&context){
    const recognizedLocations=[...state.enemyMetaLocations].filter(value=>context.includes(value.toLocaleLowerCase()));
    if(recognizedLocations.length){
      const parentRecords=state.enemyMeta.get(normalizeName(parentName))||[];
      const locations=new Set(parentRecords.filter(record=>recognizedLocations.includes(record.location)).map(record=>record.location).filter(Boolean));
      return {categories:new Set(),locations};
    }
  }
  if(context){
    // Qualifiers come from the scale table's known locations/categories. Once recognized,
    // an unmatched qualifier must stay unmatched instead of inheriting sibling encounters.
    const recognizedLocations=[...state.enemyMetaLocations].filter(value=>context.includes(value.toLocaleLowerCase())).sort((a,b)=>b.length-a.length);
    const recognizedCategories=[...state.enemyMetaCategories].filter(value=>context.includes(value.toLocaleLowerCase()));
    if(recognizedLocations.length)return enemyMetaFromRecords(records.filter(record=>recognizedLocations.includes(record.location)));
    if(recognizedCategories.length)return enemyMetaFromRecords(records.filter(record=>recognizedCategories.includes(record.category)));
  }
  return enemyMetaFromRecords(records);
}
function enemyMetaFromRecords(records){return {categories:new Set(records.map(record=>record.category).filter(Boolean)),locations:new Set(records.map(record=>record.location).filter(Boolean))}}
function matchesEnemyCategory(row,filter){
  if(filter==='all')return true;
  const categories=enemyMetaFor(row).categories;
  if(filter==='boss')return isBoss(row)||[...categories].some(x=>fieldBossCategories.has(x)||x==='夜王'||x==='夜晚Boss');
  if(filter==='nightlord')return categories.has('夜王');
  if(filter==='nightboss')return categories.has('夜晚Boss');
  if(filter==='fieldboss')return [...categories].some(x=>fieldBossCategories.has(x));
  if(filter==='sealed')return categories.has('封印监牢');
  if(filter==='ancient')return categories.has('古代封印监牢');
  if(filter==='special')return categories.has('特殊');
  if(filter==='otherboss')return isBoss(row)&&categories.size===0;
  if(filter==='other')return !isBoss(row)&&categories.size===0;
  return false;
}
function matchesEnemyArea(row,area){return area==='all'||enemyMetaFor(row).locations.has(area)}
function enemyCategoryLabel(row){
  const categories=enemyMetaFor(row).categories;
  for(const key of ['夜王','夜晚Boss','古代封印监牢','封印监牢','强敌boss','中boss','小boss','特殊','boss'])if(categories.has(key))return enemyCategoryLabels[key];
  return isBoss(row)?'未细分首领':'其他敌人';
}
function setupEnemyFilters(){
  const rows=state.enemyData.rows;
  $('#enemy-filter').innerHTML=enemyFilterOptions.map(([key,label])=>{const count=key==='all'?rows.length:rows.filter(row=>matchesEnemyCategory(row,key)).length;return `<option value="${key}">${label} · ${count.toLocaleString('zh-CN')}</option>`}).join('');
  const areas=[...state.enemyMetaLocations];
  $('#enemy-area').innerHTML='<option value="all">全部区域 / 遭遇</option>'+areas.map(area=>`<option value="${esc(area)}">${esc(area)}</option>`).join('');
}
function restoreEnemyUrlState(){
  const params=new URL(location.href).searchParams;
  $('#enemy-search').value=params.get('enemyQ')||'';
  $('#enemy-filter').value=enemyFilterOptions.some(([key])=>key===params.get('enemyType'))?params.get('enemyType'):'all';
  $('#enemy-area').value=[...$('#enemy-area').options].some(option=>option.value===params.get('enemyArea'))?params.get('enemyArea'):'all';
  state.enemyPage=Math.max(1,Number(params.get('enemyPage'))||1);
  state.enemyUrlId=params.get('enemyId')||'';
  const rawRecordIndex=params.get('enemyRecordIndex'),recordIndex=rawRecordIndex===null?'':Number(rawRecordIndex);
  state.enemyUrlIndex=rawRecordIndex!==null&&Number.isSafeInteger(recordIndex)&&recordIndex>=0?recordIndex:null;
}
function syncEnemyUrl(){
  const url=new URL(location.href),params=url.searchParams;
  const q=$('#enemy-search').value.trim(),type=$('#enemy-filter').value,area=$('#enemy-area').value;
  q?params.set('enemyQ',q):params.delete('enemyQ');
  type==='all'?params.delete('enemyType'):params.set('enemyType',type);
  area==='all'?params.delete('enemyArea'):params.set('enemyArea',area);
  state.enemyPage>1?params.set('enemyPage',String(state.enemyPage)):params.delete('enemyPage');
  const selectedIndex=state.enemySelected?state.enemyData.rows.indexOf(state.enemySelected):-1;
  if(selectedIndex>=0){params.set('enemyId',String(state.enemySelected[1]));params.set('enemyRecordIndex',String(selectedIndex))}
  else{params.delete('enemyId');params.delete('enemyRecordIndex')}
  url.search=params.toString();history.replaceState(null,'',url);
}
function resolveEnemyUrlMatch(filteredRows,allRows,recordIndex,enemyId){
  if(Number.isSafeInteger(recordIndex)&&recordIndex>=0){
    const indexedRow=allRows[recordIndex];
    if(indexedRow&&(!enemyId||String(indexedRow[1])===enemyId))return filteredRows.find(({index})=>index===recordIndex)||null;
  }
  return enemyId?filteredRows.find(({row})=>String(row[1])===enemyId)||null:null;
}
function filterEnemies(resetPage=true){
  if(!state.enemyData)return;
  const q=$('#enemy-search').value.trim().toLocaleLowerCase(),filter=$('#enemy-filter').value,area=$('#enemy-area').value;
  const rows=state.enemyData.rows.map((row,index)=>({row,index})).filter(({row})=>(!q||(enemyName(row)+' '+row[1]+' '+enemyCategoryLabel(row)+' '+[...enemyMetaFor(row).locations].join(' ')).toLocaleLowerCase().includes(q))&&matchesEnemyCategory(row,filter)&&matchesEnemyArea(row,area));
  state.enemyFiltered=rows;
  const groups=new Map();
  rows.forEach(item=>{const name=enemyGroupName(item.row);if(!groups.has(name))groups.set(name,{name,rows:[]});groups.get(name).rows.push(item)});
  state.enemyGroups=[...groups.values()];
  if(state.enemyUrlId||state.enemyUrlIndex!==null){const match=resolveEnemyUrlMatch(rows,state.enemyData.rows,state.enemyUrlIndex,state.enemyUrlId);if(match)state.enemySelected=match.row;state.enemyUrlId='';state.enemyUrlIndex=null}
  if(state.enemySelected&&!rows.some(({row})=>row===state.enemySelected))state.enemySelected=null;
  if(resetPage)state.enemyPage=1;renderEnemies();renderEnemyDetail(state.enemySelected);syncEnemyUrl();
}
function renderEnemies(){
  const total=state.enemyGroups.length,pages=Math.max(1,Math.ceil(total/state.enemyPageSize));
  state.enemyPage=Math.min(Math.max(state.enemyPage,1),pages);
  const start=(state.enemyPage-1)*state.enemyPageSize,groups=state.enemyGroups.slice(start,start+state.enemyPageSize);
  const variants=(group)=>group.rows.map(({row,index},variantIndex)=>`<button type="button" class="enemy-variant ${state.enemySelected===row?'active':''}" data-enemy-index="${index}"><span>${esc(enemyName(row))===esc(group.name)?`记录 ${variantIndex+1}`:esc(enemyName(row))}</span><small>ID <span class="enemy-number">${esc(row[1])}</span> · 第一天 HP <span class="enemy-number">${esc(fmt(row[2]))}</span></small></button>`).join('');
  $('#enemy-count').textContent=total?`第 ${start+1}–${start+groups.length} 组 / 共 ${total.toLocaleString('zh-CN')} 组 · ${state.enemyFiltered.length.toLocaleString('zh-CN')} 条记录`:`0 组 · 0 条记录`;
  $('#enemy-list').innerHTML=groups.length?groups.map(group=>{
    const selected=group.rows.some(({row})=>row===state.enemySelected);
    const row=group.rows[0].row,badge=enemyCategoryLabel(row);
    if(group.rows.length===1){const {index}=group.rows[0];return `<button type="button" class="enemy-row ${state.enemySelected===row?'active':''}" data-enemy-index="${index}"><span class="enemy-row-copy"><strong>${esc(enemyName(row))}</strong><small>ID <span class="enemy-number">${esc(row[1])}</span> · 第一天 HP <span class="enemy-number">${esc(fmt(row[2]))}</span></small></span><span class="badge ${isBoss(row)?'':'muted'}">${esc(badge)}</span></button>`}
    return `<details class="enemy-group" ${selected?'open':''}><summary class="enemy-row enemy-group-title"><span class="enemy-row-copy"><strong>${esc(group.name)}</strong><small>${group.rows.length} 条同名记录</small></span><span class="badge ${isBoss(row)?'':'muted'}">${esc(badge)}</span></summary><div class="enemy-variants">${variants(group)}</div></details>`;
  }).join(''):'<div class="empty-state"><h3>没有找到记录</h3><p>试试其他名称或 ID。</p></div>';
  renderPagination('enemy-pagination',total,state.enemyPageSize,state.enemyPage);
}
function normalizeName(s){return String(s||'').replace(/[「」『』“”‘’\s]/g,'').replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】/g,'').toLowerCase()}
function locationFor(row){
  return [...enemyMetaFor(row).locations].slice(0,8);
}
// 敌人表的伤害列存的是减伤百分比；图鉴使用玩家实际造成伤害的倍率。
function enemyDamageMultiplier(value){
  const reduction=Number(value);
  return value==null||value===''||!Number.isFinite(reduction)?null:Math.round((1-reduction/100)*1000)/1000;
}
function enemyDamageText(value){const multiplier=enemyDamageMultiplier(value);return multiplier==null?'未收录':`×${fmt(multiplier)}`}
function enemyElementSummary(row){
  const elements=[[9,'魔'],[10,'火'],[11,'雷'],[12,'圣']].map(([index,name])=>({name,value:enemyDamageMultiplier(row[index])})).filter(item=>item.value!=null);
  if(!elements.length)return '<div class="enemy-element-empty">四属性倍率未收录</div>';
  const highest=Math.max(...elements.map(item=>item.value)),lowest=Math.min(...elements.map(item=>item.value));
  if(highest===lowest)return `<div class="enemy-element-card neutral"><span>魔 / 火 / 雷 / 圣</span><strong>均为 ×${fmt(highest)}</strong></div>`;
  const card=(kind,value,label)=>`<div class="enemy-element-card ${kind}"><span>${label} · ${elements.filter(item=>item.value===value).map(item=>item.name).join(' / ')}</span><strong>×${fmt(value)}</strong></div>`;
  return card('high',highest,'最高倍率')+card('low',lowest,'最低倍率');
}
function renderEnemyDetail(r){
  if(!r){$('#enemy-detail').innerHTML='<div class="empty-state"><span>⚔</span><h3>选择一名敌人</h3><p>属性、抗性和可核对的出现位置会显示在这里。</p></div>';$('#enemy-detail').scrollTop=0;return}
  const c=state.enemyData.columns;
  const section=(title,indexes,open=false,extra='')=>`<details class="detail-section" ${open?'open':''}><summary><span>${title}</span><small>${indexes.length} 项</small></summary>${extra}<div class="${indexes.length>8?'resist-grid':'kv-grid'}">${indexes.map(i=>{const damage=i>=5&&i<=12,multiplier=damage?enemyDamageMultiplier(r[i]):null,tone=damage&&multiplier!=null?(multiplier>1?'damage-high':multiplier<1?'damage-low':'damage-neutral'):'';return `<div class="${indexes.length>8?'resist':'kv'} ${tone}"><span>${esc(c[i].label)}</span><strong>${esc(damage?enemyDamageText(r[i]):fmt(r[i]))}</strong></div>`}).join('')}</div>${title==='伤害倍率'?'<p class="enemy-damage-note">数值为实际受伤倍率：大于 ×1 伤害更高，小于 ×1 伤害更低。</p>':''}</details>`;
  const locations=locationFor(r);
  const sameName=state.enemyData.rows.map((row,index)=>({row,index})).filter(({row})=>enemyGroupName(row)===enemyGroupName(r));
  const recordPicker=sameName.length>1?`<label class="enemy-record-picker">同名数据<select id="enemy-record-select" aria-label="选择同名怪物数据">${sameName.map(({row,index})=>`<option value="${index}" ${row===r?'selected':''}>ID ${esc(row[1])} · HP ${esc(fmt(row[2]))}${enemyName(row)!==enemyGroupName(r)?' · '+esc(enemyName(row)):''}</option>`).join('')}</select></label>`:'';
  $('#enemy-detail').innerHTML=`<div class="detail-top"><div class="enemy-detail-title"><div><span class="card-kicker">${esc(enemyCategoryLabel(r))} / 怪物分类</span><h2>${esc(enemyName(r))}</h2><small>内部 ID <span class="enemy-number">${esc(r[1])}</span></small></div></div><span class="badge ${isBoss(r)?'':'muted'}">${esc(enemyCategoryLabel(r))}</span></div>${recordPicker}${section('核心属性',[2,3,4,24,25,26,27],true,`<div class="enemy-element-summary"><div class="enemy-element-heading">魔 / 火 / 雷 / 圣 · 最高与最低伤害倍率</div><div class="enemy-element-cards">${enemyElementSummary(r)}</div></div>`)}${section('伤害倍率',[5,6,7,8,9,10,11,12])}${section('异常状态抗性',[13,14,15,16,17,18,19,20,21,22,23])}${section('种族特攻',[38,39,40,41])}${section('属性削韧',[42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57])}<section class="detail-section location-section"><h3>出现位置</h3><p class="detail-note">${locations.length?esc(locations.join('、'))+'（同名 Boss 表可核对的遭遇分类）':'未收录可核对的具体位置'}</p></section>`;
  $('#enemy-detail').scrollTop=0;
}
$('#enemy-search').addEventListener('input',filterEnemies);$('#enemy-filter').addEventListener('change',filterEnemies);$('#enemy-area').addEventListener('change',filterEnemies);
$('#enemy-list').addEventListener('click',e=>{const btn=e.target.closest('[data-enemy-index]');if(!btn)return;state.enemySelected=state.enemyData.rows[Number(btn.dataset.enemyIndex)];renderEnemies();renderEnemyDetail(state.enemySelected);syncEnemyUrl()});
$('#enemy-list').addEventListener('toggle',e=>{if(e.target.matches('details.enemy-group')&&e.target.open)e.target.scrollIntoView({block:'nearest'})},true);
$('#enemy-pagination').addEventListener('click',e=>{const step=e.target.closest('[data-step]');if(!step)return;state.enemyPage+=Number(step.dataset.step);renderEnemies();syncEnemyUrl();$('#enemy-list').scrollTop=0});
$('#enemy-pagination').addEventListener('change',e=>{if(e.target.tagName!=='SELECT')return;state.enemyPage=Number(e.target.value);renderEnemies();syncEnemyUrl();$('#enemy-list').scrollTop=0});
$('#enemy-detail').addEventListener('change',e=>{if(e.target.id!=='enemy-record-select')return;state.enemySelected=state.enemyData.rows[Number(e.target.value)];renderEnemies();renderEnemyDetail(state.enemySelected);syncEnemyUrl()});

function effectName(e){
  const id=String(e.id??'');
  const info=state.relicRuleEffects?.definitions?.[id]||state.wikiZh?.[id]||state.zh?.mappings?.[id];
  if(info?.name||info?.name_zh)return info.name||info.name_zh;
  if(e.key){
    if(!state.effectNamesByKey){
      state.effectNamesByKey=new Map();
      for(const [effectId,effect] of Object.entries(state.effects?.effects||{})){
        const translated=state.relicRuleEffects?.definitions?.[effectId]||state.wikiZh?.[effectId]||state.zh?.mappings?.[effectId];
        const name=translated?.name||translated?.name_zh;
        if(effect.key&&name&&!state.effectNamesByKey.has(effect.key))state.effectNamesByKey.set(effect.key,name);
      }
    }
    const name=state.effectNamesByKey.get(e.key);if(name)return name;
  }
  return e.name_en||e.name_ja||e.key||`未知效果 #${e.id}`;
}
function isOutOfGameRelicEffect(e){return !!state.relicRuleEffects?.definitions?.[String(e.id??'')]}
function ruleEffectName(e){return state.relicRuleEffects?.definitions?.[String(e.id??'')]?.name||effectName(e)}
function ruleEffectCategory(e){return state.relicRuleEffects?.definitions?.[String(e.id??'')]?.type||'其他'}
function outOfGameEffectCatalog(){
  const catalog=new Map();
  for(const [id,e] of Object.entries(state.effects?.effects||{})){
    const definition=state.relicRuleEffects?.definitions?.[id];if(!e.key||!definition)continue;
    const item=catalog.get(e.key);
    if(item){item.modes=[...new Set([...item.modes,...(definition.modes||[])])];item.definitionIds.push(id)}
    else catalog.set(e.key,{...e,id,modes:[...(definition.modes||[])],definitionIds:[id]});
  }
  return catalog;
}
function renderEffectEncyclopedia(){
  const data=state.effectEncyclopediaData||{},labels=new Map((data.categories||[]).map(group=>[group.id,group.label]));
  const entries=(data.entries||[]).map(entry=>{
    const effect=state.effects?.effects?.[entry.id]||{};
    return {...entry,categoryLabel:labels.get(entry.category)||entry.category,english:effect.name_en||'',key:effect.key||''};
  }).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id));
  const types=[...new Set(entries.map(item=>item.type).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const typeSelect=$('#effect-encyclopedia-type');if(!typeSelect)return;
  typeSelect.innerHTML='<option value="all">全部类型</option>'+types.map(type=>`<option value="${esc(type)}">${esc(type)}</option>`).join('');
  state.effectEncyclopedia=entries;
  for(const button of $$('.effect-encyclopedia-categories [data-effect-category]')){
    const category=button.dataset.effectCategory,count=category==='all'?entries.length:entries.filter(item=>item.category===category).length;
    button.querySelector('span').textContent=count.toLocaleString('zh-CN');
  }
  filterEffectEncyclopedia();
}
function filterEffectEncyclopedia(resetPage=true){
  const list=$('#effect-encyclopedia-list');if(!list)return;
  const query=($('#effect-encyclopedia-search')?.value||'').trim().toLocaleLowerCase(),category=state.effectEncyclopediaCategory,type=$('#effect-encyclopedia-type')?.value||'all';
  const found=(state.effectEncyclopedia||[]).filter(item=>{
    if(category!=='all'&&item.category!==category)return false;
    if(type!=='all'&&item.type!==type)return false;
    return !query||`${item.name} ${item.type} ${item.explanation} ${item.id} ${item.english} ${item.key} ${item.categoryLabel} ${item.buffType}`.toLocaleLowerCase().includes(query);
  });
  if(resetPage)state.effectEncyclopediaPage=1;
  const pages=Math.max(1,Math.ceil(found.length/EFFECT_ENCYCLOPEDIA_PAGE_SIZE));
  state.effectEncyclopediaPage=Math.min(Math.max(state.effectEncyclopediaPage,1),pages);
  const start=(state.effectEncyclopediaPage-1)*EFFECT_ENCYCLOPEDIA_PAGE_SIZE,rows=found.slice(start,start+EFFECT_ENCYCLOPEDIA_PAGE_SIZE);
  $('#effect-encyclopedia-count').textContent=found.length?`第 ${start+1}–${start+rows.length} 条 / 共 ${found.length} 条匹配`:'0 条匹配结果';
  list.innerHTML=rows.length?rows.map(item=>`<article class="effect-encyclopedia-card" id="effect-${esc(item.category)}-${esc(item.id)}"><header><h2>${esc(item.name)}</h2><span class="effect-encyclopedia-id">#${esc(item.id)}</span></header><div class="effect-encyclopedia-tags"><span>${esc(item.categoryLabel)}</span><span>${esc(item.type)}</span>${item.buffType?`<span>${esc(item.buffType)}</span>`:''}</div><p>${esc(item.explanation||'效果说明暂未收录')}</p>${item.stackability?`<small>${esc(item.stackability)}</small>`:''}</article>`).join(''):'<div class="empty-state"><h3>没有找到匹配词条</h3><p>可以更换关键词或筛选条件。</p></div>';
  renderPagination('effect-encyclopedia-pagination',found.length,EFFECT_ENCYCLOPEDIA_PAGE_SIZE,state.effectEncyclopediaPage);
}
$('#effect-encyclopedia-search').addEventListener('input',()=>filterEffectEncyclopedia());
$('#effect-encyclopedia-type').addEventListener('change',()=>filterEffectEncyclopedia());
$('.effect-encyclopedia-categories').addEventListener('click',event=>{
  const button=event.target.closest('[data-effect-category]');if(!button)return;
  state.effectEncyclopediaCategory=button.dataset.effectCategory;
  for(const item of $$('.effect-encyclopedia-categories [data-effect-category]'))item.setAttribute('aria-pressed',String(item===button));
  filterEffectEncyclopedia();
});
$('#effect-encyclopedia-pagination').addEventListener('click',event=>{
  const step=event.target.closest('[data-step]');if(!step)return;
  state.effectEncyclopediaPage+=Number(step.dataset.step);filterEffectEncyclopedia(false);
  const pager=$('#effect-encyclopedia-pagination');pager.scrollIntoView({block:'nearest'});pager.querySelector(`[data-step="${step.dataset.step}"]:not(:disabled)`)?.focus();
});
$('#effect-encyclopedia-pagination').addEventListener('change',event=>{
  if(event.target.tagName!=='SELECT')return;
  state.effectEncyclopediaPage=Number(event.target.value);filterEffectEncyclopedia(false);
  const pager=$('#effect-encyclopedia-pagination');pager.scrollIntoView({block:'nearest'});pager.querySelector('select')?.focus();
});
function effectGroups(relic){return (relic.effects||[]).flat().filter(Boolean)}
function normalizedEffectName(name){return String(name||'').normalize('NFKC').replace(/\s+/g,'').replace(/\+\d+$/,'')}
function buildEffectCategoryIndex(){
  const keys=new Map(),names=new Map();
  for(const [id,entry] of Object.entries(state.zh?.mappings||{})){
    const category=entry.category_zh;if(!category)continue;
    const key=state.effects?.effects?.[id]?.key;
    if(key){if(!keys.has(key))keys.set(key,new Set());keys.get(key).add(category)}
    const name=normalizedEffectName(entry.name_zh);
    if(name){if(!names.has(name))names.set(name,new Set());names.get(name).add(category)}
  }
  state.categoryByKey=new Map([...keys].filter(([,categories])=>categories.size===1).map(([key,categories])=>[key,[...categories][0]]));
  state.categoryByName=new Map([...names].filter(([,categories])=>categories.size===1).map(([name,categories])=>[name,[...categories][0]]));
}
function effectCategory(e,isNegative=false){
  const id=String(e.id),exact=state.zh?.mappings?.[id]?.category_zh;
  if(exact)return exact;
  const byKey=state.categoryByKey?.get(e.key);if(byKey)return byKey;
  const name=effectName(e),byName=state.categoryByName?.get(normalizedEffectName(name));if(byName)return byName;
  const wiki=state.wikiZh?.[id]?.category_zh;
  if(wiki==='能力值')return '能力值';
  if(wiki==='绝招技艺')return '技艺/绝招';
  if(isNegative){
    if(/减伤率|受到.*伤害/.test(name))return '减益(减伤率)';
    if(/血量|生命力|专注值|集中力|精力|耐力|力气|灵巧|智力|信仰|感应/.test(name))return '减益(能力值)';
    if(/恢复|回复/.test(name))return '减益(恢复)';
    return '减益(行动)';
  }
  if(/【[^】]+】/.test(name))return '仅限特定角色';
  if(/技艺|绝招|量表/.test(name))return '技艺/绝招';
  if(/攻击力|造成的伤害|攻击伤害/.test(name))return '攻击力';
  if(/血量上限|专注值上限|精力上限|生命力|集中力|耐力|力气|灵巧|智力|信仰|感应/.test(name))return '能力值';
  if(/减伤率/.test(name))return '减伤率';
  if(/抵抗力|耐受/.test(name))return '对异常状态的抵抗力';
  if(/恢复|回复/.test(name))return '恢复';
  if(/附加.*(中毒|出血|催眠|腐败|冻伤|发狂)/.test(name))return '附加异常状态';
  if(/武器变为.*属性/.test(name))return '武器属性';
  if(/出击时|结晶露滴/.test(name))return '出击时的道具';
  if(/行动|冲刺|跳跃|回避/.test(name))return '行动';
  if(/强化/.test(name))return '强化';
  return '其他／未分类';
}
function relicEffectCategories(relic){return new Set(pairedEffects(relic).flatMap(group=>group.map((effect,index)=>effectCategory(effect,index>0))))}
function renderRelicCategoryOptions(){
  const counts=new Map();for(const relic of state.save?.relics||[])for(const category of relicEffectCategories(relic))counts.set(category,(counts.get(category)||0)+1);
  const order=[...new Set(Object.values(state.zh?.mappings||{}).map(entry=>entry.category_zh).filter(Boolean))];
  const categories=[...counts.keys()].sort((a,b)=>{const ai=order.indexOf(a),bi=order.indexOf(b);return (ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b,'zh-CN')});
  for(const id of ['relic-category','pool-category']){
    const select=$('#'+id),previous=select.value;
    select.innerHTML='<option value="all">全部词条类型</option>'+categories.map(category=>`<option value="${esc(category)}">${esc(category)}（${counts.get(category)}）</option>`).join('');
    select.value=categories.includes(previous)?previous:'all';
  }
}
function pairedEffects(relic){
  const groups=[];
  for(const raw of relic.effects||[]){
    if(Array.isArray(raw)){const group=raw.filter(Boolean);if(group.length)groups.push(group)}
    else if(raw){if(raw.isDebuff&&groups.length)groups[groups.length-1].push(raw);else groups.push([raw])}
  }
  return groups;
}
function renderEffectRows(relic,showId=false){
  const groups=pairedEffects(relic);
  return groups.length?groups.map(group=>`<div class="game-effect-row"><span class="game-effect-icon" aria-hidden="true">✧</span><div class="game-effect-copy"><span>${esc(effectName(group[0]))}${showId?`<em>#${esc(group[0].id)}</em>`:''}</span>${group.slice(1).map(e=>`<span class="game-effect-negative">${esc(effectName(e))}${showId?`<em>#${esc(e.id)}</em>`:''}</span>`).join('')}</div></div>`).join(''):'<div class="game-effect-row empty">此遗物无已识别词条</div>';
}
function relicType(r){return r.itemType||'Relic'}
function relicEntry(r){return state.relicCatalog?.items?.[r.itemKey]||null}
function safeSourceUrl(value){
  if(typeof value!=='string'||!value.trim())return '';
  try{const url=new URL(value,window.location.href);return url.protocol==='http:'||url.protocol==='https:'?url.href:''}catch{return ''}
}
function safeRelicImageUrl(value){
  if(typeof value!=='string'||!value.trim())return '';
  try{
    const url=new URL(value,window.location.href),directory=new URL('./relic-images/',window.location.href);
    if((url.protocol!=='http:'&&url.protocol!=='https:')||url.origin!==window.location.origin||url.origin!==directory.origin||url.search||url.hash||!url.pathname.startsWith(directory.pathname))return '';
    return /^[A-Za-z0-9._-]+\.png$/i.test(url.pathname.slice(directory.pathname.length))?url.href:'';
  }catch{return ''}
}
function relicName(r){return relicEntry(r)?.name_zh||r.itemNameEn||r.itemNameJa||r.itemKey||`遗物 #${r.itemId}`}
function relicCategory(r){return relicEntry(r)?.category||'未匹配图鉴'}
function relicImage(r){const entry=relicEntry(r),imageUrl=safeRelicImageUrl(entry?.image);return imageUrl?`<img class="relic-thumb" src="${esc(imageUrl)}" alt="${esc(entry.name_zh)}图标" loading="lazy" draggable="false" width="58" height="58">`:'<span class="relic-thumb relic-thumb-fallback" aria-hidden="true">◇</span>'}
function setSaveStatus(s,error=false){$('#save-status').textContent=s;$('#save-status').classList.toggle('error',error)}
function setSaveFailureStatus(message){
  const retainedDataNote=state.save?'本次没有替换当前数据；仍保留上次成功读取的遗物与装配。':'当前没有可用存档数据。';
  setSaveStatus(`${message} ${retainedDataNote}`,true);
}
function renderBattleRecords(){
  const records=state.save?.battleRecords;
  $('#records-empty').hidden=!!state.save;
  $('#records-panel').hidden=!state.save;
  if(!state.save)return;
  const labels={
    specialTerrain:'前往特异地形的次数',ambushEvents:'突袭事件的完成次数',endingsReached:'抵达结局的人数',
    runesEarned:'卢恩获得量',runesSpent:'卢恩花费量',runesLost:'失去的卢恩量',darksignsEarned:'暗痕获得量',lordProofs:'为王之证获得数',
    weapons:'获得的武器数量',effectsAndBlessings:'获得附加效果、庇佑的次数',specialEffects:'获得特殊效果的次数',
    enemiesDefeated:'打败敌人的次数',strongEnemiesDefeated:'打败强敌的次数',variantEnemiesDefeated:'打败敌人的次数（变异个体）',
    chestsOpened:'开启宝箱的次数',rescues:'救援成功的次数',strongestAttack:'最强力的攻击'
  };
  const valueText=value=>value==null?'待核对':typeof value==='number'?value.toLocaleString('zh-CN'):String(value);
  const renderRows=(target,rows)=>{const el=$('#'+target);if(el)el.innerHTML=rows.map(([label,value])=>`<div class="record-line"><span>${esc(label)}</span><strong>${esc(valueText(value))}</strong></div>`).join('')};
  const metricRows=obj=>Object.entries(obj||{}).map(([key,value])=>[labels[key]||key,value]);
  renderRows('record-overview',[['游玩时间',records?.playTime],['出击时间',records?.sortieTime],['总出击次数',records?.sorties],['胜利次数',records?.wins],['连续胜利次数',records?.winStreak],['连续胜利次数（深层区域）',records?.deepWinStreak]]);
  renderRows('record-characters',(records?.characterUsage||[]).map(x=>[x.name,x.count]));
  renderRows('record-nightlords',(records?.nightlordDefeats||[]).map(x=>[x.name,x.count]));
  renderRows('record-total',metricRows(records?.total));renderRows('record-peak',metricRows(records?.peak));
  renderRows('record-deep-total',metricRows(records?.deepTotal));renderRows('record-deep-peak',metricRows(records?.deepPeak).filter(([label])=>label!=='deepestDepth'));
  $('#record-method').textContent=records?.layoutStatus==='unmapped'
    ? '此存档的战绩表位置尚未识别，游玩时间以外的字段显示“待核对”。存档仅在浏览器本地解析。'
    : '存档在浏览器本地解析，未上传或修改原文件。战绩按存档中的记录字段读取。';
}
function setSteamCloudRecordNote(){
  const method=$('#record-method');
  if(method)method.textContent='Steam 云存档经项目后端临时转发，并在当前设备解析；云端文件未修改。';
}
async function readSave(file){
  if(!file)return;
  if(!/\.sl2$/i.test(file.name)){setSaveFailureStatus('请选择 .sl2 存档文件。');return}
  if(!state.items||!state.effects){setSaveFailureStatus('资料尚未载入，请稍后再试。');return}
  try{
    setSaveStatus(`正在本地解析 ${file.name}…`);
    await validateSaveFileHeader(file);
    const buffer=await file.arrayBuffer();
    const parsed=parseSaveFile(buffer,state.items,state.effects);
    const steamCloudSource=file.source==='steam-cloud';
    try{state.saveEditor=createSaveEditor(buffer);state.saveFileName=file.name}catch(editError){state.saveEditor=null;state.saveFileName=null;console.info('此存档暂不支持编辑：',editError.message)}
    invalidateBuildResults();
    showSave(parsed);
    if(steamCloudSource)setSteamCloudRecordNote();
    try{sessionStorage.setItem('nightreign-parsed-save-v2',JSON.stringify(parsed))}catch(_){/* 存储不可用时仍保留本页数据 */}
    try{if(steamCloudSource)sessionStorage.setItem('nightreign-parsed-save-source-v1','steam-cloud');else sessionStorage.removeItem('nightreign-parsed-save-source-v1')}catch(_){/* 来源说明不可用时不影响解析 */}
    state.equipped={normal:[null,null,null],deep:[null,null,null]};state.selectedRelicIndex=null;renderBuildWorkspace();
    const transferNote=steamCloudSource?'Steam 云文件由项目后端临时转发，并在本设备解析。':'未发送到服务器。';
    setSaveStatus(`已读取 ${parsed.relics.length} 件遗物${parsed.characterName?' · '+parsed.characterName:''}。原文件未修改；${transferNote}${state.saveEditor?'当前为只读模式；存档写回尚未验收。':'此存档版式暂不支持编辑。'}`);
  }catch(err){setSaveFailureStatus('无法解析此存档：'+(err?.message||String(err)))}
}
function showSave(parsed){
  if(!parsed||!Array.isArray(parsed.relics))throw new Error('遗物数据格式错误');
  state.save=parsed;const all=parsed.relics;
  if(typeof renderSaveEditorUi==='function')renderSaveEditorUi();
  state.relicPage=1;state.poolPage=1;state.activeSlot={group:'normal',index:0};state.slotFilterActive=false;
  $('#relic-dashboard').hidden=false;$('#build-empty').hidden=true;$('#build-workspace').hidden=false;
  $('#relic-total').textContent=all.length;
  $('#relic-normal').textContent=all.filter(r=>relicType(r)==='Relic').length;
  $('#relic-deep').textContent=all.filter(r=>relicType(r)==='DeepRelic').length;
  $('#relic-unique').textContent=all.filter(r=>relicType(r)==='UniqueRelic').length;
  $('#build-save-count').textContent=`已载入 ${all.length} 件遗物${parsed.characterName?' · '+parsed.characterName:''}`;
  renderBattleRecords();
  renderRelicCategoryOptions();filterRelics();renderEffectOptions();renderSelectedEffects();renderBuildWorkspace();
}
function restoreSave(){
    try{const raw=sessionStorage.getItem('nightreign-parsed-save-v2');if(!raw)return;const parsed=JSON.parse(raw);state.saveEditor=null;state.saveFileName=null;showSave(parsed);if(sessionStorage.getItem('nightreign-parsed-save-source-v1')==='steam-cloud')setSteamCloudRecordNote();setSaveStatus(`已恢复本页解析结果 · ${parsed.relics.length} 件遗物。`)}
  catch(_){try{sessionStorage.removeItem('nightreign-parsed-save-v2')}catch(e){}}
}
$('#save-file').addEventListener('change',e=>readSave(e.target.files[0]));
const zone=$('#drop-zone');
['dragenter','dragover'].forEach(x=>zone.addEventListener(x,e=>{e.preventDefault();zone.classList.add('drag')}));
['dragleave','drop'].forEach(x=>zone.addEventListener(x,e=>{e.preventDefault();zone.classList.remove('drag')}));
zone.addEventListener('drop',e=>readSave(e.dataTransfer.files[0]));
function filterRelics(){
  if(!state.save)return;
  const q=$('#relic-search').value.trim().toLocaleLowerCase(),category=$('#relic-category').value,type=$('#relic-type').value,color=$('#relic-color').value;
  state.relicFiltered=state.save.relics.filter(r=>{
    return (type==='all'||(type==='normal'&&relicType(r)!=='DeepRelic')||(type==='deep'&&relicType(r)==='DeepRelic'))
      &&(category==='all'||relicEffectCategories(r).has(category))
      &&(color==='all'||r.itemColor===color)
      &&(!q||(relicName(r)+' '+(r.itemNameEn||'')+' '+relicCategory(r)+' '+r.id+' '+r.itemId+' '+effectGroups(r).map(e=>effectName(e)+' '+e.name_en+' '+e.id).join(' ')).toLocaleLowerCase().includes(q));
  });
  state.relicPage=1;renderRelics();
}
function renderPagination(id,total,pageSize,page,alwaysVisible=false){
  const root=$('#'+id),pages=Math.max(1,Math.ceil(total/pageSize));
  root.hidden=pages<=1&&!alwaysVisible;
  root.innerHTML=root.hidden?'':`<button type="button" data-step="-1" ${page<=1?'disabled':''}>上一页</button><label>第 <select aria-label="选择页数">${Array.from({length:pages},(_,i)=>`<option value="${i+1}" ${i+1===page?'selected':''}>${i+1}</option>`).join('')}</select> 页 / 共 ${pages} 页</label><button type="button" data-step="1" ${page>=pages?'disabled':''}>下一页</button>`;
}
function renderRelics(){
  const total=state.relicFiltered.length,pages=Math.max(1,Math.ceil(total/RELIC_PAGE_SIZE));
  state.relicPage=Math.min(Math.max(state.relicPage,1),pages);
  const start=(state.relicPage-1)*RELIC_PAGE_SIZE,rows=state.relicFiltered.slice(start,start+RELIC_PAGE_SIZE);
  $('#relic-count').textContent=total?`第 ${start+1}–${start+rows.length} 件 / 共 ${total} 件`:'0 件';
  $('#relic-list').innerHTML=rows.map(r=>{const type=relicType(r),entry=relicEntry(r),sourcePage=safeSourceUrl(entry?.source_page),rarity={Relic:'normal',DeepRelic:'deep',UniqueRelic:'unique'}[type]||'normal',title=`<h3>${esc(relicName(r))}</h3>`;return `<article class="relic-card ${type==='DeepRelic'?'deep':type==='UniqueRelic'?'unique':''}"><header><div class="relic-identity">${relicImage(r)}<div>${sourcePage?`<a href="${esc(sourcePage)}" target="_blank" rel="noopener noreferrer" title="查看中文图鉴来源">${title}</a>`:title}<small>${esc(relicCategory(r))} · ${relicColorTag(r)}<br>实例 #${esc(r.id)} · 道具 #${esc(r.itemId)}</small></div></div><span class="badge relic-rarity-tag rarity-${rarity} ${type==='Relic'?'muted':''}">${esc(typeLabel[type]||type)}</span></header><div class="effect-list game-effect-list">${renderEffectRows(r,true)}</div></article>`}).join('')||'<div class="empty-state"><h3>没有匹配的遗物</h3><p>请调整搜索或类型筛选。</p></div>';
  if(typeof decorateRelicEditorCards==='function')decorateRelicEditorCards(rows);
  renderPagination('relic-pagination',total,RELIC_PAGE_SIZE,state.relicPage);
}
$('#relic-search').addEventListener('input',filterRelics);
for(const id of ['relic-category','relic-type','relic-color'])$('#'+id).addEventListener('change',filterRelics);
$('#relic-pagination').addEventListener('click',e=>{const step=e.target.closest('[data-step]');if(!step)return;state.relicPage+=Number(step.dataset.step);renderRelics();$('#relic-pagination').scrollIntoView({block:'start'});$('#relic-pagination [data-step="'+step.dataset.step+'"]:not(:disabled)')?.focus()});
$('#relic-pagination').addEventListener('change',e=>{if(e.target.tagName!=='SELECT')return;state.relicPage=Number(e.target.value);renderRelics();$('#relic-pagination').scrollIntoView({block:'start'});$('#relic-pagination select')?.focus()});

function setupCharacters(){
  const chars=state.vessels.characters||{};
  $('#character-select').innerHTML=Object.entries(chars).map(([key,v])=>`<option value="${esc(key)}">${esc(characterZh[key]||key)} · ${esc(v.nameEn)}</option>`).join('');
  const buildCharacter=$('#build-character-select');
  if(buildCharacter){buildCharacter.innerHTML=$('#character-select').innerHTML;buildCharacter.value=$('#character-select').value}
  renderCharacterPicker();
  updateVessels();
}
function portrait(key){return `<img class="character-portrait" src="./character-images/${esc(characterImage[key]||'wylder')}.png" alt="" loading="lazy">`}
function vesselColors(vessel){
  return `<span class="vessel-combos"><span><small>普通</small>${(vessel?.normalSlots||[]).map(c=>`<i class="color-dot color-${esc(c.toLowerCase())}" title="${esc(colorZh[c]||c)}色"></i>`).join('')}</span><span><small>深夜</small>${(vessel?.deepSlots||[]).map(c=>`<i class="color-dot color-${esc(c.toLowerCase())}" title="${esc(colorZh[c]||c)}色"></i>`).join('')}</span></span>`;
}
function renderCharacterPicker(){
  const key=$('#character-select').value,chars=state.vessels?.characters||{};
  $('#character-trigger').innerHTML=`${portrait(key)}<span><strong>${esc(characterZh[key]||key)}</strong><small>${esc(chars[key]?.nameEn||'')}</small></span><b aria-hidden="true">⌄</b>`;
  $('#character-menu').innerHTML=Object.entries(chars).map(([name,data])=>`<button type="button" role="option" aria-selected="${name===key}" data-character="${esc(name)}">${portrait(name)}<span><strong>${esc(characterZh[name]||name)}</strong><small>${esc(data.nameEn||'')}</small></span></button>`).join('');
}
function renderVesselPicker(){
  const character=$('#character-select').value,key=$('#vessel-select').value,v=currentVessel();
  if(!v)return;
  $('#vessel-trigger').innerHTML=`<span class="vessel-trigger-name">${esc(vesselName(key,character))}</span>${vesselColors(v)}<b aria-hidden="true">⌄</b>`;
  $('#vessel-menu').innerHTML=[...$('#vessel-select').options].map(option=>{const data=state.vessels.characters?.[character]?.vessels?.[option.value]||(state.vessels.universalVessels||[]).find(x=>x.key===option.value);return `<button type="button" role="option" aria-selected="${option.value===key}" data-vessel="${esc(option.value)}"><strong>${esc(vesselName(option.value,character))}</strong>${vesselColors(data)}</button>`}).join('');
}
function closePickers(){for(const name of ['character','vessel']){$('#'+name+'-menu').hidden=true;$('#'+name+'-trigger').setAttribute('aria-expanded','false')}}
for(const name of ['character','vessel']){
  const picker=$('#'+name+'-trigger').closest('.visual-picker');
  picker.addEventListener('focusout',e=>{if(!picker.contains(e.relatedTarget))closePickers()});
  $('#'+name+'-trigger').addEventListener('click',()=>{const menu=$('#'+name+'-menu'),opening=menu.hidden;closePickers();menu.hidden=!opening;$('#'+name+'-trigger').setAttribute('aria-expanded',String(opening));if(opening)menu.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'})});
  $('#'+name+'-menu').addEventListener('click',e=>{const option=e.target.closest('button[data-'+name+']');if(!option)return;$('#'+name+'-select').value=option.dataset[name];$('#'+name+'-select').dispatchEvent(new Event('change'));closePickers();$('#'+name+'-trigger').focus()});
  $('#'+name+'-trigger').addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const menu=$('#'+name+'-menu');menu.hidden=false;$('#'+name+'-trigger').setAttribute('aria-expanded','true');const options=[...menu.querySelectorAll('button')],selected=options.findIndex(x=>x.getAttribute('aria-selected')==='true');options[(selected+(e.key==='ArrowDown'?1:options.length-1))%options.length]?.focus()}else if(e.key==='Escape')closePickers()});
  $('#'+name+'-menu').addEventListener('keydown',e=>{const options=[...e.currentTarget.querySelectorAll('button')],index=options.indexOf(document.activeElement);if(e.key==='Escape'){closePickers();$('#'+name+'-trigger').focus()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();options[(index+(e.key==='ArrowDown'?1:options.length-1))%options.length]?.focus()}});
}
document.addEventListener('click',e=>{if(!e.target.closest('.visual-picker'))closePickers()});
function updateVessels(){
  if(!state.vessels)return;
  const ch=state.vessels.characters[$('#character-select').value];
  const entries=Object.keys(ch?.vessels||{});
  const all=[...entries,...(state.vessels.universalVessels||[]).map(x=>x.key)];
  $('#vessel-select').innerHTML=all.map(key=>`<option value="${esc(key)}">${esc(vesselName(key,$('#character-select').value))}</option>`).join('');
  renderCharacterPicker();renderVesselPicker();
  renderBuildWorkspace();
}
function stopBuildWorker(worker=state.worker){
  if(!worker)return;
  if(state.worker===worker)state.worker=null;
  worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;
  try{worker.terminate()}catch(_){}
}
function invalidateBuildResults(){stopBuildWorker();$('#run-build').disabled=false;state.buildResults=[];$('#build-results').innerHTML='';$('#build-status').textContent='选择目标词条后可计算推荐组合。'}
$('#character-select').addEventListener('change',()=>{invalidateBuildResults();state.equipped={normal:[null,null,null],deep:[null,null,null]};state.slotFilterActive=false;updateVessels();saveActiveRuleProfile()});
$('#vessel-select').addEventListener('change',()=>{invalidateBuildResults();state.equipped={normal:[null,null,null],deep:[null,null,null]};state.slotFilterActive=false;renderVesselPicker();renderBuildWorkspace()});
$('#build-mode').addEventListener('change',()=>{invalidateBuildResults();state.slotFilterActive=false;renderBuildWorkspace()});

function currentVessel(){
  const key=$('#vessel-select').value,character=$('#character-select').value;
  return state.vessels?.characters?.[character]?.vessels?.[key]||(state.vessels?.universalVessels||[]).find(v=>v.key===key)||null;
}
function slotColor(group,index){return currentVessel()?.[group==='deep'?'deepSlots':'normalSlots']?.[index]||'Any'}
function equippedIndexes(){return [...state.equipped.normal,...state.equipped.deep].filter(i=>i!==null)}
function canEquip(index,group,slot){
  const r=state.save?.relics?.[index];if(!r)return false;
  if(group==='deep'&&relicType(r)!=='DeepRelic')return false;
  if(group==='normal'&&!['Relic','UniqueRelic'].includes(relicType(r)))return false;
  const color=slotColor(group,slot);return color==='Any'||r.itemColor===color;
}
function equipRelic(index,group,slot){
  if(!canEquip(index,group,slot)){$('#equip-status').textContent='这件遗物的类型或颜色与该槽位不符。';return}
  for(const key of ['normal','deep'])state.equipped[key]=state.equipped[key].map(i=>i===index?null:i);
  state.equipped[group][slot]=index;state.selectedRelicIndex=null;state.activeSlot={group,index:slot};state.slotFilterActive=true;
  $('#equip-status').textContent=`已装配 ${relicName(state.save.relics[index])}。`;renderBuildWorkspace();
}
function activateSlot(group,index){
  state.activeSlot={group,index};state.slotFilterActive=true;state.poolPage=1;
}
function renderBuildWorkspace(){
  if(!state.vessels||!$('#loadout-slots'))return;
  const vessel=currentVessel();if(!vessel)return;
  const combined=$('#build-mode').value==='combined';
  renderVesselPicker();
  $('#loadout-slots').innerHTML=['normal',...(combined?['deep']:[])].map(group=>`<div class="slot-group"><h3>${group==='normal'?'普通遗物':'深夜遗物'}</h3><div class="slot-row">${(vessel[group==='deep'?'deepSlots':'normalSlots']||[]).map((color,i)=>{const index=state.equipped[group][i],r=index===null?null:state.save?.relics?.[index],active=state.slotFilterActive&&state.activeSlot.group===group&&state.activeSlot.index===i,slotLabel=`${group==='normal'?'普通':'深夜'}第 ${i+1} 槽，${colorZh[color]||color}色`;return `<div class="loadout-slot-frame"><button type="button" class="loadout-slot color-${esc(color.toLowerCase())} ${active?'active':''}" data-group="${group}" data-slot="${i}" ${r?'draggable="true"':''} aria-label="选择${slotLabel}${r?'，已装配'+esc(relicName(r)):''}"><span class="slot-color">${esc(colorZh[color]||color)} · ${i+1}</span>${r?`<span class="slot-relic">${relicImage(r)}</span>`:'<span class="slot-placeholder">＋</span>'}</button>${r?`<button type="button" class="slot-remove" data-group="${group}" data-slot="${i}" aria-label="卸下${esc(relicName(r))}">×</button>`:''}</div>`}).join('')}</div></div>`).join('');
  renderLoadoutSummary();renderPool();
}
function renderLoadoutSummary(){
  const combined=$('#build-mode').value==='combined',indices=[...state.equipped.normal,...(combined?state.equipped.deep:[])].filter(i=>i!==null);
  const instances=new Map();for(const group of ['normal',...(combined?['deep']:[])])for(const index of state.equipped[group])if(index!==null)for(const effect of effectGroups(state.save?.relics?.[index]||{})){const key=effect.key+'@@'+group;if(!instances.has(key))instances.set(key,[]);instances.get(key).push({effect,group})}
  const {group:activeGroup,index:activeSlot}=state.activeSlot,details=[];
  for(const group of ['normal',...(combined?['deep']:[])])state.equipped[group].forEach((relicIndex,index)=>{if(relicIndex===null)return;details.push({group,index,relic:state.save?.relics?.[relicIndex],active:group===activeGroup&&index===activeSlot})});
  const detailRoot=$('#loadout-effects'),validDetails=details.filter(item=>item.relic);detailRoot.dataset.count=String(validDetails.length);
  detailRoot.innerHTML=validDetails.length?validDetails.map(({group,index,relic,active})=>`<section class="game-relic-detail ${active?'active':''}" data-detail-group="${group}" data-detail-slot="${index}"><header>${relicImage(relic)}<div><small>${group==='normal'?'普通':'深夜'} · ${esc(colorZh[relic.itemColor]||relic.itemColor)}色 · 第 ${index+1} 槽</small><strong>${esc(relicName(relic))}</strong></div></header><div class="game-effect-list">${renderEffectRows(relic)}</div></section>`).join(''):'<div class="game-relic-empty">已装配的遗物详情会显示在这里。</div>';
  if(!state.selectedEffects.size){$('#loadout-score').textContent=`已装配 ${indices.length} / ${combined?6:3} 件 · 选择目标词条后显示匹配分`;return}
  let score=0,matched=0,missing=0,excluded=0;
  const stacking=stackingData();
  for(const rule of state.rules){const found=rule.scope==='any'?[...(instances.get(rule.key+'@@normal')||[]),...(instances.get(rule.key+'@@deep')||[])]:instances.get(rule.key+'@@'+rule.scope)||[];if(found.length){if(rule.priority==='exclude'){score-=rule.weight*found.length;excluded++}else{score+=scoreRuleInstances(found,rule,stacking);matched++}}else if(rule.priority==='required')missing++}
  $('#loadout-score').textContent=`当前目标匹配分 ${score} · 命中 ${matched} 项${missing?' · 缺少 '+missing+' 项必选':''}${excluded?' · 触发 '+excluded+' 项排除，未满足配装条件':''}`;
}
function renderPool(){
  if(!state.save)return;
  const pool=$('#build-relic-pool'),pagination=$('#pool-pagination');pool.before(pagination);
  const q=$('#pool-search').value.trim().toLocaleLowerCase(),category=$('#pool-category').value,type=$('#pool-type').value,color=$('#pool-color').value,used=new Set(equippedIndexes());
  const activeEquipped=state.slotFilterActive?state.equipped[state.activeSlot.group][state.activeSlot.index]:null;
  const rows=state.save.relics.map((r,index)=>({r,index})).filter(({r,index})=>(!used.has(index)||index===activeEquipped)&&['Relic','UniqueRelic','DeepRelic'].includes(relicType(r))&&(!state.slotFilterActive||canEquip(index,state.activeSlot.group,state.activeSlot.index))&&(type==='all'||(type==='deep')===(relicType(r)==='DeepRelic'))&&(category==='all'||relicEffectCategories(r).has(category))&&(color==='all'||r.itemColor===color)&&(!q||(relicName(r)+' '+(colorZh[r.itemColor]||'')+' '+r.itemColor+' '+effectGroups(r).map(effectName).join(' ')).toLocaleLowerCase().includes(q)));
  if(activeEquipped!==null)rows.sort((a,b)=>Number(b.index===activeEquipped)-Number(a.index===activeEquipped));
  const pages=Math.max(1,Math.ceil(rows.length/POOL_PAGE_SIZE));state.poolPage=Math.min(Math.max(state.poolPage,1),pages);
  const start=(state.poolPage-1)*POOL_PAGE_SIZE,shown=rows.slice(start,start+POOL_PAGE_SIZE);
  $('#pool-count').textContent=rows.length?`第 ${start+1}–${start+shown.length} 件 / 共 ${rows.length} 件`:'0 件';
  const filters=[];
  if(state.slotFilterActive){const {group,index}=state.activeSlot,slot=slotColor(group,index);filters.push(`槽位：${group==='normal'?'普通':'深夜'}第 ${index+1} 槽 · ${colorZh[slot]||slot}色`);}
  const search=$('#pool-search').value.trim();if(search)filters.push(`搜索：${search}`);
  if(category!=='all')filters.push(`词条：${$('#pool-category').selectedOptions[0]?.textContent.trim()||category}`);
  if(type!=='all')filters.push(`模式：${$('#pool-type').selectedOptions[0]?.textContent.trim()||type}`);
  if(color!=='all')filters.push(`颜色：${$('#pool-color').selectedOptions[0]?.textContent.trim()||color}`);
  $('#pool-filter-summary').hidden=filters.length===0;
  $('#pool-filter-summary-label').textContent=filters.length?`当前筛选：${filters.join(' · ')}`:'';
  $('#build-relic-pool').innerHTML=shown.map(({r,index})=>{const rarity={Relic:'normal',DeepRelic:'deep',UniqueRelic:'unique'}[relicType(r)]||'normal';return `<button type="button" draggable="true" class="pool-relic ${state.selectedRelicIndex===index?'selected':''} ${index===activeEquipped?'currently-equipped':''}" data-relic-index="${index}" aria-label="选择${esc(relicName(r))}，${esc(colorZh[r.itemColor]||r.itemColor)}色">${relicImage(r)}<span><strong>${esc(relicName(r))}${index===activeEquipped?' · 当前已装配':''}</strong><small><span class="relic-rarity-tag rarity-${rarity}">${esc(typeLabel[relicType(r)])}</span> · ${relicColorTag(r)} · #${esc(r.id)}</small><span class="pool-effects">${pairedEffects(r).map(group=>`<span>${esc(effectName(group[0]))}${group.slice(1).map(e=>`<em>${esc(effectName(e))}</em>`).join('')}</span>`).join('')||'无已识别词条'}</span></span></button>`}).join('')||'<span class="detail-note">没有匹配的可装备遗物。</span>';
  renderPagination('pool-pagination',rows.length,POOL_PAGE_SIZE,state.poolPage,true);
}
$('#pool-search').addEventListener('input',()=>{state.poolPage=1;renderPool()});for(const id of ['pool-category','pool-type','pool-color'])$('#'+id).addEventListener('change',()=>{state.poolPage=1;renderPool()});
$('#pool-pagination').addEventListener('click',e=>{const step=e.target.closest('[data-step]');if(!step)return;state.poolPage+=Number(step.dataset.step);renderPool();$('#build-relic-pool').scrollTop=0});
$('#pool-pagination').addEventListener('change',e=>{if(e.target.tagName!=='SELECT')return;state.poolPage=Number(e.target.value);renderPool();$('#build-relic-pool').scrollTop=0});
$('#pool-clear-filters').addEventListener('click',()=>{$('#pool-search').value='';$('#pool-category').value='all';$('#pool-type').value='all';$('#pool-color').value='all';state.slotFilterActive=false;state.poolPage=1;state.selectedRelicIndex=null;renderBuildWorkspace();$('#equip-status').textContent='已清除筛选，显示所有可用遗物。';$('#pool-search').focus()});
$('#build-relic-pool').addEventListener('click',e=>{const item=e.target.closest('[data-relic-index]');if(!item)return;const index=Number(item.dataset.relicIndex);if(state.slotFilterActive){equipRelic(index,state.activeSlot.group,state.activeSlot.index);return}state.selectedRelicIndex=index;$('#equip-status').textContent=`已选择 ${relicName(state.save.relics[index])}，请点击一个匹配颜色的槽位。`;renderPool()});
$('#build-relic-pool').addEventListener('dragstart',e=>{const item=e.target.closest('[data-relic-index]');if(!item)return;state.dragRelicIndex=Number(item.dataset.relicIndex);e.dataTransfer.setData('text/plain',item.dataset.relicIndex);e.dataTransfer.effectAllowed='move'});
$('#loadout-slots').addEventListener('dragstart',e=>{const slot=e.target.closest('.loadout-slot');if(!slot)return;const index=state.equipped[slot.dataset.group][Number(slot.dataset.slot)];if(index!==null){state.dragRelicIndex=index;e.dataTransfer.setData('text/plain',String(index))}});
$('#loadout-slots').addEventListener('dragover',e=>{const slot=e.target.closest('.loadout-slot');if(!slot)return;e.preventDefault();const index=state.dragRelicIndex;if(Number.isInteger(index)&&canEquip(index,slot.dataset.group,Number(slot.dataset.slot)))slot.classList.add('drag-over');else slot.classList.remove('drag-over')});
$('#loadout-slots').addEventListener('dragleave',e=>e.target.closest('.loadout-slot')?.classList.remove('drag-over'));
$('#loadout-slots').addEventListener('drop',e=>{const slot=e.target.closest('.loadout-slot');if(!slot)return;e.preventDefault();slot.classList.remove('drag-over');const index=state.dragRelicIndex;state.dragRelicIndex=null;if(Number.isInteger(index))equipRelic(index,slot.dataset.group,Number(slot.dataset.slot))});
document.addEventListener('dragend',()=>{state.dragRelicIndex=null;$$('.loadout-slot.drag-over').forEach(x=>x.classList.remove('drag-over'))});
$('#loadout-slots').addEventListener('click',e=>{const remove=e.target.closest('.slot-remove'),slot=e.target.closest('.loadout-slot'),control=remove||slot;if(!control)return;const group=control.dataset.group,index=Number(control.dataset.slot);activateSlot(group,index);if(remove){state.equipped[group][index]=null;state.selectedRelicIndex=null;renderBuildWorkspace();return}const pending=state.selectedRelicIndex;if(pending!==null&&canEquip(pending,group,index))equipRelic(pending,group,index);else{state.selectedRelicIndex=null;renderBuildWorkspace();$('#equip-status').textContent=`右侧显示能放入${group==='normal'?'普通':'深夜'}第 ${index+1} 槽的遗物，点击即可装配。`}});
$('#clear-save').addEventListener('click',()=>{try{sessionStorage.removeItem('nightreign-parsed-save-v2')}catch(_){}invalidateBuildResults();state.save=null;state.saveEditor=null;state.saveFileName=null;state.equipped={normal:[null,null,null],deep:[null,null,null]};state.slotFilterActive=false;$('#relic-dashboard').hidden=true;$('#build-workspace').hidden=true;$('#build-empty').hidden=false;renderBattleRecords();if(typeof renderSaveEditorUi==='function')renderSaveEditorUi();$('#save-file').value='';setSaveStatus('已清除本页解析结果，可重新选择存档。')});
function ownedEffects(){
  const map=new Map();
  for(const r of state.save?.relics||[])for(const e of effectGroups(r)){
    if(!map.has(e.key))map.set(e.key,{...e,count:0});map.get(e.key).count++;
  }
  return [...map.values()].sort((a,b)=>b.count-a.count);
}
function renderEffectOptions(){
  const q=$('#effect-search').value.trim().toLocaleLowerCase();
  const category=$('#effect-category')?.value||'all',relicMode=$('#effect-relic-mode')?.value||'all',ownedOnly=$('#effect-owned-only')?.checked||false;
  const owned=new Map(ownedEffects().map(e=>[e.key,e.count]));
  const catalog=outOfGameEffectCatalog();
  const categoryPicker=$('#effect-category');
  if(categoryPicker&&categoryPicker.options.length===1){const categories=[...new Set([...catalog.values()].map(ruleEffectCategory))].sort((a,b)=>a.localeCompare(b,'zh-CN'));categoryPicker.insertAdjacentHTML('beforeend',categories.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join(''))}
  const list=[...catalog.values()].filter(e=>e.key&&!state.rules.some(r=>r.key===e.key)&&(!q||(ruleEffectName(e)+' '+ruleEffectCategory(e)+' '+e.definitionIds.map(id=>state.relicRuleEffects.definitions[id].explanation||'').join(' ')+' '+e.name_en+' '+e.key).toLocaleLowerCase().includes(q))&&(category==='all'||ruleEffectCategory(e)===category)&&(relicMode==='all'||e.modes.includes(relicMode==='normal'?'普通':'深夜'))&&(!ownedOnly||(owned.get(e.key)||0)>0)).sort((a,b)=>(owned.get(b.key)||0)-(owned.get(a.key)||0)||ruleEffectName(a).localeCompare(ruleEffectName(b),'zh-CN'));
  const pageSize=18,pages=Math.max(1,Math.ceil(list.length/pageSize));state.effectPage=Math.min(Math.max(state.effectPage||1,1),pages);
  const start=(state.effectPage-1)*pageSize,rows=list.slice(start,start+pageSize);
  $('#effect-result-count').textContent=list.length?`第 ${start+1}–${start+rows.length} 项 / 共 ${list.length} 项`:'0 项匹配';
  $('#effect-options').innerHTML=rows.map(e=>{return `<button class="effect-option" data-effect="${esc(e.key)}" title="${esc(ruleEffectName(e))}"><span>${esc(ruleEffectName(e))}</span><small>${esc(e.modes.map(mode=>mode+'遗物').join(' / '))} · ${esc(ruleEffectCategory(e))} · ${owned.get(e.key)||0} 件已拥有 · 添加 +</small></button>`}).join('')||'<div class="empty-state" style="padding:18px"><p>没有更多匹配词条</p></div>';
  renderPagination('effect-pagination',list.length,pageSize,state.effectPage);
}
function renderSelectedEffects(){
  const catalog=outOfGameEffectCatalog();
  $('#selected-count').textContent=state.rules.length+' 项规则';
  const option=(value,label,current)=>`<option value="${value}" ${current===value?'selected':''}>${label}</option>`;
  const ruleQuery=$('#selected-rule-search')?.value.trim().toLocaleLowerCase()||'';
  const shown=state.rules.map((rule,i)=>({rule,i})).filter(({rule})=>!ruleQuery||(ruleEffectName(catalog.get(rule.key)||{key:rule.key})+' '+rule.key).toLocaleLowerCase().includes(ruleQuery));
  $('#selected-effects').innerHTML=shown.map(({rule,i})=>{const modes=effectModesForKey(rule.key),allowed=modes.map(mode=>mode==='普通'?'normal':'deep');if(allowed.length>1)allowed.push('any');const scopes=allowed.length?allowed:['normal','deep','any'];return `<div class="rule-row" data-rule-index="${i}" data-rule-key="${esc(rule.key)}"><button type="button" class="rule-drag-handle" draggable="true" aria-label="拖动排序，第 ${i+1} 项" title="拖动调整顺序"><span aria-hidden="true">⠿</span><span>${i+1}</span></button><div class="rule-name"><strong>${esc(ruleEffectName(catalog.get(rule.key)||{key:rule.key}))}</strong><small>${esc(rule.key)}</small></div><label>条件<select data-field="priority">${option('required','必选',rule.priority)}${option('preferred','偏好',rule.priority)}${option('nice_to_have','加分',rule.priority)}${option('exclude','排除',rule.priority)}</select></label><label>生效位置<select data-field="scope">${scopes.map(scope=>option(scope,scope==='normal'?'普通':scope==='deep'?'深夜':'任意',rule.scope)).join('')}</select></label><label>权重<input data-field="weight" type="number" min="1" max="10000" step="1" value="${esc(rule.weight)}"></label><label>有效次数<input data-field="cap" type="number" min="1" max="6" step="1" value="${esc(rule.cap)}"></label><button type="button" data-remove-rule="${i}" aria-label="删除此规则">×</button></div>`}).join('')||(ruleQuery?'<p class="hint">当前流派没有匹配的规则。</p>':'<p class="hint">搜索词条并点击添加。</p>');
  $$('#selected-effects [data-field]').forEach(x=>x.addEventListener('change',()=>{const rule=state.rules[Number(x.closest('[data-rule-index]').dataset.ruleIndex)],field=x.dataset.field;rule[field]=field==='weight'||field==='cap'?Math.max(1,Math.min(field==='cap'?6:10000,Number(x.value)||1)):x.value;syncRules();renderSelectedEffects()}));
  $$('#selected-effects [data-remove-rule]').forEach(x=>x.addEventListener('click',()=>{state.rules.splice(Number(x.dataset.removeRule),1);syncRules();renderSelectedEffects();renderEffectOptions()}));
  if($('#loadout-effects'))renderLoadoutSummary();
}
$('#effect-search').addEventListener('input',()=>{state.effectPage=1;renderEffectOptions()});
const RULE_STORAGE_KEY='nightreign-build-profiles-v2';
const LEGACY_RULE_STORAGE_KEY='nightreign-build-rules-v1';
const BEAST_CLAW_TEMPLATE=[
  {key:'changesCompatibleArmamentsIncantationToBeastClawAtStartOfExpedition',priority:'required',scope:'normal',weight:1000,cap:1,note:'兽爪蜗核心；出击武器祷告必须改为兽爪'},
  {key:'attackPowerPermanentlyIncreasedForEachEvergaolPrisonerDefeated',priority:'preferred',scope:'normal',weight:80,cap:1,note:'击败封印监牢囚犯后永久增攻；不可叠加'},
  {key:'attackPowerUpAfterDefeatingANightInvader',priority:'preferred',scope:'normal',weight:60,cap:1,note:'击败黑夜入侵者后增攻；不可叠加'}
];
function validRule(raw){
  if(!raw||typeof raw.key!=='string'||!Object.entries(state.effects?.effects||{}).some(([id,e])=>e.key===raw.key&&isOutOfGameRelicEffect({...e,id})))return null;
  const priority=['required','preferred','nice_to_have','exclude'].includes(raw.priority)?raw.priority:'preferred';
  const scope=['normal','deep','any'].includes(raw.scope)?raw.scope:'any';
  return {key:raw.key,priority,scope,weight:Math.max(1,Math.min(10000,Math.round(Number(raw.weight)||10))),cap:Math.max(1,Math.min(6,Math.round(Number(raw.cap)||1))),note:String(raw.note||'').slice(0,160)};
}
function isWeaponConversionRule(key){return typeof key==='string'&&key.startsWith('changesCompatibleArmaments')&&key.endsWith('AtStartOfExpedition')}
function effectModesForKey(key){return [...new Set(Object.entries(state.effects?.effects||{}).filter(([id,e])=>e.key===key&&isOutOfGameRelicEffect({...e,id})).flatMap(([id])=>state.relicRuleEffects.definitions[id].modes||[]))]}
function normalizeRuleScope(key,scope){
  const modes=effectModesForKey(key),allowed=modes.map(mode=>mode==='普通'?'normal':'deep');
  if(allowed.length===1)return allowed[0];
  if(allowed.length>1)return [...allowed,'any'].includes(scope)?scope:'any';
  return ['normal','deep','any'].includes(scope)?scope:'any';
}
function syncRules(){
  state.selectedEffects=new Map(state.rules.map(r=>[r.key,r.priority]));
  saveActiveRuleProfile();invalidateBuildResults();renderLoadoutSummary();
}
function profileId(){return `flow-${Date.now()}-${Math.random().toString(36).slice(2,7)}`}
function normalizeProfile(raw,index=0){
  if(!raw||typeof raw!=='object')return null;
  const characters=[...$('#character-select').options].map(o=>o.value),candidate=String(raw.character||characters[0]||'追跡者');
  const rules=Array.isArray(raw.rules)?raw.rules.map(validRule).filter(Boolean):[];
  const normalizedRules=[...new Map(rules.map(r=>[r.key,r])).values()].map(rule=>({...rule,scope:normalizeRuleScope(rule.key,rule.scope)}));
  return {id:String(raw.id||profileId()+`-${index}`),name:String(raw.name||'未命名流派').slice(0,60),character:characters.includes(candidate)?candidate:(characters[0]||'追跡者'),rules:normalizedRules};
}
function saveRuleProfiles(){try{localStorage.setItem(RULE_STORAGE_KEY,JSON.stringify({version:2,emptyStartApplied:true,profiles:state.ruleProfiles,activeProfileId:state.activeRuleProfileId}));return true}catch(_){return false}}
function saveActiveRuleProfile(){
  if(!state.ruleProfiles.length)return;
  const p=state.ruleProfiles.find(x=>x.id===state.activeRuleProfileId);if(!p)return;
  p.character=$('#character-select').value;p.rules=state.rules.map(r=>({...r}));saveRuleProfiles();
}
function renderRuleProfiles(){
  const select=$('#rule-profile-select');if(!select)return;
  select.innerHTML='<option value="">未选择流派</option>'+state.ruleProfiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');select.value=state.activeRuleProfileId||'';
  $('#rule-profile-delete').textContent='删除流派';$('#rule-profile-delete').disabled=!state.activeRuleProfileId;$('#rule-profile-delete').title='删除当前流派';$('#rule-profile-duplicate').disabled=!state.activeRuleProfileId;
  const p=state.ruleProfiles.find(x=>x.id===state.activeRuleProfileId);$('#rule-profile-name').value=p?.name||'';
}
function activateRuleProfile(id){
  saveActiveRuleProfile();const p=state.ruleProfiles.find(x=>x.id===id);
  state.activeRuleProfileId=p?.id||null;state.rules=(p?.rules||[]).map(r=>({...r}));
  if(p){$('#character-select').value=p.character;updateVessels()}
  state.selectedEffects=new Map(state.rules.map(r=>[r.key,r.priority]));invalidateBuildResults();renderRuleProfiles();renderSelectedEffects();renderEffectOptions();saveRuleProfiles();
}
function restoreRules(){
  let data=null;try{data=JSON.parse(localStorage.getItem(RULE_STORAGE_KEY)||'null')}catch(_){}
  state.ruleProfiles=data?.version===2&&Array.isArray(data.profiles)?data.profiles.map(normalizeProfile).filter(Boolean):[];
  state.activeRuleProfileId=state.ruleProfiles.some(p=>p.id===data?.activeProfileId)?data.activeProfileId:null;
  // 用户要求本次清空当前流派；只迁移一次，并保留本机恢复副本。
  if(!data?.emptyStartApplied){
    if(data){try{localStorage.setItem(RULE_STORAGE_KEY+'-before-empty-start',JSON.stringify(data))}catch(_){}
      state.ruleProfiles=state.ruleProfiles.filter(p=>p.id!==state.activeRuleProfileId);
    }
    state.activeRuleProfileId=null;
  }
  const active=state.ruleProfiles.find(p=>p.id===state.activeRuleProfileId);state.rules=(active?.rules||[]).map(r=>({...r}));
  if(active)$('#character-select').value=active.character;updateVessels();
  state.selectedEffects=new Map(state.rules.map(r=>[r.key,r.priority]));renderRuleProfiles();saveRuleProfiles();renderSelectedEffects();renderEffectOptions();
}
function addRule(key){
  const status=$('#effect-action-status'),relicMode=$('#effect-relic-mode')?.value||'all',wantedMode=relicMode==='normal'?'普通':relicMode==='deep'?'深夜':null;
  const row=Object.entries(state.effects?.effects||{}).find(([id,e])=>e.key===key&&isOutOfGameRelicEffect({...e,id})&&(!wantedMode||state.relicRuleEffects.definitions[id].modes.includes(wantedMode)));
  if(!row){if(status)status.textContent='此词条暂不支持加入流派规则。';return}
  if(state.rules.some(r=>r.key===key)){if(status)status.textContent='该词条已经在已选规则中。';return}
  if(isWeaponConversionRule(key)&&state.rules.some(rule=>isWeaponConversionRule(rule.key))){const message='出击时武器转换只保留一条；请先删除已有转换规则。';$('#rule-io-status').textContent=message;if(status)status.textContent=message;return}
  const e={...row[1],id:row[0]},modes=effectModesForKey(key);
  const scope=modes.length===1?(modes[0]==='普通'?'normal':'deep'):relicMode==='normal'?'normal':relicMode==='deep'?'deep':'any';
  state.rules.push({key,priority:'preferred',scope,weight:10,cap:e.stackable===true?3:1,note:''});syncRules();renderSelectedEffects();renderEffectOptions();if(status)status.textContent=`已添加「${ruleEffectName(e)}」，可在已选规则中调整。`;
}
function effectiveRules(){let conversionUsed=false;return state.rules.filter(rule=>{if(!isWeaponConversionRule(rule.key))return true;if(conversionUsed)return false;conversionUsed=true;return true})}
function buildSpecs(){const ranks={};return effectiveRules().map(r=>{const exclude=r.priority==='exclude',priority=exclude?'required':r.priority,group=`${exclude?'exclude':'include'}:${priority}`,rank=ranks[group]||0;ranks[group]=rank+1;return {key:r.key,priority,exclude,scope:normalizeRuleScope(r.key,r.scope),weight:r.weight,cap:r.cap,rank}})}
const ruleTools=document.createElement('div');ruleTools.className='rule-tools';ruleTools.innerHTML='<div class="rule-tools-heading"><strong>流派规则表</strong></div><div class="profile-controls"><label>当前流派<select id="rule-profile-select" aria-label="当前流派"></select></label><label class="profile-name">流派名称<input id="rule-profile-name" maxlength="60" placeholder="输入流派名称"></label><div class="profile-actions"><button type="button" id="rule-profile-new" class="button ghost">新建</button><button type="button" id="rule-profile-duplicate" class="button ghost">复制</button><button type="button" id="rule-profile-delete" class="button ghost">删除流派</button><button type="button" id="rule-profile-save" class="button primary">保存当前流派</button></div></div><p id="rule-io-status" role="status" aria-live="polite"></p>';
$('.effect-header').after(ruleTools);
$('.effect-header .card-kicker').textContent='配装工作区';$('.effect-header h3').textContent='规则与推荐';
$('#effect-search').closest('.search-field').insertAdjacentHTML('beforebegin','<div class="effect-selection-heading"><strong>词条选择</strong><span>点击词条加入规则</span></div><p id="effect-action-status" class="effect-action-status" role="status" aria-live="polite"></p>');
$('#effect-search').closest('.search-field').insertAdjacentHTML('afterend','<div class="effect-filter-bar"><label>遗物种类<select id="effect-relic-mode"><option value="normal">普通遗物</option><option value="deep">深夜遗物</option><option value="all">全部局外遗物</option></select></label><label>词条类型<select id="effect-category"><option value="all">全部类型</option></select></label><label class="effect-owned-filter"><input id="effect-owned-only" type="checkbox"> 只看存档持有</label><span id="effect-result-count" role="status"></span></div>');
$('#effect-options').insertAdjacentHTML('afterend','<div id="effect-pagination" class="pagination" aria-label="候选词条页数" hidden></div><label class="selected-rule-filter">筛选已选规则<input id="selected-rule-search" type="search" placeholder="搜索词条"></label>');
$('#selected-effects').insertAdjacentHTML('beforebegin','<div class="rule-columns" aria-hidden="true"><span>目标词条</span><span>条件</span><span>生效位置</span><span>权重</span><span>有效次数</span><span></span></div>');
$('.selected-rule-filter').insertAdjacentHTML('beforebegin','<div class="selected-rule-heading"><strong>已选规则</strong><span>添加词条后在此调整条件与生效位置</span></div>');
$('.selected-rule-heading span').textContent='拖动排序；同类条件中越靠上越优先';
const assistantColumns=document.createElement('div');assistantColumns.className='build-assistant-columns';
const rulesColumn=document.createElement('section');rulesColumn.className='assistant-column assistant-rules-column';rulesColumn.setAttribute('aria-label','流派规则表');
const effectColumn=document.createElement('section');effectColumn.className='assistant-column effect-selection-panel';effectColumn.setAttribute('aria-label','词条选择');
ruleTools.insertAdjacentElement('afterend',assistantColumns);assistantColumns.append(rulesColumn,effectColumn);
const buildActions=$('.build-actions');
buildActions.insertAdjacentHTML('afterbegin','<label class="build-character-control">推荐角色<select id="build-character-select" aria-label="选择推荐角色"></select></label>');
const buildCharacterControl=$('.build-character-control'),runBuildButton=$('#run-build'),buildStatus=$('#build-status');
const buildVesselScope=document.createElement('span');buildVesselScope.className='build-vessel-scope';buildVesselScope.textContent='只计算该角色专属遗物供具';
buildActions.replaceChildren(buildCharacterControl,runBuildButton,buildVesselScope,buildStatus);
assistantColumns.before(buildActions);
for(const element of [$('.selected-rule-heading'),$('.selected-rule-filter'),$('.rule-columns'),$('#selected-effects')])if(element)rulesColumn.append(element);
for(const element of [$('.effect-selection-heading'),$('#effect-action-status'),$('#effect-search').closest('.search-field'),$('.effect-filter-bar'),$('#effect-options'),$('#effect-pagination')])if(element)effectColumn.append(element);
$('#effect-options').addEventListener('click',e=>{const button=e.target.closest('[data-effect]');if(button)addRule(button.dataset.effect)});
$('#rule-profile-select').addEventListener('change',e=>activateRuleProfile(e.target.value));
$('#build-character-select').addEventListener('change',()=>invalidateBuildResults());
$('#rule-profile-save').addEventListener('click',()=>{let p=state.ruleProfiles.find(x=>x.id===state.activeRuleProfileId);const name=$('#rule-profile-name').value.trim();if(!name){$('#rule-io-status').textContent='请先填写流派名称。';$('#rule-profile-name').focus();return}if(!p){p={id:profileId(),name,character:$('#character-select').value,rules:[]};state.ruleProfiles.push(p);state.activeRuleProfileId=p.id}p.name=name;p.character=$('#character-select').value;p.rules=state.rules.map(r=>({...r}));const saved=saveRuleProfiles();renderRuleProfiles();$('#rule-io-status').textContent=saved?`“${p.name}”已保存到当前浏览器（${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}）。`:'保存失败：浏览器不允许本地存储，请检查浏览器存储权限。'});
$('#effect-category').addEventListener('change',()=>{state.effectPage=1;renderEffectOptions()});
$('#effect-relic-mode').addEventListener('change',()=>{state.effectPage=1;renderEffectOptions()});
$('#effect-owned-only').addEventListener('change',()=>{state.effectPage=1;renderEffectOptions()});
$('#effect-pagination').addEventListener('click',e=>{const step=e.target.closest('[data-step]');if(!step)return;state.effectPage+=Number(step.dataset.step);renderEffectOptions();$('#effect-options').scrollTop=0});
$('#effect-pagination').addEventListener('change',e=>{if(e.target.tagName!=='SELECT')return;state.effectPage=Number(e.target.value);renderEffectOptions();$('#effect-options').scrollTop=0});
$('#selected-rule-search').addEventListener('input',renderSelectedEffects);
let draggedRuleKey=null;
function moveRuleTo(ruleKey,targetKey,after=false){
  if(!ruleKey||ruleKey===targetKey)return;
  const from=state.rules.findIndex(rule=>rule.key===ruleKey);if(from<0)return;
  const [rule]=state.rules.splice(from,1);let to=state.rules.findIndex(item=>item.key===targetKey);if(to<0){state.rules.splice(from,0,rule);return}
  if(after)to++;state.rules.splice(to,0,rule);syncRules();renderSelectedEffects();
}
$('#selected-effects').addEventListener('dragstart',e=>{const handle=e.target.closest('.rule-drag-handle'),row=handle?.closest('.rule-row');if(!row){e.preventDefault();return}draggedRuleKey=row.dataset.ruleKey;row.classList.add('is-dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedRuleKey)});
$('#selected-effects').addEventListener('dragover',e=>{const target=e.target.closest('.rule-row');if(!target||!draggedRuleKey||target.dataset.ruleKey===draggedRuleKey)return;e.preventDefault();e.dataTransfer.dropEffect='move';for(const row of $$('#selected-effects .rule-row'))row.classList.remove('drop-before','drop-after');target.classList.add(e.clientY>target.getBoundingClientRect().top+target.offsetHeight/2?'drop-after':'drop-before')});
$('#selected-effects').addEventListener('drop',e=>{const target=e.target.closest('.rule-row');if(!target||!draggedRuleKey)return;e.preventDefault();moveRuleTo(draggedRuleKey,target.dataset.ruleKey,e.clientY>target.getBoundingClientRect().top+target.offsetHeight/2);draggedRuleKey=null});
$('#selected-effects').addEventListener('dragend',()=>{draggedRuleKey=null;for(const row of $$('#selected-effects .rule-row'))row.classList.remove('is-dragging','drop-before','drop-after')});
$('#selected-effects').addEventListener('keydown',e=>{const handle=e.target.closest('.rule-drag-handle');if(!handle||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const row=handle.closest('.rule-row'),index=state.rules.findIndex(rule=>rule.key===row.dataset.ruleKey),next=index+(e.key==='ArrowUp'?-1:1);if(next<0||next>=state.rules.length)return;const target=state.rules[next].key;moveRuleTo(row.dataset.ruleKey,target,e.key==='ArrowDown');$('#selected-effects .rule-drag-handle')?.focus()});
$('#rule-profile-name').addEventListener('change',e=>{const p=state.ruleProfiles.find(x=>x.id===state.activeRuleProfileId);if(p){p.name=e.target.value.trim()||'未命名流派';renderRuleProfiles();saveRuleProfiles()}});
$('#rule-profile-new').addEventListener('click',()=>{saveActiveRuleProfile();const p={id:profileId(),name:'新流派',character:$('#character-select').value,rules:[]};state.ruleProfiles.push(p);activateRuleProfile(p.id);$('#rule-profile-name').focus();$('#rule-io-status').textContent='已新建空白流派，请设置名称、角色和目标词条。'});
$('#rule-profile-duplicate').addEventListener('click',()=>{saveActiveRuleProfile();const src=state.ruleProfiles.find(p=>p.id===state.activeRuleProfileId);if(!src)return;const p={...src,id:profileId(),name:`${src.name}（副本）`,rules:src.rules.map(r=>({...r}))};state.ruleProfiles.push(p);activateRuleProfile(p.id);$('#rule-io-status').textContent='已复制当前流派，可独立修改副本。'});
$('#rule-profile-delete').addEventListener('click',()=>{if(!state.activeRuleProfileId)return;state.ruleProfiles=state.ruleProfiles.filter(p=>p.id!==state.activeRuleProfileId);activateRuleProfile('');$('#rule-io-status').textContent='当前流派已删除。'});
let pendingAgentPlan=null;
const agentHistory=[];
let agentClarificationContext=[];
let agentCurrentFeedbackContext=null;
let agentHistoryRestoreRevision=0;
let agentMemoryClearing=false;
let agentRequestInFlight=false;
let agentMemoryClearStage=1;
let feedbackDialogContext=null;
let feedbackDialogKind='suggestion';
const feedbackPageHost=window.location.hostname.replace(/^\[|\]$/g,'').toLowerCase();
const feedbackLocalPage=['localhost','127.0.0.1','::1'].includes(feedbackPageHost);
let feedbackApiSecure=false,feedbackLocalApi=false,feedbackApiProtocol='';
try{
  const feedbackApiUrl=new URL(window.NIGHTREIGN_AI_API_BASE||window.location.origin,window.location.href);
  const feedbackApiHost=feedbackApiUrl.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  feedbackLocalApi=['localhost','127.0.0.1','::1'].includes(feedbackApiHost);
  feedbackApiProtocol=feedbackApiUrl.protocol;
  feedbackApiSecure=feedbackApiProtocol==='https:';
}catch{}
const feedbackLocalDevelopmentPair=feedbackLocalPage&&feedbackLocalApi&&['http:','https:'].includes(window.location.protocol)&&['http:','https:'].includes(feedbackApiProtocol);
const feedbackTransportSecure=(window.location.protocol==='https:'&&feedbackApiSecure)||feedbackLocalDevelopmentPair;
const aiTransportSecure=feedbackTransportSecure;
const agentTransportWarning=$('#agent-transport-warning');
agentTransportWarning.hidden=aiTransportSecure;
$('#agent-question').setAttribute('aria-describedby',aiTransportSecure?'agent-status':'agent-transport-warning agent-status');
if(!aiTransportSecure){$('#agent-question').disabled=true;$('#agent-send').disabled=true}
function createSecureAgentUuid(){
  const cryptoApi=globalThis.crypto;
  if(typeof cryptoApi?.randomUUID==='function'){
    try{const value=cryptoApi.randomUUID();if(/^[0-9a-f-]{36}$/i.test(value))return value}catch{}
  }
  if(typeof cryptoApi?.getRandomValues!=='function')return null;
  try{
    const bytes=cryptoApi.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
    const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }catch{return null}
}
const agentSessionId=(()=>{
  const generated=createSecureAgentUuid();if(!generated)return null;
  const key='nightreign-agent-session-v1';
  try{const stored=localStorage.getItem(key);if(/^[0-9a-f-]{36}$/i.test(stored||''))return stored;localStorage.setItem(key,generated)}catch{}
  return generated;
})();
function setAgentStatus(message,error=false){const status=$('#agent-status');status.textContent=message;status.classList.toggle('error',error)}
function appendAgentMessage(role,text,feedbackContext=null){
  const log=$('#agent-chat-log'),entry=document.createElement('div'),message=document.createElement('p');log.querySelector('.agent-empty')?.remove();entry.className=`agent-entry ${role}`;message.className=`agent-message ${role}`;
  const pattern=/\[([^\]]+)\]\(#effects\)/g;let last=0,match;
  while((match=pattern.exec(String(text)))){message.append(document.createTextNode(String(text).slice(last,match.index)));const link=document.createElement('a');link.href='#effects';link.dataset.view='effects';link.textContent=match[1];message.append(link);last=pattern.lastIndex}
  message.append(document.createTextNode(String(text).slice(last)));entry.append(message);
  if(role==='assistant'&&feedbackContext?.question&&feedbackContext?.answer){const button=document.createElement('button');button.className='agent-feedback-trigger';button.type='button';button.textContent='回答有错？向窝反馈';button.addEventListener('click',()=>openFeedbackDialog('answer',feedbackContext));entry.append(button)}
  log.append(entry);log.scrollTop=log.scrollHeight;
}
async function restoreAgentHistory(){
  if(!aiTransportSecure)return;
  if(!agentSessionId){setAgentStatus('当前环境无法安全生成会话 ID；本页对话仍可继续，但不会读取或保存后端历史记忆。');return}
  const revision=agentHistoryRestoreRevision;
  try{const data=await requestJson('/api/ai/history',{session_id:agentSessionId});if(revision!==agentHistoryRestoreRevision||!Array.isArray(data.messages)||!data.messages.length||agentHistory.length)return;const log=$('#agent-chat-log');let previousQuestion='';log.replaceChildren();for(const message of data.messages){if(message.role==='user'||message.role==='assistant'){const context=message.role==='assistant'&&previousQuestion?{question:previousQuestion,answer:message.content}:null;appendAgentMessage(message.role,message.content,context);agentHistory.push(message);if(message.role==='user')previousQuestion=message.content;else{if(context)agentCurrentFeedbackContext=context;previousQuestion=''}}}setAgentStatus(`已恢复 ${Math.floor(agentHistory.length/2)} 轮对话记忆。`)}catch{if(revision===agentHistoryRestoreRevision)setAgentStatus('当前无法读取已保存的对话记忆。',true)}
}
restoreAgentHistory();
const agentMemoryClearDialog=$('#agent-memory-clear-dialog');
const agentMemoryClearOpen=$('#agent-memory-clear-open');
function updateAgentMemoryClearAvailability(){agentMemoryClearOpen.disabled=!aiTransportSecure||!agentSessionId||agentRequestInFlight||agentMemoryClearing}
function setAgentMemoryClearStage(stage){
  agentMemoryClearStage=stage;$('#agent-memory-clear-description').hidden=stage!==1;$('#agent-memory-clear-warning').hidden=stage!==2;agentMemoryClearDialog.setAttribute('aria-describedby',stage===1?'agent-memory-clear-description':'agent-memory-clear-warning');$('#agent-memory-clear-next').hidden=stage!==1;$('#agent-memory-clear-confirm').hidden=stage!==2;
}
agentMemoryClearOpen.addEventListener('click',()=>{
  if(!aiTransportSecure){setAgentStatus('当前连接不安全，已禁用记忆清除请求。请改用 HTTPS 页面与 HTTPS API，或在本机使用 loopback 地址。',true);return}
  if(!agentSessionId){setAgentStatus('当前环境无法安全生成会话 ID，暂时不能清除服务端对话记忆。',true);return}
  if(agentRequestInFlight||agentMemoryClearing)return;
  setAgentMemoryClearStage(1);const status=$('#agent-memory-clear-status');status.textContent='';status.classList.remove('error');agentMemoryClearDialog.showModal();$('#agent-memory-clear-next').focus();
});
$('#agent-memory-clear-next').addEventListener('click',()=>{setAgentMemoryClearStage(2);$('#agent-memory-clear-confirm').focus()});
$('#agent-memory-clear-cancel').addEventListener('click',()=>agentMemoryClearDialog.close());
agentMemoryClearDialog.addEventListener('cancel',event=>{if(agentMemoryClearing)event.preventDefault()});
agentMemoryClearDialog.addEventListener('close',()=>agentMemoryClearOpen.focus());
$('#agent-memory-clear-confirm').addEventListener('click',async()=>{
  if(!aiTransportSecure||agentMemoryClearing||agentRequestInFlight||!agentSessionId||agentMemoryClearStage!==2)return;
  agentMemoryClearing=true;agentMemoryClearDialog.setAttribute('aria-busy','true');updateAgentMemoryClearAvailability();$('#agent-question').disabled=true;$('#agent-send').disabled=true;$('#agent-apply-build').disabled=true;
  const confirmButton=$('#agent-memory-clear-confirm'),cancelButton=$('#agent-memory-clear-cancel'),status=$('#agent-memory-clear-status');confirmButton.disabled=true;cancelButton.disabled=true;status.textContent='正在清除已保存对话记忆…';status.classList.remove('error');status.focus();
  try{
    await requestJson('/api/ai/memory/clear',{session_id:agentSessionId});
    agentHistoryRestoreRevision++;agentHistory.length=0;agentClarificationContext=[];agentCurrentFeedbackContext=null;pendingAgentPlan=null;
    $('#agent-chat-log').replaceChildren();const empty=document.createElement('p');empty.className='agent-empty';empty.textContent='你好，我会判断你的问题是查阅资料还是请求配装。配装时我会在对话中确认角色、供具、普通或深夜范围及配装目标；信息不清楚时会先询问。配装只使用已读取存档中的遗物。';$('#agent-chat-log').append(empty);
    $('#agent-build-result').hidden=true;$('#agent-apply-build').hidden=true;setAgentStatus('已清除已保存对话记忆。');status.textContent='清除完成。';agentMemoryClearDialog.close();
  }catch(error){const message=error.message||'清除失败，请稍后重试。';status.textContent=message;status.classList.add('error');setAgentStatus(message,true)}
  finally{agentMemoryClearing=false;agentMemoryClearDialog.setAttribute('aria-busy','false');$('#agent-question').disabled=!aiTransportSecure;$('#agent-send').disabled=!aiTransportSecure;$('#agent-apply-build').disabled=false;confirmButton.disabled=false;cancelButton.disabled=false;updateAgentMemoryClearAvailability();if(agentMemoryClearDialog.open&&agentMemoryClearStage===2)confirmButton.focus();else if(!agentMemoryClearDialog.open)agentMemoryClearOpen.focus()}
});
updateAgentMemoryClearAvailability();
$('#agent-question').addEventListener('input',()=>{$('#agent-question-count').textContent=`${Array.from($('#agent-question').value).length} / 400 字`});
function requestJson(url,body){if(url.startsWith('/api/ai/')&&!aiTransportSecure)return Promise.reject(new Error('当前连接不安全，已在发送前拦截 AI 请求。请使用 HTTPS 页面与 HTTPS API，或在本机使用 loopback 地址。'));return fetch(`${window.NIGHTREIGN_AI_API_BASE||''}${url}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async response=>{const type=response.headers.get('content-type')||'';if(!type.includes('application/json')){const raw=await response.text();if(response.status===500||!raw.trim())throw new Error('本地 FastAPI 服务未启动或无法连接（默认端口 8000）。请按 backend/README.md 启动后端。');if(response.status===404)throw new Error('找不到 AI 接口，请更新并重启本地 FastAPI 服务。');throw new Error(`AI 服务返回非 JSON 响应（HTTP ${response.status}）。`)}const result=await response.json();if(!response.ok)throw new Error(result.detail||'AI 请求失败，请稍后重试。');return result})}
let feedbackDialogRevision=0;
let feedbackSubmissionCount=0;
let feedbackSubmissionSequence=0;
function feedbackPendingMessage(){return `仍有 ${feedbackSubmissionCount} 条反馈请求正在提交；关闭弹窗不会取消请求，请等待完成后再提交，以免重复入库。`}
function reportFeedbackOutcome(message,isError=false){
  let region=$('#feedback-background-status');
  if(!region)return;
  const line=document.createElement('p');line.className='hint';line.textContent=message;if(isError)line.style.color='#ed9a8f';region.append(line);while(region.children.length>5)region.firstElementChild.remove();
}
function feedbackErrorDetail(body){
  const detail=body?.detail;
  if(typeof detail==='string')return detail.trim();
  if(Array.isArray(detail))return detail.map(item=>typeof item==='string'?item:item?.msg).filter(Boolean).join('；');
  return '';
}
function openFeedbackDialog(kind,context=null){
  const dialog=$('#feedback-dialog'),form=$('#feedback-form');if(!dialog?.showModal){setAgentStatus('当前浏览器暂不支持打开反馈表单。',true);return}
  feedbackDialogRevision++;
  feedbackDialogKind=kind;feedbackDialogContext=context;form.reset();const status=$('#feedback-status'),submit=$('#feedback-submit'),hasPendingSubmission=feedbackSubmissionCount>0;status.textContent=hasPendingSubmission?feedbackPendingMessage():'';if(hasPendingSubmission)status.dataset.pendingSubmission='true';else delete status.dataset.pendingSubmission;submit.hidden=false;submit.disabled=!feedbackTransportSecure||hasPendingSubmission;$('#feedback-transport-warning').hidden=feedbackTransportSecure;$('#feedback-cancel').textContent='关闭';$('#feedback-kind-label').textContent=kind==='answer'?'反馈这条助手回答':'向我们提出建议';
  const option=$('#feedback-context-option'),preview=$('#feedback-context-preview');option.hidden=!context;preview.hidden=true;
  if(context){$('#feedback-question-preview').textContent=context.question;$('#feedback-answer-preview').textContent=context.answer}
  dialog.showModal();$('#feedback-message').focus();
}
$('#feedback-suggestion-open').addEventListener('click',()=>openFeedbackDialog('suggestion',agentCurrentFeedbackContext));
$('#feedback-include-context').addEventListener('change',event=>{$('#feedback-context-preview').hidden=!event.target.checked});
$('#feedback-cancel').addEventListener('click',()=>$('#feedback-dialog').close());
$('#feedback-dialog').addEventListener('close',()=>{feedbackDialogRevision++;feedbackDialogContext=null;$('#feedback-form').reset();const status=$('#feedback-status');status.textContent='';delete status.dataset.pendingSubmission;$('#feedback-context-preview').hidden=true;$('#feedback-transport-warning').hidden=true;$('#feedback-submit').hidden=false;$('#feedback-submit').disabled=!feedbackTransportSecure;$('#feedback-cancel').textContent='关闭';if(feedbackSubmissionCount)reportFeedbackOutcome(`仍有 ${feedbackSubmissionCount} 条反馈请求在处理中；关闭窗口不会撤销已发送的请求。`)});
$('#feedback-form').addEventListener('submit',async event=>{
  event.preventDefault();const submit=$('#feedback-submit'),status=$('#feedback-status');if(feedbackSubmissionCount>0){submit.disabled=true;status.dataset.pendingSubmission='true';status.textContent=feedbackPendingMessage();return}if(!feedbackTransportSecure){submit.disabled=true;$('#feedback-transport-warning').hidden=false;return}if(!event.currentTarget.reportValidity())return;
  const includeContext=Boolean(feedbackDialogContext&&$('#feedback-include-context').checked),payload={kind:feedbackDialogKind,message:$('#feedback-message').value.trim(),email:$('#feedback-email').value.trim()||null,include_context:includeContext};
  if(includeContext){payload.question=feedbackDialogContext.question;payload.answer=feedbackDialogContext.answer}
  const dialog=$('#feedback-dialog'),revision=feedbackDialogRevision,submission=++feedbackSubmissionSequence;feedbackSubmissionCount++;submit.disabled=true;delete status.dataset.pendingSubmission;status.textContent='正在提交…';
  try{
    const response=await fetch(`${window.NIGHTREIGN_AI_API_BASE||''}/api/feedback`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(response.status>=400&&response.status<500){let detail='';try{detail=feedbackErrorDetail(await response.json())}catch{}const error=new Error(`服务器拒绝了该反馈（HTTP ${response.status}）${detail?`：${detail}`:''}`);error.feedbackOutcome='rejected';throw error}
    if(!response.ok){const error=new Error(`反馈服务返回 HTTP ${response.status}；请求可能已到达服务器。`);error.feedbackOutcome='uncertain';throw error}
    await response.json();
    if(dialog.open&&revision===feedbackDialogRevision){status.textContent='已收到反馈，谢谢你。';submit.hidden=true;$('#feedback-cancel').textContent='完成'}
    else reportFeedbackOutcome(`第 ${submission} 条反馈已提交成功。`);
  }catch(error){
    const message=error?.feedbackOutcome==='rejected'||error?.feedbackOutcome==='uncertain'?error.message:'反馈提交结果无法确认（请求可能已送达服务器）；请先确认收件箱，再决定是否重新提交。';
    if(dialog.open&&revision===feedbackDialogRevision){status.textContent=message;submit.disabled=false}
    else reportFeedbackOutcome(`第 ${submission} 条${message}`,true);
  }finally{feedbackSubmissionCount=Math.max(0,feedbackSubmissionCount-1);if(dialog.open&&revision!==feedbackDialogRevision&&status.dataset.pendingSubmission==='true'){if(feedbackSubmissionCount>0)status.textContent=feedbackPendingMessage();else{delete status.dataset.pendingSubmission;status.textContent='';submit.disabled=!feedbackTransportSecure}}}
});
function agentInventory(){return (state.save?.relics||[]).map(relic=>{const effects=effectGroups(relic).map(effect=>({key:effect.key,name:ruleEffectName(effect)})).filter(effect=>effect.key&&effect.name).slice(0,12);return {id:String(relic.id),name:relicName(relic),kind:relicType(relic)==='DeepRelic'?'deep':'normal',color:['Red','Blue','Yellow','Green','Any'].includes(relic.itemColor)?relic.itemColor:'Any',effects:effects.map(effect=>effect.name),effect_keys:effects.map(effect=>effect.key)}})}
function describeAgentPlan(plan,inventory){
  const names=new Map(inventory.map(relic=>[String(relic.id),relic.name])),sections=[['normal','普通遗物'],['deep','深夜遗物']].filter(([group])=>plan[group]?.length),result=$('#agent-build-result');
  result.replaceChildren();const summary=document.createElement('p');summary.className='ai-plan-summary';summary.textContent=plan.summary;result.append(summary);
  for(const [group,label] of sections){const section=document.createElement('div');section.className='ai-plan-group';const heading=document.createElement('strong');heading.textContent=label;section.append(heading);for(const item of plan[group]){const row=document.createElement('p'),name=document.createElement('b'),reason=document.createElement('span');name.textContent=`${item.index+1} 槽 · ${item.relic_id?names.get(String(item.relic_id))||'未识别遗物':'暂留空'}`;reason.textContent=item.reason||'';row.append(name,reason);section.append(row)}result.append(section)}
  result.hidden=false;$('#agent-apply-build').hidden=false;
}
async function requestAgentBuild(question,context){
  if(!state.save?.relics?.length)throw new Error('请先在“遗物仪式”读取本机存档。');
  if(question.length<8||question.length>240)throw new Error('配装问题需填写 8–240 字。');
  const character=context.character_key,key=context.vessel_key,mode=context.build_scope,combined=mode==='combined';
  const vessel=state.vessels.characters?.[character]?.vessels?.[key]||(state.vessels.universalVessels||[]).find(item=>item.key===key);if(!vessel)throw new Error('所选角色供具信息不可用，请重新选择。');
  const slots=[...(vessel.normalSlots||[]).map((color,index)=>({group:'normal',index,color})),...(combined?(vessel.deepSlots||[]).map((color,index)=>({group:'deep',index,color})):[])];
  const ruleEffects=Object.entries(state.effects?.effects||{}),rules=effectiveRules().map(rule=>{const [id,effect]=ruleEffects.find(([effectId,entry])=>entry.key===rule.key&&isOutOfGameRelicEffect({...entry,id:effectId}))||[];return {key:rule.key,effect:id?ruleEffectName({...effect,id}):rule.key,priority:rule.priority,scope:normalizeRuleScope(rule.key,rule.scope),cap:rule.cap}});
  const inventory=agentInventory(),body={character:characterZh[character]||character,character_key:character,vessel:vesselName(key,character),vessel_key:key,mode,question,slots,rules,inventory};if(agentSessionId)body.session_id=agentSessionId;
  const result=await requestJson('/api/ai/recommend',body);pendingAgentPlan={plan:result,inventory,character,key,mode};describeAgentPlan(result,inventory);setAgentStatus('配装建议已生成，请检查遗物和理由，再选择是否应用。');return result;
}
$('#agent-chat-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!aiTransportSecure){setAgentStatus('当前连接不安全，已禁用 AI 请求。请改用 HTTPS 页面与 HTTPS API，或在本机使用 loopback 地址。',true);return}if(agentMemoryClearing||agentRequestInFlight)return;const question=$('#agent-question').value.trim();if(!question)return;
  const button=$('#agent-send');agentRequestInFlight=true;updateAgentMemoryClearAvailability();pendingAgentPlan=null;$('#agent-build-result').hidden=true;$('#agent-apply-build').hidden=true;appendAgentMessage('user',question);$('#agent-question').value='';$('#agent-question-count').textContent='0 / 400 字';button.disabled=true;
  try{
    setAgentStatus('正在判断问题类型并查阅相关资料…');const chatBody={question,history:agentHistory.slice(-8),has_inventory:Boolean(state.save?.relics?.length)};if(agentSessionId)chatBody.session_id=agentSessionId;const reply=await requestJson('/api/ai/chat',chatBody);
    if(reply.intent==='build'){
      const buildQuestion=[...agentClarificationContext,question].join('；').slice(-240);agentClarificationContext=[];const plan=await requestAgentBuild(buildQuestion,reply);agentCurrentFeedbackContext={question,answer:plan.summary};appendAgentMessage('assistant',plan.summary,agentCurrentFeedbackContext);agentHistory.push({role:'user',content:question},{role:'assistant',content:plan.summary});
    }else{
      const answer=reply.answer||'这个问题还不够明确，请补充一下你指的角色、敌人或配装目标。';agentCurrentFeedbackContext={question,answer};appendAgentMessage('assistant',answer,agentCurrentFeedbackContext);agentHistory.push({role:'user',content:question},{role:'assistant',content:answer});if(reply.intent==='clarify')agentClarificationContext.push(question);else agentClarificationContext=[];
      setAgentStatus(reply.intent==='clarify'?'需要你补充信息后，我再继续。':'回答已整理完成。');
    }
  }catch(error){appendAgentMessage('assistant',`暂时无法完成：${error.message||'请检查 FastAPI 服务是否启动。'}`);setAgentStatus(error.message||'AI 请求失败，请稍后重试。',true)}
  finally{button.disabled=false;agentRequestInFlight=false;updateAgentMemoryClearAvailability()}
});
$('#agent-apply-build').addEventListener('click',()=>{
  if(!pendingAgentPlan||!state.save)return;const {character,key,mode,plan}=pendingAgentPlan;
  $('#character-select').value=character;$('#character-select').dispatchEvent(new Event('change'));$('#vessel-select').value=key;$('#vessel-select').dispatchEvent(new Event('change'));$('#build-mode').value=mode;$('#build-mode').dispatchEvent(new Event('change'));
  const next={normal:[null,null,null],deep:[null,null,null]},used=new Set();
  for(const group of ['normal','deep'])for(const choice of plan[group]||[]){const index=choice.relic_id===null?null:state.save.relics.findIndex(relic=>String(relic.id)===String(choice.relic_id));if(index!==null&&(index<0||used.has(index)||!canEquip(index,group,choice.index))){setAgentStatus('方案校验失败：遗物不在当前存档中，或与所选角色供具槽位不匹配。',true);return}if(index!==null)used.add(index);next[group][choice.index]=index}
  state.equipped=next;state.selectedRelicIndex=null;renderBuildWorkspace();navigate('builds');$('#equip-status').textContent='Agent 配装已放入装配预览，可继续调整；尚未写入存档。';setAgentStatus('配装已应用到装配预览；尚未写入存档。');
});
function stackingData(){
  const byId={},byMode={normal:{},deep:{}},byKey={};
  const merge=(target,key,value)=>{if(!(key in target))target[key]=value;else if(target[key]!==value)target[key]=false};
  for(const [id,e] of Object.entries(state.effects?.effects||{})){
    const value=e.stackable===true?true:e.stackable==='conditional'?'conditional':false;
    byId[id]=value;
    merge(byKey,e.key,value);
    for(const mode of state.relicRuleEffects?.definitions?.[id]?.modes||[]){
      if(mode==='普通')merge(byMode.normal,e.key,value);
      if(mode==='深夜')merge(byMode.deep,e.key,value);
    }
  }
  return {byId,byMode,byKey};
}
function scoreRuleInstances(instances,rule,stacking){
  let nonstackable=0,conditional=0,stackable=0;
  for(const {effect,group} of instances){
    const id=effect.id==null?'':String(effect.id);
    const value=id&&Object.hasOwn(stacking.byId,id)?stacking.byId[id]:Object.hasOwn(stacking.byMode[group]||{},effect.key)?stacking.byMode[group][effect.key]:stacking.byKey[effect.key];
    if(value===true)stackable++;else if(value==='conditional')conditional++;else nonstackable++;
  }
  const cap=Math.max(1,Math.min(6,Number(rule.cap)||1)),full=Math.min(stackable+(nonstackable?1:0),cap),discounted=Math.min(conditional,cap-full);
  return rule.weight*full+(discounted?rule.weight*(full?0.7*discounted:1+0.7*(discounted-1)):0);
}
function renderBuildResult(data){
  const results=(data.allResults?.flatMap(x=>x.results||[])||[]).filter(x=>x.requiredMet);
  state.buildResults=results.slice(0,10);
  $('#build-results').innerHTML=state.buildResults.length?state.buildResults.map((x,i)=>{const vessel=x.vessel||{},character=vessel.character||$('#build-character-select').value;const renderRelic=r=>{const owned=state.save.relics.find(own=>String(own.id)===String(r.id))||r;return `<div class="build-relic"><div class="build-relic-main">${relicImage(owned)}<div><strong>${esc(relicName(owned))} · #${esc(r.id)}</strong><small>${esc(relicCategory(owned))}</small><div class="game-effect-list compact">${renderEffectRows(owned)}</div></div></div></div>`};return `<article class="build-result"><header><h3>方案 ${i+1} · ${esc(characterZh[character]||character)} · ${esc(vesselName(vessel.key,character))}</h3><strong class="score">${esc(fmt(x.score))} 分</strong></header><p class="meta">已覆盖必选词条 · 命中 ${(x.matchedEffects||[]).length} 项目标</p><div class="build-relics"><div><h4>普通遗物</h4>${(x.normalRelics||x.relics||[]).map(renderRelic).join('')||'<span class="detail-note">无</span>'}</div><div><h4>深夜遗物</h4>${(x.deepRelics||[]).map(renderRelic).join('')||'<span class="detail-note">当前模式未使用</span>'}</div></div><button type="button" class="button ghost apply-build" data-build-index="${i}">在上方槽位预览此方案 ↗</button></article>`}).join(''):'<div class="note-panel"><span class="note-icon">i</span><div><strong>没有满足全部必选条件的组合</strong><p>请检查存档里是否有必选词条，以及供具颜色是否能装入对应槽位。</p></div></div>';
}
function placeRecommended(relics,colors){
  const indexes=relics.map(r=>state.save.relics.findIndex(own=>String(own.id)===String(r.id)));
  if(indexes.some(i=>i<0))return null;
  const placed=Array(colors.length).fill(null),used=new Set();
  function next(slot){if(slot===indexes.length)return true;for(let i=0;i<colors.length;i++){if(used.has(i))continue;const color=colors[i],relic=state.save.relics[indexes[slot]];if(color!=='Any'&&relic.itemColor!==color)continue;placed[i]=indexes[slot];used.add(i);if(next(slot+1))return true;used.delete(i);placed[i]=null}return false}
  return next(0)?placed:null;
}
$('#build-results').addEventListener('click',e=>{const btn=e.target.closest('[data-build-index]');if(!btn)return;const result=state.buildResults[Number(btn.dataset.buildIndex)];if(!result||!state.save)return;
  const character=result.vessel?.character;if(character&&[...$('#character-select').options].some(option=>option.value===character)){$('#character-select').value=character;$('#character-select').dispatchEvent(new Event('change'));$('#build-character-select').value=character}
  const vessel=result.vessel?.key;if(vessel&&[...$('#vessel-select').options].some(option=>option.value===vessel))$('#vessel-select').value=vessel;
  const config=currentVessel(),normal=placeRecommended(result.normalRelics||result.relics||[],config.normalSlots),deep=$('#build-mode').value==='combined'?placeRecommended(result.deepRelics||[],config.deepSlots):[null,null,null];
  if(!normal||!deep){$('#build-status').textContent='此方案无法放入当前供具槽位，请更换供具后重试。';return}
  state.equipped={normal,deep};state.selectedRelicIndex=null;renderBuildWorkspace();$('#equip-status').textContent='已在上方槽位预览推荐方案，可继续拖拽调整。';const scrollBehavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';$('#loadout-slots').scrollIntoView({behavior:scrollBehavior,block:'center'});
});
$('#run-build').addEventListener('click',()=>{
  if(!state.save)return navigate('relics');
  if(!state.rules.length){$('#build-status').textContent='请先添加至少一项规则。';return}
  if($('#build-mode').value==='normal'&&state.rules.some(r=>r.scope==='deep'&&r.priority==='required')){$('#build-status').textContent='仅普通模式无法满足“深夜必选”规则，请切换组合模式或调整规则。';return}
  stopBuildWorker();
  const btn=$('#run-build');btn.disabled=true;state.buildResults=[];$('#build-status').textContent='正在计算供具槽位与遗物组合…';$('#build-results').innerHTML='';
  let worker;
  try{
    const payload={relics:state.save.relics,effectSpecs:buildSpecs(),vesselsData:state.vessels,stackingData:stackingData(),params:{character:$('#build-character-select').value,vessel:undefined,characterVesselsOnly:true,combined:$('#build-mode').value==='combined',candidates:25,top:10}};
    worker=new Worker('./relic-optimizer.js');state.worker=worker;
    const fail=error=>{if(state.worker!==worker)return;stopBuildWorker(worker);btn.disabled=false;$('#build-status').textContent='计算失败：'+(error?.message||'后台计算发生错误')};
    worker.onmessage=e=>{
      if(state.worker!==worker)return;
      const data=e.data||{};
      if(data.progress){$('#build-status').textContent=`正在计算 ${data.progress.current}/${data.progress.total} 个供具…`;return}
      stopBuildWorker(worker);btn.disabled=false;
      if(data.error){$('#build-status').textContent='计算失败：'+data.error;return}
      try{renderBuildResult(data.result);$('#build-status').textContent=state.buildResults.length?`计算完成 · ${state.buildResults.length} 套满足必选条件的组合`:'没有满足全部必选条件的组合'}
      catch(error){state.buildResults=[];$('#build-results').innerHTML='';$('#build-status').textContent='计算失败：'+error.message}
    };
    worker.onerror=fail;
    worker.onmessageerror=fail;
    worker.postMessage(payload);
  }catch(error){stopBuildWorker(worker);btn.disabled=false;$('#build-status').textContent='计算失败：'+error.message}
});

loadCatalogs();navigate(location.hash.slice(1)||'overview');
