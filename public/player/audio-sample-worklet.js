/* Runs on the audio thread, posting one small mono block about 12 times/sec. */
class SwiflyAudioSample extends AudioWorkletProcessor{
 constructor(){super();this.buffer=new Float32Array(4096);this.offset=0;}
 process(inputs){const channels=inputs[0];if(channels?.length){for(let i=0;i<channels[0].length;i++){let sample=0;for(const channel of channels)sample+=channel[i]||0;this.buffer[this.offset++]=sample/channels.length;if(this.offset===4096){this.port.postMessage(this.buffer,[this.buffer.buffer]);this.buffer=new Float32Array(4096);this.offset=0;}}}return true;}
}
registerProcessor('swifly-audio-sample',SwiflyAudioSample);
