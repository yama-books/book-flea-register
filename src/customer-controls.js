import {AmountLink} from './amount-link.js';
import {ensureQR,drawQR,qrReader} from './qr.js';
export function setupCustomerControls(){
  const $=s=>document.querySelector(s),status=$('#pair-status');let working=false;
  const labels={idle:'未接続',pairing:'QRを交換してください',connecting:'接続しています…',connected:'接続済み · 金額を自動更新',disconnected:'接続が切れました。QRを作り直してください。',stale:'表示の更新を待っています'};
  const link=new AmountLink({role:'sender',onState:state=>{
    status.textContent=labels[state]||state;
    $('#open-customer').textContent=state==='connected'?'お客さん表示 · 接続済み':'お客さん表示';
    $('#pair-disconnect').disabled=state==='idle';
    if(state==='connected'){reader.stop();$('#pair-offer').hidden=true;}
  }});
  const reader=qrReader({video:$('#pair-video'),status,onRead:token=>acceptAnswer(token)});
  async function acceptAnswer(token){
    if(working)return;working=true;
    try{await ensureQR();await link.acceptAnswer(token);status.textContent='接続しています…';}
    catch(e){status.textContent=e.message;}
    finally{working=false;}
  }
  $('#open-customer').onclick=()=>$('#customer-dialog').showModal();
  $('#close-customer').onclick=()=>{reader.stop();$('#customer-dialog').close();};
  $('#customer-dialog').addEventListener('cancel',()=>reader.stop());
  $('#pair-create').onclick=async()=>{
    if(working)return;working=true;$('#pair-create').disabled=true;$('#pair-offer').hidden=true;reader.stop();
    try{
      status.textContent='接続用QRを作っています…';await ensureQR();const token=await link.createOffer();
      const url=new URL('customer.html',location.href);url.hash=new URLSearchParams({pair:token}).toString();
      drawQR($('#pair-qr'),url.href);$('#pair-link').value=url.href;$('#pair-preview').href=url.href;$('#pair-offer').hidden=false;
      status.textContent='お客さん端末でこのQRを読み取り、表示された返答QRをレジで読み取ってください。';
    }catch(e){link.close();status.textContent=e.message;}
    finally{working=false;$('#pair-create').disabled=false;}
  };
  $('#pair-camera').onclick=async()=>{try{await ensureQR();await reader.start();}catch(e){status.textContent=e.message;}};
  $('#pair-image').onchange=async e=>{const file=e.target.files[0];e.target.value='';try{await ensureQR();await reader.file(file);}catch(error){status.textContent=error.message;}};
  $('#pair-image-button').onclick=()=>$('#pair-image').click();
  $('#pair-use-code').onclick=()=>acceptAnswer($('#pair-code').value);
  $('#pair-disconnect').onclick=()=>{reader.stop();link.close();$('#pair-offer').hidden=true;status.textContent='接続を終了しました。';};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')reader.stop();else link.sendLatest();});
  window.addEventListener('pagehide',()=>{reader.stop();link.close();});
  return {publish:amount=>link.publish(amount)};
}
