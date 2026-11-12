let started;

function loadScript(descriptor){
  return new Promise(resolve=>{
    const script=document.createElement('script');
    for(const[name,value]of Object.entries(descriptor.attrs)){
      if(['src','async','defer'].includes(name))continue;
      script.setAttribute(name,value);
    }
    script.dataset.svController='true';script.async=false;
    if(descriptor.src||descriptor.attrs.type==='module'){
      script.onload=()=>resolve();
      script.onerror=()=>{console.error('[Swifly controller unavailable]',descriptor.src);resolve();};
      if(descriptor.src)script.src=descriptor.src;else script.textContent=descriptor.code;
    }else script.textContent=descriptor.code;
    document.head.append(script);
    if(!descriptor.src&&descriptor.attrs.type!=='module')resolve();
  });
}

const layoutScript=descriptor=>{
  const attrs=descriptor.attrs||{};
  if(attrs['data-sv-entry']==='optional')return false;
  if(!('defer'in attrs)&&attrs.type!=='module')return true;
  const path=(descriptor.src||'').split('?')[0];
  if(['/assets/clean/download.js','/assets/player/audio-sample.js'].includes(path))return false;
  return /^\/assets\/(?:clean|studio|liquid-glass|player|party|connect|discovery|study|vendor\/lenis)\//.test(path);
};

async function phase(scripts,layout){
    const pending=[];
    const originalAdd=document.addEventListener;
    const originalRemove=document.removeEventListener;
    const originalReady=Object.getOwnPropertyDescriptor(document,'readyState');
    const add=function(type,callback,options){
      if(type==='DOMContentLoaded'){
        if(!options?.signal?.aborted)pending.push({callback,options});
        return;
      }
      return originalAdd.call(this,type,callback,options);
    };
    const remove=function(type,callback,options){
      if(type==='DOMContentLoaded'){
        const capture=typeof options==='boolean'?options:!!options?.capture;
        for(const item of pending)if(item.callback===callback&&(typeof item.options==='boolean'?item.options:!!item.options?.capture)===capture)item.removed=true;
        return;
      }
      return originalRemove.call(this,type,callback,options);
    };
    document.addEventListener=add;document.removeEventListener=remove;
    if(layout)Object.defineProperty(document,'readyState',{configurable:true,get:()=> 'loading'});
    try{
      for(const descriptor of scripts)await loadScript(descriptor);
    }finally{
      document.addEventListener=originalAdd;document.removeEventListener=originalRemove;
      if(layout){if(originalReady)Object.defineProperty(document,'readyState',originalReady);else delete document.readyState;}
      const event=new Event('DOMContentLoaded');
      const tasks=[];
      const failed=error=>{console.error('[Swifly controller boot]',error);(window.__swiflyControllerErrors||=[]).push(String(error));};
      for(const item of pending){
        if(item.removed||item.options?.signal?.aborted)continue;
        try{const result=typeof item.callback==='function'?item.callback.call(document,event):item.callback?.handleEvent(event);if(result?.then)tasks.push(Promise.resolve(result).catch(failed));}
        catch(error){failed(error);}
      }
      if(layout&&tasks.length)await bounded(tasks,450);
    }
}

async function bounded(tasks,timeout){
  let timer;
  try{await Promise.race([Promise.allSettled(tasks),new Promise(resolve=>{timer=window.setTimeout(resolve,timeout);})]);}
  finally{window.clearTimeout(timer);}
}

// Keep dependency order within each phase. Optional providers and tools cannot
// postpone the visible shell or make a revealed document pretend to be parsing.
export function startControllers(scripts){
  if(started)return started;
  started=(async()=>{
      await phase(scripts.filter(layoutScript),true);
      await new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve)));
      await bounded(Array.from(document.fonts||[]).filter(font=>font.status==='loading').map(font=>font.loaded),450);
      await new Promise(resolve=>window.requestAnimationFrame(resolve));
      document.documentElement.dataset.svLayoutState='ready';
      document.dispatchEvent(new Event('swifly:layout-ready'));
      await phase(scripts.filter(descriptor=>!layoutScript(descriptor)),false);
      document.documentElement.dataset.swiflyReact='ready';
      document.dispatchEvent(new Event('swifly:react-ready'));
      window.syncWatchButtons?.();
  })();
  return started;
}
