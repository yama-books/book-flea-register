import {sessionId,encodeSignal,decodeSignal,SIGNAL_LIFETIME,STALE_AFTER,amountMessage,readAmount} from './signaling.js';
const ICE_SERVERS=[{urls:'stun:stun.l.google.com:19302'}];
export class AmountLink {
  constructor({role,onState=()=>{},onAmount=()=>{},onDiagnostic=()=>{},iceServers=ICE_SERVERS,heartbeatMs=1000,staleMs=STALE_AFTER}={}){
    if(!['sender','receiver'].includes(role))throw new Error('接続の役割が不正です。');
    Object.assign(this,{role,onState,onAmount,onDiagnostic,iceServers,heartbeatMs,staleMs,latest:0,sequence:0,lastSequence:0,lastSeen:0,pc:null,channel:null,state:'idle'});
  }
  diagnostic(){return `接続: ${this.pc?.connectionState||'未開始'} / 通信確認: ${this.pc?.iceConnectionState||'未開始'} / 金額用の通信: ${this.channel?.readyState||'未開始'}`;}
  setState(state){
    if(['connected','live','failed','disconnected','idle'].includes(state)){clearTimeout(this.connectTimer);clearTimeout(this.waitTimer);}
    this.onDiagnostic(this.diagnostic());if(this.state===state)return;this.state=state;this.onState(state);
  }
  setup(){
    this.close();if(!globalThis.RTCPeerConnection)throw new Error('このブラウザではお客さん用表示に接続できません。SafariまたはChromeを更新してください。');
    this.pc=new RTCPeerConnection({iceServers:this.iceServers});const pc=this.pc;
    pc.onconnectionstatechange=()=>{
      if(this.pc!==pc)return;
      this.onDiagnostic(this.diagnostic());
      if(pc.connectionState==='failed')this.setState('failed');
      if(pc.connectionState==='closed')this.setState('disconnected');
      if(pc.connectionState==='disconnected')this.setState('reconnecting');
      if(pc.connectionState==='connected'&&this.channel?.readyState==='open'&&this.state!=='live')this.setState('connected');
    };
    pc.oniceconnectionstatechange=()=>{if(this.pc===pc)this.onDiagnostic(this.diagnostic());};
    pc.ondatachannel=e=>{if(this.role==='receiver'&&e.channel.label==='book-flea-amount'&&!this.channel)this.bindChannel(e.channel);else e.channel.close();};
    this.setState('pairing');return pc;
  }
  bindChannel(channel){
    this.channel=channel;
    channel.onopen=()=>{
      if(this.channel!==channel)return;
      this.setState('connected');this.lastSeen=Date.now();
      if(this.role==='sender'){this.sendLatest();this.timer=setInterval(()=>this.sendLatest(),this.heartbeatMs);}
      else{channel.send(JSON.stringify({v:1,type:'hello'}));this.timer=setInterval(()=>{if(Date.now()-this.lastSeen>this.staleMs)this.setState('stale');},250);}
    };
    channel.onmessage=e=>{
      if(this.channel!==channel)return;
      if(this.role==='sender'){
        if(e.data==='{"v":1,"type":"hello"}')this.sendLatest();return;
      }
      const data=readAmount(e.data,this.lastSequence);if(!data)return;
      this.lastSequence=data.sequence;this.lastSeen=Date.now();this.setState('live');this.onAmount(data.amountYen);
    };
    channel.onclose=()=>{if(this.channel===channel){clearInterval(this.timer);this.setState('disconnected');}};
    channel.onerror=()=>{if(this.channel===channel)this.setState('failed');};
  }
  async gather(pc){
    if(pc.iceGatheringState==='complete')return;
    await new Promise((resolve,reject)=>{
      const finish=()=>{clearTimeout(timeout);pc.removeEventListener('icegatheringstatechange',check);pc.removeEventListener('connectionstatechange',closed);};
      const check=()=>{if(pc.iceGatheringState==='complete'){finish();resolve();}};
      const closed=()=>{if(pc.connectionState==='closed'){finish();reject(new Error('接続を終了しました。'));}};
      const timeout=setTimeout(()=>{
        finish();if(pc.localDescription?.sdp.includes('a=candidate:'))resolve();
        else reject(new Error('接続情報を作れません。同じWi-Fiに接続してやり直してください。'));
      },12000);
      pc.addEventListener('icegatheringstatechange',check);pc.addEventListener('connectionstatechange',closed);check();
    });
    if(this.pc!==pc)throw new Error('接続は作り直されています。');
  }
  async createOffer(){
    const pc=this.setup();this.session=sessionId();this.expires=Date.now()+SIGNAL_LIFETIME;
    this.bindChannel(pc.createDataChannel('book-flea-amount',{ordered:true}));
    await pc.setLocalDescription(await pc.createOffer());await this.gather(pc);
    return encodeSignal({v:1,kind:'offer',session:this.session,expires:this.expires,sdp:pc.localDescription.sdp});
  }
  async acceptOffer(input){
    const s=decodeSignal(input,'offer'),pc=this.setup();this.session=s.session;this.expires=s.expires;
    await pc.setRemoteDescription({type:'offer',sdp:s.sdp});await pc.setLocalDescription(await pc.createAnswer());await this.gather(pc);
    return encodeSignal({v:1,kind:'answer',session:this.session,expires:this.expires,sdp:pc.localDescription.sdp});
  }
  canAcceptAnswer(){return this.role==='sender'&&this.pc?.signalingState==='have-local-offer'&&Date.now()<this.expires;}
  waitForConnection(pc){
    clearTimeout(this.connectTimer);clearTimeout(this.waitTimer);
    // QR交換後もICE確認が続くことがある。時間経過だけで接続を切断扱いにしない。
    const pending=()=>this.pc===pc&&!['connected','live','failed','disconnected','idle'].includes(this.state);
    this.waitTimer=setTimeout(()=>{if(pending())this.setState('waiting');},20000);
    this.connectTimer=setTimeout(()=>{if(pending())this.setState('timeout');},60000);
  }
  async acceptAnswer(input){
    if(!this.canAcceptAnswer())throw new Error('接続の準備が失われたか、有効期限が切れました。新しいQRをお客さん端末で読み直してください。');
    const pc=this.pc,s=decodeSignal(input,'answer',this.session);await pc.setRemoteDescription({type:'answer',sdp:s.sdp});
    if(this.pc!==pc)throw new Error('接続は作り直されています。新しい返答QRを読んでください。');
    if(this.channel?.readyState!=='open'){
      this.setState(pc.connectionState==='failed'?'failed':'connecting');
      if(this.state==='connecting')this.waitForConnection(pc);
    }
  }
  publish(amountYen){amountMessage(amountYen,1);this.latest=amountYen;this.sendLatest();}
  sendLatest(){if(this.role==='sender'&&this.channel?.readyState==='open'){
    try{this.channel.send(JSON.stringify(amountMessage(this.latest,++this.sequence)));}catch{this.setState('reconnecting');}
  }}
  close(){
    clearInterval(this.timer);clearTimeout(this.connectTimer);clearTimeout(this.waitTimer);
    const pc=this.pc,channel=this.channel;this.pc=null;this.channel=null;this.lastSequence=0;this.lastSeen=0;
    if(channel){channel.onclose=null;channel.onmessage=null;try{channel.close();}catch{}}
    if(pc){pc.onconnectionstatechange=null;pc.oniceconnectionstatechange=null;try{pc.close();}catch{}}
    this.setState('idle');
  }
}
