'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../public/studio/config'),A=require('../public/clean/account-data');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const values={wallpaper:'upload',wallpaperData:png,wallpaperName:'Night.png',wallpaperColor:'#789abc'};
function storage(){const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),get length(){return m.size;},key:i=>[...m.keys()][i]??null};}
test('wallpaper data accepts bounded raster images and rejects unsafe or malformed sources',()=>{
 assert.equal(C.validate(values).wallpaperData,png);
 for(const data of ['https://example.test/image.png','data:image/svg+xml;base64,PHN2Zz4=','data:text/html;base64,AAAA','data:image/png;base64,AAAA',png+'x'.repeat(160000)])assert.equal(C.validate({...values,wallpaperData:data}).wallpaperData,'');
 const v=C.validate({wallpaperDim:0,wallpaperBlur:100,wallpaperX:-1,wallpaperY:101,wallpaperName:'a'.repeat(300)});assert.equal(v.wallpaperDim,40);assert.equal(v.wallpaperBlur,12);assert.equal(v.wallpaperX,0);assert.equal(v.wallpaperY,100);assert.equal(v.wallpaperName.length,120);
});
test('curated themes preserve the independently selected wallpaper and its framing',()=>{
 const v=C.applyTheme({...values,wallpaperX:28,wallpaperDim:74},'blossom');assert.equal(v.themeId,'blossom');assert.equal(v.wallpaperData,png);assert.equal(v.wallpaper,'upload');assert.equal(v.wallpaperX,28);assert.equal(v.wallpaperDim,74);
});
test('effective wallpaper readability and tint retain manual raw settings',()=>{
 const raw=C.validate({...values,accentColor:'#ff0000',canvasColor:'#101010',wallpaperTint:true,wallpaperBlur:9});const v=C.effective(raw,{});
 assert.equal(v.backdrop,'smooth');assert.equal(v.customColors,true);assert.notEqual(v.accentColor,raw.accentColor);assert(C.contrast(v.accentColor,v.canvasColor)>=4.5);assert.equal(raw.accentColor,'#ff0000');
 assert.equal(C.effective({...raw,wallpaperAurora:true},{}).backdrop,'aurora');assert.equal(C.effective({...raw,wallpaper:'aurora'},{}).backdrop,'aurora');assert.equal(C.effective(raw,{tv:true}).wallpaperBlur,0);
 assert.equal(C.wallpaperImage(C.effective({...raw,highContrast:true},{})),'none');assert.equal(C.wallpaperImage(C.effective({...raw,performancePreset:'minimal'},{})),'none');assert.equal(raw.wallpaperData,png);
});
test('stored active and named looks deduplicate images and hydrate them on reload',()=>{
 const s=storage(),r=C.read(s);C.write(s,{...r,values,looks:[{id:'night',name:'Night',values},{id:'copy',name:'Same image',values}]});
 const text=s.getItem(r.key);assert.equal(text.split(png).length-1,1);const loaded=C.read(s);assert.equal(loaded.values.wallpaperData,png);assert.equal(loaded.looks[1].values.wallpaperData,png);
});
test('broken asset references fail strict imports and preserve corrupted storage for recovery',()=>{
 const record={version:2,values:{wallpaper:'upload',wallpaperData:'asset:missing'},wallpaperAssets:{},looks:[]};
 assert.throws(()=>C.unpackRecord(record,{strict:true}),/wallpaper|asset/i);const s=storage();s.setItem('swiflytv.appearance',JSON.stringify(record));const raw=s.getItem('swiflytv.appearance'),r=C.read(s);assert.equal(r.values.wallpaperData,'');assert.match(r.warning,/saved|wallpaper|read/i);assert.equal(s.getItem('swiflytv.appearance'),raw);
});
test('self-contained themes carry optimized wallpapers larger than the old 32 KB limit',()=>{
 const base=Buffer.from(png.split(',')[1],'base64'),chunk=Buffer.alloc(40012);chunk.writeUInt32BE(40000);chunk.write('tEXt',4);const large='data:image/png;base64,'+Buffer.concat([base.subarray(0,-12),chunk,base.subarray(-12)]).toString('base64');
 const text=JSON.stringify(C.exportTheme({...values,wallpaperData:large},'My wallpaper'));assert(text.length>32768);assert.equal(C.parseImport(text).values.wallpaperData,large);assert.throws(()=>C.parseImport('x'.repeat(196609)),/192|smaller|large/i);
 assert.throws(()=>C.parseImport(JSON.stringify({schemaVersion:2,values:{wallpaperData:'data:image/svg+xml;base64,AAAA'}})),/Invalid|wallpaper/i);
});
test('guest fallback never shares a private uploaded wallpaper with a newly signed-in profile',()=>{
 const s=storage();C.write(s,{...C.read(s),values,looks:[{id:'private',name:'Private',values}]});s.setItem('swiflytv.accountOwner','new-account');const r=C.read(s);assert.equal(r.values.wallpaperData,'');assert.notEqual(r.values.wallpaper,'upload');assert.equal(r.looks[0].values.wallpaperData,'');
});
test('an account backup does not inherit a private guest upload through a global fallback',()=>{
 const s=storage();C.write(s,{...C.read(s),values});s.setItem('swiflytv.profiles',JSON.stringify([{id:'main',name:'Account'}]));const backup=A.capture(s,{owner:'different-account'});assert(!JSON.stringify(backup).includes(png));
});
test('account backup restores deduplicated wallpaper looks alongside the real watchlist',()=>{
 const s=storage();s.setItem('swiflytv.profiles',JSON.stringify([{id:'main',name:'Me'}]));s.setItem('movieverse.watchlist',JSON.stringify([{id:'42',type:'movie',title:'Arrival'}]));C.write(s,{...C.read(s),values,looks:[{id:'night',name:'Night',values}]});
 const backup=A.parse(JSON.stringify(A.capture(s))),patch=A.statePatch(backup),target=storage();for(const [k,v]of Object.entries(patch.local))target.setItem(k,v);assert.equal(C.read(target).values.wallpaperData,png);assert.equal(C.read(target).looks[0].values.wallpaperData,png);assert.equal(backup.profiles[0].library.watchlist[0].id,'42');assert.equal(JSON.stringify(backup).split(png).length-1,1);
});
test('a wallpaper quota failure rolls back both previous storage records',()=>{
 const s=storage(),r=C.read(s);C.write(s,r);const prior=s.getItem(r.key),device=s.getItem('swiflytv.studio.device'),set=s.setItem;let fail=true;s.setItem=(k,v)=>{if(k==='swiflytv.studio.device'&&fail){fail=false;throw Error('quota');}set(k,v);};assert.throws(()=>C.write(s,{...r,values}),/quota/);assert.equal(s.getItem(r.key),prior);assert.equal(s.getItem('swiflytv.studio.device'),device);
});

test('secondary guest backups do not inherit the primary guest wallpaper or named-look images',()=>{
 const s=storage();C.write(s,{...C.read(s),values,looks:[{id:'private',name:'Private',values}]});s.setItem('swiflytv.profiles',JSON.stringify([{id:'main',name:'Me'},{id:'other',name:'Other'}]));const b=A.capture(s);assert(JSON.stringify(b.profiles[0]).includes(png));assert(!JSON.stringify(b.profiles[1]).includes(png));
});
test('imported raster containers reject truncated headers, oversized dimensions and incomplete files',()=>{
 const bytes=Buffer.from(png.split(',')[1],'base64');const huge=Buffer.from(bytes);huge.writeUInt32BE(100000,16);huge.writeUInt32BE(100000,20);
 for(const image of [bytes.subarray(0,36),huge,bytes.subarray(0,bytes.length-8)]){const data='data:image/png;base64,'+image.toString('base64');assert.equal(C.validWallpaperData(data),false);assert.throws(()=>C.parseImport(JSON.stringify({schemaVersion:2,values:{wallpaper:'upload',wallpaperData:data}})),/wallpaper|Invalid/i);}
});
