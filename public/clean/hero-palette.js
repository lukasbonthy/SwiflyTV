/* Opt-in artwork colors. One tiny readback per cached image; never sample video. */
(() => {
  'use strict';
  if (window.SwiflyHeroPalette) return;
  const cache=new Map(),maximum=96;
  function address(value) {
    if(typeof value!=='string'||value.length>2048)return '';
    try{const url=new URL(value,location.href);if(url.username||url.password||!(url.protocol==='https:'||url.protocol==='http:'&&url.origin===location.origin))return '';url.hash='';return url.href;}catch(_){return '';}
  }
  function colors(image) {
      const canvas=document.createElement('canvas');
      canvas.width=36;canvas.height=24;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context) return null;
      context.drawImage(image,0,0,canvas.width,canvas.height);
      const data=context.getImageData(0,0,canvas.width,canvas.height).data;
      const groups=Array.from({length:12},()=>({weight:0,r:0,g:0,b:0}));
      for(let i=0;i<data.length;i+=8) {
        const r=data[i],g=data[i+1],b=data[i+2];
        const max=Math.max(r,g,b),min=Math.min(r,g,b);
        const delta=max-min,brightness=max/255,saturation=max?delta/max:0;
        if(saturation<.20 || brightness<.25 || delta<22)continue;
        let hue;
        if(delta===0)hue=0;
        else if(max===r)hue=60*((g-b)/delta+(g<b?6:0));
        else if(max===g)hue=60*((b-r)/delta+2);
        else hue=60*((r-g)/delta+4);
        const index=Math.floor(hue/30)%12;
        const weight=(.2+saturation*saturation)*(0.4+brightness);
        const group=groups[index];
        group.weight+=weight;group.r+=r*weight;group.g+=g*weight;group.b+=b*weight;
      }
      const ranked=groups.map((g,i)=>({...g,index:i})).filter(g=>g.weight>1.4)
        .sort((a,b)=>b.weight-a.weight);
      if(!ranked.length)return null;
      const primary=ranked[0];
      const secondary=ranked.find(g=>{
        const separation=Math.abs(g.index-primary.index);
        return Math.min(separation,12-separation)>=2;
      })||ranked[1]||primary;
      // Retain chroma, rather than washing every sampled hue into a gray/
      // brown average. Only these three channel values reach CSS gradients;
      // the movie bitmap is never copied beneath the catalog.
      const soften=group=>{
        const channels=[group.r,group.g,group.b].map(v=>v/group.weight);
        const average=(channels[0]+channels[1]+channels[2])/3;
        return channels.map(value=>
          Math.max(26,Math.min(225,Math.round(average*.94+(value-average)*1.22+9)))
        ).join(' ');
      };
      return Object.freeze({primary:soften(primary),secondary:soften(secondary)});
  }
  function sample(value) {
    const src=address(value);
    if(!src||typeof Image!=='function'||typeof HTMLCanvasElement==='undefined')return Promise.resolve(null);
    if(cache.has(src)){const result=cache.get(src);cache.delete(src);cache.set(src,result);return result;}
    const result=new Promise(resolve=>{
      const image=new Image();let settled=false,timer;
      function finish(palette){if(settled)return;settled=true;clearTimeout(timer);image.onload=null;image.onerror=null;resolve(palette);}
      image.crossOrigin='anonymous';image.decoding='async';
      image.onload=()=>{try{finish(colors(image));}catch(_){finish(null);}};
      image.onerror=()=>finish(null);timer=setTimeout(()=>finish(null),6000);
      try{image.src=src;}catch(_){finish(null);}
    });
    cache.set(src,result);if(cache.size>maximum)cache.delete(cache.keys().next().value);
    return result;
  }
  window.SwiflyHeroPalette=Object.freeze({sample});
})();
