import {AmountLink} from './amount-link.js';
import {ensureQR,drawQR,qrReader} from './qr.js';
export function setupCustomerControls(){
  const $=s=>document.querySelector(s),status=$('#pair-status');let working=false;
  const labels={idle:'未接続',pairing:'接続情報を準備しています…',connecting:'接続しています…',connected:'接続済み · 金額を自動更新',disconnected:'接続が切れました。QRを作り直してください。',stale:'表示の更新を待っています'};
  function updateControls(){
    const ready=!working&&link.canAcceptAnswer();
    for(const id of ['pair-camera','pair-image-button','pair-code','pair-use-code'])$('#'+id).disabled=!ready;
    $('#pair-create').disabled=working;
    $('#pair-disconnect').disabled=!link.pc||working;
  }
  const link=new AmountLink({role:'sender',onState:state=>{
    status.textContent=labels[state]||state;
    $('#open-customer').textContent=state==='connected'?'お客さん表示 · 接続済み':'お客さん表示';
    if(state==='connected'){reader.stop();$('#pair-offer').hidden=true;}
    updateControls();
  }});
  const reader=qrReader({video:$('#pair-video'),status,onRead:token=>acceptAnswer(token)});
  async function prepare(restarted=false){
    if(working)return;working=true;updateControls();$('#pair-offer').hidden=true;reader.stop();$('#pair-code').value='';
    try{
      status.textContent='接続用QRを作っています…';await ensureQR();const token=await link.createOffer();
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
    if(!['connected','connecting'].includes(link.state)&&!link.canAcceptAnswer())void prepare();
    else updateControls();
  };
  $('#close-customer').onclick=()=>{reader.stop();$('#customer-dialog').close();};
  $('#customer-dialog').addEventListener('cancel',()=>reader.stop());
  $('#pair-create').onclick=()=>prepare(true);
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
