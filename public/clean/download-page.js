
(() => {
  'use strict';
  const root=document.querySelector('[data-sv-download-options]');
  if(!root)return;
  const type=root.dataset.downloadType,id=root.dataset.downloadId;
  if(!['movie','tv'].includes(type)||!/^[1-9]\d{0,11}$/.test(id))return;
  const season=root.dataset.downloadSeason||'1',episode=root.dataset.downloadEpisode||'1';
  const choices=root.querySelector('[data-sv-download-choices]');
  const count=root.querySelector('[data-sv-download-count]');
  const refresh=root.querySelector('[data-sv-download-refresh]');
  const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></svg>';
  let current=null;
  function proxyLink(value) {
    try {
      const url=new URL(String(value||''),location.href);
      if(url.origin!==location.origin||!/^\/api\/media-file-proxy\/[a-zA-Z0-9_-]{8,128}\/video\.mp4$/.test(url.pathname))return '';
      url.searchParams.set('download','1');
      return url.href;
    }catch{return '';}
  }
  function formatSize(bytes) {
    if(!Number.isFinite(bytes)||bytes<=0)return 'Size unavailable';
    if(bytes<1048576)return Math.ceil(bytes/1024)+' KB';
    const units=bytes>=1073741824?['GB',1073741824]:['MB',1048576];
    return (bytes/units[1]).toFixed(1)+' '+units[0];
  }
  function sourceQuality(source) {
    const value=String(source?.streamQuality||'').trim();
    return /^(?:2160p|1440p|1080p|720p|480p|360p|4k|uhd|hd|sd)$/i.test(value)?value:'Original';
  }
  function state(name,title,copy) {
    choices.replaceChildren();
    const empty=document.createElement('div');empty.className='svDownloadEmpty';empty.dataset.svDownloadState=name;
    const art=document.createElement('div');art.className='svDownloadProgressIcon';art.innerHTML=icon;
    const heading=document.createElement('strong');heading.textContent=title;
    const message=document.createElement('p');message.textContent=copy;
    empty.append(art,heading,message);choices.append(empty);
  }
  async function probe(url,signal) {
    const inspect=async method=>{
      const rangeProbe=method==='GET',controller=rangeProbe?new AbortController():null;
      const abort=()=>controller?.abort();
      if(rangeProbe) {
        if(signal?.aborted)throw new DOMException('Aborted','AbortError');
        signal?.addEventListener('abort',abort,{once:true});
      }
      try {
        const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',
          ...(rangeProbe?{headers:{Range:'bytes=0-0'},signal:controller.signal}:{signal})});
        const headers=response.headers;
        if(!response.ok||!/^attachment\b/i.test(headers.get('Content-Disposition')||''))return null;
        const contentType=(headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
        if(contentType&&!contentType.startsWith('video/')&&contentType!=='application/octet-stream')return null;
        // A fallback byte-range response has Content-Length: 1; show the
        // complete size when upstream provides Content-Range instead.
        const total=rangeProbe?/\/([1-9]\d*)$/.exec(headers.get('Content-Range')||''):null;
        const bytes=Number(total?.[1]||headers.get('Content-Length'));
        return {url,size:Number.isFinite(bytes)&&bytes>0?bytes:0,contentType};
      }finally{
        controller?.abort();
        if(rangeProbe)signal?.removeEventListener('abort',abort);
      }
    };
    try {const head=await inspect('HEAD');if(head)return head;return await inspect('GET');}
    catch(error){if(error?.name==='AbortError'&&signal?.aborted)throw error;return null;}
  }
  function addCard(option,index) {
    const card=document.createElement('article');card.className='svDownloadOption';
    const badge=document.createElement('div');badge.className='svDownloadOptionBadge';badge.textContent=option.format;
    const body=document.createElement('div');body.className='svDownloadOptionBody';
    const title=document.createElement('h3');title.className='svDownloadOptionTitle';
    title.textContent=option.quality==='Original'?'Original '+option.format:option.quality+' · '+option.format;
    const meta=document.createElement('p');meta.className='svDownloadOptionMeta';
    meta.textContent=[option.provider||('Source '+(index+1)),formatSize(option.size),'Direct file'].join('  ·  ');
    body.append(title,meta);
    const action=document.createElement('a');action.className='svDownloadOptionAction';
    action.href=option.url;action.setAttribute('download','');action.textContent='↓ Download';
    action.setAttribute('aria-label','Download '+title.textContent);
    card.append(badge,body,action);choices.append(card);
  }
  function renderOptions(options) {
    choices.replaceChildren();
    choices.setAttribute('aria-busy','false');
    count.textContent=String(options.length);
    refresh.hidden=false;
    if(!options.length){
      state('empty','No downloads available','We couldn’t find a compatible downloadable file for this title right now. You can retry or watch it online.');
      return;
    }
    options.forEach(addCard);
  }
  async function discover(signal) {
    const seen=new Set(),options=[];
    const add=async (url,source={})=>{
      if(!url||seen.has(url)||options.length>=7)return;
      seen.add(url);
      const found=await probe(url,signal);
      if(!found)return;
      const format=found.contentType==='video/webm'?'WEBM':found.contentType.includes('matroska')?'MKV':'MP4';
      const provider=String(source.streamName||source.provider||'SwiflyTV').trim().slice(0,60);
      options.push({...found,format,provider,quality:sourceQuality(source)});
      count.textContent=String(options.length);
    };
    const fallback='/api/download/'+type+'/'+id+(type==='tv'?'?s='+season+'&e='+episode:'');
    await add(fallback,{streamName:'SwiflyTV file'});
    const query=new URLSearchParams({season,episode,wait:'2600'});
    for(let attempt=0;attempt<9&&!signal.aborted;attempt++){
      let result;
      try{
        const response=await fetch('/api/proxy-video-wait/'+type+'/'+id+'?'+query,{credentials:'same-origin',cache:'no-store',signal});
        if(!response.ok)break;
        result=await response.json();
      }catch(error){if(error.name==='AbortError')throw error;break;}
      if(result.status==='ready'||result.status==='ok'){
        const sourceRows=Array.isArray(result.playbackSources)?result.playbackSources:[];
        const list=[{playbackUrl:result.playbackUrl,streamQuality:result.streamQuality,streamName:result.streamName},...sourceRows];
        for(const source of list){
          const url=proxyLink(source.playbackUrl);
          if(url)await add(url,source);
        }
        break;
      }
      if(result.status!=='loading')break;
    }
    return options;
  }
  async function load() {
    current?.abort();
    const task=new AbortController();current=task;
    choices.setAttribute('aria-busy','true');
    count.textContent='—';refresh.hidden=true;
    state('loading','Checking available downloads…','Finding available files for this '+(type==='tv'?'episode':'movie')+'.');
    try {
      const options=await discover(task.signal);
      if(!task.signal.aborted)renderOptions(options);
    } catch(error) {
      if(!task.signal.aborted) {
        choices.setAttribute('aria-busy','false');count.textContent='0';refresh.hidden=false;
        state('error','Couldn’t check downloads','Please try again in a moment.');
      }
    }
  }
  refresh.addEventListener('click',load);
  window.addEventListener('pagehide',()=>current?.abort(),{once:true});
  load();
})();
