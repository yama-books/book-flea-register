import {sessionId,encodeSignal,decodeSignal,SIGNAL_LIFETIME,STALE_AFTER,amountMessage,readAmount} from './signaling.js';
const ICE_SERVERS=[{urls:'stun:stun.l.google.com:19302'}];
export class AmountLink {
  constructor({role,onState=()=>{},onAmount=()=>{},iceServers=ICE_SERVERS,heartbeatMs=1000,staleMs=STALE_AFTER}={}){
    if(!['sender','receiver'].includes(role))throw new Error('接続の役割が不正です。');
    Object.assign(this,{role,onState,onAmount,iceServers,heartbeatMs,staleMs,latest:0,sequence:0,lastSequence:0,lastSeen:0,pc:null,channel:null,state:'idle'});
  }
  setState(state){if(this.state===state)return;this.state=state;this.onState(state);}
  setup(){
    this.close();if(!globalThis.RTCPeerConnection)throw new Error('このブラウザではお客さん用表示に接続できません。SafariまたはChromeを更新してください。');
    this.pc=new RTCPeerConnection({iceServers:this.iceServers});const pc=this.pc;
    pc.onconnectionstatechange=()=>{
      if(this.pc!==pc)return;
      if(['failed','closed','disconnected'].includes(pc.connectionState))this.setState('disconnected');
      if(pc.connectionState==='connected'&&this.channel?.readyState==='open'&&this.state!=='live')this.setState('connected');
    };
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
    channel.onerror=()=>{if(this.channel===channel)this.setState('disconnected');};
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
  async acceptAnswer(input){
    if(!this.canAcceptAnswer())throw new Error('接続の準備が失われたか、有効期限が切れました。新しいQRをお客さん端末で読み直してください。');
    const s=decodeSignal(input,'answer',this.session);await this.pc.setRemoteDescription({type:'answer',sdp:s.sdp});if(this.channel?.readyState!=='open')this.setState('connecting');
    this.connectTimer=setTimeout(()=>{if(!['connected','live'].includes(this.state))this.setState('disconnected');},20000);
  }
  publish(amountYen){amountMessage(amountYen,1);this.latest=amountYen;this.sendLatest();}
  sendLatest(){if(this.role==='sender'&&this.channel?.readyState==='open'){
    try{this.channel.send(JSON.stringify(amountMessage(this.latest,++this.sequence)));}catch{this.setState('disconnected');}
  }}
  close(){
    clearInterval(this.timer);clearTimeout(this.connectTimer);
    const pc=this.pc,channel=this.channel;this.pc=null;this.channel=null;this.lastSequence=0;this.lastSeen=0;
    if(channel){channel.onclose=null;channel.onmessage=null;try{channel.close();}catch{}}
    if(pc){pc.onconnectionstatechange=null;try{pc.close();}catch{}}
    this.setState('idle');
  }
}
