import test from 'node:test';
import assert from 'node:assert/strict';
import {customerBill} from '../src/customer-bill.js';
function fixture(){
  let time=0,id=0,display;const timers=new Map();
  const view=customerBill(bill=>display=bill,{now:()=>time,schedule:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
  return {view,get display(){return display;},get pending(){return timers.size;},advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}
const done={amountYen:600,receivedYen:1000,changeYen:400,done:true};
test('完了表示は再送で延長せず10秒で待機へ戻り、古い完了再送でも復活しない',()=>{
  const f=fixture();f.view.update(done);
  for(let i=1;i<10;i++){f.advance(1000);f.view.update({...done,sequence:i});assert.equal(f.display.done,true);}
  f.advance(999);assert.equal(f.display.amountYen,600);f.advance(1);
  assert.deepEqual(f.display,{amountYen:0,receivedYen:null,changeYen:null,done:false});
  f.view.update({...done,sequence:11});assert.equal(f.display.amountYen,0);assert.equal(f.pending,0);
});
test('次会計を古いタイマーで消さず、同額の次会計にも新しい10秒を与える',()=>{
  const f=fixture();f.view.update(done);f.advance(5000);
  f.view.update({amountYen:200,receivedYen:null,changeYen:null,done:false});f.advance(6000);assert.equal(f.display.amountYen,200);
  f.view.update(done);f.advance(9999);assert.equal(f.display.done,true);f.advance(1);assert.equal(f.display.done,false);
});
test('通信停止中はタイマーを止め、復帰時は経過済みの金額を表示しない',()=>{
  const f=fixture();f.view.update(done);f.view.stop();assert.equal(f.pending,0);
  f.advance(15000);f.view.update(done);assert.equal(f.display.amountYen,0);
});
