// 9:00〜16:30の連続表示のため、表示中は画面の自動消灯を止める。
// 解除されても、画面に戻る・タップする・定期確認のいずれかで取り直す。
export function keepScreenAwake(onChange=()=>{},{wakeLock=globalThis.navigator?.wakeLock,doc=globalThis.document,retryMs=30000}={}){
  let lock=null,pending=false,status='';
  const report=next=>{if(next!==status){status=next;onChange(next);}};
  async function acquire(){
    if(!wakeLock?.request){report('unsupported');return;}
    if(lock||pending||doc.visibilityState!=='visible')return;
    pending=true;
    try{
      const current=await wakeLock.request('screen');lock=current;report('on');
      current.addEventListener?.('release',()=>{if(lock===current){lock=null;report('off');}});
    }catch{report('failed');}
    finally{pending=false;}
  }
  doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible')void acquire();});
  doc.addEventListener('pointerdown',()=>{if(!lock)void acquire();},{passive:true});
  const timer=setInterval(()=>{if(!lock)void acquire();},retryMs);
  void acquire();
  return {acquire,stop(){clearInterval(timer);const current=lock;lock=null;void current?.release?.();},get active(){return Boolean(lock);}};
}
export const AWAKE_LABELS={on:'画面の自動消灯を止めています',off:'画面の自動消灯の防止が解除されました。画面をタップすると再開します',failed:'画面の自動消灯を止められません。iPadの設定で自動ロックを「なし」にしてください',unsupported:'このブラウザは自動消灯の防止に対応していません。iPadの設定で自動ロックを「なし」にしてください'};
// 問い合わせ用の接続状況は、指定要素を短時間に5回タップしたときだけ表示する。
export function revealOnTaps(target,hidden,{count=5,windowMs=3000,now=()=>Date.now()}={}){
  let taps=[];
  target.addEventListener('click',()=>{
    const t=now();taps=[...taps.filter(x=>t-x<windowMs),t];
    if(taps.length>=count){taps=[];hidden.hidden=!hidden.hidden;if(!hidden.hidden)hidden.open=true;}
  });
}
