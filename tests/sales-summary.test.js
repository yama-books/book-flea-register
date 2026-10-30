import test from 'node:test';
import assert from 'node:assert/strict';
import {salesSummary,pieGradient} from '../src/sales-summary.js';
const receipt=(id,hour,items,date='2026-10-30')=>({id,businessDate:date,committedAt:new Date(2026,9,30,hour,15).toISOString(),items,totalYen:items.reduce((s,i)=>s+i.lineTotalYen,0),quantityTotal:items.reduce((s,i)=>s+i.quantity,0)});
const item=(genreLabel,amount=100,quantity=1,colorHex='#e85c63')=>({genreLabel,lineTotalYen:amount,quantity,colorHex});
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
