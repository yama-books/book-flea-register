import {extractToken} from './signaling.js';
let libraries;
export async function withCameraPermission(action,mediaDevices=globalThis.navigator?.mediaDevices){
  if(!mediaDevices?.getUserMedia)throw new Error('カメラが使えません。Safariでこのページを開いてください。');
  let stream;
  try{stream=await mediaDevices.getUserMedia({video:true,audio:false});return await action();}
  catch(e){if(e.name==='NotAllowedError')throw new Error('Safari用の接続準備にはカメラの許可が必要です。許可してから、もう一度このボタンを押してください。');throw e;}
  finally{stream?.getTracks().forEach(track=>track.stop());}
}
export function ensureQR(){
  if(!libraries)libraries=(async()=>{
    for(const [file,name] of [['qrcode.js','qrcode'],['fflate.js','fflate'],['jsqr.js','jsQR']]){
      if(globalThis[name])continue;
      await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('../vendor/'+file,import.meta.url).href;script.onload=resolve;script.onerror=()=>reject(new Error('QR機能を読み込めません。再読込してお試しください。'));document.head.append(script);});
    }
  })().catch(e=>{libraries=null;throw e;});
  return libraries;
}
export function drawQR(canvas,text){
  if(text.length>2950)throw new Error('QRコードが大きすぎます。接続を作り直してください。');
  const qr=globalThis.qrcode(0,'L');qr.addData(text,'Byte');qr.make();
  const count=qr.getModuleCount(),cell=4,margin=4;
  canvas.width=canvas.height=(count+margin*2)*cell;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#172333';
  for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(qr.isDark(y,x))ctx.fillRect((x+margin)*cell,(y+margin)*cell,cell,cell);
  return count;
}
export function readQRImage(canvas,source){
  const w=source.videoWidth||source.naturalWidth||source.width,h=source.videoHeight||source.naturalHeight||source.height;
  if(!w||!h)return null;
  const scale=Math.min(1,1400/Math.max(w,h));canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const image=ctx.getImageData(0,0,canvas.width,canvas.height);return globalThis.jsQR(image.data,image.width,image.height,{inversionAttempts:'dontInvert'})?.data??null;
}
export function qrReader({video,status,onRead}){
  const canvas=document.createElement('canvas');let stream,timer,generation=0;
  function stop(){generation++;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.hidden=true;}
  function accept(raw){const token=extractToken(raw);stop();onRead(token);}
  async function start(){
    stop();const run=generation;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('カメラが使えません。「QR画像を選ぶ」を使ってください。');
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});
      if(run!==generation){media.getTracks().forEach(t=>t.stop());return;}
      stream=media;video.srcObject=media;video.hidden=false;await video.play();status.textContent='相手の接続用QRをカメラに映してください。';
      const scan=()=>{
        if(run!==generation)return;
        try{const raw=readQRImage(canvas,video);if(raw){accept(raw);return;}}catch(e){status.textContent=e.message;}
        timer=setTimeout(scan,180);
      };scan();
    }catch(e){stop();status.textContent=e.name==='NotAllowedError'?'カメラを許可するか、「QR画像を選ぶ」を使ってください。':e.message;}
  }
  async function file(file){
    if(!file)return;stop();
    try{
      if(file.size>12_000_000)throw new Error('12MB以内のQR画像を選んでください。');
      const url=URL.createObjectURL(file),img=new Image();
      try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});const raw=readQRImage(canvas,img);if(!raw)throw new Error('QRを読み取れません。余白を含め、明るく鮮明に撮ってください。');accept(raw);}finally{URL.revokeObjectURL(url);}
    }catch(e){status.textContent=e.message||'画像を読み取れません。';}
  }
  return {start,stop,file};
}
