export const SIGNAL_LIFETIME = 10*60*1000;
export const MAX_SIGNAL_CHARS = 2800;
export const STALE_AFTER = 8000;
export function sessionId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');}
export function encodeSignal(signal){
  validateSignal(signal,signal.kind);
  const bytes=globalThis.fflate.compressSync(globalThis.fflate.strToU8(JSON.stringify(signal)),{level:9});
  const token='BFR1.'+btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  if(token.length>MAX_SIGNAL_CHARS)throw new Error('接続情報がQRに収まりません。同じWi-Fiで接続を作り直してください。');
  return token;
}
export function extractToken(input){
  let token=String(input).trim();
  if(/^https?:\/\//i.test(token))token=new URLSearchParams(new URL(token).hash.slice(1)).get('pair')||'';
  if(!/^BFR1\.[A-Za-z0-9_-]+$/.test(token)||token.length>MAX_SIGNAL_CHARS)throw new Error('このレジの接続用QRコードを読み取ってください。');
  return token;
}
export function decodeSignal(input,kind,expectedSession,now=Date.now()){
  const token=extractToken(input),raw=atob(token.slice(5).replaceAll('-','+').replaceAll('_','/'));
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if(bytes.length<18 || new DataView(bytes.buffer).getUint32(bytes.length-4,true)>24000)throw new Error('接続情報が大きすぎます。');
  let signal;
  try{
    const expanded=globalThis.fflate.decompressSync(bytes);
    if(expanded.length>24000)throw new Error();
    signal=JSON.parse(globalThis.fflate.strFromU8(expanded));
  }catch{throw new Error('接続情報を読み取れません。QRコードを作り直してください。');}
  return validateSignal(signal,kind,expectedSession,now);
}
export function validateSignal(s,kind,expectedSession,now=Date.now()){
  if(!s||s.v!==1||!['offer','answer'].includes(kind)||s.kind!==kind||! /^[a-f0-9]{32}$/.test(s.session)||typeof s.sdp!=='string'||s.sdp.length>16000||!s.sdp.startsWith('v=0\r\n')||!s.sdp.includes('m=application '))throw new Error('接続情報の種類が違います。正しいQRコードを読み取ってください。');
  if(!Number.isSafeInteger(s.expires)||s.expires<=now||s.expires>now+SIGNAL_LIFETIME+30000)throw new Error('接続用QRコードの有効期限が切れています。作り直してください。');
  if(expectedSession&&s.session!==expectedSession)throw new Error('別の接続の返答QRです。お客さん端末でレジの新しいQRを読み直し、新しく出た返答QRをこの画面で読んでください。');
  return {v:1,kind:s.kind,session:s.session,expires:s.expires,sdp:s.sdp};
}
export function amountMessage(amountYen,sequence){
  if(!Number.isSafeInteger(amountYen)||amountYen<0||amountYen>99999999||!Number.isSafeInteger(sequence)||sequence<1)throw new Error('表示金額が不正です。');
  return {v:1,type:'amount',amountYen,sequence};
}
export function readAmount(raw,lastSequence=0){
  if(typeof raw!=='string'||raw.length>200)return null;
  try{const data=JSON.parse(raw);amountMessage(data.amountYen,data.sequence);if(data.v!==1||data.type!=='amount'||data.sequence<=lastSequence)return null;return {amountYen:data.amountYen,sequence:data.sequence};}catch{return null;}
}
