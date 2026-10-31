import {openStore,readState,changeState,saveSale,restoreState,savePrediction} from '../src/storage.js';
import {copy,voidSale,activeReceipts,parseBackup,backupJSON,addSale,initialState,finalizeDay,closedDay,localDate} from '../src/calculation.js';
import {addPrediction} from '../src/sales-forecast.js';
import {openPractice} from '../src/practice.js';
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const row={priceId:'p100',unitPriceYen:100,quantity:2,colorId:'red',colorLabel:'赤',colorHex:'#e85c63',genreId:null,genreLabel:'未分類',lineTotalYen:200};
const sale=id=>({id,items:[copy(row)],receivedYen:1000});
document.querySelector('#run').onclick=async()=>{
  const button=document.querySelector('#run');button.disabled=true;document.querySelector('#results').replaceChildren();let failures=0,checks=0,db,practiceDb;
  const name='book-flea-register-test-'+Date.now();
  async function check(title,run){checks++;const li=document.createElement('li');try{await run();li.textContent='PASS '+title;li.className='pass';}catch(e){failures++;li.textContent='FAIL '+title+': '+e.message;li.className='fail';}document.querySelector('#results').append(li);}
  try{
    db=await openStore(name);
    await check('初回設定を保存し、再接続して読戻し',async()=>{let s=await readState(db);assert(s.settings.initialized,'初期状態');s=await changeState(db,s.revision,s=>{s.settings.initialized=true;s.settings.colors.forEach(c=>c.priceId='p100');return s;});db.close();db=await openStore(name);assert((await readState(db)).settings.initialized,'再接続');});
    await check('保存完了後の読戻し、同一会計IDの重複排除',async()=>{let s=await readState(db);s=await saveSale(db,s.revision,sale('first'));s=await saveSale(db,0,sale('first'));assert(s.receipts.length===1,'重複');assert(s.nextReceiptNo===2,'採番');assert(s.receipts[0].changeYen===800,'釣り');});
    await check('同じrevisionからの同時更新は片方だけ成功',async()=>{const s=await readState(db);const results=await Promise.allSettled([saveSale(db,s.revision,sale('tab-a')),saveSale(db,s.revision,sale('tab-b'))]);assert(results.filter(r=>r.status==='fulfilled').length===1,'競合');assert((await readState(db)).receipts.length===2,'2会計');});
    await check('トランザクション途中失敗は取消も差替も残さない',async()=>{const before=await readState(db);try{await changeState(db,before.revision,s=>{voidSale(s,'first','失敗試験');throw new Error('simulated failure');});}catch{}assert(JSON.stringify(await readState(db))===JSON.stringify(before),'ロールバック');});
    await check('訂正は元の取消と新会計を一緒に保存',async()=>{const s=await readState(db);const d={...sale('replacement'),correctionOfId:'first',receivedYen:200};const next=await saveSale(db,s.revision,d);assert(next.voids.find(v=>v.receiptId==='first')?.replacementReceiptId==='replacement','関連');assert(!activeReceipts(next).some(r=>r.id==='first'),'元は取消');});
    await check('不正バックアップの拒否と正常バックアップの復元',async()=>{const s=await readState(db);const bad=copy(s);bad.receipts[0].totalYen=1;let rejected=false;try{await restoreState(db,s.revision,bad);}catch{rejected=true;}assert(rejected,'不正拒否');assert(JSON.stringify(await readState(db))===JSON.stringify(s),'既存維持');const data=parseBackup(backupJSON(s));const next=await restoreState(db,s.revision,data);assert(next.revision===s.revision+1,'revision更新');assert(next.receipts.length===s.receipts.length,'復元件数');});
    await check('旧ピンク設定をDBから移行し履歴を保ったまま新設定を保存',async()=>{const old=await readState(db);delete old.settings.markerVersion;old.settings.colors=old.settings.colors.filter(c=>c.id!=='cd').map(c=>c.id==='so'?{...c,id:'pink',label:'ピンク',hex:'#ec96bf'}:c);addSale(old,{id:'legacy-pink',items:[{...copy(row),colorId:'pink',colorLabel:'ピンク',colorHex:'#ec96bf'}],receivedYen:200});await new Promise((resolve,reject)=>{const tx=db.transaction('register','readwrite');tx.objectStore('register').put(old,'state');tx.oncomplete=resolve;tx.onabort=reject;});const migrated=await readState(db);assert(migrated.settings.initialized,'100円で利用可');assert(migrated.revision===old.revision+1,'移行のrevision更新');const persisted=await new Promise((resolve,reject)=>{const tx=db.transaction('register','readonly');const req=tx.objectStore('register').get('state');req.onsuccess=()=>resolve(req.result);req.onerror=reject;});assert(persisted.settings.markerVersion===3,'移行を永続化');assert((await readState(db)).revision===migrated.revision,'移行は繰返さない');assert(migrated.settings.colors.every(c=>c.priceId==='p100'),'全マーク100円');assert(migrated.settings.colors.some(c=>c.id==='so'),'そ');const saved=await changeState(db,migrated.revision,s=>{s.settings.colors.find(c=>c.id==='so').priceId='p100';s.settings.colors.find(c=>c.id==='red').priceId='p400';s.settings.initialized=true;return s;});assert(saved.receipts.find(r=>r.id==='legacy-pink').items[0].colorId==='pink','旧履歴');assert(saved.settings.colors.every(c=>c.id!=='pink'),'新設定');assert((await readState(db)).settings.colors.find(c=>c.id==='red').priceId==='p400','変更設定の維持');});
    await check('練習の保存・取消・再読込は本番履歴と採番に影響せず、設定だけ同期',async()=>{
      const live=await readState(db),before=JSON.stringify(live);
      let practice=await openPractice(live.settings,name+'-practice');practiceDb=practice.db;
      assert(practice.state.receipts.length===0,'本番履歴を複写しない');
      const saved=await saveSale(practiceDb,practice.state.revision,sale('demo-only'));
      const cancelled=await changeState(practiceDb,saved.revision,s=>voidSale(s,'demo-only','練習の取消'));
      await changeState(practiceDb,cancelled.revision,s=>finalizeDay(s));
      practiceDb.close();const settings=copy(live.settings);settings.colors[0].priceId='p200';
      practice=await openPractice(settings,name+'-practice');practiceDb=practice.db;
      assert(practice.state.settings.colors[0].priceId==='p200','現在の本番設定を反映');
      assert(practice.state.receipts.length===1&&practice.state.voids.length===cancelled.voids.length,'練習履歴を維持');
      assert(practice.state.nextReceiptNo===2,'練習の採番');assert(Boolean(closedDay(practice.state)),'練習の確定も永続化');
      assert(JSON.stringify(await readState(db))===before,'本番の設定・履歴・採番は不変');
    });
    await check('前日の会計と予測を保持し、予測の再試行は重複せず古い復元を拒否',async()=>{
      const before=await readState(db),prior=new Date();prior.setDate(prior.getDate()-1);
      const forecastNow=new Date(2026,9,31,11),input={id:'prediction-one',businessDate:'2026-10-31',staff:'テスト担当',amountYen:5000};
      let saved=await changeState(db,before.revision,s=>{addSale(s,sale('prior-day'),prior);return addPrediction(s,input,forecastNow);});
      assert(saved.receipts.find(r=>r.id==='prior-day').businessDate===localDate(prior),'前日の記録');
      assert(saved.predictions[0].staff==='テスト担当'&&saved.predictions[0].createdAt===forecastNow.toISOString(),'名前と時刻');
      const once=JSON.stringify(saved);saved=await savePrediction(db,0,input);assert(JSON.stringify(saved)===once,'ID再試行は重複しない');
      let rejected=false;try{await restoreState(db,saved.revision,before);}catch{rejected=true;}assert(rejected,'前日と予測を消す復元を拒否');
      db.close();db=await openStore(name);const loaded=await readState(db);assert(loaded.predictions.length===1,'予測は再接続後も保持');assert(loaded.receipts.some(r=>r.id==='prior-day'),'前日も保持');
    });
    await check('旧DBを記録を保って更新し、旧版からの再接続を拒否',async()=>{
      const legacyName=name+'-legacy',initial=initialState();delete initial.closedDays;delete initial.predictions;addSale(initial,sale('legacy-version'));
      let upgraded,legacy;
      try{
        legacy=await new Promise((resolve,reject)=>{const request=indexedDB.open(legacyName,1);request.onupgradeneeded=()=>request.result.createObjectStore('register');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
        await new Promise((resolve,reject)=>{const tx=legacy.transaction('register','readwrite');tx.objectStore('register').put(initial,'state');tx.oncomplete=resolve;tx.onabort=reject;});
        legacy.onversionchange=()=>legacy.close();upgraded=await openStore(legacyName);
        assert(upgraded.version===2,'DB更新');assert(JSON.stringify(await readState(upgraded))===JSON.stringify(initial),'全記録保持');
        const rejected=await new Promise(resolve=>{const request=indexedDB.open(legacyName,1);request.onerror=()=>resolve(request.error.name==='VersionError');request.onsuccess=()=>{request.result.close();resolve(false);};});assert(rejected,'旧版の書込入口を止める');
      }finally{legacy?.close();upgraded?.close();indexedDB.deleteDatabase(legacyName);}
    });
    await check('確定と追加の競合を排他制御し、再接続後も追加・取消・古い復元を拒否',async()=>{
      const before=await readState(db),date=localDate();
      const race=await Promise.allSettled([changeState(db,before.revision,s=>finalizeDay(s,date)),saveSale(db,before.revision,sale('close-race'))]);
      assert(race.filter(r=>r.status==='fulfilled').length===1,'同じrevisionの操作は片方だけ');
      let closed=await readState(db);if(!closedDay(closed,date))closed=await changeState(db,closed.revision,s=>finalizeDay(s,date));
      db.close();db=await openStore(name);closed=await readState(db);assert(Boolean(closedDay(closed,date)),'確定を永続化');const snapshot=JSON.stringify(closed);
      for(const action of [()=>saveSale(db,closed.revision,sale('after-close')),()=>changeState(db,closed.revision,s=>voidSale(s,'replacement','取消')),()=>restoreState(db,closed.revision,before),()=>changeState(db,closed.revision,s=>{s.receipts.find(r=>r.businessDate===date).items[0].genreLabel='書換';return s;})]){
        let rejected=false;try{await action();}catch{rejected=true;}assert(rejected,'確定後変更拒否');assert(JSON.stringify(await readState(db))===snapshot,'失敗後の記録不変');
      }
      const restored=await restoreState(db,closed.revision,parseBackup(backupJSON(closed)));assert(Boolean(closedDay(restored,date)),'同じ確定記録を含む復元は可能');
    });
    await check('閉じたDBへの保存失敗を成功と扱わない',async()=>{const s=await readState(db);db.close();let rejected=false;try{await saveSale(db,s.revision,sale('closed-db'));}catch{rejected=true;}assert(rejected,'失敗通知');db=await openStore(name);assert(!(await readState(db)).receipts.some(r=>r.id==='closed-db'),'未保存');});
  }catch(e){failures++;document.querySelector('#status').textContent=e.message;}
  finally{db?.close();practiceDb?.close();indexedDB.deleteDatabase(name);indexedDB.deleteDatabase(name+'-practice');document.querySelector('#status').textContent=failures?`FAIL: ${failures}件`:`PASS: 保存テスト${checks}件すべて成功`;button.disabled=false;}
};
