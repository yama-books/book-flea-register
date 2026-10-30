// Only the public GAS endpoint is shipped. Passcodes stay in localStorage and GAS script properties.
export const CALL_ENDPOINT_URL='https://script.google.com/macros/s/AKfycbzJqPHStaj08vfVucJ0hl7a1Nlw7lDIIcq1i5DSj0uRDySu4pS2J1-FpUfqR-fNMnJ9/exec';
const ownKey='book-flea-register-call',sharedKey='entrance-counter-call';
export function validateCallSettings(value){
  if(!value||typeof value.key!=='string'||!value.key.trim()||value.key.length>200)
    throw new Error('合言葉を1〜200文字で入力してください。');
  // Ignore legacy saved URLs: use the fixed approved endpoint on every device.
  return {url:CALL_ENDPOINT_URL,key:value.key};
}
export function readCallSettings(storage){
  for(const key of [ownKey,sharedKey]){
    try{const value=validateCallSettings(JSON.parse(storage.getItem(key)));return {...value,shared:key===sharedKey};}
    catch{}
  }
  return null;
}
export async function sendStaffCall(settings,text,{staff='',practice=false,fetcher=globalThis.fetch,timeoutMs=20000}={}){
  text=String(text).trim();if(!text||text.length>500)throw new Error('要件を1〜500文字で入力してください。');
  staff=String(staff).trim();if(!staff||staff.length>80)throw new Error('担当者名を1〜80文字で入力してください。');
  if(practice)return {demo:true};
  const config=validateCallSettings(settings),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeoutMs);
  try{
    const response=await fetcher(config.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({key:config.key,text,staff,source:'book-sale',at:new Date().toISOString()}),signal:abort.signal});
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
    $('#call-status').textContent=settings?.shared?'共通の合言葉を使用します。':settings?'':isPractice()?'':'合言葉が未設定です。「設定」→「メール通知」で入力してください。';
  };
  $('#close-call').onclick=()=>{if(!sending)$('#call-dialog').close();};
  $('#call-dialog').addEventListener('cancel',e=>{if(sending)e.preventDefault();});
  // The existing register Settings dialog owns the passcode input.
  $('#open-settings').addEventListener('click',()=>{const settings=getSettings();$('#call-key').value='';$('#call-settings-status').textContent=settings?'合言葉は設定済みです。変更する場合は新しい合言葉を入力してください。':'合言葉がまだ設定されていません。';});
  $('#call-settings-form').onsubmit=e=>{
    e.preventDefault();try{
      if(isPractice())throw new Error('送信設定は本番モードで変更してください。');
      const settings=validateCallSettings({key:$('#call-key').value});
      localStorage.setItem(ownKey,JSON.stringify({key:settings.key}));
      $('#call-key').value='';$('#call-settings-status').textContent='この端末に合言葉を保存しました。';
    }catch(error){$('#call-settings-status').textContent=error.message;}
  };
  $('#call-form').onsubmit=async e=>{
    e.preventDefault();if(sending)return;
    const practice=isPractice();
    if(!practice&&!getSettings()){$('#call-status').textContent='合言葉が未設定です。「設定」→「メール通知」で保存してください。要件は残っています。';return;}
    sending=true;$('#call-submit').disabled=true;$('#close-call').disabled=true;$('#call-status').textContent=practice?'練習しています…':'送信中…';
    try{
      await sendStaffCall(getSettings(),$('#call-input').value,{staff:$('#call-staff').value,practice});
      $('#call-input').value='';$('#call-staff').value='';$('#call-status').textContent=practice?'呼出の練習ができました。メールは送っていません。':'送信しました。';
    }catch(error){$('#call-status').textContent=(error.name==='AbortError'?'時間内に送信結果を確認できませんでした。':error.message)+' 要件は残っています。';}
    finally{sending=false;$('#call-submit').disabled=false;$('#close-call').disabled=false;}
  };
}
