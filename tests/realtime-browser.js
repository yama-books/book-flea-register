import {AmountLink} from '../src/amount-link.js';
import {ensureQR,drawQR} from '../src/qr.js';
import {decodeSignal} from '../src/signaling.js';
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
function until(predicate,ms=8000){return new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(predicate()){clearInterval(timer);resolve();}else if(Date.now()-started>ms){clearInterval(timer);reject(new Error('timeout'));}},30);});}
document.querySelector('#run').onclick=async()=>{
  const button=document.querySelector('#run');button.disabled=true;document.querySelector('#results').replaceChildren();let failures=0,passed=0,sender,receiver,amount=null,receiverState;
  async function check(name,run){const li=document.createElement('li');try{await run();passed++;li.textContent='PASS '+name;li.className='pass';}catch(e){failures++;li.textContent='FAIL '+name+': '+e.message;li.className='fail';}document.querySelector('#results').append(li);}
  function qrRoundTrip(raw){const canvas=document.querySelector('#qr');drawQR(canvas,raw);const image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);const data=globalThis.jsQR(image.data,image.width,image.height)?.data;assert(data===raw,'QR decode');return data;}
  try{
    await ensureQR();
    sender=new AmountLink({role:'sender',iceServers:[],heartbeatMs:1000});receiver=new AmountLink({role:'receiver',iceServers:[],staleMs:250,onAmount:n=>amount=n,onState:s=>receiverState=s});
    let offer,answer;
    await check('接続用QRを実際に生成・読取し、offerを復元',async()=>{offer=await sender.createOffer();const url=new URL('../customer.html',location.href);url.hash='pair='+offer;decodeSignal(qrRoundTrip(url.href),'offer');});
    await check('返答QRを実際に生成・読取して接続',async()=>{answer=await receiver.acceptOffer(offer);await sender.acceptAnswer(qrRoundTrip(answer));await until(()=>sender.channel?.readyState==='open'&&receiver.channel?.readyState==='open');});
    await check('金額600円をWebRTCで即時受信',async()=>{sender.publish(600);await until(()=>amount===600);assert(receiverState==='live','live');});
    await check('連続追加後の更新と会計クリア0円を受信',async()=>{sender.publish(1000);await until(()=>amount===1000);sender.publish(0);await until(()=>amount===0);});
    await check('ハートビート途絶でstale状態になる',async()=>{await until(()=>receiverState==='stale');sender.publish(200);await until(()=>amount===200&&receiverState==='live');});
    await check('切断はdisconnectedまたはstaleとして検出',async()=>{sender.close();await until(()=>['disconnected','stale'].includes(receiverState));});
  }catch(e){failures++;document.querySelector('#status').textContent=e.message;}
  finally{sender?.close();receiver?.close();document.querySelector('#status').textContent=failures?`FAIL ${failures}件`:`PASS リアルタイム表示 ${passed}件`;button.disabled=false;}
};
