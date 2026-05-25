require('dotenv').config();
const express = require('express');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.API_KEY || '';

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const PROVIDERS = {
  '4khdhub': { home: '/api/4khdhub', search: '/api/4khdhub/search', details: '/api/4khdhub/details', gadget: '/api/4khdhub/gadget' },
  desiremovies: { home: '/api/desiremovies', search: '/api/desiremovies/search', details: '/api/desiremovies/details' },
  drive: { home: '/api/drive', search: '/api/drive/search', details: '/api/drive/details', mdrive: '/api/drive/mdrive' },
  netmirror: { home: '/api/netmirror', search: '/api/netmirror/search', details: '/api/netmirror/getpost', stream: '/api/netmirror/stream', eps: '/api/netmirror/eps' },
  movies4u: { home: '/api/movies4u', search: '/api/movies4u/search', details: '/api/movies4u/details', m4ulinks: '/api/movies4u/m4ulinks' },
  hdhub4u: { home: '/api/hdhub4u', search: '/api/hdhub4u/search', details: '/api/hdhub4u/details' },
  zeefliz: { home: '/api/zeefliz', search: '/api/zeefliz/search', details: '/api/zeefliz/details', nextdrive: '/api/zeefliz/nextdrive' },
  vega: { home: '/api/vega', search: '/api/vega/search', details: '/api/vega/details', nextdrive: '/api/vega/nextdrive' },
  zinkmovies: { home: '/api/zinkmovies', search: '/api/zinkmovies/search', details: '/api/zinkmovies/details', zinkcloud: '/api/zinkmovies/zinkcloud' },
  animesalt: { home: '/api/animesalt', search: '/api/animesalt/search', details: '/api/animesalt/details', stream: '/api/animesalt/stream' },
  animepahe: { home: '/api/animepahe', details: '/api/animepahe/details', stream: '/api/animepahe/stream' },
  castel: { stream: '/api/castel' },
  kmmovies: { home: '/api/kmmovies', search: '/api/kmmovies/search', details: '/api/kmmovies/details', magiclinks: '/api/kmmovies/magiclinks' },
  uhdmovies: { home: '/api/uhdmovies', search: '/api/uhdmovies/search', details: '/api/uhdmovies/details', tech: '/api/uhdmovies/tech' },
  mod: { home: '/api/mod', search: '/api/mod/search', details: '/api/mod/details', modpro: '/api/mod/modpro' },
  hubcloud: { extract: '/api/extractors/hubcloud' },
  gdflix: { extract: '/api/extractors/gdflix' }
};
const SEARCH_PROVIDERS = ['netmirror','4khdhub','movies4u','hdhub4u','zeefliz','vega','zinkmovies','animesalt','kmmovies','uhdmovies','mod','drive','desiremovies'];
const clean = v => typeof v === 'string' ? v.trim() : '';
const first = (...v) => v.map(clean).find(Boolean) || '';
const arr = v => Array.isArray(v) ? v : v ? [v] : [];
const guessYear = v => (String(v || '').match(/(?:19|20)\d{2}/) || [''])[0];
function guessType(item, fb='movie'){ const raw=String(item?.type||item?.mediaType||item?.category||'').toLowerCase(); if(raw.includes('anime'))return'anime'; if(raw.includes('tv')||raw.includes('show')||raw.includes('series'))return'tv'; return fb; }
function walk(v, cb, seen=new Set()){ if(v==null)return; if(typeof v==='object'){ if(seen.has(v))return; seen.add(v); } cb(v); if(Array.isArray(v)) v.forEach(x=>walk(x,cb,seen)); else if(typeof v==='object') Object.values(v).forEach(x=>walk(x,cb,seen)); }
function normalizeSources(input){ const out=[]; walk(input,n=>{ if(typeof n==='string'){ if(/^https?:\/\//i.test(n)) out.push({name:'source',quality:'',url:n,headers:{}}); return; } if(!n||typeof n!=='object')return; const url=first(n.url,n.src,n.file,n.link,n.href,n.stream,n.streamUrl,n.m3u8,n.playlist,n.downloadUrl); if(!/^https?:\/\//i.test(url))return; out.push({name:first(n.name,n.server,n.provider,n.label,n.source)||'source',quality:first(n.quality,n.resolution,n.size),url,headers:n.headers&&typeof n.headers==='object'?n.headers:{}}); }); return [...new Map(out.map(s=>[s.url,s])).values()]; }
function topList(json){ if(Array.isArray(json))return json; for(const k of ['data','results','items','movies','shows','anime','posts','list','latest','trending']) if(Array.isArray(json?.[k])) return json[k]; let found=[]; walk(json,n=>{ if(!found.length&&Array.isArray(n)&&n.some(x=>x&&typeof x==='object')) found=n; }); return found; }
function normalizeItem(item={}, provider='', fb='movie'){ const title=first(item.title,item.name,item.movie,item.post_title,item.label,item.original_title); return {provider,id:first(item.id,item.tmdb,item.tmdbId,item.postId,item.contentId,item.session),url:first(item.url,item.link,item.href,item.path,item.detailsUrl,item.postUrl,item.playUrl),title,year:first(item.year,item.releaseYear,guessYear(title),guessYear(item.date)),type:guessType(item,fb),poster:first(item.poster,item.image,item.thumbnail,item.cover,item.logo,item.img),backdrop:first(item.backdrop,item.banner,item.background,item.cover),overview:first(item.overview,item.description,item.plot,item.synopsis,item.content,item.excerpt),sources:normalizeSources(item.sources||item.streams||item.links||item.downloads||item.servers)}; }
function normalizeResponse(raw, provider, fb='movie'){ const root=raw?.data||raw?.result||raw; const item=normalizeItem(root&&!Array.isArray(root)?root:{},provider,fb); item.sources=normalizeSources(raw); return item; }
async function providerFetch(endpoint, params={}){ if(!API_BASE_URL||!API_KEY) throw new Error('Missing API_BASE_URL or API_KEY env vars'); if(String(endpoint).includes('/api/adult/')) throw new Error('Adult provider routes are disabled'); const url=new URL(API_BASE_URL+endpoint); Object.entries(params).forEach(([k,v])=>{ if(v!==undefined&&v!==null&&v!=='') url.searchParams.set(k,String(v)); }); const r=await fetch(url,{headers:{'x-api-key':API_KEY,'Content-Type':'application/json',Accept:'application/json'}}); const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}} if(!r.ok) throw new Error(data?.error||data?.message||`Provider HTTP ${r.status}`); return data; }
function getProvider(name){ const key=clean(name).toLowerCase(); if(!PROVIDERS[key]) throw new Error('Unsupported provider'); return [key,PROVIDERS[key]]; }

app.get('/health',(req,res)=>res.json({ok:true,providerApiConfigured:Boolean(API_BASE_URL&&API_KEY)}));
app.get('/api/providers',(req,res)=>res.json({ok:true,providers:Object.keys(PROVIDERS)}));
app.get('/api/provider/home',async(req,res)=>{try{const[provider,cfg]=getProvider(req.query.provider||'netmirror'); if(!cfg.home)return res.status(400).json({ok:false,error:'Provider has no home route'}); const data=await providerFetch(cfg.home,{page:req.query.page||1,maxPages:req.query.maxPages}); res.json({ok:true,provider,results:topList(data).map(x=>normalizeItem(x,provider,provider.includes('anime')?'anime':'movie'))});}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.get('/api/provider/search',async(req,res)=>{const q=clean(req.query.q); if(!q)return res.status(400).json({ok:false,error:'Missing q'}); const requested=clean(req.query.provider).toLowerCase(); const providers=requested?[requested]:SEARCH_PROVIDERS; const jobs=await Promise.all(providers.map(async provider=>{try{const cfg=PROVIDERS[provider]; if(!cfg?.search)return{provider,results:[]}; const data=await providerFetch(cfg.search,{q,page:req.query.page||1}); return{provider,results:topList(data).map(x=>normalizeItem(x,provider,provider.includes('anime')?'anime':'movie'))};}catch(e){return{provider,error:e.message,results:[]}}})); res.json({ok:true,q,results:jobs.flatMap(j=>j.results),errors:jobs.filter(j=>j.error)});});
app.get('/api/provider/details',async(req,res)=>{try{const[provider,cfg]=getProvider(req.query.provider); if(!cfg.details)return res.status(400).json({ok:false,error:'Provider has no details route'}); const params=provider==='netmirror'?{id:req.query.id||req.query.url,t:req.query.t}:{url:req.query.url}; const data=await providerFetch(cfg.details,params); res.json({ok:true,provider,item:normalizeResponse(data,provider,provider.includes('anime')?'anime':'movie')});}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.get('/api/provider/action',async(req,res)=>{try{const[provider,cfg]=getProvider(req.query.provider); const action=clean(req.query.action).toLowerCase(); const endpoint=cfg[action]; if(!endpoint||endpoint.includes('/api/adult/'))return res.status(400).json({ok:false,error:'Unsupported action'}); const params={...req.query}; delete params.provider; delete params.action; const data=await providerFetch(endpoint,params); res.json({ok:true,provider,action,item:normalizeResponse(data,provider,provider.includes('anime')?'anime':'movie'),raw:data});}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.get('/api/provider/embed',async(req,res)=>{try{const[provider,cfg]=getProvider(req.query.provider||'castel'); const endpoint=cfg.stream||cfg.extract||cfg.details; if(!endpoint)return res.status(400).json({ok:false,error:'Provider has no embed route'}); const params={...req.query}; delete params.provider; const data=await providerFetch(endpoint,params); const item=normalizeResponse(data,provider,provider.includes('anime')?'anime':(req.query.type||'movie')); if(provider==='animepahe') item.sources=item.sources.map(s=>({...s,headers:{Referer:'https://kwik.cx/',Origin:'https://kwik.cx',...(s.headers||{})}})); res.json({ok:item.sources.length>0,title:item.title,year:item.year,type:item.type,poster:item.poster,backdrop:item.backdrop,overview:item.overview,sources:item.sources});}catch(e){res.status(500).json({ok:false,error:e.message,sources:[]})}});
app.get('/watch-provider',(req,res)=>res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SwiflyTV Provider Player</title><script type="module" src="https://cdn.jsdelivr.net/npm/vidstack@latest/cdn/with-layouts/vidstack.js"></script><style>body{margin:0;background:#05060a;color:white;font-family:Inter,system-ui,sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(1200px,100%)}media-player{width:100%;aspect-ratio:16/9;border-radius:24px;overflow:hidden;background:#000;box-shadow:0 30px 80px #000}.msg{opacity:.8;margin:14px 4px}</style></head><body><div class="wrap"><div class="card"><media-player id="player" title="SwiflyTV" crossorigin playsinline><media-provider></media-provider><media-video-layout></media-video-layout></media-player><div id="msg" class="msg">Loading provider source...</div></div></div><script>const q=new URLSearchParams(location.search);const msg=document.getElementById('msg');fetch('/api/provider/embed?'+q.toString()).then(r=>r.json()).then(d=>{const s=(d.sources||[]).find(x=>x.url);if(!s)throw new Error(d.error||'No source found');document.getElementById('player').src={src:s.url,type:s.url.includes('.m3u8')?'application/x-mpegurl':'video/mp4'};msg.textContent=(s.name||'source')+(s.quality?' • '+s.quality:'');}).catch(e=>{msg.textContent='Could not load provider source: '+e.message;});</script></body></html>`));
app.get('/',(req,res)=>res.send('<h1>SwiflyTV</h1><p>Backend provider routes ready.</p>'));
app.listen(PORT,()=>console.log(`SwiflyTV running on ${PORT}`));
