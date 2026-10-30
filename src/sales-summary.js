import {activeReceipts,integer,localDate} from './calculation.js';
const palette=['#cf5361','#d7ac32','#398c71','#538ebd','#9463af','#d07b3d','#697782'];
// 白い値札はグラフ内だけ色を分ける。値札の設定・履歴は変えない。
const whiteMarkColors={white:'#8196a8',so:'#9b70b8',cd:'#d68b45'};
function chartColor(item,index){return whiteMarkColors[item.colorId]||(/^#[0-9a-f]{6}$/i.test(item.colorHex)&&item.colorHex.toLowerCase()!=='#ffffff'?item.colorHex:palette[index%palette.length]);}
// 履歴の確定時ラベルで分類する。現在の設定を引かず、取消は除く。
export function salesSummary(state,date=localDate()){
  const categories=new Map(),hours=new Map();let totalYen=0;
  for(const receipt of activeReceipts(state).filter(r=>r.businessDate===date)){
    const hour=new Date(receipt.committedAt).getHours();
    const period=hours.get(hour)||{hour,amountYen:0,quantity:0,receipts:0};
    period.amountYen=integer(period.amountYen+receipt.totalYen,0,Number.MAX_SAFE_INTEGER);period.quantity+=receipt.quantityTotal;period.receipts++;hours.set(hour,period);
    for(const item of receipt.items){
      const name=item.genreLabel?.trim()||'未分類';
      const group=categories.get(name)||{name,amountYen:0,quantity:0,color:chartColor(item,categories.size)};
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

// 実測したラベルの四隅がドーナツの同じ区画に収まる時だけ内側に置く。
export function pieLabels(groups,measurements,size){
  const total=groups.reduce((sum,g)=>sum+g.amountYen,0),placed=[];
  let start=0;
  return groups.map((group,index)=>{
    const sweep=total?group.amountYen/total*Math.PI*2:0,end=start+sweep;
    const angle=start+sweep/2,{width,height}=measurements[index];
    let position=null;
    if(size>0&&sweep>0){
      for(const radius of [.35,.38,.32]){
        const x=size/2+Math.sin(angle)*size*radius,y=size/2-Math.cos(angle)*size*radius;
        const box={left:x-width/2-3,right:x+width/2+3,top:y-height/2-3,bottom:y+height/2+3};
        const corners=[[box.left,box.top],[box.right,box.top],[box.left,box.bottom],[box.right,box.bottom]];
        const fits=corners.every(([cx,cy])=>{
          const dx=cx-size/2,dy=cy-size/2,distance=Math.hypot(dx,dy);
          const theta=(Math.atan2(dx,-dy)+Math.PI*2)%(Math.PI*2);
          return distance>=size*.2+4&&distance<=size*.5-4&&(sweep>=Math.PI*2-1e-9||theta>=start+.025&&theta<=end-.025);
        });
        // ラベルの辺が中央の穴を横切る場合も除外する。
        const closestX=Math.max(box.left,Math.min(size/2,box.right));
        const closestY=Math.max(box.top,Math.min(size/2,box.bottom));
        const clearCenter=Math.hypot(closestX-size/2,closestY-size/2)>=size*.2+4;
        const overlaps=placed.some(b=>box.left<b.right&&box.right>b.left&&box.top<b.bottom&&box.bottom>b.top);
        if(fits&&clearCenter&&!overlaps){position={x,y};placed.push(box);break;}
      }
    }
    start=end;
    return {...position,inside:Boolean(position),percent:total?(group.amountYen/total*100).toFixed(1):'0.0'};
  });
}
