/* No model/network work until a person asks for picks. */
(() => {
 'use strict';const root=document.querySelector('[data-recommendations]');if(!root)return;
 const form=root.querySelector('[data-recommendation-form]'),output=root.querySelector('[data-ai-status]'),results=root.querySelector('[data-ai-results]'),cancel=root.querySelector('[data-ai-cancel]');
 let worker=null,epoch=0,controller=null,deadline=0,rejectWorker=null,busy=false,disposed=false;
 const list=k=>{try{const rows=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(rows)?rows.filter(m=>m&&['movie','tv'].includes(m.type)&&/^\d+$/.test(String(m.id))):[];}catch{return [];}};
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function showFilters(values=[]){const box=root.querySelector('[data-query-filters]');if(!box)return;box.replaceChildren();for(const value of values.slice(0,12))box.append(node('li','',String(value).slice(0,100)));box.hidden=!box.children.length;}
 function setBusy(value){busy=value;form.querySelector('[type=submit]').disabled=value;cancel.hidden=!value;form.setAttribute('aria-busy',String(value));}
 function stop(message='Request cancelled. Your next idea is welcome.'){epoch++;controller?.abort();worker?.terminate();worker=null;clearTimeout(deadline);rejectWorker?.(Error('cancelled'));rejectWorker=null;setBusy(false);root.dataset.searchState='idle';output.textContent=message;}
 function paint(rows,ai,mode='mood'){results.replaceChildren();for(const m of rows){const card=node('article','svDiscoveryCard'),a=node('a','svDiscoveryPoster');a.href=m.href;a.setAttribute('aria-label',m.title);if(m.poster){const image=node('img');image.src=m.poster;image.alt='';image.loading='lazy';image.decoding='async';a.append(image);}else a.append(node('span','svDiscoveryFallback',m.title.slice(0,1)));const copy=node('div','svDiscoveryCardCopy');copy.append(node('small','',`${m.type==='tv'?'Series':'Movie'}${m.year?' · '+m.year:''}${m.runtime?' · '+m.runtime+' min':''}`),node('h3','',m.title));if(m.reason)copy.append(node('p','svPickReason',m.reason));if(m.overview)copy.append(node('p','svPickOverview',m.overview));const share=node('button','svDiscoveryShare');share.innerHTML=window.SwiflyFeatureIcon?.('send')||'↗';share.type='button';share.dataset.shareTitle='';share.dataset.shareId=m.id;share.dataset.shareType=m.type;share.setAttribute('aria-label','Send '+m.title+' to a friend');card.append(a,copy,share);results.append(card);}root.querySelector('.svRecommendationResults').hidden=!rows.length;root.dataset.picksSource=mode==='title'?'title':ai?'ai':'catalog';root.dataset.searchState=rows.length?'results':'empty';}
 function infer(payload,token){return new Promise((resolve,reject)=>{
  if(!window.Worker){reject(Error('This browser cannot run the recommendation model. Try a newer browser.'));return;}
  if(!worker)worker=new Worker('/assets/discovery/model-worker.js?v=5',{type:'module'});
  rejectWorker=reject;const current=worker;
  const onMessage=event=>{if(token!==epoch||current!==worker)return;const data=event.data;if(data.kind==='progress')output.textContent=data.message;else if(data.kind===(payload.kind==='plan'?'planned':'done')){finish();resolve(payload.kind==='plan'?data.topics:data.results);}else if(data.kind==='error'){finish();current.terminate();if(worker===current)worker=null;reject(Error(data.message||'The model could not finish.'));}};
  const onError=()=>{if(token!==epoch||current!==worker)return;finish();current.terminate();worker=null;reject(Error('Matching could not finish. Check your connection and try again.'));};
  function finish(){clearTimeout(deadline);current.removeEventListener?.('message',onMessage);current.removeEventListener?.('error',onError);rejectWorker=null;}
  current.addEventListener('message',onMessage);current.addEventListener('error',onError);deadline=setTimeout(()=>{finish();current.terminate();if(worker===current)worker=null;reject(Error('Matching is taking too long. Try again or search for a title.'));},90000);current.postMessage(payload);
 });}
 form.elements.prompt.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||disposed)return;const prompt=form.elements.prompt.value.trim();if(!prompt)return;const token=++epoch;controller=new AbortController();setBusy(true);paint([],false);showFilters();root.dataset.searchState='loading';output.textContent='Searching the catalog…';let candidates=[];
  try{
   const personal=[...list('movieverse.liked'),...list('movieverse.watchlist')],watched=list('movieverse.continue');let taste=personal;
   if(form.elements.audience.value==='home'){const session=await window.SwiflyAccount?.ready;if(!session?.user)throw Error('Sign in and join a shared home to get picks for both of you.');const shared=await window.SwiflyAccount.request('/home/taste',{signal:controller.signal});taste=shared.titles;}
   const seeds=[...new Map(taste.map(m=>[m.type+':'+m.id,m])).values()].slice(0,3),params=new URLSearchParams({q:prompt,plan:'1',type:form.elements.type.value,seeds:seeds.map(m=>m.type+':'+m.id).join(','),exclude:form.elements.unseen.checked?watched.map(m=>m.type+':'+m.id).slice(0,200).join(','):''});
   const retrieve=async()=>{const response=await fetch('/api/discovery/candidates?'+params,{signal:controller.signal}),data=await response.json();if(!response.ok)throw Error(data.message||'The movie catalog is unavailable.');return data;};
   let body=await retrieve();if(token!==epoch||disposed)return;showFilters(body.filters);
   if(body.mode==='plan'){
    // A failed topic planner should not make catalog recommendations disappear.
    // Ranking can be retried independently after the catalog responds.
    let topics=[];
    try {topics=await infer({kind:'plan',query:body.semanticQuery||prompt},token);}
    catch(error){if(token!==epoch||disposed||controller.signal.aborted)return;output.textContent='Searching the catalog without topic hints…';}
    if(token!==epoch||disposed)return;
    params.delete('plan');params.set('planned','1');params.set('topics',Array.isArray(topics)?topics.slice(0,2).join(','):'');output.textContent='Finding stories that fit…';body=await retrieve();if(token!==epoch||disposed)return;showFilters(body.filters);
   }
   candidates=Array.isArray(body.candidates)?body.candidates:[];
   if(!candidates.length){paint([],false);output.textContent=body.message||'No close matches found. Try a more specific story detail or fewer filters.';return;}
   const heading=root.querySelector('#svPicksHeading');
   if(body.mode==='title'){paint(candidates,false,'title');if(heading)heading.textContent=body.correction?'Closest title match':candidates.length===1?'Found your title':'Choose a title';output.textContent=body.correction?'Did you mean “'+body.correction.title+'”?':candidates.length===1?'Found '+candidates[0].title+(candidates[0].year?' ('+candidates[0].year+')':'')+'.':'Choose the title you’re looking for.';return;}
   if(body.ranking?.broad){const picks=candidates.slice().sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)||(Number(b.votes)||0)-(Number(a.votes)||0)).slice(0,8);paint(picks,false);if(heading)heading.textContent='Matches your filters';output.textContent=picks.length+' titles matching your filters.';return;}
   output.textContent='Choosing the closest matches…';const references=Array.isArray(body.references)?body.references.slice(0,2):[];const query=body.semanticQuery||prompt+(references.length?' Similar stories to '+references.map(m=>m.title+': '+String(m.overview||'').slice(0,700)).join(' '):'');
   const picks=await infer({kind:'rank',query,candidates,context:body.ranking||{}},token);if(token!==epoch||disposed)return;paint(picks,true);if(heading)heading.textContent=references.length?'If you liked '+references[0].title:'Matches your request';output.textContent=picks.length?`${picks.length} AI ${picks.length===1?'match':'matches'} for “${prompt}”.`:'We could not find a close enough match. Try a title you love or one more story detail.';
  }catch(e){if(token!==epoch||disposed||e.name==='AbortError')return;if(candidates.length){const related=candidates.filter(m=>m.source==='reference'||m.match==='title').slice(0,8);paint(related,false);const heading=root.querySelector('#svPicksHeading');if(heading)heading.textContent='Related titles';output.textContent=related.length?'AI matching is unavailable. Here are related titles from the catalog.':'Matching could not finish. Try again, or search for a title.';}else output.textContent=e.message||'Could not find picks. Please try again.';}
  finally{if(token===epoch&&!disposed){setBusy(false);if(root.dataset.searchState==='loading')root.dataset.searchState='empty';}}
 });
 for(const b of root.querySelectorAll('[data-mood]'))b.addEventListener('click',()=>{form.elements.prompt.value=b.dataset.mood;form.elements.prompt.focus();form.requestSubmit();});
 cancel.addEventListener('click',()=>stop());if(new URLSearchParams(location.search).get('for')==='home'){form.elements.audience.value='home';root.querySelector('.svRecommendationPreferences').open=true;}
 window.addEventListener('pagehide',()=>{disposed=true;stop('');});window.addEventListener('pageshow',e=>{if(e.persisted){disposed=false;output.textContent='Your next favorite is out there.';}});
})();
