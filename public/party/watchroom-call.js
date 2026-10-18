/* Optional watchroom media. Movie playback and host controls stay with the parent. */
(() => {
 'use strict';
 if(window.SwiflyWatchroomCall)return;
 const mounts=new WeakMap();
 function mount(root,{socket}={}) {
  if(!root||!socket)throw Error('A call panel and party connection are required.');
  if(mounts.has(root))return mounts.get(root);
  const $=selector=>root.querySelector(selector),joinButton=$('[data-call-join]'),leaveButton=$('[data-call-leave]'),controls=$('[data-call-controls]'),status=$('[data-call-status]'),tiles=$('[data-call-tiles]'),localTile=$('[data-call-local]'),localVideo=localTile.querySelector('video'),unlock=$('[data-call-unlock]');
  const buttons={audio:$('[data-call-audio]'),video:$('[data-call-video]')},tracks={audio:null,video:null},wanted={audio:false,video:false},pending={audio:0,video:0},peers=new Map(),listeners=[];
  let pendingJoinId='',joinTimer=null,roomId='',selfId='',sessionId='',joining=false,destroyed=false,generation=0,serial=0,maxParticipants=8,iceServers=[],members=[],localStream=null;
  const supported=typeof window.RTCPeerConnection==='function'&&typeof window.MediaStream==='function';
  const active=()=>Boolean(sessionId)&&!destroyed;
  const current=(epoch,session=sessionId)=>!destroyed&&epoch===generation&&session===sessionId&&active();
  const say=text=>{status.textContent=text;};
  function update() {
   root.hidden=!roomId;joinButton.hidden=active();joinButton.disabled=!roomId||joining||!supported||socket.connected===false;joinButton.textContent=joining?'Joining call…':'Join call';leaveButton.hidden=!active()&&!joining;controls.hidden=!active();localTile.hidden=!active();
   $('[data-call-count]').textContent=members.length+' / '+maxParticipants;
   for(const kind of ['audio','video']){const on=Boolean(tracks[kind]);buttons[kind].textContent=(kind==='audio'?'Mic':'Camera')+(pending[kind]?' · Cancel':on?' on':' off');buttons[kind].setAttribute('aria-pressed',String(on));buttons[kind].setAttribute('aria-busy',String(Boolean(pending[kind])));buttons[kind].disabled=!active()||!navigator.mediaDevices?.getUserMedia;}
   localTile.classList.toggle('hasVideo',Boolean(tracks.video));$('[data-call-local-state]').textContent=(tracks.audio?'Mic on':'Mic off')+' · '+(tracks.video?'Camera on':'Camera off');
  }
  function publish(){if(active())socket.emit('watchroom:call-state',{roomId,sessionId,audio:Boolean(tracks.audio),video:Boolean(tracks.video)});}
  function livePeer(peer){return current(peer.generation,peer.ownSession)&&peers.get(peer.id)===peer&&peer.pc.signalingState!=='closed';}
  function enqueue(peer,fn) {
   peer.queue=peer.queue.then(async()=>{if(livePeer(peer))await fn();}).catch(()=>{if(livePeer(peer))say('A call connection could not update. Leave and join the call to retry.');});return peer.queue;
  }
  function send(peer,signal){if(livePeer(peer))socket.emit('watchroom:call-signal',{roomId,sessionId,to:peer.id,targetSessionId:peer.sessionId,...signal});}
  function playRemote(peer){if(!livePeer(peer))return;try{const result=peer.video.play();result?.catch(()=>{if(livePeer(peer)){peer.needsSound=true;unlock.hidden=false;say('Select Enable call sound to hear your friends.');}});}catch{peer.needsSound=true;unlock.hidden=false;}}
  function closePeer(peer){peers.delete(peer.id);peer.pc.onicecandidate=null;peer.pc.onnegotiationneeded=null;peer.pc.ontrack=null;peer.pc.onconnectionstatechange=null;peer.pc.close();peer.stream.getTracks().forEach(track=>track.stop());peer.video.pause();peer.video.srcObject=null;peer.tile.remove();unlock.hidden=![...peers.values()].some(p=>p.needsSound);}
  function createPeer(member) {
   const pc=new RTCPeerConnection({iceServers}),tile=document.createElement('article'),video=document.createElement('video'),avatar=document.createElement('div'),caption=document.createElement('p'),name=document.createElement('b'),state=document.createElement('span');
   tile.className='svCallTile';tile.dataset.callPeer=member.id;video.autoplay=true;video.playsInline=true;video.setAttribute('aria-label',String(member.name||'Guest')+' call video');avatar.className='svCallAvatar';avatar.setAttribute('aria-hidden','true');caption.append(name,state);tile.append(video,avatar,caption);tiles.append(tile);
   const peer={id:member.id,sessionId:member.sessionId,ownSession:sessionId,generation,pc,tile,video,name,state,avatar,stream:new MediaStream(),queue:Promise.resolve(),senders:{},makingOffer:false,ignoreOffer:false,settingAnswer:false,candidates:[],polite:selfId>member.id,needsSound:false};
   peers.set(member.id,peer);video.srcObject=peer.stream;
   pc.onicecandidate=event=>{if(event.candidate)send(peer,{candidate:event.candidate.toJSON?event.candidate.toJSON():event.candidate});};
   pc.onnegotiationneeded=()=>enqueue(peer,async()=>{try{if(pc.signalingState!=='stable')return;peer.makingOffer=true;await pc.setLocalDescription();if(livePeer(peer))send(peer,{description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});}finally{peer.makingOffer=false;}});
   pc.ontrack=event=>{if(!livePeer(peer)){event.track.stop();return;}peer.stream.addTrack(event.track);playRemote(peer);};
   pc.onconnectionstatechange=()=>{if(!livePeer(peer))return;if(pc.connectionState==='failed')say('A friend’s call connection failed. Leave and join the call to retry.');else if(pc.connectionState==='disconnected')say('A friend’s call connection is reconnecting…');};
   for(const kind of ['audio','video']){peer.senders[kind]=pc.addTransceiver(kind,{direction:'sendrecv',streams:[localStream]}).sender;enqueue(peer,async()=>{const track=tracks[kind];await peer.senders[kind].replaceTrack(track);if(!livePeer(peer))return;/* A queued device update supplies any newer track. */});}
   return peer;
  }
  function roster(rows) {
   members=Array.isArray(rows)?rows.filter(m=>m&&typeof m.id==='string'&&typeof m.sessionId==='string').slice(0,maxParticipants):[];
   if(active()){
    const others=members.filter(m=>m.id!==selfId);
    for(const peer of [...peers.values()])if(!others.some(m=>m.id===peer.id&&m.sessionId===peer.sessionId))closePeer(peer);
    for(const member of others){const peer=peers.get(member.id)||createPeer(member);peer.name.textContent=String(member.name||'Guest').slice(0,40);peer.avatar.textContent=String(member.name||'Guest').slice(0,1).toUpperCase();peer.state.textContent=(member.audio?'Mic on':'Mic off')+' · '+(member.video?'Camera on':'Camera off');peer.tile.classList.toggle('hasVideo',member.video===true);}
   }
   update();
  }
  function replace(kind,track){for(const peer of peers.values())enqueue(peer,async()=>{await peer.senders[kind].replaceTrack(track);});}
  function release(kind){const track=tracks[kind];tracks[kind]=null;wanted[kind]=false;pending[kind]=0;if(track){track.onended=null;track.stop();localStream?.removeTrack(track);}replace(kind,null);update();publish();}
  async function toggle(kind) {
   if(!active())return;
   if(wanted[kind]||tracks[kind]||pending[kind]){release(kind);return;}
   wanted[kind]=true;const epoch=generation,session=sessionId,request=++serial;pending[kind]=request;say('');update();
   try {
    const stream=await navigator.mediaDevices.getUserMedia(kind==='audio'?{audio:{echoCancellation:true,noiseSuppression:true},video:false}:{audio:false,video:{width:{ideal:640,max:640},height:{ideal:360,max:360},frameRate:{ideal:15,max:15}}});
    if(!current(epoch,session)||pending[kind]!==request||!wanted[kind]){stream.getTracks().forEach(track=>track.stop());return;}
    const track=stream.getTracks().find(t=>t.kind===kind);stream.getTracks().filter(t=>t!==track).forEach(t=>t.stop());if(!track)throw Error('No device was available.');
    tracks[kind]=track;pending[kind]=0;localStream.addTrack(track);localVideo.srcObject=localStream;localVideo.muted=true;localVideo.playsInline=true;
    track.onended=()=>{if(current(epoch,session)&&tracks[kind]===track){release(kind);say((kind==='audio'?'Microphone':'Camera')+' stopped. Enable it to try again.');}};
    replace(kind,track);update();publish();
   }catch(error){if(!current(epoch,session)||pending[kind]!==request)return;pending[kind]=0;wanted[kind]=false;update();say(error?.name==='NotAllowedError'?'Device permission was not allowed. Allow access in your browser, then try again.':(kind==='audio'?'Microphone':'Camera')+' is unavailable. Check your device and try again.');}
  }
  function clearCall(notify=true) {
   clearTimeout(joinTimer);joinTimer=null;pendingJoinId='';const previousSession=sessionId,previousRoom=roomId;++generation;sessionId='';selfId='';joining=false;
   for(const kind of ['audio','video']){wanted[kind]=false;pending[kind]=0;const track=tracks[kind];tracks[kind]=null;if(track){track.onended=null;track.stop();}}
   for(const peer of [...peers.values()])closePeer(peer);
   localStream=null;localVideo.pause();localVideo.srcObject=null;unlock.hidden=true;members=[];update();
   if(notify&&previousSession&&socket.connected!==false)socket.emit('watchroom:call-leave',{roomId:previousRoom,sessionId:previousSession});
  }
  function leave(){if(destroyed)return;clearCall();say('Call ended. Your microphone and camera are off.');}
  function setRoom(value){if(destroyed)return;const next=typeof value==='string'?value:'';if(next===roomId)return;clearCall();roomId=next;say(supported?'':'Calls are unavailable in this browser. Try a current browser with WebRTC support.');update();}
  function on(name,fn){socket.on(name,fn);listeners.push([name,fn]);}
  function join(){if(!roomId||joining||active()||destroyed||!supported||socket.connected===false)return;joining=true;pendingJoinId='call-'+Date.now().toString(36)+'-'+(++serial).toString(36);say('Joining the call with your microphone and camera off…');update();const epoch=generation;joinTimer=setTimeout(()=>{if(!destroyed&&epoch===generation&&joining){joining=false;pendingJoinId='';say('The call did not connect. Try joining again.');update();}},12000);socket.emit('watchroom:call-join',{roomId,requestId:pendingJoinId});}
  on('watchroom:call-joined',data=>{
   if(typeof data?.sessionId!=='string'||typeof data.selfId!=='string')return;
   if(destroyed||!joining||!roomId||data.roomId!==roomId||data.requestId!==pendingJoinId){if(data.sessionId!==sessionId&&socket.connected!==false)socket.emit('watchroom:call-leave',{roomId:data.roomId,sessionId:data.sessionId});return;}
   clearTimeout(joinTimer);joinTimer=null;pendingJoinId='';
   ++generation;sessionId=data.sessionId;selfId=data.selfId;joining=false;maxParticipants=Number.isInteger(data.maxParticipants)?Math.min(8,Math.max(1,data.maxParticipants)):8;iceServers=Array.isArray(data.iceServers)?data.iceServers:[];localStream=new MediaStream();localVideo.srcObject=localStream;localVideo.muted=true;localVideo.playsInline=true;roster(data.members);say('Listening. Your microphone and camera are off.');
  });
  on('watchroom:call-members',data=>{if(!destroyed&&roomId&&data?.roomId===roomId)roster(data.members);});
  on('watchroom:call-signal',data=>{
   if(!active()||data?.roomId!==roomId||data.targetSessionId!==sessionId)return;const peer=peers.get(data.from);if(!peer||peer.sessionId!==data.sessionId)return;
   enqueue(peer,async()=>{
    const pc=peer.pc;
    if(data.description){const description=data.description;if(!['offer','answer'].includes(description.type))return;const ready=!peer.makingOffer&&(pc.signalingState==='stable'||peer.settingAnswer),collision=description.type==='offer'&&!ready;peer.ignoreOffer=!peer.polite&&collision;if(peer.ignoreOffer){peer.candidates=[];return;}
     peer.settingAnswer=description.type==='answer';try{await pc.setRemoteDescription(description);}finally{peer.settingAnswer=false;}if(!livePeer(peer))return;
     for(const candidate of peer.candidates.splice(0)){await pc.addIceCandidate(candidate);if(!livePeer(peer))return;}
     if(description.type==='offer'){await pc.setLocalDescription();if(livePeer(peer))send(peer,{description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});}
    }else if(data.candidate&&!peer.ignoreOffer){if(!pc.remoteDescription){if(peer.candidates.length<128)peer.candidates.push(data.candidate);}else await pc.addIceCandidate(data.candidate);}
   });
  });
  on('watchroom:call-left',data=>{if(data?.roomId===roomId&&data.sessionId===sessionId){clearCall(false);say('You left the call.');}});
  on('watchroom:call-error',data=>{if(!destroyed&&data?.roomId===roomId&&(!data.requestId||data.requestId===pendingJoinId)){clearTimeout(joinTimer);joinTimer=null;pendingJoinId='';joining=false;say(String(data.message||'The call is unavailable. Try again.').slice(0,240));update();}});
  on('disconnect',()=>{if(destroyed)return;clearCall(false);say('Connection lost. Join the call again after the watchroom reconnects.');});
  const pagehide=()=>{if(!destroyed){clearCall();say('Call ended. Join again when you are ready.');}};
  const keys=event=>{if([' ','Spacebar','k','K','j','J','l','L','m','M','f','F','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))event.stopPropagation();};
  const sound=async()=>{const epoch=generation;await Promise.all([...peers.values()].map(async peer=>{try{await peer.video.play();if(livePeer(peer))peer.needsSound=false;}catch{if(livePeer(peer))peer.needsSound=true;}}));if(epoch===generation){unlock.hidden=![...peers.values()].some(p=>p.needsSound);if(unlock.hidden)say('Call sound enabled.');}};
  const audioClick=()=>toggle('audio'),videoClick=()=>toggle('video');
  joinButton.addEventListener('click',join);leaveButton.addEventListener('click',leave);buttons.audio.addEventListener('click',audioClick);buttons.video.addEventListener('click',videoClick);unlock.addEventListener('click',sound);root.addEventListener('keydown',keys);root.addEventListener('keyup',keys);window.addEventListener('pagehide',pagehide);
  function destroy(){if(destroyed)return;clearCall();destroyed=true;roomId='';listeners.forEach(([name,fn])=>socket.off(name,fn));joinButton.removeEventListener('click',join);leaveButton.removeEventListener('click',leave);buttons.audio.removeEventListener('click',audioClick);buttons.video.removeEventListener('click',videoClick);unlock.removeEventListener('click',sound);root.removeEventListener('keydown',keys);root.removeEventListener('keyup',keys);window.removeEventListener('pagehide',pagehide);mounts.delete(root);update();}
  const api=Object.freeze({setRoom,leave,destroy});mounts.set(root,api);update();return api;
 }
 window.SwiflyWatchroomCall=Object.freeze({mount});
})();
