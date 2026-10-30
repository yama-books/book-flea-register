// 画面に入ったときだけ一度回す。画面外のグラフでアニメーションを使い切らない。
export function animatePie(element,{Observer=globalThis.IntersectionObserver,reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches}={}){
  if(reduced)return ()=>{};
  if(!Observer){element.classList.add('pie-spinning');return ()=>{};}
  const observer=new Observer(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){
      element.classList.add('pie-spinning');observer.disconnect();
    }
  },{threshold:.25});
  observer.observe(element);return ()=>observer.disconnect();
}
