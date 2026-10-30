import {activeReceipts,integer,localDate} from './calculation.js';
const palette=['#cf5361','#d7ac32','#398c71','#538ebd','#9463af','#d07b3d','#697782'];
// 履歴の確定時ラベルで分類する。現在の設定を引かず、取消は除く。
export function salesSummary(state,date=localDate()){
  const categories=new Map(),hours=new Map();let totalYen=0;
  for(const receipt of activeReceipts(state).filter(r=>r.businessDate===date)){
    const hour=new Date(receipt.committedAt).getHours();
    const period=hours.get(hour)||{hour,amountYen:0,quantity:0,receipts:0};
    period.amountYen=integer(period.amountYen+receipt.totalYen,0,Number.MAX_SAFE_INTEGER);period.quantity+=receipt.quantityTotal;period.receipts++;hours.set(hour,period);
    for(const item of receipt.items){
      const name=item.genreLabel?.trim()||'未分類';
      const group=categories.get(name)||{name,amountYen:0,quantity:0,color:/^#[0-9a-f]{6}$/i.test(item.colorHex)?item.colorHex:palette[categories.size%palette.length]};
      group.amountYen=integer(group.amountYen+item.lineTotalYen,0,Number.MAX_SAFE_INTEGER);group.quantity+=item.quantity;categories.set(name,group);
    }
    totalYen=integer(totalYen+receipt.totalYen,0,Number.MAX_SAFE_INTEGER);
  }
  const groups=[...categories.values()].sort((a,b)=>b.amountYen-a.amountYen||a.name.localeCompare(b.name,'ja'));
  const periods=[];
  if(hours.size)for(let hour=Math.min(...hours.keys());hour<=Math.max(...hours.keys());hour++)periods.push(hours.get(hour)||{hour,amountYen:0,quantity:0,receipts:0});
  return {categories:groups,hours:periods,totalYen};
}
export function pieGradient(groups){
  const total=groups.reduce((sum,g)=>sum+g.amountYen,0);if(!total)return '#e7e9e5';
  let start=0;return 'conic-gradient('+groups.map((g,i)=>{
    const end=i===groups.length-1?100:start+g.amountYen/total*100;
    const part=`${g.color} ${start}% ${end}%`;start=end;return part;
  }).join(',')+')';
}
