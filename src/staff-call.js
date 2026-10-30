// entrance-counterのGAS呼出APIを援用。宛先・合言葉・実URLは公開コードに置かない。
const ownKey='book-flea-register-call',sharedKey='entrance-counter-call';
const configFormat='staff-call-config';
export function parseCallConfigFile(raw){
  const data=JSON.parse(raw);
  if(!data||data.format!==configFormat||data.version!==1)throw new Error('対応する送信設定ファイルではありません。');
  return validateCallSettings(data);
}
export function makeCallConfigFile(settings){
  const config=validateCallSettings(settings);
  return JSON.stringify({format:configFormat,version:1,url:config.url,key:config.key},null,2);
}
export function validateCallSettings(value){
  if(!value||typeof value.url!=='string'||!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(value.url)||typeof value.key!=='string'||!value.key.trim()||value.key.length>200)throw new Error('送信先のウェブアプリURLと合言葉を確認してください。');
  return {url:value.url,key:value.key};
}
export function readCallSettings(storage){
  for(const key of [ownKey,sharedKey]){try{const value=validateCallSettings(JSON.parse(storage.getItem(key)));return {...value,shared:key===sharedKey};}catch{}}
  return null;
}
export async function sendStaffCall(settings,text,{practice=false,fetcher=globalThis.fetch,timeoutMs=20000}={}){
  text=String(text).trim();if(!text||text.length>500)throw new Error('要件を1〜500文字で入力してください。');
  if(practice)return {demo:true};
  const config=validateCallSettings(settings),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeoutMs);
  try{
    const response=await fetcher(config.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({key:config.key,text,staff:'古本フリマレジ',source:'book-sale',at:new Date().toISOString()}),signal:abort.signal});
    const result=await response.json();
    if(!response.ok||result?.ok!==true)throw new Error(typeof result?.error==='string'?result.error.slice(0,200):'送信の確認ができませんでした。');
    return {demo:false};
  }finally{clearTimeout(timer);}
}
export function setupStaffCall({isPractice}){
  const $=s=>document.querySelector(s);let sending=false;
  const getSettings=()=>{try{return readCallSettings(localStorage);}catch{return null;}};
  $('#open-call').onclick=()=>{
    const settings=getSettings();$('#call-dialog').showModal();
    $('#call-mode').textContent=isPractice()?'練習モードです。実際にはメールを送りません。':'入力した要件を山本へメールで送ります。';
    $('#call-submit').textContent=isPractice()?'呼出を練習する':'山本を呼ぶ（メール送信）';
    $('#call-status').textContent=settings?.shared?'入場カウンターと共通の端末設定を使用します。':settings?'':isPractice()?'':'送信設定がまだありません。';
    $('#call-url').value=settings?.url||'';$('#call-key').value=settings?.key||'';$('#call-settings').open=!settings&&!isPractice();
  };
  $('#close-call').onclick=()=>{if(!sending)$('#call-dialog').close();};
  $('#call-dialog').addEventListener('cancel',e=>{if(sending)e.preventDefault();});
  $('#call-settings-form').onsubmit=e=>{
    e.preventDefault();try{
      if(isPractice())throw new Error('送信設定は本番モードで変更してください。');
      const settings=validateCallSettings({url:$('#call-url').value.trim(),key:$('#call-key').value});
      localStorage.setItem(ownKey,JSON.stringify(settings));$('#call-settings').open=false;$('#call-status').textContent='この端末に送信設定を保存しました。';
    }catch(error){$('#call-status').textContent=error.message;}
  };
  $('#call-config-import').onchange=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(isPractice())throw new Error('送信設定は本番モードで変更してください。');
      if(file.size>8192)throw new Error('設定ファイルが大きすぎます。');
      const config=parseCallConfigFile(await file.text());
      localStorage.setItem(ownKey,JSON.stringify(config));
      $('#call-url').value=config.url;$('#call-key').value=config.key;
      $('#call-settings').open=false;
      $('#call-status').textContent='共通送信設定をこの端末に取り込みました。';
    }catch(error){$('#call-status').textContent='設定の読込に失敗：'+error.message;}
    finally{e.target.value='';}
  };
  $('#call-config-export').onclick=()=>{
    try{
      const settings=getSettings();if(!settings)throw new Error('先に送信設定を保存してください。');
      const content=makeCallConfigFile(settings);
      const objectUrl=URL.createObjectURL(new Blob([content],{type:'application/json'}));
      const a=document.createElement('a');a.href=objectUrl;a.download='staff-call-settings.local.json';a.click();
      setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
      $('#call-status').textContent='設定ファイルを書き出しました。合言葉が含まれるため公開しないでください。';
    }catch(error){$('#call-status').textContent=error.message;}
  };
  $('#call-form').onsubmit=async e=>{
    e.preventDefault();if(sending)return;
    const practice=isPractice();sending=true;$('#call-submit').disabled=true;$('#close-call').disabled=true;$('#call-status').textContent=practice?'練習しています…':'送信中…';
    try{
      await sendStaffCall(getSettings(),$('#call-input').value,{practice});
      $('#call-input').value='';$('#call-status').textContent=practice?'呼出の練習ができました。メールは送っていません。':'送信しました。';
    }catch(error){$('#call-status').textContent=(error.name==='AbortError'?'時間内に送信結果を確認できませんでした。':error.message)+' 要件は残っています。';}
    finally{sending=false;$('#call-submit').disabled=false;$('#close-call').disabled=false;}
  };
}
