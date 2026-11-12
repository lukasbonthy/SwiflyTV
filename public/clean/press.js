/* Delegated press feedback leaves native activation, layout and hit sizes intact. */
(() => {
 'use strict';if(window.SwiflyPressFeedback)return;
 const query=matchMedia('(prefers-reduced-motion: reduce)'),motions=new Map(),pointers=new Map(),keys=new Map(),released=new WeakMap(),listeners=[];
 const selector='button,a:is(.dsPrimaryBtn,.dsSecondaryBtn,.dsIconBtn,.dsGhostPill,.dsMiniBtn,.svNavButton,.svPlayerAction,[role="button"])';
 const still=()=>query.matches||document.body.classList.contains('reduceMotion')||document.body.dataset.stPageMotion==='false'||document.documentElement.dataset.svTv==='true'||document.documentElement.dataset.svXbox==='true';
 function listen(target,name,handler,options){target.addEventListener(name,handler,options);listeners.push(()=>target.removeEventListener(name,handler,options));}
 function target(event){const node=event.target.closest?.(selector);return node&&!node.disabled&&node.getAttribute('aria-disabled')!=='true'&&!node.closest('[inert]')?node:null;}
 const surface=node=>node.querySelector(':scope > .svNavMatchedLabel,:scope > .svCardActionLabel')||node;
 function stop(node){const record=motions.get(node);record?.animation.cancel();motions.delete(node);}
 function animate(node,frames,options){
  if(still()||typeof node.animate!=='function')return null;
  const content=surface(node),animation=content.animate(frames,options);
  const record={animation,content,rest:Number(getComputedStyle(content).opacity)||1};motions.set(node,record);
  animation.finished.then(()=>{if(motions.get(node)===record&&options.fill!=='forwards')motions.delete(node);},()=>{});
  return record;
 }
 function press(node){stop(node);const rest=Number(getComputedStyle(surface(node)).opacity)||1;const record=animate(node,[{opacity:rest},{opacity:rest*.82}],{duration:90,easing:'ease-out',fill:'forwards'});if(record)record.rest=rest;}
 function release(node,cancelled=false){
  const record=motions.get(node);if(!record)return;
  const opacity=Number(getComputedStyle(record.content).opacity),rest=record.rest;
  stop(node);released.set(node,performance.now());
  if(!cancelled&&node.isConnected)animate(node,[{opacity},{opacity:rest}],{duration:140,easing:'ease-out'});
 }
 function cancelAll(){for(const node of motions.keys())stop(node);pointers.clear();keys.clear();}
 listen(document,'pointerdown',event=>{if(event.button!==0||event.isPrimary===false)return;const node=target(event);if(!node)return;pointers.set(event.pointerId,{node,x:event.clientX,y:event.clientY});press(node);},{passive:true});
 listen(document,'pointermove',event=>{const item=pointers.get(event.pointerId);if(item&&Math.hypot(event.clientX-item.x,event.clientY-item.y)>10){release(item.node,true);pointers.delete(event.pointerId);}},{passive:true});
 listen(document,'pointerup',event=>{const item=pointers.get(event.pointerId);if(item){pointers.delete(event.pointerId);release(item.node);}},{passive:true});
 listen(document,'pointercancel',event=>{const item=pointers.get(event.pointerId);if(item){release(item.node,true);pointers.delete(event.pointerId);}},{passive:true});
 listen(document,'keydown',event=>{if(event.repeat||!['Enter',' '].includes(event.key)||event.ctrlKey||event.metaKey||event.altKey)return;const node=target(event);if(node){keys.set(event.key,node);press(node);}});
 listen(document,'keyup',event=>{const node=keys.get(event.key);keys.delete(event.key);if(node)release(node);});
 listen(document,'focusin',event=>{for(const[key,node]of keys)if(!node.contains(event.target)){keys.delete(key);release(node,true);}});
 listen(document,'click',event=>{const node=target(event);if(node&&event.detail===0&&performance.now()-(released.get(node)??-Infinity)>300&&!motions.has(node)){const rest=Number(getComputedStyle(surface(node)).opacity)||1;animate(node,[{opacity:rest},{opacity:rest*.82,offset:.25},{opacity:rest}],{duration:180,easing:'ease-out'});}});
 listen(document,'visibilitychange',()=>{if(document.hidden)cancelAll();});
 listen(document,'swifly:studio-change',()=>{if(still())cancelAll();});
 listen(query,'change',()=>{if(query.matches)cancelAll();});
 listen(window,'blur',cancelAll);
 function destroy(){cancelAll();for(const remove of listeners.splice(0))remove();}
 listen(window,'pagehide',event=>{cancelAll();if(!event.persisted)destroy();});
 window.SwiflyPressFeedback=Object.freeze({destroy});
})();
