export const MAX_MONEY = 99_999_999;
export const MAX_QUANTITY = 999;
export const COLORS = [['red','赤','#e85c63'],['yellow','黄','#f2c94c'],['green','緑','#47a785'],['white','白','#ffffff'],['blue','青','#559bd5'],['so','そ','#ffffff']];
export const GENRES = ['文庫','新書','漫画','その他書籍','専門書','CD'];
export const copy = value => JSON.parse(JSON.stringify(value));
export function integer(value, min = 0, max = MAX_MONEY) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('金額・数量は範囲内の整数で入力してください。');
  return value;
}
export function parseMoney(text) {
  if (!/^\d{1,8}$/.test(String(text))) throw new Error('お預かり金額を整数で入力してください。');
  return integer(Number(text));
}
export function initialState() {
  return {schemaVersion:1, revision:0, nextReceiptNo:1,
    settings:{markerVersion:2, initialized:true, prices:[100,200,400].map(n=>({id:`p${n}`,amountYen:n})), colors:COLORS.map(([id,label,hex])=>({id,label,hex,priceId:'p100'})), genres:GENRES.map((label,i)=>({id:`g${i}`,label}))}, receipts:[], voids:[]};
}
export function migrateMarkers(state) {
  const colors=state?.settings?.colors;
  if(state?.schemaVersion===1 && Array.isArray(colors) && state.settings.markerVersion!==2){
    const legacy=copy(state.settings);
    legacy.colors=legacy.colors.map(c=>c.id==='pink'?{...c,id:'so',label:'そ',hex:'#ffffff'}:c);
    validateSettings(legacy,!legacy.initialized);
    state=copy(state);
    state.settings=initialState().settings;
  }
  return state;
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function text(value, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('データの文字列が不正です。');
  return value;
}
function unique(rows, field) {
  if (new Set(rows.map(x=>x[field])).size !== rows.length) throw new Error('データのIDが重複しています。');
}
export function validateSettings(settings, allowUnset = false) {
  if (!settings || typeof settings.initialized !== 'boolean' || !Array.isArray(settings.prices) || settings.prices.length < 1 || settings.prices.length > 30) throw new Error('価格は1〜30種類で設定してください。');
  for (const price of settings.prices) { text(price.id); integer(price.amountYen,1,1_000_000); }
  unique(settings.prices,'id'); unique(settings.prices,'amountYen');
  if (!Array.isArray(settings.colors) || settings.colors.length !== 6) throw new Error('6色の対応を設定してください。');
  for (const [id,label,hex] of COLORS) {
    const c=settings.colors.find(x=>x.id===id);
    if (!c || c.label!==label || c.hex!==hex || (!settings.prices.some(p=>p.id===c.priceId) && !(allowUnset && c.priceId===''))) throw new Error('すべての色に価格を割り当ててください。');
  }
  unique(settings.colors,'id');
  if (!Array.isArray(settings.genres) || settings.genres.length!==6 || settings.genres.some((g,i)=>g.id!==`g${i}` || g.label!==GENRES[i])) throw new Error('分類設定が不正です。');
  return settings;
}
export function totals(items) {
  if (!Array.isArray(items) || items.length>500) throw new Error('明細数が多すぎます。');
  let totalYen=0, quantityTotal=0;
  for (const item of items) {
    integer(item.unitPriceYen,1,1_000_000); integer(item.quantity,1,MAX_QUANTITY);
    totalYen=integer(totalYen+item.unitPriceYen*item.quantity); quantityTotal=integer(quantityTotal+item.quantity,0,99_999);
  }
  return {totalYen,quantityTotal};
}
export function validateItem(item) {
  text(item.priceId); text(item.colorId); text(item.colorLabel); text(item.genreLabel);
  if (item.genreId!==null) text(item.genreId);
  if ((!COLORS.some(([id])=>id===item.colorId) && item.colorId!=='pink') || !/^#[0-9a-f]{6}$/i.test(item.colorHex)) throw new Error('色の記録が不正です。');
  const {totalYen}=totals([item]);
  if (item.lineTotalYen!==totalYen) throw new Error('明細金額が一致しません。');
}
export function activeReceipts(state) {
  const removed=new Set(state.voids.map(v=>v.receiptId));
  return state.receipts.filter(r=>!removed.has(r.id));
}
export function salesTotal(receipts) { return receipts.reduce((sum,r)=>integer(sum+r.totalYen,0,Number.MAX_SAFE_INTEGER),0); }
export function makeReceipt(state, draft, now = new Date()) {
  if (!state.settings.initialized) throw new Error('最初に色と価格を設定してください。');
  text(draft.id); const existing=state.receipts.find(r=>r.id===draft.id);
  if (existing) return existing;
  const items=copy(draft.items);
  if (!items.length) throw new Error('本を追加してください。');
  for (const item of items) validateItem(item);
  const {totalYen,quantityTotal}=totals(items), receivedYen=integer(draft.receivedYen);
  if (receivedYen<totalYen) throw new Error('お預かり金額が不足しています。');
  const correctionOfId=draft.correctionOfId || null;
  if (correctionOfId && !activeReceipts(state).some(r=>r.id===correctionOfId)) throw new Error('訂正元の会計が変更されています。再読込してください。');
  const prior=activeReceipts(state).filter(r=>r.id!==correctionOfId);
  return {id:draft.id,receiptNo:integer(state.nextReceiptNo,1,Number.MAX_SAFE_INTEGER-1),committedAt:now.toISOString(),businessDate:localDate(now),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',utcOffsetMinutes:0-now.getTimezoneOffset(),items,quantityTotal,totalYen,receivedYen,changeYen:receivedYen-totalYen,cumulativeAtCommitYen:integer(salesTotal(prior)+totalYen,0,Number.MAX_SAFE_INTEGER),correctionOfId};
}
export function addSale(state,draft,now = new Date()) {
  if (state.receipts.some(r=>r.id===draft.id)) return state;
  if (state.receipts.length>=50_000) throw new Error('履歴が上限に達しました。バックアップを保存してください。');
  const receipt=makeReceipt(state,draft,now);
  if (receipt.correctionOfId) state.voids.push({id:`void-${receipt.correctionOfId}`,receiptId:receipt.correctionOfId,voidedAt:receipt.committedAt,reason:'訂正による差替',replacementReceiptId:receipt.id});
  state.receipts.push(receipt); state.nextReceiptNo++; return state;
}
export function voidSale(state,id,reason,now = new Date()) {
  if (state.voids.some(v=>v.receiptId===id)) return state;
  if (!state.receipts.some(r=>r.id===id)) throw new Error('会計が見つかりません。');
  text(reason,200); state.voids.push({id:`void-${id}`,receiptId:id,voidedAt:now.toISOString(),reason,replacementReceiptId:null}); return state;
}
export function validateState(state) {
  if (!state || state.schemaVersion!==1 || !Array.isArray(state.receipts) || !Array.isArray(state.voids) || state.receipts.length>50_000) throw new Error('このバックアップ形式は読み込めません。');
  integer(state.revision,0,Number.MAX_SAFE_INTEGER); integer(state.nextReceiptNo,1,Number.MAX_SAFE_INTEGER-1);
  validateSettings(state.settings,!state.settings.initialized);
  unique(state.receipts,'id'); unique(state.receipts,'receiptNo'); unique(state.voids,'receiptId'); unique(state.voids,'id');
  let maxNo=0;
  for (const r of state.receipts) {
    text(r.id); integer(r.receiptNo,1,Number.MAX_SAFE_INTEGER-1); maxNo=Math.max(maxNo,r.receiptNo);
    if (!Number.isFinite(Date.parse(r.committedAt)) || !/^\d{4}-\d{2}-\d{2}$/.test(r.businessDate)) throw new Error('会計日時が不正です。');
    if (!r.items.length) throw new Error('空の会計が含まれています。');
    for (const item of r.items) validateItem(item);
    const t=totals(r.items);
    integer(r.receivedYen); integer(r.changeYen); integer(r.cumulativeAtCommitYen,0,Number.MAX_SAFE_INTEGER);
    if (t.totalYen!==r.totalYen || t.quantityTotal!==r.quantityTotal || r.receivedYen-r.totalYen!==r.changeYen) throw new Error('会計金額が一致しません。');
  }
  if (state.nextReceiptNo<=maxNo) throw new Error('採番情報が不正です。');
  for (const v of state.voids) {
    text(v.id);text(v.reason,200);
    if (!state.receipts.some(r=>r.id===v.receiptId) || !Number.isFinite(Date.parse(v.voidedAt))) throw new Error('取消情報が不正です。');
    if (v.replacementReceiptId && !state.receipts.some(r=>r.id===v.replacementReceiptId && r.correctionOfId===v.receiptId)) throw new Error('訂正の関連情報が不正です。');
  }
  for(const r of state.receipts) if(r.correctionOfId && !state.voids.some(v=>v.receiptId===r.correctionOfId && v.replacementReceiptId===r.id)) throw new Error('訂正元が不正です。');
  salesTotal(activeReceipts(state)); return state;
}
export function parseBackup(raw) {
  if (raw.length>20_000_000) throw new Error('バックアップは20MB以内にしてください。');
  const data=JSON.parse(raw);
  if (data.format!=='book-flea-register' || data.version!==1) throw new Error('対応するバックアップではありません。');
  return validateState(migrateMarkers(data.state));
}
export function backupJSON(state) {return JSON.stringify({format:'book-flea-register',version:1,exportedAt:new Date().toISOString(),state},null,2);}
function csvCell(value) {
  let s=String(value??''); if (/^[\s]*[=+\-@]/.test(s)) s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
export function exportCSV(state) {
  const rows=[['会計ID','会計番号','日時','営業日','状態','取消日時','訂正元ID','単価','数量','色','分類','明細金額','会計合計（繰返し・合算不可）','お預かり','お釣り','確定時累計']];
  for(const r of state.receipts) {
    const v=state.voids.find(x=>x.receiptId===r.id);
    for(const i of r.items) rows.push([r.id,r.receiptNo,r.committedAt,r.businessDate,v?'取消済み':'有効',v?.voidedAt,r.correctionOfId,i.unitPriceYen,i.quantity,i.colorLabel,i.genreLabel,i.lineTotalYen,r.totalYen,r.receivedYen,r.changeYen,r.cumulativeAtCommitYen]);
  }
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
