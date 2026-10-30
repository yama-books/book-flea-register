import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {AmountLink} from '../src/amount-link.js';
import {withCameraPermission} from '../src/qr.js';
import {encodeSignal,decodeSignal,extractToken,SIGNAL_LIFETIME,amountMessage,readAmount} from '../src/signaling.js';
const context=vm.createContext({Uint8Array,Uint8ClampedArray,ArrayBuffer,DataView,TextEncoder,TextDecoder,console});context.self=context;context.window=context;
for(const file of ['fflate.js','qrcode.js','jsqr.js'])vm.runInContext(fs.readFileSync(new URL('../vendor/'+file,import.meta.url),'utf8'),context);
globalThis.fflate=context.fflate;
test('20秒経過は接続待ちとし、60秒でも接続オブジェクトを閉じない',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const link=new AmountLink({role:'sender'}),pc={connectionState:'connecting'};link.pc=pc;link.setState('connecting');link.waitForConnection(pc);
  t.mock.timers.tick(20000);assert.equal(link.state,'waiting');assert.equal(link.pc,pc);
  t.mock.timers.tick(40000);assert.equal(link.state,'timeout');assert.equal(link.pc,pc);
  link.setState('connected');assert.equal(link.state,'connected');
});
test('接続成立・終了・作り直し後に古い待機タイマーは表示を変えない',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const link=new AmountLink({role:'sender'}),pc={};link.pc=pc;link.setState('connecting');link.waitForConnection(pc);link.setState('connected');
  t.mock.timers.tick(60000);assert.equal(link.state,'connected');
  link.setState('connecting');link.waitForConnection(pc);link.pc={};link.setState('pairing');t.mock.timers.tick(60000);assert.equal(link.state,'pairing');
  link.pc=null;link.setState('idle');
});
test('Safari用のカメラは情報生成中だけ使い、成功・失敗の両方で停止する',async()=>{
  let stopped=0,requested;
  const media={getUserMedia:async options=>{requested=options;return {getTracks:()=>[{stop:()=>stopped++}]};}};
  assert.equal(await withCameraPermission(async()=>{assert.equal(stopped,0);return 'qr';},media),'qr');
  assert.deepEqual(requested,{video:true,audio:false});assert.equal(stopped,1);
  await assert.rejects(withCameraPermission(async()=>{throw new Error('generation failed');},media),/generation failed/);assert.equal(stopped,2);
  await assert.rejects(withCameraPermission(async()=>assert.fail('must not run'),{getUserMedia:async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'});}}),/カメラの許可が必要/);
});
test('一時的な途絶は復帰待ち、ブラウザのfailedは接続失敗として区別',t=>{
  const previous=globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection=class {constructor(){this.connectionState='new';this.iceConnectionState='new';}close(){this.connectionState='closed';}};
  t.after(()=>{if(previous)globalThis.RTCPeerConnection=previous;else delete globalThis.RTCPeerConnection;});
  let detail='';const link=new AmountLink({role:'sender',onDiagnostic:text=>detail=text}),pc=link.setup();
  link.channel={readyState:'open',close(){}};
  pc.connectionState='disconnected';pc.onconnectionstatechange();assert.equal(link.state,'reconnecting');
  pc.connectionState='connected';pc.onconnectionstatechange();assert.equal(link.state,'connected');
  pc.iceConnectionState='failed';pc.connectionState='failed';pc.onconnectionstatechange();assert.equal(link.state,'failed');assert.match(detail,/failed/);
  link.close();
});
test('返答読取は現在の未回答offerと有効期限がそろう場合だけ許可',async()=>{
  const link=new AmountLink({role:'sender'});
  assert.equal(link.canAcceptAnswer(),false);
  await assert.rejects(link.acceptAnswer('unused'),/接続の準備が失われた/);
  link.pc={signalingState:'have-local-offer'};link.expires=Date.now()+10000;
  assert.equal(link.canAcceptAnswer(),true);
  link.pc.signalingState='stable';assert.equal(link.canAcceptAnswer(),false);
  link.pc.signalingState='have-local-offer';link.expires=Date.now()-1;assert.equal(link.canAcceptAnswer(),false);
  link.expires=Date.now()+10000;link.role='receiver';assert.equal(link.canAcceptAnswer(),false);
});
const makeSignal=(kind='offer')=>({v:1,kind,session:'a'.repeat(32),expires:Date.now()+SIGNAL_LIFETIME,sdp:'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'+('a=candidate:123 1 udp 123 192.0.2.1 9999 typ host\r\n').repeat(12)});
test('圧縮した接続情報が往復し、共有リンクからも取り出せる',()=>{const s=makeSignal(),token=encodeSignal(s);assert.deepEqual(decodeSignal(token,'offer'),s);assert.equal(extractToken('https://example.test/customer.html#pair='+token),token);assert.deepEqual(decodeSignal('https://example.test/customer.html#pair='+token,'offer'),s);});
test('期限切れ・種類違い・別接続の返答を拒否する',()=>{const s=makeSignal(),token=encodeSignal(s);assert.throws(()=>decodeSignal(token,'offer',null,s.expires+1));assert.throws(()=>decodeSignal(token,'answer'));assert.throws(()=>decodeSignal(token,'offer','b'.repeat(32)));assert.throws(()=>decodeSignal('BFR1.not-a-payload','offer'));assert.throws(()=>extractToken('https://example.test/'));assert.throws(()=>encodeSignal({...s,expires:Date.now()+2*SIGNAL_LIFETIME}));});
test('金額パケットは売上明細を含まず、不正・古い順番を拒否する',()=>{const data=amountMessage(600,1);assert.deepEqual(Object.keys(data),['v','type','amountYen','receivedYen','changeYen','done','sequence']);assert.deepEqual(readAmount(JSON.stringify(data)),{amountYen:600,receivedYen:null,changeYen:null,done:false,sequence:1});assert.deepEqual(readAmount('{"v":1,"type":"amount","amountYen":300,"sequence":2}'),{amountYen:300,receivedYen:null,changeYen:null,done:false,sequence:2},'旧形式も受け付ける');for(const value of [-1,NaN,Infinity,1.2,100000000])assert.throws(()=>amountMessage(value,1));assert.equal(readAmount(JSON.stringify(data),1),null);assert.equal(readAmount('{"v":1,"type":"amount","amountYen":-1,"sequence":2}'),null);assert.equal(readAmount('not json'),null);});
test('実際のQR生成と読取ライブラリで接続URLを復元できる',()=>{const url='https://yama-books.github.io/book-flea-register/customer.html#pair='+encodeSignal(makeSignal()),qr=context.qrcode(0,'L');qr.addData(url);qr.make();const n=qr.getModuleCount(),cell=4,size=(n+8)*cell,data=new Uint8ClampedArray(size*size*4).fill(255);for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))for(let dy=0;dy<cell;dy++)for(let dx=0;dx<cell;dx++){const i=(((y+4)*cell+dy)*size+(x+4)*cell+dx)*4;data[i]=data[i+1]=data[i+2]=0;}assert.equal(context.jsQR(data,size,size)?.data,url);});
test('お会計・お預かり・お釣りを送り、計算の合わないお釣りを拒否する',()=>{const ok=amountMessage(600,3,{receivedYen:1000,changeYen:400,done:true});assert.deepEqual(readAmount(JSON.stringify(ok)),{amountYen:600,receivedYen:1000,changeYen:400,done:true,sequence:3});assert.deepEqual(readAmount(JSON.stringify(amountMessage(600,4,{receivedYen:500}))),{amountYen:600,receivedYen:500,changeYen:null,done:false,sequence:4});for(const bad of [{receivedYen:1000,changeYen:300},{receivedYen:null,changeYen:0},{receivedYen:-1},{receivedYen:1.5},{receivedYen:600,changeYen:0,done:'yes'},{done:true}])assert.throws(()=>amountMessage(600,1,bad));assert.equal(readAmount(JSON.stringify({...ok,changeYen:1})),null);});
