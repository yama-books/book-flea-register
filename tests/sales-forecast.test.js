import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,copy,addSale,voidSale,localDate,finalizeDay,backupJSON,parseBackup,validateState,assertRecordedDataPreserved} from '../src/calculation.js';
import {salesForecast,addPrediction,previousPredictions} from '../src/sales-forecast.js';

const at=(day,hour=10,minute=30)=>new Date(2026,day==='31'?9:10,Number(day),hour,minute);
const item={priceId:'p100',unitPriceYen:100,quantity:9,colorId:'red',colorLabel:'赤',colorHex:'#e85c63',genreId:null,genreLabel:'文庫',lineTotalYen:900};
const sale=(s,id,now,quantity=9)=>addSale(s,{id,items:[{...item,quantity,lineTotalYen:100*quantity}],receivedYen:100*quantity},now);
const prediction=(id,now,amountYen=5000)=>({id,staff:'担当者A',businessDate:localDate(now),amountYen});

test('1日目の90分900円は本日4500円・2日間9000円、取消や別日を除外する',()=>{
  const s=initialState(),now=at('31');sale(s,'today',now);sale(s,'void',now);voidSale(s,'void','取消',now);sale(s,'older',new Date(2026,9,30,10));
  const before=copy(s),forecast=salesForecast(s,now);
  assert.equal(forecast.todayEstimateYen,4500);assert.equal(forecast.eventEstimateYen,9000);assert.equal(forecast.elapsedMinutes,90);assert.equal(forecast.durationMinutes,450);
  assert.deepEqual(s,before);
});
test('2日目は前日の実績を足し、前日記録がなければ2日間を未算出にする',()=>{
  const s=initialState();sale(s,'day-one',at('31',16,30),45);sale(s,'day-two',at('01'));
  const forecast=salesForecast(s,at('01'));assert.equal(forecast.todayEstimateYen,4500);assert.equal(forecast.eventEstimateYen,9000);
  const missing=initialState();sale(missing,'day-two',at('01'));const result=salesForecast(missing,at('01'));
  assert.equal(result.todayEstimateYen,4500);assert.equal(result.eventEstimateYen,null);assert.equal(result.status,'missing-previous');
  finalizeDay(missing,localDate(at('31')),at('31',16,30));assert.equal(salesForecast(missing,at('01')).eventEstimateYen,4500);
});
test('営業前・開始直後・記録なしは予測しない。終了後と確定後は当日実績を使う',()=>{
  const s=initialState();assert.equal(salesForecast(s,at('31',8)).status,'before-opening');assert.equal(salesForecast(s,at('31',9,0)).status,'starting');
  assert.equal(salesForecast(s,at('31',10)).status,'no-sales');assert.equal(salesForecast(s,new Date(2026,10,2,10)).status,'outside');
  sale(s,'sale',at('31'));assert.equal(salesForecast(s,at('31',17)).todayEstimateYen,900);assert.equal(salesForecast(s,at('31',17)).eventEstimateYen,1800);
  finalizeDay(s,localDate(at('31')),at('31',12,0));const forecast=salesForecast(s,at('31',13));
  assert.equal(forecast.todayEstimateYen,900);assert.equal(forecast.eventEstimateYen,3150);
});
test('名前・金額・対象日・入力時刻を追記し、保存前と不明IDには前の予測を返さない',()=>{
  const s=initialState(),dayOne=at('31'),dayTwo=at('01');
  assert.deepEqual(previousPredictions(s,null),[]);addPrediction(s,prediction('a',dayOne),dayOne);
  assert.deepEqual(previousPredictions(s,null),[]);assert.deepEqual(previousPredictions(s,'missing'),[]);assert.deepEqual(previousPredictions(s,'a'),[]);
  addPrediction(s,{...prediction('b',dayTwo,6000),staff:' 担当者B '},dayTwo);
  assert.deepEqual(s.predictions[1],{id:'b',staff:'担当者B',amountYen:6000,businessDate:'2026-11-01',createdAt:dayTwo.toISOString()});
  assert.deepEqual(previousPredictions(s,'b').map(record=>record.id),['a']);
  const before=copy(s);addPrediction(s,prediction('b',dayTwo,1),dayTwo);assert.deepEqual(s,before);
  assert.deepEqual(parseBackup(backupJSON(s)),s);
});
test('不正金額・名前・開催日外・日付をまたいだ予測を拒否し、以前の記録は保持する',()=>{
  const s=initialState(),now=at('31'),input=prediction('test',now);
  for(const amountYen of [-1,1.5,NaN,Infinity,100_000_000])assert.throws(()=>addPrediction(s,{...input,amountYen},now));
  for(const staff of ['', ' ', 'あ'.repeat(81),'改\n行'])assert.throws(()=>addPrediction(s,{...input,staff},now));
  assert.throws(()=>addPrediction(s,prediction('old',new Date(2026,9,30)),new Date(2026,9,30)),/10\/31/);
  assert.throws(()=>addPrediction(s,input,at('01')),/日付が変わりました/);
  assert.deepEqual(s.predictions,[]);addPrediction(s,{...input,amountYen:0},now);validateState(s);
  const bad=copy(s);bad.predictions[0].amountYen=-1;assert.throws(()=>parseBackup(backupJSON(bad)));
});
test('前日の会計・取消・予測は削除も書換えも並べ替えもできず、翌日は追記する',()=>{
  const s=initialState(),first=at('31'),next=at('01');sale(s,'day-one',first);sale(s,'cancelled',first);voidSale(s,'cancelled','取消',first);addPrediction(s,prediction('first',first),first);
  const before=copy(s);sale(s,'day-two',next);addPrediction(s,prediction('second',next),next);assertRecordedDataPreserved(before,s);
  assert.equal(s.receipts[0].businessDate,'2026-10-31');assert.equal(s.predictions[0].businessDate,'2026-10-31');
  for(const mutate of [t=>t.receipts.shift(),t=>t.voids=[],t=>t.predictions=[],t=>t.predictions[0].amountYen++,t=>t.predictions.reverse()]){
    const bad=copy(s);mutate(bad);assert.throws(()=>assertRecordedDataPreserved(s,bad),/保存済み/);
  }
  const changedSettings=copy(s);changedSettings.settings.colors[0].category='絵本';assert.doesNotThrow(()=>assertRecordedDataPreserved(s,changedSettings));
});
