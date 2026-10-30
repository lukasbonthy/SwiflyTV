/* Local raster uploads: bounded decode, metadata-free encoding, no network upload. */
(() => {
 'use strict';
 const C=window.SwiflyStudioConfig;if(!C||window.SwiflyWallpapers)return;
 const MAX_FILE=8*1024*1024;
 const dimensionsError=()=>Error('Choose an image up to 8192 pixels per side and 32 megapixels.');
 function checkDimensions(width,height){if(!width||!height||width>8192||height>8192||width*height>32000000)throw dimensionsError();}
 function headerDimensions(b,type){
  const be=(i,n)=>{let v=0;for(let k=0;k<n;k++)v=v*256+b[i+k];return v;},le=(i,n)=>{let v=0;for(let k=n-1;k>=0;k--)v=v*256+b[i+k];return v;};
  if(type==='image/png'&&b.length>=24)return[be(16,4),be(20,4)];
  if(type==='image/webp'&&b.length>=30){const chunk=String.fromCharCode(...b.slice(12,16));if(chunk==='VP8X')return[le(24,3)+1,le(27,3)+1];if(chunk==='VP8 ')return[le(26,2)&16383,le(28,2)&16383];if(chunk==='VP8L')return[1+(b[21]|(b[22]&63)<<8),1+((b[22]>>6)|(b[23]<<2)|(b[24]&15)<<10)];}
  if(type==='image/jpeg'){let i=2;while(i+9<b.length){if(b[i]!==255)break;while(b[i]===255)i++;const marker=b[i++];if(marker===217||marker===218)break;const size=be(i,2);if(size<2||i+size>b.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return[be(i+5,2),be(i+3,2)];i+=size;}}
  return null;
 }
 const read=(file,method)=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('This image could not be read.'));r[method](file);});
 async function prepareUpload(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPG or WebP image.');
  if(file.size>MAX_FILE)throw Error('Choose an image smaller than 8 MB.');
  const bytes=new Uint8Array(await (file.arrayBuffer?.()||read(file,'readAsArrayBuffer'))),ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
  const signature=file.type==='image/png'?ascii(0,8)==='\x89PNG\r\n\x1a\n':file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
  if(!signature)throw Error('This file is not a valid '+file.type.slice(6).toUpperCase()+' image.');
  const size=headerDimensions(bytes,file.type);if(size)checkDimensions(...size);
  let image,url;
  try{
   if(typeof createImageBitmap==='function')image=await createImageBitmap(file);
   else {url=URL.createObjectURL(file);image=await new Promise((resolve,reject)=>{const n=new Image();n.onload=()=>resolve(n);n.onerror=()=>reject(Error('This image could not be decoded.'));n.src=url;});}
   const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
   checkDimensions(width,height);
   const sample=document.createElement('canvas');sample.width=sample.height=12;const sc=sample.getContext('2d',{willReadFrequently:true});sc.fillStyle='#10131b';sc.fillRect(0,0,12,12);sc.drawImage(image,0,0,12,12);const pixels=sc.getImageData(0,0,12,12).data,sums=[0,0,0];for(let i=0;i<pixels.length;i+=4)for(let c=0;c<3;c++)sums[c]+=pixels[i+c];const color='#'+sums.map(n=>Math.round(n/144).toString(16).padStart(2,'0')).join('');
   const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
   for(const bound of [1920,1600,1280,960,720]){
    const scale=Math.min(1,bound/width,(bound*.75)/height);canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));ctx.fillStyle='#10131b';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.82,.68,.54,.42]){
     let data=canvas.toDataURL('image/webp',quality);if(!data.startsWith('data:image/webp;'))data=canvas.toDataURL('image/jpeg',quality);
     if(data.length<=C.MAX_WALLPAPER_CHARS&&C.validWallpaperData(data))return{data,name:String(file.name||'My wallpaper').replace(/[\u0000-\u001f]/g,'').slice(0,120),color,width:canvas.width,height:canvas.height};
    }
   }
   throw Error('This image could not fit the wallpaper size limit. Try a simpler picture.');
  }catch(error){throw Error(error.message||'This image could not be decoded.');}
  finally {image?.close?.();if(url)URL.revokeObjectURL(url);}
 }
 async function verifyImages(images){
  for(const data of new Set(images.filter(Boolean))){
   if(!C.validWallpaperData(data))throw Error('This wallpaper image is invalid or exceeds the image limits.');
   const image=new Image();try{image.src=data;if(image.decode)await image.decode();else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});checkDimensions(image.naturalWidth||image.width,image.naturalHeight||image.height);}catch{throw Error('This wallpaper image could not be decoded. Choose another image.');}finally{image.removeAttribute('src');}
  }
 }
 function apply(values){const raw=C.validate(values);document.body.style.setProperty('--st-upload-image',C.wallpaperImage({...raw,wallpaper:'upload',highContrast:false,performancePreset:'desktop'}));}
 window.SwiflyWallpapers=Object.freeze({prepareUpload,verifyImages,image:C.wallpaperImage,apply});
 document.addEventListener('swifly:studio-change',e=>apply(e.detail.values));
 try{if(document.body)apply(C.read(localStorage).values);}catch{}
})();
