import {activeReceipts,salesTotal,localDate,integer,closedDay} from './calculation.js';

export const EVENT_DAYS=Object.freeze(['2026-10-31','2026-11-01']);
export const OPEN_TIME='09:00';
export const CLOSE_TIME='16:30';
const minute=60_000;
const hours=date=>({open:new Date(`${date}T${OPEN_TIME}:00`),close:new Date(`${date}T${CLOSE_TIME}:00`)});
const safeEstimate=value=>Number.isSafeInteger(Math.round(value))&&value>=0?Math.round(value):null;

// 営業時間内の経過時間で線形外挿する。将来の天候や客足を推定するモデルではない。
export function salesForecast(state,now=new Date()){
  const date=localDate(now),index=EVENT_DAYS.indexOf(date),valid=activeReceipts(state);
  const days=EVENT_DAYS.map(businessDate=>{
    const receipts=valid.filter(r=>r.businessDate===businessDate);
    return {businessDate,actualYen:salesTotal(receipts),recorded:state.receipts.some(r=>r.businessDate===businessDate)||Boolean(closedDay(state,businessDate))};
  });
  if(index<0)return {date,days,todayEstimateYen:null,eventEstimateYen:null,status:'outside'};
  const {open,close}=hours(date),duration=(close-open)/minute,day=days[index],finalized=closedDay(state,date);
  const at=finalized?new Date(finalized.finalizedAt):now;
  const elapsed=Math.max(0,Math.min(duration,(at-open)/minute));
  const ended=Boolean(finalized)||now>=close;
  let status=ended?'ended':now<open?'before-opening':elapsed<1?'starting':!day.recorded?'no-sales':'running';
  const todayEstimateYen=ended?day.actualYen:status==='running'?safeEstimate(day.actualYen/elapsed*duration):null;
  let eventEstimateYen=null;
  const previousKnown=days.slice(0,index).every(d=>d.recorded);
  if(todayEstimateYen!==null&&previousKnown){
    const previous=days.slice(0,index).reduce((sum,d)=>sum+d.actualYen,0);
    const futureMinutes=EVENT_DAYS.slice(index+1).reduce((sum,d)=>{const h=hours(d);return sum+(h.close-h.open)/minute;},0);
    const rate=elapsed>=1?day.actualYen/elapsed:null;
    if(!futureMinutes||rate!==null)eventEstimateYen=safeEstimate(previous+todayEstimateYen+(rate??0)*futureMinutes);
  }
  if(!previousKnown)status='missing-previous';
  return {date,days,todayEstimateYen,eventEstimateYen,status,elapsedMinutes:elapsed,durationMinutes:duration};
}

export function addPrediction(state,input,now=new Date()){
  if(state.predictions?.some(record=>record.id===input.id))return state;
  const date=localDate(now);
  if(input.businessDate!==date)throw new Error('日付が変わりました。予測の画面を開き直してください。');
  if(!EVENT_DAYS.includes(date))throw new Error('予測を入力できるのは10/31と11/1です。');
  if(typeof input.id!=='string'||!input.id||input.id.length>100)throw new Error('予測の記録IDが不正です。');
  const staff=String(input.staff??'').trim();
  if(!staff||staff.length>80||/[\u0000-\u001f]/.test(staff))throw new Error('担当者名を1〜80文字で入力してください。');
  integer(input.amountYen);
  state.predictions??=[];
  if(state.predictions.length>=50_000)throw new Error('予測の記録が上限に達しました。');
  state.predictions.push({id:input.id,staff,amountYen:input.amountYen,businessDate:date,createdAt:now.toISOString()});
  return state;
}

// 保存済みの自分の記録より前の入力だけを返す。保存前は一件も返さない。
export function previousPredictions(state,savedId){
  if(!savedId)return [];
  const records=state.predictions??[],index=records.findIndex(record=>record.id===savedId);
  return index<0?[]:records.slice(0,index).reverse();
}
