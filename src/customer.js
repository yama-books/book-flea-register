import {AmountLink} from './amount-link.js';
import {ensureQR,drawQR,qrReader} from './qr.js';
const $=s=>document.querySelector(s);let working=false;
function blank(){ $('#customer-amount').textContent='—';$('#customer-yen').hidden=true; }
const link=new AmountLink({role:'receiver',onAmount:amount=>{
  $('#customer-amount').textContent=new Intl.NumberFormat('ja-JP').format(amount);$('#customer-yen').hidden=false;
},onState:state=>{
  const live=state==='live';
  $('#customer-state').textContent=({idle:'レジと接続してください',pairing:'接続用QRを準備しています…',connecting:'レジに接続しています…',connected:'金額の更新を待っています…',live:'お会計',stale:'金額の更新が止まっています',disconnected:'接続が切れました'})[state]||state;
  if(!live)blank();
  if(live){$('#customer-pairing').hidden=true;$('#customer-reconnect').hidden=true;$('#customer-help').hidden=true;reader.stop();}
  else if(['stale','disconnected'].includes(state)){$('#customer-reconnect').hidden=false;$('#customer-help').hidden=false;$('#customer-help').textContent='最新の金額を確認できないため、金額を非表示にしています。';}
}});
const reader=qrReader({video:$('#customer-video'),status:$('#customer-state'),onRead:offer=>acceptOffer(offer)});
async function acceptOffer(token){
  if(working)return;working=true;$('#customer-answer').hidden=true;
  try{
    await ensureQR();const answer=await link.acceptOffer(token);drawQR($('#customer-qr'),answer);$('#customer-answer-code').value=answer;$('#customer-answer').hidden=false;
    $('#customer-state').textContent='返答QRをレジで読み取ってください';
    history.replaceState(null,'',location.pathname+location.search);
  }catch(e){link.close();$('#customer-state').textContent=e.message;}
  finally{working=false;}
}
$('#customer-camera').onclick=async()=>{try{await ensureQR();await reader.start();}catch(e){$('#customer-state').textContent=e.message;}};
$('#customer-image-button').onclick=()=>$('#customer-image').click();
$('#customer-image').onchange=async e=>{const file=e.target.files[0];e.target.value='';try{await ensureQR();await reader.file(file);}catch(error){$('#customer-state').textContent=error.message;}};
$('#customer-use-code').onclick=()=>acceptOffer($('#customer-code').value);
$('#customer-reconnect').onclick=()=>{link.close();$('#customer-pairing').hidden=false;$('#customer-answer').hidden=true;$('#customer-reconnect').hidden=true;$('#customer-help').textContent='レジで新しいQRを作り、読み取ってください。';};
$('#customer-save-qr').onclick=()=>{const a=document.createElement('a');a.download='レジに返すQR.png';a.href=$('#customer-qr').toDataURL('image/png');a.click();};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')reader.stop();else if(link.lastSeen&&Date.now()-link.lastSeen>link.staleMs){blank();$('#customer-state').textContent='最新の金額を確認しています…';}});
window.addEventListener('pagehide',()=>{reader.stop();link.close();});
const offer=new URLSearchParams(location.hash.slice(1)).get('pair');if(offer)acceptOffer(offer);
