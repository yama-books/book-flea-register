import test from 'node:test';
import assert from 'node:assert/strict';
import {salesSummary,pieGradient,pieLabels,previousBusinessDate} from '../src/sales-summary.js';
const receipt=(id,hour,items,date='2026-10-30')=>({id,businessDate:date,committedAt:new Date(2026,9,30,hour,15).toISOString(),items,totalYen:items.reduce((s,i)=>s+i.lineTotalYen,0),quantityTotal:items.reduce((s,i)=>s+i.quantity,0)});
const item=(genreLabel,amount=100,quantity=1,colorHex='#e85c63')=>({genreLabel,lineTotalYen:amount,quantity,colorHex});

test('前日は現地の暦日で求め、月初・年初・うるう年と日付境界を扱う',()=>{
  for(const [date,expected] of [['2026-11-01T00:00:00','2026-10-31'],['2026-11-01T23:59:59','2026-10-31'],['2027-01-01T09:00:00','2026-12-31'],['2024-03-01T09:00:00','2024-02-29'],['2026-03-01T09:00:00','2026-02-28']]){
    const now=new Date(date),before=now.getTime();assert.equal(previousBusinessDate(now),expected);assert.equal(now.getTime(),before);
  }
});
test('白い値札の漫画・その他・CDはグラフだけ別の色にする',()=>{
  const items=[['white','漫画'],['so','その他'],['cd','CD']].map(([colorId,name])=>({...item(name,100,1,'#ffffff'),colorId}));
  const state={receipts:[receipt('colors',9,items)],voids:[]},before=JSON.stringify(state);
  const groups=salesSummary(state,'2026-10-30').categories;
  assert.equal(new Set(groups.map(g=>g.color)).size,3);assert.ok(groups.every(g=>g.color!=='#ffffff'));
  assert.equal(groups.find(g=>g.name==='その他').color,'#9b70b8');assert.equal(groups.find(g=>g.name==='CD').color,'#d68b45');
  assert.equal(JSON.stringify(state),before);
});
test('分類は保存済みラベルでまとめ、同分類の別色を合算し取消と別日を除く',()=>{
  const state={settings:{colors:[{category:'変更後'}]},receipts:[receipt('a',9,[item('文庫'),item('文庫',200,2,'#559bd5')]),receipt('b',11,[item('漫画',400,1,'#ffffff'),item('',100)]),receipt('void',10,[item('取消',999)]),receipt('old',9,[item('別日',500)],'2026-10-29')],voids:[{receiptId:'void'}]};
  const result=salesSummary(state,'2026-10-30');assert.equal(result.totalYen,800);
  assert.deepEqual(result.categories.map(g=>[g.name,g.amountYen,g.quantity]),[['漫画',400,1],['文庫',300,3],['未分類',100,1]]);
  assert.deepEqual(result.hours.map(h=>[h.hour,h.amountYen,h.quantity,h.receipts]),[[9,300,3,1],[10,0,0,0],[11,500,2,1]]);
  assert.equal(result.categories.reduce((sum,g)=>sum+g.amountYen,0),result.hours.reduce((sum,h)=>sum+h.amountYen,0));
});
test('空の記録・全件取消は空表示、23時台も24時までの1枠で扱う',()=>{
  assert.deepEqual(salesSummary({receipts:[],voids:[]},'2026-10-30'),{categories:[],hours:[],totalYen:0});
  const state={receipts:[receipt('late',23,[item('CD',100)])],voids:[]};
  assert.equal(salesSummary(state,'2026-10-30').hours[0].hour,23);state.voids.push({receiptId:'late'});assert.equal(salesSummary(state,'2026-10-30').totalYen,0);
});
test('円グラフの区間は売上比率で計算し、末尾を100%にそろえる',()=>{
  assert.equal(pieGradient([{amountYen:300,color:'#ffffff'},{amountYen:100,color:'#559bd5'}]),'conic-gradient(#ffffff 0% 75%,#559bd5 75% 100%)');
  assert.equal(pieGradient([]),'#e7e9e5');
});
test('ラベルは各区画に収まり、幅が狭くなると欄外へ移す',()=>{
  const groups=Array.from({length:6},()=>({amountYen:100}));
  const measured=groups.map(()=>({width:42,height:38}));
  const wide=pieLabels(groups,measured,300),narrow=pieLabels(groups,measured,180);
  assert.ok(wide.every(p=>p.inside&&p.percent==='16.7'));
  assert.ok(narrow.every(p=>!p.inside));
  wide.forEach((p,index)=>{
    for(const [dx,dy] of [[-21,-19],[21,-19],[-21,19],[21,19]]){
      const x=p.x+dx-150,y=p.y+dy-150,angle=(Math.atan2(x,-y)+2*Math.PI)%(2*Math.PI);
      assert.ok(Math.hypot(x,y)>60&&Math.hypot(x,y)<150);
      assert.ok(angle>=index*Math.PI/3&&angle<=(index+1)*Math.PI/3);
    }
  });
});
test('小区画・長い項目名は省略せず欄外とし、空や単一分類も扱う',()=>{
  const labels=pieLabels([{amountYen:9900},{amountYen:100}],[{width:42,height:38},{width:30,height:38}],300);
  assert.equal(labels[1].inside,false);assert.equal(labels[1].percent,'1.0');
  assert.equal(pieLabels([{amountYen:100}],[{width:300,height:38}],300)[0].inside,false);
  assert.equal(pieLabels([{amountYen:100}],[{width:42,height:38}],300)[0].inside,true);
  assert.deepEqual(pieLabels([],[],300),[]);
  assert.equal(pieLabels([{amountYen:0}],[{width:42,height:38}],300)[0].inside,false);
});


test('2日間の品目と同じ時間帯を合算し、訂正は元の販売時刻に置く',()=>{
 const first=receipt('first',9,[item('文庫',300)],'2026-10-31');
 const second={...receipt('second',10,[item('漫画',400)],'2026-11-01'),committedAt:new Date(2026,10,1,10,15).toISOString()};
 const amendment={...receipt('fixed',23,[item('文庫',100)],'2026-10-31'),saleOccurredAt:first.committedAt,correctionOfId:'first'};
 const s={receipts:[first,second,amendment],voids:[{receiptId:'first'}]},summary=salesSummary(s,['2026-10-31','2026-11-01']);
 assert.equal(summary.totalYen,500);assert.deepEqual(summary.hours.map(h=>[h.hour,h.amountYen]),[[9,100],[10,400]]);
});


test('通算の時間帯別は日別金額を同じ枠に保持し、売上のない日と時間帯を0にする',()=>{
 const a=receipt('a',9,[item('文庫',300)],'2026-10-31'),b=receipt('b',11,[item('漫画',600)],'2026-11-01');
 const summary=salesSummary({receipts:[a,b],voids:[]},['2026-10-31','2026-11-01']);
 assert.deepEqual(summary.hours.map(h=>h.days.map(d=>d.amountYen)),[[300,0],[0,0],[0,600]]);
 for(const h of summary.hours){assert.equal(h.days.reduce((n,d)=>n+d.amountYen,0),h.amountYen);assert.equal(h.days.reduce((n,d)=>n+d.quantity,0),h.quantity);}
});
