/* Validated, portable Studio values. No identity or private library data exports. */
(() => {
 'use strict';
 const home=['continue','upcoming','recommended','trending-movies','trending-tv','popular-movies','popular-tv','top-movies','top-tv','new-releases'];
 const nav=['home','movies','tv','discover','list','study'];
 const defaults={theme:'default',font:'default',layout:'default',cardstyle:'rounded',density:'comfy',backdrop:'aurora',auroraColor:'glacier',auroraStrength:80,auroraMotion:'drift',glass:'liquid',smooth:true,reduceMotion:false,
  customColors:false,accentColor:'#c8c3ef',accentSecondary:'#84bdb4',canvasColor:'#090b0f',gradientAngle:135,gradientStrength:8,glassOpacity:55,glassBlur:18,glassEdge:40,glassGlow:10,
  homeOrder:home,homeHidden:[],heroMode:'cinematic',heroPosition:'first',posterWidth:180,homeColumns:6,rowShape:'rail',navOrder:nav,navLayout:'top',navLabels:true,navIcons:'line',navDensity:'comfortable',navActive:'pill',
  playerStyle:'cinema',playerProgress:3,playerTime:true,playerIconScale:100,playerOpacity:85,playerPosition:'floating',playerAutoHide:2600,captionSize:100,captionColor:'#ffffff',captionBg:65,captionEdge:'shadow',playerBackdrop:'dark',adaptiveCinema:false,adaptiveStrength:35,
  hudPosition:'right',hudWidth:360,hudDensity:'comfortable',hudTransparency:85,hudIcons:'line',hudMotion:'subtle',notificationPreview:'expanded',toastPosition:'bottom',aiSpacing:'comfortable',aiWidth:720,aiCards:'list',aiGlass:'inherit',aiOptions:false,
  loaderStyle:'cinematic',transitionSpeed:220,loaderDim:90,pageMotion:true,posterHover:'lift',posterActions:'auto',focusStyle:'ring',uiScale:100,highContrast:false,reduceTransparency:false,largeTargets:false,
  performancePreset:'auto',tvScale:110,tvControls:'standard'};
 const enums={theme:['default','red','blue','green','mono'],font:['default','cinema','soft','wide'],layout:['default','cinema','posterwall'],cardstyle:['rounded','sharp','softglass'],density:['comfy','compact'],backdrop:['aurora','smooth','grain'],auroraColor:['glacier','violet','rose','mint'],auroraMotion:['drift','slow','still'],glass:['off','subtle','liquid'],heroMode:['cinematic','compact','banner'],heroPosition:['first','after-first'],rowShape:['rail','grid'],navLayout:['top','sidebar'],navIcons:['line','filled','minimal'],navDensity:['comfortable','compact'],navActive:['pill','underline','accent'],playerStyle:['cinema','minimal','classic'],playerPosition:['floating','bottom'],playerAutoHide:[1800,2600,4000,6000],captionEdge:['shadow','outline','none'],playerBackdrop:['dark','artwork','ambient'],hudPosition:['right','left'],hudDensity:['comfortable','compact'],hudIcons:['line','solid'],hudMotion:['subtle','none'],notificationPreview:['expanded','compact'],toastPosition:['bottom','top'],aiSpacing:['comfortable','compact'],aiCards:['list','grid'],aiGlass:['inherit','solid','soft'],loaderStyle:['cinematic','minimal','artwork','aurora','basic'],posterHover:['lift','zoom','reveal','flat'],posterActions:['auto','always'],focusStyle:['ring','frame'],performancePreset:['auto','desktop','mobile','xbox','minimal'],tvControls:['standard','large']};
 const ranges={auroraStrength:[0,100],gradientAngle:[0,360],gradientStrength:[0,30],glassOpacity:[15,95],glassBlur:[0,28],glassEdge:[0,100],glassGlow:[0,30],posterWidth:[120,260],homeColumns:[3,8],playerProgress:[2,7],playerIconScale:[85,125],playerOpacity:[60,100],captionSize:[75,200],captionBg:[0,100],adaptiveStrength:[0,65],hudWidth:[280,480],hudTransparency:[65,100],aiWidth:[560,880],transitionSpeed:[100,400],loaderDim:[70,98],uiScale:[90,120],tvScale:[100,130]};
 const colors=['accentColor','accentSecondary','canvasColor','captionColor'],deviceFields=['performancePreset','tvScale','tvControls'];
 const clone=v=>JSON.parse(JSON.stringify(v));
 const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const hex=v=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v)?v.toLowerCase():typeof v==='string'&&/^#[\da-f]{3}$/i.test(v)?'#'+[...v.slice(1)].map(c=>c+c).join('').toLowerCase():null;
 function validate(input){
  const result=clone(defaults);if(!plain(input))return result;
  for(const name of Object.keys(defaults)){
   const value=input[name];
   if(enums[name]?.includes(value))result[name]=value;
   else if(ranges[name]&&typeof value==='number'&&Number.isFinite(value))result[name]=Math.round(Math.max(ranges[name][0],Math.min(ranges[name][1],value)));
   else if(typeof defaults[name]==='boolean'&&typeof value==='boolean')result[name]=value;
   else if(colors.includes(name)&&hex(value))result[name]=hex(value);
  }
  for(const [name,keys]of [['homeOrder',home],['navOrder',nav]])if(Array.isArray(input[name]))result[name]=[...new Set([...input[name].filter(v=>keys.includes(v)),...keys])];
  if(Array.isArray(input.homeHidden))result.homeHidden=[...new Set(input.homeHidden.filter(v=>home.includes(v)))];
  if(home.filter(k=>k!=='continue').every(k=>result.homeHidden.includes(k)))result.homeHidden=result.homeHidden.filter(k=>k!=='trending-movies');
  return result;
 }
 const get=(s,key)=>{try{return s.getItem(key);}catch{return null;}};
 const json=(s,key)=>{try{return JSON.parse(get(s,key)||'null');}catch{return null;}};
 function ownerKey(storage,user){
  const profile=json(storage,'swiflytv.activeProfile'),session=json(storage,'swiflytv.session');
  const id=String(user===undefined?(get(storage,'swiflytv.accountOwner')||session?.id||session?.email||''):(user?.id||user?.email||'')).slice(0,128);
  const profileId=String(profile?.id||'main').slice(0,80);
  return(id?'account:'+encodeURIComponent(id):'guest')+(profileId==='main'&&!id?'':':profile:'+encodeURIComponent(profileId));
 }
 const storageKey=owner=>owner==='guest'?'swiflytv.appearance':'swiflytv.appearance.v2.'+owner;
 function legacy(storage){
  const v={};for(const name of Object.keys(enums))v[name]=get(storage,'movieverse.'+name);
  v.reduceMotion=get(storage,'movieverse.reduceMotion')==='on';
  if(v.layout==='dense'){v.layout='default';v.density='compact';}if(v.layout==='spotlight')v.layout='cinema';if(v.cardstyle==='float')v.cardstyle='softglass';if(get(storage,'movieverse.effect')==='off')v.glass='off';
  return validate(v);
 }
 function looks(values){return(Array.isArray(values)?values:[]).slice(0,12).filter(v=>plain(v)&&typeof v.id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v.id)&&typeof v.name==='string').map(v=>({id:v.id,name:v.name.trim().slice(0,64)||'Untitled look',description:typeof v.description==='string'?v.description.slice(0,160):'',values:portable(validate(v.values))}));}
 function read(storage,user){
  const owner=ownerKey(storage,user),key=storageKey(owner),own=json(storage,key),global=json(storage,'swiflytv.appearance'),record=own||(key!=='swiflytv.appearance'?global:null),device=json(storage,'swiflytv.studio.device');
  const valid=record&&(record.version===1||record.version===2||record.schemaVersion===2);
  let values=valid?validate(record.values):record?clone(defaults):legacy(storage);
  const d=validate(device?.values);for(const k of deviceFields)values[k]=d[k];
  return{owner,key,values,looks:valid?looks(record.looks):[],warning:record&&!valid?'The saved theme could not be read. Defaults are previewed until you save.':''};
 }
 function portable(value){const result={};for(const key of Object.keys(defaults))if(!deviceFields.includes(key))result[key]=clone(value[key]);return result;}
 function write(storage,record){
  const values=validate(record.values),keys=[record.key,'swiflytv.studio.device'],previous=keys.map(k=>get(storage,k));
  try{
   storage.setItem(keys[0],JSON.stringify({version:2,values:portable(values),looks:looks(record.looks)}));
   storage.setItem(keys[1],JSON.stringify({version:1,values:Object.fromEntries(deviceFields.map(k=>[k,values[k]]))}));
  }catch(error){for(let i=0;i<keys.length;i++){try{if(previous[i]===null)storage.removeItem(keys[i]);else storage.setItem(keys[i],previous[i]);}catch{}}throw error;}
 }
 function bytes(text){let n=0;for(const c of text){const v=c.codePointAt(0);n+=v<=127?1:v<=2047?2:v<=65535?3:4;}return n;}
 function exportTheme(values,name='My Swifly look',description=''){return{app:'SwiflyTV Studio',schemaVersion:2,name:String(name).trim().slice(0,64)||'My Swifly look',description:String(description).slice(0,160),values:portable(validate(values))};}
 function parseImport(text){
  if(typeof text!=='string'||bytes(text)>32768)throw Error('Theme files must be smaller than 32 KB.');
  let data;try{data=JSON.parse(text);}catch{throw Error('This is not valid theme JSON.');}
  if(!plain(data)||!plain(data.values))throw Error('Choose a Swifly Studio theme with a values object.');
  const version=data.schemaVersion??data.version;if(version!==1&&version!==2)throw Error('This theme version is unsupported. Update SwiflyTV or export a version 2 theme.');
  const allowed=['app','schemaVersion','version','name','description','values'];if(Object.keys(data).some(k=>!allowed.includes(k)))throw Error('This theme contains unsupported fields.');
  if(data.name!==undefined&&(typeof data.name!=='string'||data.name.length>64)||data.description!==undefined&&(typeof data.description!=='string'||data.description.length>160))throw Error('Theme names are limited to 64 characters and descriptions to 160.');
  for(const [key,value]of Object.entries(data.values)){
   if(!Object.prototype.hasOwnProperty.call(defaults,key)||deviceFields.includes(key))throw Error('Unsupported theme setting: '+key);
   if(enums[key]&&!enums[key].includes(value)||ranges[key]&&(!Number.isInteger(value)||value<ranges[key][0]||value>ranges[key][1])||colors.includes(key)&&!hex(value)||typeof defaults[key]==='boolean'&&typeof value!=='boolean')throw Error('Invalid value for '+key+'.');
   const allowedArray=key==='homeOrder'||key==='homeHidden'?home:key==='navOrder'?nav:null;
   if(allowedArray&&(!Array.isArray(value)||value.some(v=>!allowedArray.includes(v))||new Set(value).size!==value.length))throw Error('Invalid order or visibility list.');
  }
  return{name:typeof data.name==='string'?data.name.trim()||'Imported look':'Imported look',description:data.description||'',values:validate(data.values)};
 }
 function contrast(a,b){const lum=color=>{const v=hex(color)||'#000000',channels=[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
 function effective(values,context={}){
  const v=validate(values),preset=v.performancePreset==='auto'?(context.tv?'xbox':context.mobile?'mobile':'desktop'):v.performancePreset;
  v.performancePreset=preset;v.reduceMotion=v.reduceMotion||!!context.reducedMotion||preset==='xbox'||preset==='minimal';v.reduceTransparency=v.reduceTransparency||!!context.reducedTransparency||preset==='xbox'||preset==='minimal';
  if(v.reduceTransparency)v.glass='off';else if(preset==='mobile'&&v.glass==='liquid')v.glass='subtle';
  if(preset==='mobile')v.glassBlur=Math.min(12,v.glassBlur);
  if(v.reduceMotion){v.auroraMotion='still';v.posterHover='flat';v.hudMotion='none';v.pageMotion=false;}
  if(preset==='minimal'){v.backdrop='smooth';v.glassGlow=0;}if(v.highContrast){v.customColors=true;v.canvasColor='#000000';v.accentColor='#ffffff';v.accentSecondary='#ffffff';}
  return v;
 }
 const accents={default:'#ece9e2',red:'#e7baa3',blue:'#a9c7ed',green:'#b4cbb8',mono:'#c1c1c7',purple:'#c8b1ff',orange:'#ffc18c',pink:'#f5b5d1',cyan:'#9ae1e9'};
 for(const color of ['purple','orange','pink','cyan'])if(!enums.theme.includes(color))enums.theme.push(color);
 const canvases={default:'#000000',red:'#080605',blue:'#05080d',green:'#050907',mono:'#09090b',purple:'#090610',orange:'#0d0805',pink:'#0e070b',cyan:'#050c0e'};
 const fonts={default:'"Host Grotesk",system-ui,sans-serif',cinema:'"Space Grotesk","Host Grotesk",sans-serif',soft:'"Outfit","Host Grotesk",sans-serif',wide:'"Host Grotesk",system-ui,sans-serif'};
 const hues={glacier:0,violet:95,rose:205,mint:310},washes={glacier:['#57a9b71a','#7e75b51c'],violet:['#7966c41e','#5d6dab1c'],rose:['#a470971b','#8468a51b'],mint:['#65aa8e1d','#6b98a71c']};
 function context(){
  const w=typeof window!=='undefined'?window:null,d=typeof document!=='undefined'?document:null,match=q=>{try{return !!w?.matchMedia(q).matches;}catch{return false;}};
  return{tv:d?.documentElement.dataset.svTv==='true'||d?.documentElement.dataset.svXbox==='true',mobile:match('(max-width: 767px)')||match('(pointer: coarse)'),reducedMotion:match('(prefers-reduced-motion: reduce)'),reducedTransparency:match('(prefers-reduced-transparency: reduce)')};
 }
 function hue(color){const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;if(!d)return 0;const n=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;return(n*60+360)%360;}
 function apply(values,environment=context(),root=typeof document!=='undefined'?document.body:null){
  const v=effective(values,environment);if(!root)return v;
  for(const [name,value]of Object.entries(v))if(!Array.isArray(value)&&name!=='auroraStrength')root.dataset['st'+name[0].toUpperCase()+name.slice(1)]=String(value);
  root.dataset.svAppearance='v155';root.dataset.svScroll=v.smooth?'smooth':'native';
  root.classList.toggle('reduceMotion',v.reduceMotion);
  const old=['effect-clean','effect-cinematic','effect-dropcart','effect-neon','effect-glow','effect-glass','effect-calm','effect-ultra','effect-off','detail-clean','detail-balanced','detail-max','layout-dense','layout-spotlight','cardstyle-float','backdrop-grid'];
  for(const name of ['theme','font','layout','cardstyle','density','backdrop']){for(const item of enums[name])old.push(name+'-'+item);}
  root.classList.remove(...old);root.classList.add('effect-clean','detail-balanced');
  for(const name of ['theme','font','layout','cardstyle','density','backdrop'])root.classList.add(name+'-'+v[name]);
  const accent=v.customColors?v.accentColor:accents[v.theme],linked=v.customColors||!['default','mono'].includes(v.theme);root.dataset.stAccentAurora=String(linked);
  const tokens={'--st-accent-hue':linked?(Math.round(hue(accent))-175)+'deg':'0deg','--sv-aurora-strength':v.auroraStrength/100,'--sv-aurora-hue':hues[v.auroraColor]+'deg','--sv-aurora-wash-a':linked?accent+'1a':washes[v.auroraColor][0],'--sv-aurora-wash-b':linked?(v.customColors?v.accentSecondary:accent)+'1c':washes[v.auroraColor][1],'--sv-aurora-speed':v.auroraMotion==='slow'?'55s':'32s',
   '--st-accent':v.customColors?v.accentColor:accents[v.theme],'--st-accent-secondary':v.customColors?v.accentSecondary:accents[v.theme],'--st-canvas':v.customColors?v.canvasColor:canvases[v.theme],'--st-font':fonts[v.font],'--st-display-font':v.font==='wide'?'"Unbounded","Host Grotesk",sans-serif':fonts[v.font],
   '--st-radius':{sharp:'3px',rounded:'10px',softglass:'20px'}[v.cardstyle],'--st-gap':v.density==='compact'?'10px':'16px','--sv-poster-width':v.posterWidth!==defaults.posterWidth?v.posterWidth+'px':v.layout==='cinema'?'clamp(168px,18vw,250px)':v.density==='compact'?'clamp(126px,12vw,174px)':'clamp(150px,14vw,210px)',
   '--st-gradient-angle':v.gradientAngle+'deg','--st-gradient-strength':v.gradientStrength/100,'--st-glass-opacity':v.glassOpacity/100,'--st-glass-blur':v.glassBlur+'px','--st-glass-edge':v.glassEdge/100,'--st-glass-glow':v.glassGlow/100,'--st-ui-scale':v.uiScale/100,'--st-focus-width':v.focusStyle==='frame'?'4px':'2px','--st-hit-target':v.largeTargets?'44px':'36px'};
  for(const [key,value]of Object.entries(tokens))root.style.setProperty(key,String(value));
  if(typeof window!=='undefined'){window.SwiflyAppearance=clone(v);if(!v.smooth||v.reduceMotion)window.SwiflyMotion?.stop?.();window.SwiflyAurora?.refresh?.();}
  return v;
 }
 const api={defaults,enums,ranges,colors,deviceFields,clone,validate,ownerKey,storageKey,read,write,portable,exportTheme,parseImport,contrast,effective,context,apply,accents};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.SwiflyStudioConfig=Object.freeze(api);
})();
