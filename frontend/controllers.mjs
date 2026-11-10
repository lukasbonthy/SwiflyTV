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

// The original feature controllers are retained during this migration. Running
// them after hydration preserves DOM ownership and their original boot order.
// Every route uses the same React entry; no alternate app or iframe is opened.
export function startControllers(scripts){
  if(started)return started;
  started=(async()=>{
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
    Object.defineProperty(document,'readyState',{configurable:true,get:()=> 'loading'});
    try{
      for(const descriptor of scripts)await loadScript(descriptor);
    }finally{
      document.addEventListener=originalAdd;document.removeEventListener=originalRemove;
      if(originalReady)Object.defineProperty(document,'readyState',originalReady);else delete document.readyState;
      const event=new Event('DOMContentLoaded');
      for(const item of pending){
        if(item.removed||item.options?.signal?.aborted)continue;
        try{if(typeof item.callback==='function')item.callback.call(document,event);else item.callback?.handleEvent(event);}
        catch(error){console.error('[Swifly controller boot]',error);(window.__swiflyControllerErrors||=[]).push(String(error));}
      }
      document.documentElement.dataset.swiflyReact='ready';
      document.dispatchEvent(new Event('swifly:react-ready'));
      window.syncWatchButtons?.();
    }
  })();
  return started;
}
