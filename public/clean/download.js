/* Download controls for operator-licensed files only. */
(() => {
  'use strict';
  let toast, hideTimer;
  function announce(message) {
    if(!toast){
      toast=document.createElement('div');
      toast.className='svDownloadToast';
      toast.setAttribute('role','status');
      toast.setAttribute('aria-live','polite');
      document.body.appendChild(toast);
    }
    toast.textContent=message;
    toast.hidden=false;
    clearTimeout(hideTimer);
    hideTimer=setTimeout(()=>{toast.hidden=true;},3500);
  }
  document.addEventListener('click',async event=>{
    const link=event.target.closest?.('a[data-sv-download]');
    if(!link||event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin||!/^\/api\/download\/(?:movie|tv)\/[1-9]\d*(?:\?|$)/.test(url.pathname+url.search))return;
    event.preventDefault();
    if(link.dataset.downloadPending==='true')return;
    link.dataset.downloadPending='true';
    link.setAttribute('aria-busy','true');
    announce('Checking the available download…');
    try {
      const response=await fetch(url.href,{method:'HEAD',credentials:'same-origin',cache:'no-store'});
      if(!response.ok) {
        announce('No downloadable file is available for this '+(link.dataset.svDownloadType||'title')+' yet.');
      } else {
        announce('Starting your download…');
        // A real attachment response streams bytes from the server instead of
        // fetching the whole movie into memory. Xbox Edge may restrict saving.
        const a=document.createElement('a');a.href=url.href;
        a.download='';
        a.hidden=true;document.body.appendChild(a);a.click();a.remove();
      }
    } catch {
      announce('The download could not be checked. Please try again.');
    } finally {
      delete link.dataset.downloadPending;
      link.removeAttribute('aria-busy');
    }
  });
})();
