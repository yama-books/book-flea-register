import {AmountLink} from './amount-link.js';
import {ensureQR,drawQR,qrReader,withCameraPermission} from './qr.js';
export function setupCustomerControls(){
  const $=s=>document.querySelector(s),status=$('#pair-status');let working=false;
  const labels={idle:'未接続',pairing:'接続情報を準備しています…',connecting:'接続しています… 両方の画面を開いたままお待ちください。',waiting:'通信の確認に時間がかかっています。両方のSafariを開いたまま、もう少しお待ちください。',timeout:'1分待ちましたが接続を確認できません。同じWi-Fiでも端末間の通信が制限される場合があります。下の接続状況を確認してください。',reconnecting:'通信が一時的に途切れています。両方のSafariを開いたまま、復帰を待っています。',failed:'端末間の通信が成立しませんでした。下の接続状況を確認してください。別のWi-Fiやテザリングで試す場合はQRを作り直してください。',connected:'接続済み · 金額を自動更新',disconnected:'接続を終了しました。もう一度つなぐ場合はQRを作り直してください。',stale:'表示の更新を待っています'};
  function updateControls(){
    const ready=!working&&link.canAcceptAnswer();
    for(const id of ['pair-camera','pair-image-button','pair-code','pair-use-code'])$('#'+id).disabled=!ready;
    $('#pair-create').disabled=working;
    $('#pair-safari').disabled=working;
    $('#pair-disconnect').disabled=!link.pc||working;
  }
  const link=new AmountLink({role:'sender',onDiagnostic:text=>{$('#pair-diagnostic').textContent=text;},onState:state=>{
    status.textContent=labels[state]||state;
    $('#open-customer').textContent=state==='connected'?'お客さん表示 · 接続済み':'お客さん表示';
    if(state==='connected'){reader.stop();$('#pair-offer').hidden=true;}
    updateControls();
  }});
  const reader=qrReader({video:$('#pair-video'),status,onRead:token=>acceptAnswer(token)});
  async function prepare(restarted=false,safari=false){
    if(working)return;working=true;updateControls();$('#pair-offer').hidden=true;reader.stop();$('#pair-code').value='';
    try{
      status.textContent=safari?'カメラを許可するとSafari用のQRを作ります…':'接続用QRを作っています…';await ensureQR();
      const token=await (safari?withCameraPermission(()=>link.createOffer()):link.createOffer());
      const url=new URL('customer.html',location.href);url.hash=new URLSearchParams({pair:token}).toString();
      drawQR($('#pair-qr'),url.href);$('#pair-link').value=url.href;$('#pair-preview').href=url.href;$('#pair-offer').hidden=false;
      $('#pair-create').textContent='QRを作り直す';
      status.textContent=restarted?'新しいQRを用意しました。お客さん端末でこのQRを読み直し、新しく出た返答QRをこの画面で読んでください。':'お客さん端末でこのQRを読み、表示された返答QRを下の「返答QRを読む」で読んでください。';
    }catch(e){link.close();status.textContent=e.message;}
    finally{working=false;updateControls();}
  }
  async function readyToRead(){
    if(working)return false;
    if(link.canAcceptAnswer())return true;
    await prepare(true);return false;
  }
  async function acceptAnswer(token){
    if(!await readyToRead())return;working=true;updateControls();
    try{await ensureQR();await link.acceptAnswer(token);status.textContent=labels[link.state]||'接続しています…';}
    catch(e){status.textContent=e.message;}
    finally{working=false;updateControls();}
  }
  $('#open-customer').onclick=()=>{
    $('#customer-dialog').showModal();
    if(!['connected','connecting','waiting','timeout','reconnecting'].includes(link.state)&&!link.canAcceptAnswer())void prepare();
    else updateControls();
  };
  $('#close-customer').onclick=()=>{reader.stop();$('#customer-dialog').close();};
  $('#customer-dialog').addEventListener('cancel',()=>reader.stop());
  $('#pair-create').onclick=()=>prepare(true);
  $('#pair-safari').onclick=()=>prepare(true,true);
  $('#pair-camera').onclick=async()=>{if(!await readyToRead())return;try{await ensureQR();await reader.start();}catch(e){status.textContent=e.message;}};
  $('#pair-image').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!await readyToRead())return;try{await ensureQR();await reader.file(file);}catch(error){status.textContent=error.message;}};
  $('#pair-image-button').onclick=async()=>{if(await readyToRead())$('#pair-image').click();};
  $('#pair-use-code').onclick=()=>acceptAnswer($('#pair-code').value);
  $('#pair-disconnect').onclick=()=>{reader.stop();link.close();$('#pair-offer').hidden=true;status.textContent='接続を終了しました。';};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')reader.stop();else link.sendLatest();});
  window.addEventListener('pagehide',()=>{reader.stop();link.close();$('#pair-offer').hidden=true;});
  window.addEventListener('pageshow',e=>{if(e.persisted&&$('#customer-dialog').open)void prepare(true);});
  updateControls();
  return {publish:amount=>link.publish(amount)};
}
