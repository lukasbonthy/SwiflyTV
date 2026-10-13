/* SwiflyTV v186 — sample a tiny image for COLOR, never render it.
   Movie imagery itself stays fully clipped to .dsHero. Any sampling / CORS
   failure simply leaves the quiet neutral CSS fallback glow in place. */
(() => {
  'use strict';
  const hero=document.querySelector('main > .dsHero[data-sv-palette-src]');
  if(!hero || !hero.parentElement) return;
  const src=hero.getAttribute('data-sv-palette-src');
  if(!src || !/^https:\/\//i.test(src)) return;
  if(typeof HTMLCanvasElement==='undefined') return;
  const image=new Image();
  image.crossOrigin='anonymous';
  image.decoding='async';
  const pick=()=>{
    try {
      const canvas=document.createElement('canvas');
      canvas.width=36;canvas.height=24;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context) return;
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
      if(!ranked.length)return;
      const primary=ranked[0];
      const secondary=ranked.find(g=>{
        const separation=Math.abs(g.index-primary.index);
        return Math.min(separation,12-separation)>=2;
      })||ranked[1];
      const soften=group=>[group.r,group.g,group.b].map(v=>
        Math.max(35,Math.min(185,Math.round(v/group.weight*.78+24)))
      ).join(' ');
      const main=hero.parentElement;
      main.style.setProperty('--sv-art-glow-1',soften(primary));
      if(secondary)main.style.setProperty('--sv-art-glow-2',soften(secondary));
    } catch(_) {
      // TMDB/CDN may refuse cross-origin canvas pixels: never block the page.
    }
  };
  image.onload=pick;
  image.onerror=()=>{};
  image.src=src;
})();
