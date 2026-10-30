import {openStore,readState,changeState,saveSale,restoreState} from '../src/storage.js';
import {copy,voidSale,activeReceipts,parseBackup,backupJSON} from '../src/calculation.js';
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const row={priceId:'p100',unitPriceYen:100,quantity:2,colorId:'red',colorLabel:'赤',colorHex:'#e85c63',genreId:null,genreLabel:'未分類',lineTotalYen:200};
const sale=id=>({id,items:[copy(row)],receivedYen:1000});
document.querySelector('#run').onclick=async()=>{
  const button=document.querySelector('#run');button.disabled=true;document.querySelector('#results').replaceChildren();let failures=0,db;
  const name='book-flea-register-test-'+Date.now();
  async function check(title,run){const li=document.createElement('li');try{await run();li.textContent='PASS '+title;li.className='pass';}catch(e){failures++;li.textContent='FAIL '+title+': '+e.message;li.className='fail';}document.querySelector('#results').append(li);}
  try{
    db=await openStore(name);
    await check('初回設定を保存し、再接続して読戻し',async()=>{let s=await readState(db);assert(!s.settings.initialized,'初期状態');s=await changeState(db,s.revision,s=>{s.settings.initialized=true;s.settings.colors.forEach(c=>c.priceId='p100');return s;});db.close();db=await openStore(name);assert((await readState(db)).settings.initialized,'再接続');});
    await check('保存完了後の読戻し、同一会計IDの重複排除',async()=>{let s=await readState(db);s=await saveSale(db,s.revision,sale('first'));s=await saveSale(db,0,sale('first'));assert(s.receipts.length===1,'重複');assert(s.nextReceiptNo===2,'採番');assert(s.receipts[0].changeYen===800,'釣り');});
    await check('同じrevisionからの同時更新は片方だけ成功',async()=>{const s=await readState(db);const results=await Promise.allSettled([saveSale(db,s.revision,sale('tab-a')),saveSale(db,s.revision,sale('tab-b'))]);assert(results.filter(r=>r.status==='fulfilled').length===1,'競合');assert((await readState(db)).receipts.length===2,'2会計');});
    await check('トランザクション途中失敗は取消も差替も残さない',async()=>{const before=await readState(db);try{await changeState(db,before.revision,s=>{voidSale(s,'first','失敗試験');throw new Error('simulated failure');});}catch{}assert(JSON.stringify(await readState(db))===JSON.stringify(before),'ロールバック');});
    await check('訂正は元の取消と新会計を一緒に保存',async()=>{const s=await readState(db);const d={...sale('replacement'),correctionOfId:'first',receivedYen:200};const next=await saveSale(db,s.revision,d);assert(next.voids.find(v=>v.receiptId==='first')?.replacementReceiptId==='replacement','関連');assert(!activeReceipts(next).some(r=>r.id==='first'),'元は取消');});
    await check('不正バックアップの拒否と正常バックアップの復元',async()=>{const s=await readState(db);const bad=copy(s);bad.receipts[0].totalYen=1;let rejected=false;try{await restoreState(db,s.revision,bad);}catch{rejected=true;}assert(rejected,'不正拒否');assert(JSON.stringify(await readState(db))===JSON.stringify(s),'既存維持');const data=parseBackup(backupJSON(s));const next=await restoreState(db,s.revision,data);assert(next.revision===s.revision+1,'revision更新');assert(next.receipts.length===s.receipts.length,'復元件数');});
    await check('閉じたDBへの保存失敗を成功と扱わない',async()=>{const s=await readState(db);db.close();let rejected=false;try{await saveSale(db,s.revision,sale('closed-db'));}catch{rejected=true;}assert(rejected,'失敗通知');db=await openStore(name);assert(!(await readState(db)).receipts.some(r=>r.id==='closed-db'),'未保存');});
  }catch(e){failures++;document.querySelector('#status').textContent=e.message;}
  finally{db?.close();indexedDB.deleteDatabase(name);document.querySelector('#status').textContent=failures?`FAIL: ${failures}件`:'PASS: 保存テスト7件すべて成功';button.disabled=false;}
};
