const WAITING={amountYen:0,receivedYen:null,changeYen:null,done:false};
// 完了パケットは毎秒再送される。同じ完了表示では期限を延長しない。
export function customerBill(render,{now=Date.now,schedule=setTimeout,cancel=clearTimeout}={}){
  let latest=null,completion=null,deadline=0,timer=null;
  function clear(){if(timer!==null)cancel(timer);timer=null;}
  function refresh(){
    clear();if(!latest)return;
    if(latest.done){
      const remaining=deadline-now();
      if(remaining<=0){render({...WAITING});return;}
      timer=schedule(refresh,remaining);
    }
    render(latest);
  }
  return {
    update(bill){
      const key=bill.done?JSON.stringify([bill.amountYen,bill.receivedYen,bill.changeYen]):null;
      if(key!==completion){completion=key;deadline=key===null?0:now()+10000;}
      latest=bill;refresh();
    },
    refresh,
    stop:clear
  };
}
