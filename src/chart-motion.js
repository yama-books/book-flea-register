// 各要素が25%以上見えた時に一度だけ再生。差替時は待機中の監視も解除する。
export function animateCharts(elements,{Observer=globalThis.IntersectionObserver,reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,className='chart-entered'}={}){
  const pending=new Set(elements);
  if(reduced||!pending.size)return ()=>{};
  if(!Observer){pending.forEach(element=>element.classList.add(className));return ()=>{};}
  let stopped=false;
  const observer=new Observer(entries=>{
    if(stopped)return;
    for(const entry of entries){
      if(entry.isIntersecting&&entry.intersectionRatio>=.25&&pending.delete(entry.target)){
        entry.target.classList.add(className);observer.unobserve(entry.target);
      }
    }
    if(!pending.size){stopped=true;observer.disconnect();}
  },{threshold:.25});
  pending.forEach(element=>observer.observe(element));
  return ()=>{stopped=true;pending.clear();observer.disconnect();};
}
export function animatePie(element,options={}){
  return animateCharts([element],{...options,className:'pie-spinning'});
}
