import {initialState,copy,validateState,addSale,migrateMarkers,assertClosedDaysPreserved,assertRecordedDataPreserved} from './calculation.js';
import {addPrediction} from './sales-forecast.js';
export function openStore(name = 'book-flea-register-v1') {
  return new Promise((resolve,reject)=>{
    if (!globalThis.indexedDB) return reject(new Error('このブラウザでは保存できません。通常のSafariで開いてください。'));
    const req=indexedDB.open(name,2);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('register'))req.result.createObjectStore('register');};
    req.onerror=()=>reject(new Error('端末の保存領域を開けません。プライベートブラウズを避け、空き容量を確認してください。'));
    req.onblocked=()=>reject(new Error('別のタブを閉じてから再読込してください。'));
    req.onsuccess=()=>{const db=req.result; db.onversionchange=()=>db.close();resolve(db);};
  });
}
export function readState(db) {
  return new Promise((resolve,reject)=>{
    let state,failure;const tx=db.transaction('register','readwrite'),store=tx.objectStore('register');
    store.get('state').onsuccess=e=>{
      try{
        const existing=e.target.result,raw=existing||initialState();state=migrateMarkers(raw);
        if(state!==raw)state.revision=raw.revision+1;
        validateState(state);
        if(!existing||state!==raw)store.put(state,'state');
      }catch(error){failure=error;tx.abort();}
    };
    tx.oncomplete=()=>resolve(state);
    tx.onabort=()=>reject(failure || tx.error || new Error('保存内容を読み込めません。'));
  });
}
export function changeState(db,expectedRevision,mutate,{duplicateId,duplicatePredictionId} = {}) {
  return new Promise((resolve,reject)=>{
    let result, failure;const tx=db.transaction('register','readwrite'),store=tx.objectStore('register');
    store.get('state').onsuccess=e=>{
      try {
        const current=migrateMarkers(e.target.result || initialState());
        if (duplicateId && current.receipts.some(r=>r.id===duplicateId)) {result=current;return;}
        if (duplicatePredictionId && current.predictions?.some(r=>r.id===duplicatePredictionId)) {result=current;return;}
        if (current.revision!==expectedRevision) throw new Error('別のタブで更新されました。会計を残したまま最新データを読み直します。内容を確認して再操作してください。');
        result=mutate(copy(current)); result.revision=current.revision+1; validateState(result);assertClosedDaysPreserved(current,result);assertRecordedDataPreserved(current,result);store.put(result,'state');
      }catch(error){failure=error;tx.abort();}
    };
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(failure || new Error('保存できませんでした。入力は残っています。端末の空き容量を確認して再試行してください。'));
    tx.onerror=()=>{};
  });
}
export function saveSale(db,revision,draft) {return changeState(db,revision,state=>addSale(state,draft),{duplicateId:draft.id});}
export function savePrediction(db,revision,input) {return changeState(db,revision,state=>addPrediction(state,input),{duplicatePredictionId:input.id});}
export function restoreState(db,revision,state) {state=migrateMarkers(state);validateState(state);return changeState(db,revision,()=>copy(state));}
