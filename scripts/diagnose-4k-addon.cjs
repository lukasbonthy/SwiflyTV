'use strict';
// Diagnostic only: prints aggregate counts, never provider URLs or credentials.
(async()=>{
  const target=process.env.ADDON_SMOKE_URL||'https://swiflytv-4k-modern.onrender.com/addons/quality-4k/stream/movie/tt0816692.json';
  const response=await fetch(target,{signal:AbortSignal.timeout(85000),headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('Addon responded '+response.status);
  const json=await response.json();
  const rows=Array.isArray(json.streams)?json.streams:[];
  const byProvider={},byExtension={},quality={};
  for(const row of rows){
    const provider=String(row.behaviorHints?.doomProviderId||'unspecified');
    const title=String(row.name||'');
    const q=/\\b(?:2160p|4k|uhd)\\b/i.test(title)?'4K':/\\b1080p\\b/i.test(title)?'1080p':'other';
    let ext='unknown';
    try{ext=new URL(row.url).pathname.toLowerCase().match(/\\.([a-z0-9]+)$/)?.[1]||'extensionless';}catch{}
    byProvider[provider]=(byProvider[provider]||0)+1;
    byExtension[ext]=(byExtension[ext]||0)+1;
    quality[q]=(quality[q]||0)+1;
  }
  console.log('ADDON_SMOKE_COUNTS',JSON.stringify({total:rows.length,quality,byProvider,byExtension}));
  if(!rows.length)process.exitCode=2;
})().catch(e=>{console.error('ADDON_SMOKE_ERROR',e.message);process.exitCode=1;});
