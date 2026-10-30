export async function toggleFullscreen(doc=globalThis.document){
  if(doc.fullscreenElement){await doc.exitFullscreen();return true;}
  if(doc.fullscreenEnabled===false||!doc.documentElement.requestFullscreen)return false;
  await doc.documentElement.requestFullscreen();return true;
}
export function setupFullscreen(){
  const button=document.querySelector('#toggle-fullscreen'),status=document.querySelector('#fullscreen-status');
  button.hidden=!document.documentElement.requestFullscreen||document.fullscreenEnabled===false;
  button.onclick=async()=>{
    status.textContent='';
    try{
      if(await toggleFullscreen())status.textContent='';
      else status.textContent='このSafariでは全画面に切り替えられません。「ホーム画面に追加」して開く方法もあります。';
    }catch{status.textContent='この環境では全画面に切り替えられません。「ホーム画面に追加」して開く方法もあります。';}
  };
  document.addEventListener('fullscreenchange',()=>button.textContent=document.fullscreenElement?'全画面を終了':'全画面');
}
