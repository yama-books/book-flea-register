import {AmountLink} from './amount-link.js';
import {ensureQR,drawQR,qrReader,withCameraPermission} from './qr.js';
import {keepScreenAwake,revealOnTaps,AWAKE_LABELS} from './display-support.js';
const $=s=>document.querySelector(s);let working=false,currentOffer=null;
const yen=n=>new Intl.NumberFormat('ja-JP').format(n)+'円';
function blank(){ $('#customer-bill').hidden=true; }
function showBill({amountYen,receivedYen,changeYen,done}){
  $('#customer-amount').textContent=new Intl.NumberFormat('ja-JP').format(amountYen);
  $('#customer-received').textContent=receivedYen===null?'—':yen(receivedYen);
  $('#customer-change').textContent=changeYen===null?'—':yen(changeYen);
  $('#customer-bill').classList.toggle('is-done',done);$('#customer-bill').hidden=false;
  $('#customer-state').textContent=done?'ありがとうございました':amountYen?'お会計内容をご確認ください':'いらっしゃいませ';
}
const link=new AmountLink({role:'receiver',onDiagnostic:text=>{$('#customer-diagnostic').textContent=text;},onAmount:showBill,onState:state=>{
  const live=state==='live';
  $('#customer-state').textContent=({idle:'レジと接続してください',pairing:'接続用QRを準備しています…',connecting:'レジに接続しています…',reconnecting:'通信の復帰を待っています。両方のSafariを開いたままにしてください。',failed:'端末間の通信が成立しませんでした。レジで新しいQRを作って接続し直してください。',connected:'金額の更新を待っています…',live:$('#customer-state').textContent,stale:'金額の更新が止まっています',disconnected:'接続が切れました'})[state]||state;
  if(!live)blank();
  if(live){$('#customer-pairing').hidden=true;$('#customer-reconnect').hidden=true;$('#customer-help').hidden=true;reader.stop();}
  // 一時的な途絶では接続を閉じずに自動復帰を待つ。作り直しは通信が終わったときだけ案内する。
  else if(['stale','reconnecting'].includes(state)){$('#customer-reconnect').hidden=true;$('#customer-help').hidden=false;$('#customer-help').textContent='通信の復帰を待っています。このまま画面を開いておいてください。';}
  else if(['disconnected','failed'].includes(state)){$('#customer-reconnect').hidden=false;$('#customer-help').hidden=false;$('#customer-help').textContent='最新の金額を確認できないため、金額を非表示にしています。';}
}});
const reader=qrReader({video:$('#customer-video'),status:$('#customer-state'),onRead:offer=>acceptOffer(offer)});
async function acceptOffer(token,safari=false){
  if(working)return;working=true;$('#customer-safari').disabled=true;$('#customer-answer').hidden=true;currentOffer=token;
  try{
    await ensureQR();const answer=await (safari?withCameraPermission(()=>link.acceptOffer(token)):link.acceptOffer(token));drawQR($('#customer-qr'),answer);$('#customer-answer-code').value=answer;$('#customer-answer').hidden=false;
    $('#customer-state').textContent='返答QRをレジで読み取ってください';
    history.replaceState(null,'',location.pathname+location.search);
  }catch(e){link.close();$('#customer-state').textContent=e.message;}
  finally{working=false;$('#customer-safari').disabled=!currentOffer;}
}
$('#customer-safari').onclick=()=>{if(currentOffer)acceptOffer(currentOffer,true);};
$('#customer-camera').onclick=async()=>{try{await ensureQR();await reader.start();}catch(e){$('#customer-state').textContent=e.message;}};
$('#customer-image-button').onclick=()=>$('#customer-image').click();
$('#customer-image').onchange=async e=>{const file=e.target.files[0];e.target.value='';try{await ensureQR();await reader.file(file);}catch(error){$('#customer-state').textContent=error.message;}};
$('#customer-use-code').onclick=()=>acceptOffer($('#customer-code').value);
$('#customer-reconnect').onclick=()=>{link.close();$('#customer-pairing').hidden=false;$('#customer-answer').hidden=true;$('#customer-reconnect').hidden=true;$('#customer-help').textContent='レジで新しいQRを作り、読み取ってください。';};
$('#customer-save-qr').onclick=()=>{const a=document.createElement('a');a.download='レジに返すQR.png';a.href=$('#customer-qr').toDataURL('image/png');a.click();};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')reader.stop();else if(link.lastSeen&&Date.now()-link.lastSeen>link.staleMs){blank();$('#customer-state').textContent='最新の金額を確認しています…';}});
window.addEventListener('pagehide',()=>{reader.stop();link.close();});
const offer=new URLSearchParams(location.hash.slice(1)).get('pair');if(offer)acceptOffer(offer);
revealOnTaps($('#customer-state'),$('#customer-diagnostic-box'));
keepScreenAwake(status=>{const text=AWAKE_LABELS[status]||'';$('#customer-awake-detail').textContent='画面: '+text;$('#customer-awake').textContent=status==='on'?'':text;});
