/* Explicit backup/recovery UI. Preview never changes the account. */
(() => {
 'use strict';if(window.SwiflyAccountBackup)return;
 function boot(){
  const root=document.querySelector('[data-account-data]'),D=window.SwiflyAccountData,A=window.SwiflyAccount;if(!root||!D||!A)return;
  const q=selector=>root.querySelector(selector),dialog=q('[data-backup-dialog]'),file=q('[data-backup-file]');
  let available=false,verified=false,busy=false,preview=null,retryContext=null,generation=0,opener=null,lastOwner='',lastProfile='',sourceRows=[];
  const selectedProfile=()=>{try{return JSON.parse(localStorage.getItem('swiflytv.activeProfile')||'null')?.id||JSON.parse(localStorage.getItem('swiflytv.profiles')||'[]')?.[0]?.id||'main';}catch{return'main';}};
  const owner=()=>A.user?.id||'guest';
  function status(value,error=false){q('[data-backup-status]').textContent=value;q('[data-backup-status]').dataset.error=String(error);}
  const node=(tag,className,value)=>{const n=document.createElement(tag);n.className=className;if(value!==undefined)n.textContent=value;return n;};
  function identityValid(){try{return verified&&available&&(localStorage.getItem('swiflytv.accountOwner')||'guest')===owner();}catch{return false;}}
  function paint(){
   const valid=identityValid();q('[data-backup-open]').disabled=!valid||!A.user||busy;q('[data-backup-recover]').disabled=!valid||!A.user||busy;q('[data-backup-export]').disabled=!valid||busy;q('[data-backup-signin]').hidden=!!A.user||!valid;
   q('[data-backup-identity]').textContent=!verified?'Checking account…':!available?'Account unavailable':A.user?'Signed in as '+A.user.name:'Guest · this browser';
  }
  function dismiss(){generation++;preview=null;q('[data-backup-confirm]').disabled=true;q('[data-backup-counts]').replaceChildren();q('[data-backup-mapping]').replaceChildren();q('[data-backup-review-source]').textContent='';q('[data-backup-destination]').textContent='';q('[data-backup-review-status]').textContent='';file.value='';if(dialog.open)dialog.close();if(opener?.isConnected)opener.focus({preventScroll:true});}
  function clearPrivate(){dismiss();retryContext=null;q('[data-backup-retry]').hidden=true;q('[data-backup-sources]').hidden=true;q('[data-backup-source-list]').replaceChildren();sourceRows=[];}
  function checkPreview(){if(!preview||!identityValid()||!A.user||preview.owner!==owner()||preview.profile!==selectedProfile())throw Error('Your account or profile changed. Review the import again before continuing.');}
  function mapping(){return Object.fromEntries([...root.querySelectorAll('[data-backup-map]')].map(n=>[n.dataset.backupMap,n.value]));}
  function makePlan(){checkPreview();return D.plan(preview.backup,D.capture(localStorage,{owner:owner()}),{mapping:mapping(),personalization:q('[data-backup-personalization]').checked});}
  function renderCounts(plan){
   const target=q('[data-backup-counts]');target.replaceChildren();for(const[label,value]of [['Saved titles',plan.added.titles],['Favorites',plan.added.favorites],['History entries',plan.added.history],['Resume titles',plan.added.progress],['New profiles',plan.added.profiles]]){const card=node('div','svBackupCount');card.append(node('strong','',String(value)),node('span','',label));target.append(card);}
   q('[data-backup-review-status]').textContent='Counts show new entries. Matching records are merged without duplicates.';q('[data-backup-confirm]').disabled=busy;
  }
  function updatePlan(){try{renderCounts(makePlan());}catch(error){q('[data-backup-review-status]').textContent=error.message;q('[data-backup-confirm]').disabled=true;}}
  function renderReview(backup,label){
   if(!identityValid()||!A.user)throw Error('Sign in before importing personal data.');const current=D.capture(localStorage,{owner:owner()}),normalized=D.validate(backup),selected=D.defaultMapping(normalized,current);
   generation++;preview={backup:normalized,owner:owner(),profile:selectedProfile()};opener=document.activeElement;q('[data-backup-review-source]').textContent=label;q('[data-backup-destination]').textContent='Importing into '+A.user.name+'’s account. Choose a destination for each backup profile.';q('[data-backup-personalization]').checked=false;
   const host=q('[data-backup-mapping]');host.replaceChildren();
   for(const entry of normalized.profiles){const row=node('label','svBackupMapRow'),copy=node('span',''),select=node('select','');copy.append(node('strong','',entry.profile.name),node('small','',entry.library.watchlist.length+' saved · '+entry.library.history.length+' history'));select.dataset.backupMap=entry.profile.id;select.setAttribute('aria-label','Destination for '+entry.profile.name);
    for(const existing of current.profiles){const option=node('option','',existing.profile.name+' · merge');option.value=existing.profile.id;select.append(option);}const fresh=node('option','','Create profile: '+entry.profile.name);fresh.value='new';select.append(fresh);select.value=selected[entry.profile.id];row.append(copy,select);host.append(row);
   }
   updatePlan();if(!dialog.open)dialog.showModal();q('[data-backup-mapping] select')?.focus();
  }
  async function review(backup,label){
   dismiss();const token=++generation,identity=owner(),profile=selectedProfile();try{
    if(!identityValid()||!A.user)throw Error('Sign in before importing personal data.');const normalized=D.validate(backup),C=window.SwiflyStudioConfig,images=[];
    for(const entry of normalized.profiles)if(entry.appearance){const record=C.unpackRecord(entry.appearance,{strict:true});for(const v of [record.values,...record.looks.map(v=>v.values)])if(v.wallpaperData)images.push(v.wallpaperData);}
    if(images.length){if(!window.SwiflyWallpapers)throw Error('Wallpaper tools are still loading. Try again.');await window.SwiflyWallpapers.verifyImages(images);}
    if(token!==generation||identity!==owner()||profile!==selectedProfile()||!identityValid())return;renderReview(normalized,label);
   }catch(error){if(token===generation&&identity===owner()&&profile===selectedProfile())status(error.message,true);}
  }
  function showSources(){
   if(!identityValid()||!A.user)return;sourceRows=D.sources(localStorage,A.user);const host=q('[data-backup-source-list]');host.replaceChildren();q('[data-backup-sources]').hidden=false;
   for(const[row,index]of sourceRows.map((row,index)=>[row,index])){const b=node('button','svBackupSource');b.type='button';b.dataset.backupSource=String(index);const copy=node('span','');copy.append(node('strong','',row.label),node('small','',row.backup.profiles.length+' profile'+(row.backup.profiles.length===1?'':'s')+' · '+row.count+' saved records'));b.append(copy,node('span','svBackupSourceAction','Review →'));host.append(b);}
   status(sourceRows.length?'Found '+sourceRows.length+' earlier browser '+(sourceRows.length===1?'library.':'libraries.')+' Choose one to review.':'No older library was found for this account on this browser. Try your earlier browser or device, or import a backup file.');
   if(!sourceRows.length)host.append(node('p','svBackupEmpty','No recoverable copy found here. You can still choose Import account data if you have a backup.'));
  }
  async function importSelected(){
   if(busy)return;try{checkPreview();busy=true;paint();q('[data-backup-confirm]').disabled=true;q('[data-backup-review-status]').textContent='Checking your account before importing…';await A.revalidate();checkPreview();const id=preview.owner,profile=preview.profile,result=await A.commitImport(()=>D.statePatch(makePlan().backup,{owner:id,activeProfile:profile}),{expectedOwner:id});
    // Account/profile changes can settle while an upload is in flight. The
    // account API guards the write; never show the old owner’s results here.
    checkPreview();dismiss();window.SwiflyStudio?.reloadSaved?.();retryContext=result.synced?null:{owner:id,profile};q('[data-backup-retry]').hidden=result.synced;status(result.synced?'Imported and synced to your account. Your existing titles and the original recovery copy were kept.':'Imported on this browser. Account sync could not finish: '+result.message+' Use Retry account sync before leaving.',!result.synced);
   }catch(error){if(preview){q('[data-backup-review-status]').textContent=error.message;q('[data-backup-confirm]').disabled=false;}else status(error.message,true);}
   finally{busy=false;paint();}
  }
  function exportBackup(){
   if(!identityValid())throw Error('Wait for your account to finish checking before exporting.');const backup=D.capture(localStorage,{owner:owner()}),serialized=JSON.stringify(backup,null,2);if(D.bytes(serialized)>D.MAX_BYTES)throw Error('This backup exceeds 2 MB. Choose fewer saved profile photos before exporting.');const blob=new Blob([serialized],{type:'application/json'}),url=URL.createObjectURL(blob),link=node('a','');link.href=url;link.download='swifly-account-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Backup downloaded. Keep this JSON file somewhere you can find it if you change accounts or devices.');return backup;
  }
  root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;
   if(button.hasAttribute('data-backup-cancel')){if(!busy)dismiss();return;}if(button.hasAttribute('data-backup-open'))file.click();
   if(button.hasAttribute('data-backup-recover'))try{showSources();}catch(error){status(error.message,true);}
   if(button.hasAttribute('data-backup-source'))try{const row=sourceRows[Number(button.dataset.backupSource)];if(row)review(row.backup,row.label);}catch(error){status(error.message,true);}
   if(button.hasAttribute('data-backup-export'))try{exportBackup();}catch(error){status(error.message,true);}
   if(button.hasAttribute('data-backup-confirm'))importSelected();
   if(button.hasAttribute('data-backup-retry')){const context=retryContext,valid=()=>context&&context===retryContext&&identityValid()&&context.owner===owner()&&context.profile===selectedProfile();if(!valid()){retryContext=null;button.hidden=true;return;}button.disabled=true;A.flush().then(()=>{if(!valid())return;retryContext=null;button.hidden=true;status('Your imported data is now synced to your account.');}).catch(error=>{if(valid())status('Account sync is still waiting: '+error.message,true);}).finally(()=>{button.disabled=false;});}
  });
  root.addEventListener('change',event=>{if(event.target.matches('[data-backup-map],[data-backup-personalization]'))updatePlan();});
  file.addEventListener('change',async()=>{const chosen=file.files?.[0],token=++generation,identity=owner();if(!chosen)return;try{if(chosen.size>D.MAX_BYTES)throw Error('Account backup files must be 2 MB or smaller.');const text=chosen.text?await chosen.text():await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('This file could not be read.'));r.readAsText(chosen);});if(token!==generation||identity!==owner()||!identityValid())return;review(D.parse(text),chosen.name);}catch(error){status(error.message,true);}finally{file.value='';}});
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)dismiss();});
  const refresh=()=>{if(lastOwner!==owner()||lastProfile!==selectedProfile()){clearPrivate();lastOwner=owner();lastProfile=selectedProfile();}paint();};
  document.addEventListener('swifly:account-hydrated',()=>{verified=true;available=true;refresh();});document.addEventListener('swifly:profile-changed',refresh);document.addEventListener('swifly:account-suspended',()=>{verified=false;clearPrivate();paint();status('Sign in again before reviewing or importing account data.');});window.addEventListener('pagehide',clearPrivate);
  A.ready.then(session=>{available=session?.available!==false;verified=true;lastOwner=owner();lastProfile=selectedProfile();paint();status(!available?'Account storage is temporarily unavailable. Your browser data has not been replaced. Try again shortly.':A.user?'Your account is ready. Imports are reviewed first and merged with the titles you already have.':'Sign in to restore data into an account. You can export this browser’s guest library first.');});
  window.SwiflyAccountBackup=Object.freeze({review,exportBackup,importSelected,refresh});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
