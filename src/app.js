import {COLORS,copy,initialState,integer,parseMoney,totals,localDate,activeReceipts,salesTotal,validateSettings,voidSale,backupJSON,parseBackup,exportCSV,categoryOf,tenderCandidates,MAX_QUANTITY,MAX_CATEGORY} from './calculation.js';
import {openStore,readState,changeState,saveSale,restoreState} from './storage.js';
import {setupCustomerControls} from './customer-controls.js';
import {openPractice,draftKey,practiceBackup} from './practice.js';
import {setupStaffCall} from './staff-call.js';
import {setupFullscreen} from './menu.js';
import {salesSummary,pieGradient} from './sales-summary.js';
import {animatePie} from './chart-motion.js';
const $=s=>document.querySelector(s);
const yen=n=>new Intl.NumberFormat('ja-JP').format(n)+'円';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4)),x=>x.toString(16)).join('-');
const blank=()=>({id:uid(),items:[],received:'',correctionOfId:null});
const key=i=>JSON.stringify([i.priceId,i.unitPriceYen,i.colorId,i.genreId,i.genreLabel]);
let db,liveDb,practiceDb,practice=false,state=initialState(),draft=blank(),busy=false,ready=false,editor,historyLimit=20,pendingConfirm,lastSale=null;
let stopPieMotion=()=>{};
const customerDisplay=setupCustomerControls();
setupStaffCall({isPractice:()=>practice});setupFullscreen();
function notify(message,error=false){$('#notice').textContent=(practice?'【練習】':'')+message;$('#notice').classList.toggle('error',error);}
function persistDraft(){try{sessionStorage.setItem(draftKey(practice),JSON.stringify(draft));}catch{notify('会計の途中保存が使えません。再読込すると未確定の入力が消えることがあります。',true);}}
function recoverDraft(){try{const data=JSON.parse(sessionStorage.getItem(draftKey(practice)));if(data && typeof data.id==='string' && Array.isArray(data.items) && typeof data.received==='string'){totals(data.items);draft=data;}}catch{notify('途中の会計を復元できませんでした。未確定の入力をご確認ください。',true);}}
// 分類名は確定時のsnapshotとして明細へ残すが、レジ画面には表示しない。
function itemFor(colorId){
  const c=state.settings.colors.find(x=>x.id===colorId),p=state.settings.prices.find(x=>x.id===c?.priceId);
  if(!p)return null;
  return {priceId:p.id,unitPriceYen:p.amountYen,colorId:c.id,colorLabel:c.label,colorHex:c.hex,genreId:null,genreLabel:categoryOf(c),quantity:1,lineTotalYen:p.amountYen};
}
const textMarks={so:'そ',cd:'CD'};
function mark(id,hex,extra=''){const label=textMarks[id];return `<span class="swatch${label?` text-mark ${id}-mark`:''}${extra}" style="background:${esc(hex)}" aria-hidden="true">${label??''}</span>`;}
// ボタンと明細には分類名を出す。分類名が空のマークは色名で表示する。
const displayName=(category,colorLabel)=>category&&category!=='未分類'?category:colorLabel;
function renderColors(){
  $('#colors').innerHTML=state.settings.colors.map(c=>{const p=state.settings.prices.find(p=>p.id===c.priceId),name=displayName(c.category?.trim(),c.label);return `<button class="color-choice" data-color="${esc(c.id)}" aria-label="${esc(name)}（${esc(c.label)}） ${p?yen(p.amountYen)+'を1点追加':'価格未設定'}" ${!ready||busy||!p?'disabled':''}>${mark(c.id,c.hex)}<span class="color-name">${esc(name)}</span><span class="color-price">${p?yen(p.amountYen):'未設定'}</span></button>`;}).join('');
}
function payment(){
  const {totalYen,quantityTotal}=totals(draft.items);let received=null;
  try{received=parseMoney(draft.received);}catch{}
  const enough=Boolean(draft.items.length)&&received!==null&&received>=totalYen;
  return {totalYen,quantityTotal,received,changeYen:enough?received-totalYen:null};
}
// お客さん画面へは会計中の金額だけを送る。完了直後は次の操作まで前回の会計を表示する。
function customerView(){
  const p=payment();
  if(lastSale&&!draft.items.length&&!draft.received)return lastSale;
  return {amountYen:p.totalYen,receivedYen:draft.items.length?p.received:null,changeYen:p.changeYen,done:false};
}
function renderCart(){
  let t;try{t=totals(draft.items);}catch(e){notify(e.message,true);return;}
  $('#total').innerHTML=`${new Intl.NumberFormat('ja-JP').format(t.totalYen)}<span>円</span>`;$('#count').textContent=t.quantityTotal;
  $('#draft-label').textContent=draft.correctionOfId?'履歴を残して訂正中':'';
  $('.register').classList.toggle('is-correcting',Boolean(draft.correctionOfId));
  $('#cart').innerHTML=draft.items.length?draft.items.map((i,n)=>`<div class="cart-row">${mark(i.colorId,i.colorHex)}<div class="cart-description"><strong>${esc(displayName(i.genreLabel,i.colorLabel))}</strong><span>${yen(i.unitPriceYen)} × <b>${i.quantity}</b></span></div><strong class="cart-amount">${yen(i.lineTotalYen)}</strong><div class="cart-stepper"><button data-row="${n}" data-delta="-1" aria-label="${esc(displayName(i.genreLabel,i.colorLabel))}を1点減らす" ${busy?'disabled':''}>−</button><button data-row="${n}" data-delta="1" aria-label="${esc(displayName(i.genreLabel,i.colorLabel))}を1点増やす" ${busy||i.quantity>=MAX_QUANTITY?'disabled':''}>＋</button></div></div>`).join(''):'<p class="cart-empty">左のマークをタップすると、<br>ここに明細が出ます。</p>';
  $('#received').value=draft.received;$('#received').disabled=busy||!ready;
  $('#open-settings').disabled=busy||!ready;
  $('#clear-draft').disabled=busy||!ready||(!draft.items.length&&!draft.correctionOfId&&!draft.received);
  renderPayment();
}
function renderPayment(){
  const {totalYen,received,changeYen}=payment();let error='';
  if(received===null)error=draft.received?'整数の金額を入力してください':'お預かり金額を入力してください';
  if(!draft.items.length)error='マークをタップしてください';
  else if(received!==null && received<totalYen)error=`あと${yen(totalYen-received)}不足しています`;
  $('#received-view').textContent=received===null?'—':yen(received);
  $('#change').textContent=changeYen===null?'—':yen(changeYen);
  $('#payment-hint').textContent=error || (draft.correctionOfId?'元の会計を取消し、この内容へ差し替えます':'内容を確認して「完了」を押してください');
  $('#payment-hint').classList.toggle('short',received!==null&&received<totalYen&&Boolean(draft.items.length));
  $('#complete').disabled=Boolean(error)||busy||!ready||!state.settings.initialized;
  $('#complete').innerHTML=busy?'保存しています…':`${draft.correctionOfId?'訂正を完了':practice?'練習を完了':'完了'} <span>${practice?'デモとして保存して、次の練習へ':'会計を保存して、次のお客さんへ'}</span>`;
  const off=busy||!ready||!draft.items.length?'disabled':'';
  $('#quick-money').innerHTML=`<button data-money="exact" ${off}>ちょうど</button>`+tenderCandidates(totalYen).map(n=>`<button data-money="${n}" class="${String(n)===draft.received?'is-current':''}" ${off}>${yen(n)}</button>`).join('');
  // 練習の金額を、本番のお客さん用画面に流さない。
  customerDisplay.publish(practice?{amountYen:0,receivedYen:null,changeYen:null,done:false}:customerView());
}
function renderHistory(){
  const date=localDate(),valid=activeReceipts(state),today=valid.filter(r=>r.businessDate===date);
  $('#today-date').textContent=new Date().toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'});
  $('#today-total').innerHTML=`${new Intl.NumberFormat('ja-JP').format(salesTotal(today))} <span>円</span>`;
  $('#today-count').textContent=`${today.reduce((s,r)=>s+r.quantityTotal,0)}点 · ${today.length}回のお会計`;
  const latest=state.receipts.at(-1),isActive=latest&&!state.voids.some(v=>v.receiptId===latest.id);
  $('#last-action').innerHTML=isActive?`<button class="quiet" data-void="${esc(latest.id)}" ${busy?'disabled':''}>直前の会計 #${String(latest.receiptNo).padStart(4,'0')} を取消</button>`:'';
  $('#history').innerHTML=state.receipts.length?[...state.receipts].reverse().slice(0,historyLimit).map(r=>{
    const v=state.voids.find(v=>v.receiptId===r.id);
    return `<article class="history-item ${v?'voided':''}"><div class="history-top"><span>#${String(r.receiptNo).padStart(4,'0')} ${v?'<span class="void-badge">取消済み</span>':''}</span><strong>${yen(r.totalYen)}</strong></div><p class="history-meta">${new Date(r.committedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${r.quantityTotal}点${r.correctionOfId?' · 訂正会計':''}</p><details><summary>明細・お預かりを見る</summary>${r.items.map(i=>`<p>${esc(i.colorLabel)} / ${esc(i.genreLabel)}<br>${yen(i.unitPriceYen)} × ${i.quantity}点 = ${yen(i.lineTotalYen)}</p>`).join('')}<p>お預かり ${yen(r.receivedYen)} / お釣り ${yen(r.changeYen)}<br>確定時の累計 ${yen(r.cumulativeAtCommitYen)}</p>${v?`<p>取消: ${esc(v.reason)}<br>${new Date(v.voidedAt).toLocaleString('ja-JP')}</p>`:`<button data-correct="${esc(r.id)}" ${busy?'disabled':''}>訂正</button><button data-void="${esc(r.id)}" ${busy?'disabled':''}>取消</button>`}</details></article>`;
  }).join(''):'<div class="empty-history">まだ売上の記録はありません。<br>「完了」を押すと、ここに残ります。</div>';
  $('#more-history').hidden=state.receipts.length<=historyLimit;
  renderSummary(date);
  $('#csv').disabled=busy||!ready;$('#backup').disabled=busy||!ready;
}
function renderSummary(date=localDate()){
  stopPieMotion();stopPieMotion=()=>{};
  const data=salesSummary(state,date),target=$('#summaries');
  if(!data.totalYen){target.innerHTML='<p class="summary-empty">まだ記録はありません。会計を保存すると表示します。</p>';return;}
  if($('#summary-mode').value==='hourly'){
    const max=Math.max(...data.hours.map(h=>h.amountYen));
    target.innerHTML='<h4>時間帯別の売上（1時間ごと）</h4><p class="mini-note">会計を完了した時刻で集計します。</p><div class="hour-chart">'+data.hours.map(h=>`<div class="hour-row"><span>${String(h.hour).padStart(2,'0')}〜${String(h.hour+1).padStart(2,'0')}時</span><div class="hour-track" aria-hidden="true"><div style="width:${h.amountYen/max*100}%"></div></div><strong>${yen(h.amountYen)}</strong><small>${h.quantity}点 · ${h.receipts}会計</small></div>`).join('')+'</div>';
    return;
  }
  const description=data.categories.map(g=>`${g.name} ${yen(g.amountYen)}`).join('、');
  target.innerHTML=`<h4>分類別の売上金額</h4><div class="category-chart"><div id="sales-pie" class="sales-pie" role="img" aria-label="${esc(description)}"></div><div class="chart-legend">${data.categories.map(g=>`<div class="legend-row"><span class="legend-dot" style="background:${g.color}" aria-hidden="true"></span><span>${esc(g.name)}<small>${g.quantity}点 · ${(g.amountYen/data.totalYen*100).toFixed(1)}%</small></span><strong>${yen(g.amountYen)}</strong></div>`).join('')}</div></div>`;
  $('#sales-pie').style.background=pieGradient(data.categories);
  stopPieMotion=animatePie($('#sales-pie'));
}
$('#summary-mode').addEventListener('change',()=>renderSummary());
function render(){
  document.body.classList.toggle('practice-mode',practice);$('#practice-banner').hidden=!practice;
  $('#toggle-practice').textContent=practice?'本番モードに戻る':'練習モード';$('#toggle-practice').disabled=busy||!ready;
  $('#today-title').textContent=practice?'練習の記録（本番の売上には含みません）':'きょうの売上';
  $('#history-title').firstChild.textContent=practice?'練習の記録 ':'売上の記録 ';
  renderColors();renderCart();renderHistory();
}
async function switchMode(next){
  if(busy||!ready)return;persistDraft();busy=true;render();
  try{
    const live=await readState(liveDb);let target;
    if(next){target=await openPractice(live.settings);practiceDb?.close();practiceDb=target.db;}
    else target={db:liveDb,state:live};
    db=target.db;state=target.state;practice=next;draft=blank();lastSale=null;historyLimit=20;recoverDraft();
    if(state.receipts.some(r=>r.id===draft.id)){draft=blank();persistDraft();}
    try{sessionStorage.setItem('book-flea-register-mode',practice?'practice':'live');}catch{}
    notify(practice?'練習モードです。本番と同じ設定で操作できます。記録は本番と分けて保存します。':'本番モードに戻りました。');
  }catch(error){notify(error.message,true);}
  finally{busy=false;render();}
}
$('#toggle-practice').onclick=()=>{
  confirmAction(practice?'本番モードに戻る':'練習モードに切り替える','入力途中の会計は現在のモードに残します。練習の記録は本番の売上と分けて保存し、お客さん画面は待機表示にします。',()=>switchMode(!practice));
};
// index省略時はマークの1点追加。同じ価格・マーク・分類の明細へまとめる。
function step(delta,index,colorId){
  if(busy||!ready)return;
  const next=copy(draft.items),item=index===undefined?itemFor(colorId):next[index];if(!item)return;
  const n=index===undefined?next.findIndex(i=>key(i)===key(item)):index;
  if(n<0){if(delta>0)next.push(item);}else{next[n].quantity+=delta;if(next[n].quantity<=0)next.splice(n,1);else next[n].lineTotalYen=next[n].quantity*next[n].unitPriceYen;}
  try{totals(next);draft.items=next;lastSale=null;persistDraft();renderCart();}catch(e){notify(e.message,true);}
}
function confirmAction(title,message,action,withReason=false){
  $('#confirm-title').textContent=title;$('#confirm-message').textContent=message;$('#reason-label').hidden=!withReason;$('#reason').value='操作間違い';pendingConfirm=action;$('#confirm-dialog').showModal();
}
async function refreshAfterError(error){notify(error.message || '操作を完了できませんでした。',true);try{state=await readState(db);}catch{} }
async function runMutation(action,message){
  if(busy||!ready)return;busy=true;render();
  try{state=await action();notify(message);broadcast();}catch(e){await refreshAfterError(e);}finally{busy=false;render();}
}
async function finish(){
  if($('#complete').disabled||busy)return;
  if(draft.correctionOfId){confirmAction('会計の訂正',`合計 ${yen(totals(draft.items).totalYen)} に差し替えます。\n元の会計は取消済みとして残ります。`,commitDraft);}
  else await commitDraft();
}
async function commitDraft(){
  if(busy)return;busy=true;render();
  try{
    const saved=await saveSale(db,state.revision,{id:draft.id,items:draft.items,receivedYen:parseMoney(draft.received),correctionOfId:draft.correctionOfId});
    const receipt=saved.receipts.find(r=>r.id===draft.id);state=saved;draft=blank();lastSale={amountYen:receipt.totalYen,receivedYen:receipt.receivedYen,changeYen:receipt.changeYen,done:true};persistDraft();notify(`会計 #${String(receipt.receiptNo).padStart(4,'0')} · ${yen(receipt.totalYen)} を保存しました。次のお客さんをどうぞ。`);broadcast();
  }catch(e){await refreshAfterError(e);}finally{busy=false;render();}
}
function download(content,type,name){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
function saveBackup(){download(practice?practiceBackup(state):backupJSON(state),'application/json',`${practice?'練習-':''}古本フリマレジ-backup-${localDate()}-${Date.now()}.json`);}
function renderEditor(){
  $('#price-editor').innerHTML=editor.prices.map((p,i)=>`<div class="price-editor-row"><input type="number" min="1" max="1000000" step="1" inputmode="numeric" data-price="${i}" aria-label="価格${i+1}" value="${p.amountYen}"><span>円</span><button type="button" data-move="${i}" data-direction="-1" aria-label="価格${i+1}を上へ" ${i===0?'disabled':''}>↑</button><button type="button" data-move="${i}" data-direction="1" aria-label="価格${i+1}を下へ" ${i===editor.prices.length-1?'disabled':''}>↓</button><button type="button" class="remove-price" data-remove="${i}" ${editor.prices.length===1?'disabled':''}>削除</button></div>`).join('');
  $('#mapping-editor').innerHTML=editor.colors.map(c=>`<div class="mapping-row"><span class="mapping-name">${mark(c.id,c.hex)}${esc(c.label)}</span><select data-mapping="${c.id}" aria-label="${esc(c.label)}の価格"><option value="">価格を選択</option>${editor.prices.map(p=>`<option value="${esc(p.id)}" ${c.priceId===p.id?'selected':''}>${yen(p.amountYen)}</option>`).join('')}</select><input type="text" data-category="${c.id}" maxlength="${MAX_CATEGORY}" value="${esc(c.category)}" placeholder="未分類" aria-label="${esc(c.label)}の分類名" autocomplete="off"></div>`).join('');
}
function openSettings(){
  if(busy||!ready)return;
  const locked=settingsLocked();$('#settings-edit-fields').disabled=locked;$('#restore').disabled=locked;
  editor=copy(state.settings);$('#setup-help').textContent=practice?'本番と共通の設定です。変更は本番モードで行ってください。':locked?'会計中もお客さん表示につなげます。価格や分類名の変更は会計を空にしてから行ってください。':state.settings.initialized?'価格や分類名を変更しても、過去の売上は変わりません。':`最初に、${COLORS.length}種類のマークの値札と価格を対応させてください。`;$('#settings-error').textContent='';renderEditor();$('#settings-dialog').showModal();
}
function settingsLocked(){return practice||Boolean(state.settings.initialized&&(draft.items.length||draft.correctionOfId));}
async function submitSettings(e){
  e.preventDefault();if(busy||settingsLocked())return;
  try{
    const settings=copy(editor);settings.initialized=true;for(const c of settings.colors)c.category=c.category.trim();validateSettings(settings);
    busy=true;$('#settings-form button[type=submit]').disabled=true;
    state=await changeState(db,state.revision,s=>{s.settings=settings;return s;});$('#settings-dialog').close();notify('設定を保存しました。マークをタップしてお会計をはじめましょう。');broadcast();
  }catch(error){$('#settings-error').textContent=error.message;try{state=await readState(db);}catch{}}
  finally{busy=false;$('#settings-form button[type=submit]').disabled=false;render();}
}
let channel;
try{channel=new BroadcastChannel('book-flea-register');channel.onmessage=()=>{if(!busy)notify('別のタブで更新されました。保存前に最新の記録を確認します。',true);};}catch{}
function broadcast(){if(practice)return;try{channel?.postMessage('updated');}catch{}}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.color)step(1,undefined,b.dataset.color);
  if('row' in b.dataset)step(Number(b.dataset.delta),Number(b.dataset.row));
  if('money' in b.dataset){draft.received=b.dataset.money==='exact'?String(totals(draft.items).totalYen):b.dataset.money;$('#received').value=draft.received;persistDraft();renderPayment();}
  if(b.dataset.void){const id=b.dataset.void,r=state.receipts.find(r=>r.id===id);confirmAction('会計を取消',`会計 #${String(r.receiptNo).padStart(4,'0')} · ${yen(r.totalYen)} を取消します。\n記録は消さず、売上集計から除きます。`,()=>runMutation(()=>changeState(db,state.revision,s=>voidSale(s,id,$('#reason').value.trim()||'操作間違い')),'会計を取消しました。記録は履歴に残っています。'),true);}
  if(b.dataset.correct){
    if(draft.items.length||draft.correctionOfId){notify('現在の会計を完了するか「やりなおす」で空にしてください。',true);return;}
    const r=state.receipts.find(r=>r.id===b.dataset.correct);confirmAction('会計を訂正',`会計 #${String(r.receiptNo).padStart(4,'0')} を編集します。\n「訂正を完了」するまで元の会計は有効なままです。`,()=>{draft={id:uid(),items:copy(r.items),received:String(r.receivedYen),correctionOfId:r.id};persistDraft();render();notify('訂正する明細の＋/−とお預かりを変更し、訂正を完了してください。');$('#checkout-title').scrollIntoView({block:'start'});});
  }
  if('move' in b.dataset){const i=Number(b.dataset.move),j=i+Number(b.dataset.direction);[editor.prices[i],editor.prices[j]]=[editor.prices[j],editor.prices[i]];renderEditor();}
  if('remove' in b.dataset){const [removed]=editor.prices.splice(Number(b.dataset.remove),1);for(const c of editor.colors)if(c.priceId===removed.id)c.priceId='';renderEditor();}
});
$('#received').addEventListener('input',e=>{draft.received=e.target.value;persistDraft();renderPayment();});
$('#complete').addEventListener('click',finish);
$('#clear-draft').addEventListener('click',()=>confirmAction('いまの会計をやりなおす','未確定の入力をクリアします。保存済みの履歴は変わりません。',()=>{draft=blank();lastSale=null;persistDraft();render();notify('会計を空にしました。');}));
$('#open-settings').addEventListener('click',openSettings);
$('#open-customer').addEventListener('click',()=>$('#settings-dialog').close(),{capture:true});
$('#close-settings').addEventListener('click',()=>{if(!busy)$('#settings-dialog').close();});
$('#reset-settings').addEventListener('click',()=>{
  if(busy||settingsLocked())return;
  confirmAction('設定をすべて初期状態に戻す','価格の選択肢を100/200/400円、全マークを100円、分類名を初期値に戻して保存します。\n売上の記録・取消・訂正は変わりません。',async()=>{
    if(busy)return;busy=true;$('#reset-settings').disabled=true;
    try{state=await changeState(db,state.revision,s=>{s.settings=initialState().settings;return s;});editor=copy(state.settings);renderEditor();$('#settings-error').textContent='';$('#settings-dialog').close();notify('設定を初期状態に戻しました。');broadcast();}
    catch(error){$('#settings-error').textContent=error.message;try{state=await readState(db);}catch{}}
    finally{busy=false;$('#reset-settings').disabled=false;render();}
  });
});
$('#settings-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('#settings-form').addEventListener('submit',submitSettings);
$('#settings-form').addEventListener('input',e=>{
  if(e.target.dataset.category)editor.colors.find(c=>c.id===e.target.dataset.category).category=e.target.value;
  if('price' in e.target.dataset){editor.prices[Number(e.target.dataset.price)].amountYen=Number(e.target.value);const selections=[...document.querySelectorAll('[data-mapping]')].map(el=>[el,el.value]);for(const [el,value] of selections){el.innerHTML='<option value="">価格を選択</option>'+editor.prices.map(p=>`<option value="${esc(p.id)}">${yen(p.amountYen)}</option>`).join('');el.value=value;}}
});
$('#settings-form').addEventListener('change',e=>{if(e.target.dataset.mapping)editor.colors.find(c=>c.id===e.target.dataset.mapping).priceId=e.target.value;});
$('#add-price').addEventListener('click',()=>{if(editor.prices.length>=30){$('#settings-error').textContent='価格は30種類までです。';return;}editor.prices.push({id:uid(),amountYen:100});renderEditor();});
$('#generate-prices').addEventListener('click',()=>{
  try{const min=integer(Number($('#range-min').value),1,1_000_000),max=integer(Number($('#range-max').value),min,1_000_000),step=integer(Number($('#range-step').value),1,1_000_000);const amounts=[];for(let n=min;n<=max;n+=step){amounts.push(n);if(amounts.length>30)throw new Error('候補は30種類以内にしてください。');}
    confirmAction('価格候補を置き換える',amounts.map(yen).join('、')+'\nこの候補へ置き換えます。消える価格の色は再設定が必要です。',()=>{const old=editor.prices;editor.prices=amounts.map(n=>old.find(p=>p.amountYen===n)??{id:uid(),amountYen:n});for(const c of editor.colors)if(!editor.prices.some(p=>p.id===c.priceId))c.priceId='';renderEditor();});
  }catch(e){$('#settings-error').textContent=e.message;}
});
$('#confirm-form').addEventListener('submit',async e=>{e.preventDefault();const action=pendingConfirm;pendingConfirm=null;$('#confirm-dialog').close();if(action)await action();});
$('#confirm-cancel').addEventListener('click',()=>{pendingConfirm=null;$('#confirm-dialog').close();});
$('#confirm-dialog').addEventListener('cancel',()=>{pendingConfirm=null;});
$('#more-history').addEventListener('click',()=>{historyLimit+=20;renderHistory();});
$('#csv').addEventListener('click',()=>download(exportCSV(state),'text/csv;charset=utf-8',`${practice?'練習-':''}古本フリマレジ-${localDate()}.csv`));
$('#backup').addEventListener('click',saveBackup);
$('#restore').addEventListener('click',()=>{if(practice){notify('練習中は本番のバックアップを復元できません。');return;}if(!busy)$('#restore-file').click();});
$('#restore-file').addEventListener('change',async e=>{
  if(practice){e.target.value='';notify('練習中は本番のバックアップを復元できません。');return;}
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{
    if(file.size>20_000_000)throw new Error('バックアップは20MB以内にしてください。');
    const imported=parseBackup(await file.text());
    confirmAction('バックアップから復元',`会計 ${imported.receipts.length}件・取消 ${imported.voids.length}件のデータに全体を置き換えます。\n現在のデータのバックアップを先にダウンロードします。ファイルを保存したことを確認し、復元する場合だけ次の確認へ進んでください。`,()=>{
      saveBackup();confirmAction('保存できましたか？','現在のJSONバックアップを端末外にも保管してください。\n確認して実行すると、既存データと未確定会計を置き換えます。',async()=>{
        if(busy)return;busy=true;render();try{state=await restoreState(db,state.revision,imported);draft=blank();persistDraft();$('#settings-dialog').close();broadcast();notify('バックアップを復元しました。');}catch(error){await refreshAfterError(error);}finally{busy=false;render();if(!state.settings.initialized)openSettings();}
      });
    });
  }catch(error){$('#settings-error').textContent=error.message;}
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ready&&!busy)renderHistory();});
window.addEventListener('pagehide',persistDraft);
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
async function init(){
  render();try{liveDb=await openStore();db=liveDb;state=await readState(db);
    let resumePractice=false;try{resumePractice=sessionStorage.getItem('book-flea-register-mode')==='practice';}catch{}
    if(resumePractice){const target=await openPractice(state.settings);practiceDb=target.db;db=target.db;state=target.state;practice=true;}
    recoverDraft();
    if(state.receipts.some(r=>r.id===draft.id)){draft=blank();persistDraft();}
    ready=true;render();notify(draft.items.length?'途中のお会計を復元しました。内容をご確認ください。':state.settings.initialized?'マークをタップすると、1点追加されます。':'最初に「設定」で、マークと価格を対応させてください。');
    if(!state.settings.initialized)openSettings();
  }catch(e){notify(e.message,true);render();}
}
init();
