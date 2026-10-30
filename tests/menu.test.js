import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {toggleFullscreen} from '../src/menu.js';
import {validateCallSettings,readCallSettings,sendStaffCall,parseCallConfigFile,makeCallConfigFile} from '../src/staff-call.js';
import {practiceBackup,draftKey} from '../src/practice.js';
import {initialState,parseBackup} from '../src/calculation.js';
test('練習の途中会計とバックアップを本番として読み込まない',()=>{
  assert.notEqual(draftKey(true),draftKey(false));
  const state=initialState();assert.throws(()=>parseBackup(practiceBackup(state)),/対応するバックアップ/);
  assert.equal(JSON.parse(practiceBackup(state)).format,'book-flea-register-practice');
});
test('全画面の開始・終了と非対応を区別する',async()=>{
  let entered=0,exited=0;
  const doc={documentElement:{requestFullscreen:async()=>entered++},fullscreenElement:null,exitFullscreen:async()=>exited++};
  assert.equal(await toggleFullscreen(doc),true);assert.equal(entered,1);
  doc.fullscreenElement={};assert.equal(await toggleFullscreen(doc),true);assert.equal(exited,1);
  assert.equal(await toggleFullscreen({documentElement:{}}),false);
  assert.equal(await toggleFullscreen({fullscreenEnabled:false,documentElement:{requestFullscreen:async()=>assert.fail('disabled')}}),false);
  await assert.rejects(toggleFullscreen({documentElement:{requestFullscreen:async()=>{throw new Error('denied');}}}),/denied/);
});
const config={url:'https://script.google.com/macros/s/test-only-not-deployed/exec',key:'test-only-not-a-secret'};
test('送信設定は正規のGAS URLだけを受け付け、共通端末設定を読める',()=>{
  for(const url of ['https://example.test/exec',config.url+'?x=1','http://script.google.com/macros/s/test/exec'])assert.throws(()=>validateCallSettings({...config,url}));
  assert.throws(()=>validateCallSettings({...config,key:' '}));
  const storage={getItem:key=>key==='entrance-counter-call'?JSON.stringify(config):null};
  assert.deepEqual(readCallSettings(storage),{...config,shared:true});
  assert.equal(readCallSettings({getItem:()=>'{bad'}),null);
});
test('共通設定ファイルは両アプリ共通の形式で読み書きし、不正形式を拒否する',()=>{
  assert.deepEqual(parseCallConfigFile(makeCallConfigFile(config)),config);
  assert.throws(()=>parseCallConfigFile('{"format":"wrong","version":1}'));
  assert.throws(()=>parseCallConfigFile('{"format":"staff-call-config","version":1,"url":"https://evil.example/","key":"x"}'));
});
test('練習の呼出は設定不要で、送信を一度も実行しない',async()=>{
  let calls=0;assert.deepEqual(await sendStaffCall(null,'練習',{practice:true,fetcher:()=>{calls++;throw new Error();}}),{demo:true});assert.equal(calls,0);
  await assert.rejects(sendStaffCall(config,' '.repeat(4),{practice:true}),/1〜500文字/);
  await assert.rejects(sendStaffCall(config,'x'.repeat(501),{practice:true}),/1〜500文字/);
});
test('呼出APIの契約どおり送信し、成功応答以外は成功と扱わない',async()=>{
  let sent;
  const result=await sendStaffCall(config,' 本を運んでください ',{fetcher:async(url,options)=>{sent={url,options};return {ok:true,json:async()=>({ok:true})};}});
  assert.deepEqual(result,{demo:false});assert.equal(sent.url,config.url);assert.equal(sent.options.method,'POST');assert.match(sent.options.headers['Content-Type'],/^text\/plain/);
  const body=JSON.parse(sent.options.body);assert.equal(body.text,'本を運んでください');assert.equal(body.staff,'古本フリマレジ');assert.equal(body.source,'book-sale');assert.equal(body.key,config.key);
  for(const response of [{ok:true,json:async()=>({ok:false,error:'上限です'})},{ok:false,json:async()=>({ok:true})},{ok:true,json:async()=>({})}])await assert.rejects(sendStaffCall(config,'呼出',{fetcher:async()=>response}));
});
test('呼出はタイムアウトしても自動再送しない',async()=>{
  let calls=0;
  await assert.rejects(sendStaffCall(config,'呼出',{timeoutMs:5,fetcher:async(_url,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('timeout'),{name:'AbortError'}))));}}),{name:'AbortError'});
  assert.equal(calls,1);
});
test('GASひな形は合言葉・連打・日次上限を確認してから模擬メールを送る',()=>{
  const props=new Map([['RECIPIENT','recipient@example.invalid'],['PASSCODE','test-only']]),cache=new Map();let sent=0,mail;
  const context=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperties:values=>Object.entries(values).forEach(([k,v])=>props.set(k,v))})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Utilities:{formatDate:()=> '2026-10-30'},MailApp:{sendEmail:arg=>{mail=arg;sent++;}},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})}});
  vm.runInContext(fs.readFileSync(new URL('../gas/call-staff.gs',import.meta.url),'utf-8'),context);
  const request=key=>context.doPost({postData:{contents:JSON.stringify({key,text:'テスト',staff:'古本フリマレジ'})}});
  assert.equal(request('wrong').ok,false);assert.equal(sent,0);
  assert.equal(request('test-only').ok,true);assert.equal(sent,1);assert.equal(mail.subject,'【古本市レジより】山本を呼ぶ');
  assert.equal(request('test-only').ok,false);assert.equal(sent,1);
  cache.clear();
  assert.equal(context.doPost({postData:{contents:JSON.stringify({key:'test-only',text:'受付に来て',staff:'受付係',source:'library'})}}).ok,true);
  assert.equal(mail.subject,'【図書館受付より】山本を呼ぶ');assert.equal(sent,2);
  cache.clear();props.set('CALL_COUNT','50');assert.equal(request('test-only').ok,false);assert.equal(sent,2);
});
