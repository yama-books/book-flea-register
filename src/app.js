import {COLORS,copy,initialState,integer,parseMoney,totals,localDate,activeReceipts,salesTotal,validateSettings,voidSale,backupJSON,parseBackup,exportCSV,MAX_QUANTITY} from './calculation.js';
import {openStore,readState,changeState,saveSale,restoreState} from './storage.js';
const $=s=>document.querySelector(s);
const yen=n=>new Intl.NumberFormat('ja-JP').format(n)+'円';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4)),x=>x.toString(16)).join('-');
const blank=()=>({id:uid(),items:[],received:'',correctionOfId:null});
const key=i=>JSON.stringify([i.priceId,i.unitPriceYen,i.colorId,i.genreId,i.genreLabel]);
let db,state=initialState(),draft=blank(),colorId='red',genreId=null,busy=false,ready=false,editor,historyLimit=20,pendingConfirm;
function notify(message,error=false){$('#notice').textContent=message;$('#notice').classList.toggle('error',error);}
function persistDraft(){try{sessionStorage.setItem('book-flea-register-draft',JSON.stringify(draft));}catch{notify('会計の途中保存が使えません。再読込すると未確定の入力が消えることがあります。',true);}}
function recoverDraft(){try{const data=JSON.parse(sessionStorage.getItem('book-flea-register-draft'));if(data && typeof data.id==='string' && Array.isArray(data.items) && typeof data.received==='string'){totals(data.items);draft=data;}}catch{notify('途中の会計を復元できませんでした。未確定の入力をご確認ください。',true);}}
function selectedItem(){
  const c=state.settings.colors.find(x=>x.id===colorId),p=state.settings.prices.find(x=>x.id===c?.priceId),g=state.settings.genres.find(x=>x.id===genreId);
  if(!p)return null;
  return {priceId:p.id,unitPriceYen:p.amountYen,colorId:c.id,colorLabel:c.label,colorHex:c.hex,genreId:g?.id??null,genreLabel:g?.label??'未分類',quantity:1,lineTotalYen:p.amountYen};
}
function renderColors(){
  $('#colors').innerHTML=state.settings.colors.map(c=>{const p=state.settings.prices.find(p=>p.id===c.priceId);return `<button class="color-choice" data-color="${esc(c.id)}" aria-label="${esc(c.label)} ${p?yen(p.amountYen):'価格未設定'}" aria-pressed="${c.id===colorId}" ${!ready||busy?'disabled':''}><span class="swatch" style="background:${c.hex}"></span><span class="color-name">${c.label}</span><span class="color-price">${p?yen(p.amountYen):'未設定'}</span></button>`;}).join('');
  $('#genres').innerHTML=[{id:'',label:'未分類'},...state.settings.genres].map(g=>`<button data-genre="${g.id}" aria-pressed="${g.id===(genreId??'')}" ${busy?'disabled':''}>${g.label}</button>`).join('');
  $('#selected-genre').textContent=state.settings.genres.find(g=>g.id===genreId)?.label??'未分類';
}
function renderCart(){
  let t;try{t=totals(draft.items);}catch(e){notify(e.message,true);return;}
  $('#total').innerHTML=`${new Intl.NumberFormat('ja-JP').format(t.totalYen)}<span>円</span>`;$('#count').textContent=t.quantityTotal;
  $('#draft-label').textContent=draft.correctionOfId?'履歴を残して、この会計を訂正中':'色を選んで冊数を追加';
  const item=selectedItem(),qty=item?draft.items.find(i=>key(i)===key(item))?.quantity??0:0;
  $('#quantity-picker').innerHTML=`<div class="quantity-label">${item?`${yen(item.unitPriceYen)}の本 × ${qty}冊`:'最初に色と価格を設定'}<small>${item?`${esc(item.colorLabel)} · ${esc(item.genreLabel)}`:'設定から6色の価格を選べます'}</small></div><div class="stepper"><button data-step="-1" aria-label="選択した本を1冊減らす" ${!item||!qty||busy||!ready?'disabled':''}>−</button><strong>${qty}</strong><button data-step="1" aria-label="選択した本を1冊増やす" ${!item||busy||!ready||qty>=MAX_QUANTITY?'disabled':''}>＋</button></div>`;
  $('#cart').innerHTML=draft.items.length?draft.items.map((i,n)=>`<div class="cart-row"><div class="cart-description"><span class="swatch" style="background:${esc(i.colorHex)}"></span>${esc(i.colorLabel)} · ${yen(i.unitPriceYen)} × ${i.quantity}冊<small>${esc(i.genreLabel)} · ${yen(i.lineTotalYen)}</small></div><div class="cart-stepper"><button data-row="${n}" data-delta="-1" aria-label="明細${n+1}を1冊減らす" ${busy?'disabled':''}>−</button><button data-row="${n}" data-delta="1" aria-label="明細${n+1}を1冊増やす" ${busy||i.quantity>=MAX_QUANTITY?'disabled':''}>＋</button></div></div>`).join(''):'<p class="cart-empty">値札の色を選び、＋で冊数を増やしてください。</p>';
  const counts=new Map();for(const i of draft.items)counts.set(i.unitPriceYen,(counts.get(i.unitPriceYen)??0)+i.quantity);
  $('#price-summary').textContent=[...counts].sort((a,b)=>a[0]-b[0]).map(([p,q])=>`${yen(p)} × ${q}冊`).join('　/　');
  $('#received').value=draft.received;$('#received').disabled=busy||!ready;
  $('#open-settings').disabled=busy||!ready;
  $('#clear-draft').disabled=busy||!ready||(!draft.items.length&&!draft.correctionOfId&&!draft.received);
  renderPayment();
}
function renderPayment(){
  const {totalYen}=totals(draft.items);let received=null,error='';
  try{received=parseMoney(draft.received);}catch{error=draft.received?'整数の金額を入力してください':'お預かり金額を入力してください';}
  if(!draft.items.length)error='本を追加してください';
  else if(received!==null && received<totalYen)error=`あと${yen(totalYen-received)}不足しています`;
  $('#change').textContent=received!==null && received>=totalYen && draft.items.length?yen(received-totalYen):'—';
  $('#payment-hint').textContent=error || (draft.correctionOfId?'元の会計を取消し、この内容へ差し替えます':'内容を確認して「完了」を押してください');
  $('#payment-hint').classList.toggle('short',received!==null&&received<totalYen);
  $('#complete').disabled=Boolean(error)||busy||!ready||!state.settings.initialized;
  $('#complete').innerHTML=busy?'保存しています…':`${draft.correctionOfId?'訂正を完了':'完了'} <span>会計を保存して、次のお客さんへ</span>`;
  document.querySelectorAll('[data-money]').forEach(b=>{b.disabled=busy||!ready||!draft.items.length;});
}
function renderHistory(){
  const date=localDate(),valid=activeReceipts(state),today=valid.filter(r=>r.businessDate===date);
  $('#today-date').textContent=new Date().toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'});
  $('#today-total').innerHTML=`${new Intl.NumberFormat('ja-JP').format(salesTotal(today))} <span>円</span>`;
  $('#today-count').textContent=`${today.reduce((s,r)=>s+r.quantityTotal,0)}冊（CD含む） · ${today.length}回のお会計`;
  const latest=state.receipts.at(-1),isActive=latest&&!state.voids.some(v=>v.receiptId===latest.id);
  $('#last-action').innerHTML=isActive?`<button class="quiet" data-void="${esc(latest.id)}" ${busy?'disabled':''}>直前の会計 #${String(latest.receiptNo).padStart(4,'0')} を取消</button>`:'';
  $('#history').innerHTML=state.receipts.length?[...state.receipts].reverse().slice(0,historyLimit).map(r=>{
    const v=state.voids.find(v=>v.receiptId===r.id);
    return `<article class="history-item ${v?'voided':''}"><div class="history-top"><span>#${String(r.receiptNo).padStart(4,'0')} ${v?'<span class="void-badge">取消済み</span>':''}</span><strong>${yen(r.totalYen)}</strong></div><p class="history-meta">${new Date(r.committedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${r.quantityTotal}冊${r.correctionOfId?' · 訂正会計':''}</p><details><summary>明細・お預かりを見る</summary>${r.items.map(i=>`<p>${esc(i.colorLabel)} / ${esc(i.genreLabel)}<br>${yen(i.unitPriceYen)} × ${i.quantity}冊 = ${yen(i.lineTotalYen)}</p>`).join('')}<p>お預かり ${yen(r.receivedYen)} / お釣り ${yen(r.changeYen)}<br>確定時の累計 ${yen(r.cumulativeAtCommitYen)}</p>${v?`<p>取消: ${esc(v.reason)}<br>${new Date(v.voidedAt).toLocaleString('ja-JP')}</p>`:`<button data-correct="${esc(r.id)}" ${busy?'disabled':''}>訂正</button><button data-void="${esc(r.id)}" ${busy?'disabled':''}>取消</button>`}</details></article>`;
  }).join(''):'<div class="empty-history">まだ売上の記録はありません。<br>「完了」を押すと、ここに残ります。</div>';
  $('#more-history').hidden=state.receipts.length<=historyLimit;
  $('#summaries').innerHTML=[['価格別',i=>yen(i.unitPriceYen)],['色別',i=>i.colorLabel],['分類別',i=>i.genreLabel]].map(([label,group])=>{
    const map=new Map();for(const r of today)for(const i of r.items){const k=group(i),v=map.get(k)??{quantity:0,amount:0};v.quantity+=i.quantity;v.amount+=i.lineTotalYen;map.set(k,v);}
    return `<section class="summary-group"><h4>${label}</h4>${map.size?[...map].map(([name,v])=>`<p><span>${esc(name)} · ${v.quantity}冊</span><strong>${yen(v.amount)}</strong></p>`).join(''):'<p>まだ記録はありません</p>'}</section>`;
  }).join('');
  $('#csv').disabled=busy||!ready;$('#backup').disabled=busy||!ready;
}
function render(){renderColors();renderCart();renderHistory();}
function step(delta,index){
  if(busy||!ready)return;
  const next=copy(draft.items),item=index===undefined?selectedItem():next[index];if(!item)return;
  const n=index===undefined?next.findIndex(i=>key(i)===key(item)):index;
  if(n<0){if(delta>0)next.push(item);}else{next[n].quantity+=delta;if(next[n].quantity<=0)next.splice(n,1);else next[n].lineTotalYen=next[n].quantity*next[n].unitPriceYen;}
  try{totals(next);draft.items=next;persistDraft();renderCart();}catch(e){notify(e.message,true);}
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
    const receipt=saved.receipts.find(r=>r.id===draft.id);state=saved;draft=blank();genreId=null;persistDraft();notify(`会計 #${String(receipt.receiptNo).padStart(4,'0')} · ${yen(receipt.totalYen)} を保存しました。次のお客さんをどうぞ。`);broadcast();
  }catch(e){await refreshAfterError(e);}finally{busy=false;render();}
}
function download(content,type,name){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
function saveBackup(){download(backupJSON(state),'application/json',`古本フリマレジ-backup-${localDate()}-${Date.now()}.json`);}
function renderEditor(){
  $('#price-editor').innerHTML=editor.prices.map((p,i)=>`<div class="price-editor-row"><input type="number" min="1" max="1000000" step="1" inputmode="numeric" data-price="${i}" aria-label="価格${i+1}" value="${p.amountYen}"><span>円</span><button type="button" data-move="${i}" data-direction="-1" aria-label="価格${i+1}を上へ" ${i===0?'disabled':''}>↑</button><button type="button" data-move="${i}" data-direction="1" aria-label="価格${i+1}を下へ" ${i===editor.prices.length-1?'disabled':''}>↓</button><button type="button" class="remove-price" data-remove="${i}" ${editor.prices.length===1?'disabled':''}>削除</button></div>`).join('');
  $('#mapping-editor').innerHTML=editor.colors.map(c=>`<label><span class="swatch" style="background:${c.hex}"></span>${c.label}<select data-mapping="${c.id}" aria-label="${c.label}の価格"><option value="">価格を選択</option>${editor.prices.map(p=>`<option value="${esc(p.id)}" ${c.priceId===p.id?'selected':''}>${yen(p.amountYen)}</option>`).join('')}</select></label>`).join('');
}
function openSettings(){
  if(busy||!ready)return;
  if(draft.items.length||draft.correctionOfId){notify('設定を変える前に、会計を完了するか「やり直す」で会計を空にしてください。',true);return;}
  editor=copy(state.settings);$('#setup-help').textContent=state.settings.initialized?'価格を変更しても、過去の売上は変わりません。':'最初に、6色の値札と価格を対応させてください。';$('#settings-error').textContent='';renderEditor();$('#settings-dialog').showModal();
}
async function submitSettings(e){
  e.preventDefault();if(busy)return;
  try{
    const settings=copy(editor);settings.initialized=true;validateSettings(settings);
    busy=true;$('#settings-form button[type=submit]').disabled=true;
    state=await changeState(db,state.revision,s=>{s.settings=settings;return s;});$('#settings-dialog').close();notify('設定を保存しました。色を選んでお会計をはじめましょう。');broadcast();
  }catch(error){$('#settings-error').textContent=error.message;try{state=await readState(db);}catch{}}
  finally{busy=false;$('#settings-form button[type=submit]').disabled=false;render();}
}
let channel;
try{channel=new BroadcastChannel('book-flea-register');channel.onmessage=()=>{if(!busy)notify('別のタブで更新されました。保存前に最新の記録を確認します。',true);};}catch{}
function broadcast(){try{channel?.postMessage('updated');}catch{}}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.color){colorId=b.dataset.color;renderColors();renderCart();}
  if('genre' in b.dataset){genreId=b.dataset.genre||null;renderColors();renderCart();}
  if('step' in b.dataset)step(Number(b.dataset.step));
  if('row' in b.dataset)step(Number(b.dataset.delta),Number(b.dataset.row));
  if('money' in b.dataset){draft.received=b.dataset.money==='exact'?String(totals(draft.items).totalYen):b.dataset.money;$('#received').value=draft.received;persistDraft();renderPayment();}
  if(b.dataset.void){const id=b.dataset.void,r=state.receipts.find(r=>r.id===id);confirmAction('会計を取消',`会計 #${String(r.receiptNo).padStart(4,'0')} · ${yen(r.totalYen)} を取消します。\n記録は消さず、売上集計から除きます。`,()=>runMutation(()=>changeState(db,state.revision,s=>voidSale(s,id,$('#reason').value.trim()||'操作間違い')),'会計を取消しました。記録は履歴に残っています。'),true);}
  if(b.dataset.correct){
    if(draft.items.length||draft.correctionOfId){notify('現在の会計を完了するか「やり直す」で空にしてください。',true);return;}
    const r=state.receipts.find(r=>r.id===b.dataset.correct);confirmAction('会計を訂正',`会計 #${String(r.receiptNo).padStart(4,'0')} を編集します。\n「訂正を完了」するまで元の会計は有効なままです。`,()=>{draft={id:uid(),items:copy(r.items),received:String(r.receivedYen),correctionOfId:r.id};persistDraft();render();notify('訂正する明細の＋/−とお預かりを変更し、訂正を完了してください。');$('#checkout-title').scrollIntoView({block:'start'});});
  }
  if('move' in b.dataset){const i=Number(b.dataset.move),j=i+Number(b.dataset.direction);[editor.prices[i],editor.prices[j]]=[editor.prices[j],editor.prices[i]];renderEditor();}
  if('remove' in b.dataset){const [removed]=editor.prices.splice(Number(b.dataset.remove),1);for(const c of editor.colors)if(c.priceId===removed.id)c.priceId='';renderEditor();}
});
$('#received').addEventListener('input',e=>{draft.received=e.target.value;persistDraft();renderPayment();});
$('#complete').addEventListener('click',finish);
$('#clear-draft').addEventListener('click',()=>confirmAction('いまの会計をやり直す','未確定の入力をクリアします。保存済みの履歴は変わりません。',()=>{draft=blank();genreId=null;persistDraft();render();notify('会計を空にしました。');}));
$('#open-settings').addEventListener('click',openSettings);
$('#close-settings').addEventListener('click',()=>{if(!busy)$('#settings-dialog').close();});
$('#settings-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('#settings-form').addEventListener('submit',submitSettings);
$('#settings-form').addEventListener('input',e=>{
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
$('#csv').addEventListener('click',()=>download(exportCSV(state),'text/csv;charset=utf-8',`古本フリマレジ-${localDate()}.csv`));
$('#backup').addEventListener('click',saveBackup);
$('#restore').addEventListener('click',()=>{if(!busy)$('#restore-file').click();});
$('#restore-file').addEventListener('change',async e=>{
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
  render();try{db=await openStore();state=await readState(db);recoverDraft();
    if(state.receipts.some(r=>r.id===draft.id)){draft=blank();persistDraft();}
    ready=true;render();notify(draft.items.length?'途中のお会計を復元しました。内容をご確認ください。':'色を選んで、＋で冊数を追加してください。');
    if(!state.settings.initialized)openSettings();
  }catch(e){notify(e.message,true);render();}
}
init();
