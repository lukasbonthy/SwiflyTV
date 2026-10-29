'use strict';

// Keep verification bound to the expected document. Playwright's condition wait
// reacquires its context if the browser replaces a document during startup.
async function appReady(page, pathname, {timeout=10000}={}) {
  const deadline=Date.now()+timeout;
  let lastError;
  do {
    let handle;
    try {
      handle=await page.waitForFunction(expected=>{
        if(location.pathname!==expected||!window.SwiflyAccount?.ready||!window.SwiflyLibrary?.ready||document.documentElement.hasAttribute('data-sv-loading'))return false;
        return Promise.all([SwiflyAccount.ready,SwiflyLibrary.ready]).then(([session,library])=>({session,library}));
      },pathname,{timeout:Math.max(1,deadline-Date.now())});
      const state=await handle.jsonValue();
      if(new URL(page.url()).pathname!==pathname)throw Error('The application left the expected route: '+pathname);
      return state;
    } catch(error) {
      lastError=error;
      // A context can also disappear while serializing the successful handle.
      // Preserve script/verification errors and the original overall deadline.
      if(!/Execution context was destroyed|Cannot find context|JSHandle is disposed/.test(error.message)||Date.now()>=deadline)throw error;
    } finally {if(handle)await handle.dispose().catch(()=>{});}
  } while(Date.now()<deadline);
  throw lastError;
}
async function menuTargetsReady(page, selector, {timeout=10000}={}) {
  // An entrance can restart after an earlier animation finishes. Check the
  // current animations and the same 44px contract in one bounded condition.
  await page.waitForFunction(selector=>{
    const menu=document.querySelector(selector),links=menu?.querySelectorAll(':scope > a[href]');
    const moving=menu?.getAnimations().some(animation=>animation.playState==='running'&&animation.effect?.getTiming().iterations!==Infinity);
    return !moving&&!!links?.length&&[...links].every(link=>link.getBoundingClientRect().height>=44);
  },selector,{timeout});
}
module.exports = {appReady, menuTargetsReady};
