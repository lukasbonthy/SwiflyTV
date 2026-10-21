/* Only film audio is sampled. No microphone permission or idle audio processing. */
(() => {
 'use strict';const contexts=new WeakMap();
 function wav(chunks,sampleRate){const total=chunks.reduce((n,c)=>n+c.length,0),input=new Float32Array(total);let offset=0;for(const c of chunks){input.set(c,offset);offset+=c.length;}const count=Math.min(12*16000,Math.floor(total*16000/sampleRate)),buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer);const text=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++){const start=Math.floor(i*sampleRate/16000),end=Math.max(start+1,Math.floor((i+1)*sampleRate/16000));let value=0;for(let j=start;j<end&&j<input.length;j++)value+=input[j];value=Math.max(-1,Math.min(1,value/(end-start)));view.setInt16(44+i*2,value<0?value*32768:value*32767,true);}return new Blob([buffer],{type:'audio/wav'});
 }
 async function capture(video,{signal,onProgress}={}){
  if(!video||video.paused||video.ended||video.readyState<3)throw Error('Keep the movie playing while we listen.');
  const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw Error('Song identification needs a newer browser.');
  if(signal?.aborted)throw Error('Cancelled.');
  let context,input,stream,persistent=false;
  const captureStream=video.captureStream||video.mozCaptureStream;
  if(captureStream){stream=captureStream.call(video);if(!stream.getAudioTracks().length){stream.getTracks().forEach(t=>t.stop());throw Error('This source does not expose its audio for song identification.');}context=new Context();await context.resume();input=context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));}
  else{
   try{if(new URL(video.currentSrc||video.src,location.href).origin!==location.origin)throw Error();}catch{throw Error('Song identification isn’t available for this video source.');}
   let existing=contexts.get(video);if(!existing){context=new Context();await context.resume();input=context.createMediaElementSource(video);input.connect(context.destination);existing={context,input};contexts.set(video,existing);}({context,input}=existing);await context.resume();persistent=true;
  }
  let processor,gain;const chunks=[];let samples=0,finished=false;
  return new Promise(async(resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timeout);signal?.removeEventListener('abort',abort);video.removeEventListener('pause',interrupt);video.removeEventListener('seeking',interrupt);video.removeEventListener('emptied',interrupt);try{if(processor){input.disconnect(processor);processor.disconnect();if(processor.port)processor.port.onmessage=null;else processor.onaudioprocess=null;}gain?.disconnect();}catch{}stream?.getTracks().forEach(t=>t.stop());if(!persistent)context.close().catch(()=>{});};
   const finish=(e,value)=>{if(finished)return;finished=true;cleanup();e?reject(e):resolve(value);};
   const abort=()=>finish(Error('Cancelled.'));
   const interrupt=()=>finish(Error('Playback changed. Play the song and try again.'));
   const timeout=setTimeout(()=>finish(Error('The audio sample took too long. Try again while the song is playing.')),17000);
   signal?.addEventListener('abort',abort,{once:true});video.addEventListener('pause',interrupt);video.addEventListener('seeking',interrupt);video.addEventListener('emptied',interrupt);
   function chunk(value){if(finished)return;const copy=value instanceof Float32Array?value:new Float32Array(value);chunks.push(copy);samples+=copy.length;onProgress?.(Math.min(12,Math.floor(samples/context.sampleRate)));if(samples>=context.sampleRate*12)finish(null,wav(chunks,context.sampleRate));}
   try{
    if(context.audioWorklet&&window.AudioWorkletNode){await context.audioWorklet.addModule('/assets/player/audio-sample-worklet.js?v=1');if(finished)return;processor=new AudioWorkletNode(context,'swifly-audio-sample');processor.port.onmessage=e=>chunk(e.data);}
    else{processor=context.createScriptProcessor(4096,1,1);processor.onaudioprocess=e=>chunk(new Float32Array(e.inputBuffer.getChannelData(0)));}
    gain=context.createGain();gain.gain.value=0;input.connect(processor);processor.connect(gain);gain.connect(context.destination);if(signal?.aborted)abort();
   }catch(e){finish(Error('This browser could not sample the movie audio. Try another source.'));}
  });
 }
 function release(video){const entry=contexts.get(video);if(entry){try{entry.input.disconnect();entry.context.close().catch(()=>{});}catch{}contexts.delete(video);}}
 window.SwiflyAudioSample=Object.freeze({capture,release});
})();
