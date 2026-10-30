import test from 'node:test';
import assert from 'node:assert/strict';
import {keepScreenAwake,revealOnTaps} from '../src/display-support.js';
function fakeDoc(){const handlers={};return {visibilityState:'visible',handlers,addEventListener(type,fn){(handlers[type]??=[]).push(fn);},fire(type){for(const fn of handlers[type]??[])fn();}};}
function fakeLock(){const listeners=[];return {released:0,listeners,addEventListener(type,fn){if(type==='release')listeners.push(fn);},release(){this.released++;for(const fn of listeners)fn();}};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('自動消灯を止め、解除後は画面復帰・タップ・定期確認で取り直す',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const doc=fakeDoc(),locks=[],states=[];
  const wakeLock={request:async type=>{assert.equal(type,'screen');const lock=fakeLock();locks.push(lock);return lock;}};
  const awake=keepScreenAwake(s=>states.push(s),{wakeLock,doc,retryMs:30000});
  await flush();assert.equal(locks.length,1);assert.equal(awake.active,true);
  locks[0].release();assert.equal(awake.active,false);
  doc.visibilityState='hidden';doc.fire('visibilitychange');await flush();assert.equal(locks.length,1,'非表示中は取得しない');
  doc.visibilityState='visible';doc.fire('visibilitychange');await flush();assert.equal(locks.length,2);
  locks[1].release();doc.fire('pointerdown');await flush();assert.equal(locks.length,3);
  locks[2].release();t.mock.timers.tick(30000);await flush();assert.equal(locks.length,4);
  doc.fire('pointerdown');await flush();assert.equal(locks.length,4,'取得済みなら重複して取らない');
  assert.deepEqual(states.slice(0,3),['on','off','on']);
  awake.stop();assert.equal(locks[3].released,1);
});
test('自動消灯の防止に非対応・失敗のときは自動ロック設定を案内する状態を返す',async()=>{
  const states=[];keepScreenAwake(s=>states.push(s),{wakeLock:undefined,doc:fakeDoc()}).stop();assert.deepEqual(states,['unsupported']);
  const failed=[];const awake=keepScreenAwake(s=>failed.push(s),{wakeLock:{request:async()=>{throw new Error('NotAllowed');}},doc:fakeDoc()});await flush();awake.stop();assert.deepEqual(failed,['failed']);
});
test('接続状況は3秒以内の5回タップでだけ表示・非表示を切り替える',()=>{
  let clock=0,click;const target={addEventListener:(type,fn)=>{assert.equal(type,'click');click=fn;}},box={hidden:true,open:false};
  revealOnTaps(target,box,{now:()=>clock});
  for(let i=0;i<4;i++){click();clock+=500;}assert.equal(box.hidden,true);
  clock+=3000;click();assert.equal(box.hidden,true,'間が空いたタップは数えない');
  for(let i=0;i<4;i++){clock+=400;click();}assert.equal(box.hidden,false);assert.equal(box.open,true);
  for(let i=0;i<5;i++){clock+=100;click();}assert.equal(box.hidden,true);
});
