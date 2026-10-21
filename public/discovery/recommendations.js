/* No model/network work until a person asks for picks. */
(() => {
 'use strict';const root=document.querySelector('[data-recommendations]');if(!root)return;
 const form=root.querySelector('[data-recommendation-form]'),output=root.querySelector('[data-ai-status]'),results=root.querySelector('[data-ai-results]'),cancel=root.querySelector('[data-ai-cancel]');
 let worker=null,epoch=0,controller=null,deadline=0,rejectWorker=null,busy=false,disposed=false;
 const list=k=>{try{const rows=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(rows)?rows.filter(m=>m&&['movie','tv'].includes(m.type)&&/^\d+$/.test(String(m.id))):[];}catch{return [];}};
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function setBusy(value){busy=value;form.querySelector('[type=submit]').disabled=value;cancel.hidden=!value;form.setAttribute('aria-busy',String(value));}
 function stop(message='Request cancelled. Your next idea is welcome.'){epoch++;controller?.abort();worker?.terminate();worker=null;clearTimeout(deadline);rejectWorker?.(Error('cancelled'));rejectWorker=null;setBusy(false);output.textContent=message;}
 function paint(rows,ai){results.replaceChildren();for(const m of rows){const card=node('article','svDiscoveryCard'),a=node('a','svDiscoveryPoster');a.href=m.href;a.setAttribute('aria-label',m.title);if(m.poster){const image=node('img');image.src=m.poster;image.alt='';image.loading='lazy';image.decoding='async';a.append(image);}else a.append(node('span','svDiscoveryFallback',m.title.slice(0,1)));const copy=node('div','svDiscoveryCardCopy');copy.append(node('small','',`${m.type==='tv'?'Series':'Movie'}${m.year?' · '+m.year:''}`),node('h3','',m.title));if(m.overview)copy.append(node('p','svPickOverview',m.overview));const share=node('button','svDiscoveryShare');share.innerHTML=window.SwiflyFeatureIcon?.('send')||'↗';share.type='button';share.dataset.shareTitle='';share.dataset.shareId=m.id;share.dataset.shareType=m.type;share.setAttribute('aria-label','Send '+m.title+' to a friend');card.append(a,copy,share);results.append(card);}root.querySelector('.svRecommendationResults').hidden=!rows.length;root.dataset.picksSource=ai?'ai':'catalog';}
 function infer(query,candidates,token){return new Promise((resolve,reject)=>{
  if(!window.Worker){reject(Error('This browser cannot run the recommendation model. Try a newer browser.'));return;}
  if(!worker)worker=new Worker('/assets/discovery/model-worker.js?v=2',{type:'module'});
  rejectWorker=reject;const current=worker;
  const onMessage=event=>{if(token!==epoch||current!==worker)return;const data=event.data;if(data.kind==='progress')output.textContent=data.message;else if(data.kind==='done'){finish();resolve(data.results);}else if(data.kind==='error'){finish();reject(Error(data.message||'The model could not finish.'));}};
  const onError=()=>{finish();worker?.terminate();worker=null;reject(Error('The AI model could not load. Check your connection and try again.'));};
  function finish(){clearTimeout(deadline);current.removeEventListener?.('message',onMessage);current.removeEventListener?.('error',onError);rejectWorker=null;}
  current.addEventListener('message',onMessage);current.addEventListener('error',onError);deadline=setTimeout(()=>{finish();current.terminate();if(worker===current)worker=null;reject(Error('The model download took too long. Try again on a faster connection.'));},180000);current.postMessage({query,candidates});
 });}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||disposed)return;const prompt=form.elements.prompt.value.trim();if(!prompt)return;const token=++epoch;controller=new AbortController();setBusy(true);output.textContent='Finding real titles for your mood…';let candidates=[];
  try{
   const personal=[...list('movieverse.liked'),...list('movieverse.watchlist')],watched=list('movieverse.continue');let taste=personal;
   if(form.elements.audience.value==='home'){const session=await window.SwiflyAccount?.ready;if(!session?.user)throw Error('Sign in and join a shared home to get picks for both of you.');const shared=await window.SwiflyAccount.request('/home/taste',{signal:controller.signal});taste=shared.titles;}
   const seeds=[...new Map(taste.map(m=>[m.type+':'+m.id,m])).values()].slice(0,3),params=new URLSearchParams({q:prompt,type:form.elements.type.value,seeds:seeds.map(m=>m.type+':'+m.id).join(','),exclude:form.elements.unseen.checked?watched.map(m=>m.type+':'+m.id).slice(0,200).join(','):''});
   const response=await fetch('/api/discovery/candidates?'+params,{signal:controller.signal}),body=await response.json();if(!response.ok)throw Error(body.message||'The movie catalog is unavailable.');if(token!==epoch||disposed)return;candidates=body.candidates;
   if(!candidates.length){paint([],false);output.textContent=body.message||'No close matches found. Try a broader mood or fewer filters.';return;}
   output.textContent='Matching your request…';const references=Array.isArray(body.references)?body.references.slice(0,2):[];const query=prompt+(references.length?' Similar stories to '+references.map(m=>m.title+': '+String(m.overview||'').slice(0,700)).join(' '):'');const picks=await infer(query,candidates,token);if(token!==epoch||disposed)return;paint(picks,true);output.textContent=`${picks.length} AI matches for “${prompt}”.`;
  }catch(e){if(token!==epoch||disposed||e.name==='AbortError')return;if(candidates.length){paint(candidates.slice(0,12),false);output.textContent=e.message+' These are catalog suggestions; AI ranking is unavailable. Try again to retry the model.';}else output.textContent=e.message||'Could not find picks. Please try again.';}
  finally{if(token===epoch&&!disposed)setBusy(false);}
 });
 for(const b of root.querySelectorAll('[data-mood]'))b.addEventListener('click',()=>{form.elements.prompt.value=b.dataset.mood;form.elements.prompt.focus();});
 cancel.addEventListener('click',()=>stop());if(new URLSearchParams(location.search).get('for')==='home'){form.elements.audience.value='home';root.querySelector('.svRecommendationPreferences').open=true;}
 window.addEventListener('pagehide',()=>{disposed=true;stop('');});window.addEventListener('pageshow',e=>{if(e.persisted){disposed=false;output.textContent='Your next favorite is out there.';}});
})();
