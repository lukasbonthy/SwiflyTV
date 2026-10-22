/* Download a currently resolved MP4 through the existing SwiflyTV source
   proxy. Streaming HLS/DASH URLs are not magically downloadable MP4s. */
(() => {
  'use strict';
  let toast, hideTimer;
  function announce(message) {
    if(!toast) {
      toast=document.createElement('div');
      toast.className='svDownloadToast';
      toast.setAttribute('role','status');
      toast.setAttribute('aria-live','polite');
      Object.assign(toast.style,{position:'fixed',bottom:'25px',left:'50%',transform:'translateX(-50%)',zIndex:'2147483647',
        padding:'12px 18px',maxWidth:'min(90vw,550px)',border:'1px solid #ffffff55',borderRadius:'15px',
        background:'#1b1b21f2',color:'#fff',textAlign:'center',boxShadow:'0 12px 36px #0009'});
      document.body.appendChild(toast);
    }
    toast.textContent=message;
    toast.hidden=false;
    clearTimeout(hideTimer);
    hideTimer=setTimeout(()=>{toast.hidden=true;},4200);
  }
  function mediaRequest(link) {
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin)return null;
    const match=/^\/api\/download\/(movie|tv)\/([1-9]\d{0,11})$/.exec(url.pathname);
    if(!match)return null;
    return {type:match[1],id:match[2],season:url.searchParams.get('s')||'1',
      episode:url.searchParams.get('e')||'1',fallback:url.href};
  }
  function mp4Proxy(url) {
    if(typeof url!=='string')return null;
    try {
      const parsed=new URL(url,location.href);
      if(parsed.origin!==location.origin||!/^\/api\/media-file-proxy\/[a-zA-Z0-9_-]{8,128}\/video\.mp4$/.test(parsed.pathname))return null;
      parsed.searchParams.set('download','1');
      return parsed.href;
    } catch {return null;}
  }
  function playingSource(target) {
    const root=document.querySelector('.svPlayerPage[data-player-root]');
    const playing=window.SwiflyPlayer?.getState?.();
    if(!root||!playing||String(playing.mediaId)!==target.id||playing.type!==target.type)return null;
    if(target.type==='tv'&&(String(root.dataset.playerSeason)!==target.season||
        String(root.dataset.playerEpisode)!==target.episode))return null;
    return mp4Proxy(playing.source);
  }
  async function readyAttachment(url) {
    const probe=async method=>{
      // Some verified file hosts reject HEAD even when GET succeeds.
      // A one-byte range request checks headers without buffering a movie.
      const rangeProbe=method==='GET',controller=rangeProbe?new AbortController():null;
      try {
        const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',
          ...(rangeProbe?{headers:{Range:'bytes=0-0'},signal:controller.signal}:{})});
        const disposition=response.headers?.get('Content-Disposition')||'';
        const type=String(response.headers?.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
        return response.ok&&/^attachment\b/i.test(disposition)&&(!type||type.startsWith('video/')||type==='application/octet-stream');
      } finally {
        controller?.abort();
      }
    };
    try {if(await probe('HEAD'))return true;}catch{}
    try {return await probe('GET');}catch{return false;}
  }
  async function resolveProxy(target) {
    const query=new URLSearchParams({season:target.season,episode:target.episode,wait:'3500'});
    for(let i=0;i<12;i++) {
      const url='/api/proxy-video-wait/'+target.type+'/'+target.id+'?'+query;
      const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)return null;
      const data=await response.json();
      if(data.status==='ok'||data.status==='ready') {
        const sources=[data.playbackUrl,data.proxyVideo,...(Array.isArray(data.playbackSources)
          ?data.playbackSources.map(item=>item.playbackUrl):[])];
        // Test each verified MP4: the first playback source can reject
        // downloads while a secondary source still supplies a real file.
        for(const source of sources){const proxy=mp4Proxy(source);if(proxy&&await readyAttachment(proxy))return proxy;}
        return null;
      }
      if(data.status!=='loading')return null;
    }
    return null;
  }
  function beginDownload(url) {
    // Navigating to an attachment streams bytes; never fetch an entire
    // feature-length movie as an ArrayBuffer/Blob into the browser's RAM.
    const anchor=document.createElement('a');
    anchor.href=url;anchor.setAttribute('download','');anchor.hidden=true;
    document.body.append(anchor);anchor.click();anchor.remove();
  }
  document.addEventListener('click',async event=>{
    const link=event.target.closest?.('a[data-sv-download]');
    if(!link||event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const target=mediaRequest(link);if(!target)return;
    event.preventDefault();
    if(link.dataset.downloadPending==='true')return;
    link.dataset.downloadPending='true';
    link.setAttribute('aria-busy','true');
    announce('Finding the current MP4 download…');
    try {
      let proxy=playingSource(target);
      if(proxy&&await readyAttachment(proxy)) {
        announce('Starting your MP4 download…');beginDownload(proxy);return;
      }
      // Keep operator-supplied files as a fast supported fallback.
      if(await readyAttachment(target.fallback)){
        announce('Starting your download…');beginDownload(target.fallback);return;
      }
      proxy=await resolveProxy(target);
      if(proxy){
        announce('Starting your MP4 download…');beginDownload(proxy);return;
      }
      announce('A downloadable MP4 is not currently available for this '+(link.dataset.svDownloadType||'title')+'.');
    }catch{
      announce('The download could not be started. Please try again.');
    }finally{
      delete link.dataset.downloadPending;
      link.removeAttribute('aria-busy');
    }
  });
})();
