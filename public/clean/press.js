/* Delegated press feedback leaves native activation, layout and hit sizes intact. */
(() => {
 'use strict';if(window.SwiflyPressFeedback)return;
 const query=matchMedia('(prefers-reduced-motion: reduce)'),motions=new Map(),pointers=new Map(),released=new WeakMap(),listeners=[];
 const selector='button,a:is(.dsPrimaryBtn,.dsSecondaryBtn,.dsIconBtn,.dsGhostPill,.dsMiniBtn,.svNavButton,.svPlayerAction,[role="button"])';
 const still=()=>query.matches||document.body.classList.contains('reduceMotion')||document.body.dataset.stPageMotion==='false'||document.documentElement.dataset.svTv==='true'||document.documentElement.dataset.svXbox==='true';
 function listen(target,name,handler,options){target.addEventListener(name,handler,options);listeners.push(()=>target.removeEventListener(name,handler,options));}
 function target(event){const node=event.target.closest?.(selector);return node&&!node.disabled&&node.getAttribute('aria-disabled')!=='true'&&!node.closest('[inert]')?node:null;}
 function stop(node){const record=motions.get(node);record?.animation.cancel();motions.delete(node);}
 function animate(node,frames,options){
  if(still()||typeof node.animate!=='function')return null;
  const animation=node.animate(frames,{composite:'add',...options});
  const record={animation,depth:2};motions.set(node,record);
  animation.finished.then(()=>{if(motions.get(node)===record&&options.fill!=='forwards')motions.delete(node);},()=>{});
  return record;
 }
 function press(node){stop(node);animate(node,[{translate:'0 0'},{translate:'0 2px'}],{duration:90,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});}
 function release(node,cancelled=false){
  const record=motions.get(node);if(!record)return;
  const depth=2*(record.animation.effect?.getComputedTiming().progress??1);
  stop(node);released.set(node,performance.now());
  if(!cancelled&&node.isConnected)animate(node,[{translate:`0 ${depth}px`,offset:0},{translate:'0 -.55px',offset:.62},{translate:'0 0',offset:1}],{duration:210,easing:'cubic-bezier(.2,.75,.3,1)'});
 }
 function cancelAll(){for(const node of motions.keys())stop(node);pointers.clear();}
 listen(document,'pointerdown',event=>{if(event.button!==0||event.isPrimary===false)return;const node=target(event);if(!node)return;pointers.set(event.pointerId,{node,x:event.clientX,y:event.clientY});press(node);},{passive:true});
 listen(document,'pointermove',event=>{const item=pointers.get(event.pointerId);if(item&&Math.hypot(event.clientX-item.x,event.clientY-item.y)>10){release(item.node,true);pointers.delete(event.pointerId);}},{passive:true});
 listen(document,'pointerup',event=>{const item=pointers.get(event.pointerId);if(item){pointers.delete(event.pointerId);release(item.node);}},{passive:true});
 listen(document,'pointercancel',event=>{const item=pointers.get(event.pointerId);if(item){release(item.node,true);pointers.delete(event.pointerId);}},{passive:true});
 listen(document,'keydown',event=>{if(event.repeat||!['Enter',' '].includes(event.key)||event.ctrlKey||event.metaKey||event.altKey)return;const node=target(event);if(node)press(node);});
 listen(document,'keyup',event=>{if(['Enter',' '].includes(event.key)){const node=target(event);if(node)release(node);}});
 listen(document,'click',event=>{const node=target(event);if(node&&event.detail===0&&performance.now()-(released.get(node)??-Infinity)>300&&!motions.has(node))animate(node,[{translate:'0 0'},{translate:'0 2px',offset:.3},{translate:'0 0'}],{duration:220,easing:'cubic-bezier(.2,.75,.3,1)'});});
 listen(document,'visibilitychange',()=>{if(document.hidden)cancelAll();});
 listen(document,'swifly:studio-change',()=>{if(still())cancelAll();});
 listen(query,'change',()=>{if(query.matches)cancelAll();});
 listen(window,'blur',cancelAll);
 function destroy(){cancelAll();for(const remove of listeners.splice(0))remove();}
 listen(window,'pagehide',event=>{cancelAll();if(!event.persisted)destroy();});
 window.SwiflyPressFeedback=Object.freeze({destroy});
})();
