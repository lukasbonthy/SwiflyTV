/* Private inbox and shared home. One idle event stream; no background polling. */
(() => {
 'use strict';if(window.SwiflyConnect)return;
 const page=document.querySelector('[data-connect-page]'),content=page?.querySelector('[data-connect-content]'),status=page?.querySelector('[data-connect-status]');
 const api=(route,options)=>window.SwiflyAccount.request(route,options);
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const button=(text,action,cls='svConnectButton')=>{const b=el('button',cls,text);b.type='button';if(action)b.addEventListener('click',action);return b;};
 const link=(text,href,cls='svConnectLink')=>{const a=el('a',cls,text);a.href=href;return a;};
 const avatar=u=>el('span','svConnectAvatar',Array.from(u.name||u.handle||'?')[0].toUpperCase());
 let data=null,selected=new URLSearchParams(location.search).get('friend')||'',stream=null,disposed=false,refreshing=null,refreshEpoch=0,refreshController=null,threadEpoch=0,peopleEpoch=0,peopleController=null,selectedMedia=null,titleController=null,titleEpoch=0,presenceTimer=0,lastPresence='',pageBuilt=false;
 let shareMedia=null,shareParty=false,shareEpoch=0,homeInvite=null,homeInviting=false,homeEpoch=0;
 function clearPrivate(){refreshEpoch++;refreshController?.abort();refreshing=null;threadEpoch++;homeEpoch++;homeInvite=null;homeInviting=false;data=null;selected='';pageBuilt=false;content?.replaceChildren();document.querySelector('[data-notification-list]')?.replaceChildren();document.querySelector('[data-share-list]')?.replaceChildren();document.querySelectorAll('[data-connect-notifications]').forEach(b=>b.hidden=true);for(const d of document.querySelectorAll('.svConnectDialog[open]'))d.close();}
 function error(output,e){if(output){output.textContent=e.message||'Please try again.';output.hidden=false;}}
 async function act(route,body={},output=status){try{await api(route,{body});await refresh();return true;}catch(e){error(output,e);return false;}}
 function dialog(id){const node=document.getElementById(id);if(node&&!node.open){node.showModal();node.querySelector('[data-connect-close]')?.focus();}return node;}
 function openNotifications(){paintNotifications();dialog('svNotificationDialog');}
 function paintNotifications(){
  const notes=data?.notifications||[],unread=notes.filter(n=>!n.readAt).length;
  document.querySelectorAll('[data-connect-notifications]').forEach(b=>{b.hidden=!data?.user;b.setAttribute('aria-label',unread?`Notifications, ${unread} unread`:'Notifications');});
  document.querySelectorAll('[data-notification-count]').forEach(b=>{b.textContent=unread>99?'99+':String(unread);b.hidden=!unread;});
  const list=document.querySelector('[data-notification-list]');if(!list)return;list.replaceChildren();
  if(!notes.length)list.append(el('p','svConnectEmpty','You’re all caught up. Your invitations and messages will appear here.'));
  for(const n of notes){const a=link('',/^\/(?!\/)/.test(n.href||'')?n.href:'/friends','svNotification'+(!n.readAt?' isUnread':''));a.append(el('span','svNotificationDot',n.kind==='party_invite'?'▶':n.kind.startsWith('friend')?'＋':'↗'),el('span','',n.text),el('time','',new Date(n.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})));list.append(a);}
 }
 async function refresh(){
  if(disposed)return;if(refreshing)return refreshing;
  const token=++refreshEpoch;refreshController=new AbortController();
  const job=(async()=>{const incoming=await api('/bootstrap',{signal:refreshController.signal});if(disposed||token!==refreshEpoch)return;if(data&&data.user.id!==incoming.user.id)clearPrivate();data=incoming;paintNotifications();if(page){if(!pageBuilt)buildPage();paintFriends();paintRequests();paintHome();if(selected)await loadThread(false);}if(data.stateRevision)window.SwiflyAccount.refreshState?.().catch(()=>{});})();refreshing=job;
  try{return await job;}finally{if(refreshing===job)refreshing=null;}
 }
 function buildPage(){
  pageBuilt=true;content.replaceChildren();if(status)status.hidden=true;
  const identity=el('p','svConnectOwnHandle','Your handle: @'+data.user.handle);content.append(identity);
  const layout=el('div','svConnectLayout');
  const aside=el('aside','svConnectSidebar');aside.id='friends';aside.append(el('span','svConnectEyebrow','GOOD COMPANY'),el('h2','','Your people'));
  const find=el('form','svFindFriend');find.innerHTML='<label for="svFriendSearch">Find a friend by handle</label><input id="svFriendSearch" type="search" placeholder="@theirhandle" maxlength="24" autocomplete="off"><div data-people-results aria-live="polite"></div>';
  find.addEventListener('submit',e=>e.preventDefault());find.querySelector('input').addEventListener('input',searchPeople);
  aside.append(find,el('div','svFriendRequests'));aside.lastChild.dataset.friendRequests='';
  const list=el('div','svFriendList');list.dataset.friendList='';aside.append(list);
  const privacy=el('label','svWatchingPrivacy');privacy.innerHTML='<input type="checkbox" data-share-watching><span>Show friends what I’m watching<small>Only while a movie or episode is playing.</small></span>';privacy.querySelector('input').checked=!!data.user.settings?.shareWatching;privacy.querySelector('input').addEventListener('change',e=>act('/settings',{shareWatching:e.target.checked}));aside.append(privacy);
  const conversation=el('section','svConversation');conversation.id='inbox';conversation.setAttribute('aria-label','Direct messages');conversation.innerHTML='<div data-conversation-head class="svConversationHead"></div><div class="svMessageLog" data-message-log role="log" aria-label="Conversation"></div><div data-conversation-compose></div>';
  layout.append(aside,conversation);content.append(layout);
  const home=el('section','svSharedHome');home.id='home';home.dataset.sharedHome='';content.append(home);
  if(!selected)emptyConversation();
  const tab=new URLSearchParams(location.search).get('tab');if(['home','requests'].includes(tab))queueMicrotask(()=>document.getElementById(tab==='home'?'home':'friends')?.scrollIntoView?.({block:'start'}));
 }
 function emptyConversation(){const head=content.querySelector('[data-conversation-head]'),log=content.querySelector('[data-message-log]');head.replaceChildren(el('h2','','A good film starts a conversation.'));log.replaceChildren(el('div','svConversationEmpty','Pick a friend to say hello, share a film, or send a watchparty invite.'));content.querySelector('[data-conversation-compose]').replaceChildren();}
 function paintFriends(){
  const list=content.querySelector('[data-friend-list]');if(!list)return;list.replaceChildren();
  if(!data.friends.length)list.append(el('p','svConnectEmpty','Find your first friend above. Your conversations stay between the two of you.'));
  for(const f of data.friends){const b=button('',()=>selectFriend(f.id),'svFriend'+(selected===f.id?' isSelected':''));b.dataset.connectFriend=f.id;b.setAttribute('aria-pressed',String(selected===f.id));const copy=el('span','svFriendCopy');copy.append(el('strong','',f.name),el('small','',f.activity?'Watching '+f.activity.media.title:'@'+f.handle));b.append(avatar(f),copy);if(f.unread)b.append(el('b','svUnread',String(f.unread)));if(f.activity)b.classList.add('isWatching');list.append(b);}
  const privacy=content.querySelector('[data-share-watching]');if(privacy)privacy.checked=!!data.user.settings?.shareWatching;
  if(selected&&!data.friends.some(f=>f.id===selected)){selected='';threadEpoch++;emptyConversation();}
 }
 async function selectFriend(id){selected=id;selectedMedia=null;paintFriends();await loadThread(true);if(matchMedia('(max-width:760px)').matches)content.querySelector('#inbox')?.scrollIntoView?.({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
 async function loadThread(rebuild){
  if(!selected||disposed)return;const f=data.friends.find(f=>f.id===selected);if(!f)return;const id=selected,epoch=++threadEpoch;
  try{const thread=await api('/messages/'+id);if(disposed||epoch!==threadEpoch||id!==selected)return;
   const head=content.querySelector('[data-conversation-head]'),log=content.querySelector('[data-message-log]'),nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<90;
   if(rebuild||head.dataset.friend!==id){head.replaceChildren();head.dataset.friend=id;const who=el('div','svConversationWho');who.append(avatar(f),el('h2','',f.name),el('small','',f.activity?'Watching '+f.activity.media.title:'@'+f.handle));const actions=el('div','svFriendActions');actions.append(button('Unfriend',()=>{if(confirm('Remove '+f.name+' from friends?'))act('/friends/'+id+'/remove');}),button('Block',()=>{if(confirm('Block '+f.name+'? They won’t be able to message you.'))act('/friends/'+id+'/block');}));head.append(who,actions);buildComposer(f);}
   const signature=JSON.stringify(thread.messages.map(m=>[m.id,m.readAt]));if(log.dataset.signature!==signature){log.dataset.signature=signature;log.replaceChildren();if(!thread.messages.length)log.append(el('p','svConnectEmpty','Your next movie night starts here.'));for(const m of thread.messages)log.append(message(m));if(nearBottom||rebuild)log.scrollTop=log.scrollHeight;}
   if(thread.messages.some(m=>m.to===data.user.id&&!m.readAt)&&!document.hidden){await api('/messages/'+id+'/read',{body:{}});const peer=data.friends.find(f=>f.id===id);if(peer)peer.unread=0;for(const n of data.notifications)if(n.from===id&&['message','party_invite'].includes(n.kind))n.readAt=Date.now();paintFriends();paintNotifications();}
  }catch(e){error(status,e);}
 }
 function message(m){
  const box=el('article','svMessage'+(m.from===data.user.id?' isMine':''));if(m.text)box.append(el('p','',m.text));
  if(m.media){const a=link('',m.kind==='party'?m.partyUrl:m.media.href,'svMessageTitle');if(m.media.poster){const image=el('img');image.src=m.media.poster;image.alt='';image.loading='lazy';a.append(image);}const copy=el('span');copy.append(el('small','',m.kind==='party'?'YOU’RE INVITED':m.media.type==='tv'?'SERIES':'MOVIE'),el('strong','',m.media.title),el('b','',m.kind==='party'?'Join watchparty ↗':'Open title ↗'));a.append(copy);box.append(a);}
  box.append(el('time','',new Date(m.createdAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})+(m.from===data.user.id&&m.readAt?' · Read':'')));return box;
 }
 function buildComposer(f){
  const region=content.querySelector('[data-conversation-compose]');region.replaceChildren();
  const tools=el('div','svMessageTools'),attachment=el('div','svAttachmentPicker');attachment.hidden=true;attachment.innerHTML='<label for="svMessageTitleQuery">Find a movie or series</label><input id="svMessageTitleQuery" type="search" placeholder="Search a title…" autocomplete="off" maxlength="120"><div data-attachment-results></div><p data-attachment-status role="status"></p>';
  const showPicker=party=>{shareParty=party;attachment.hidden=false;attachment.dataset.party=String(party);attachment.querySelector('input').focus();};tools.append(button('＋ Send a title',()=>showPicker(false)),button('↗ Invite to watchparty',()=>showPicker(true)));
  attachment.querySelector('input').addEventListener('input',searchTitles);
  const form=el('form','svMessageForm');form.dataset.messageForm='';form.innerHTML='<label class="svVisuallyHidden" for="svMessageText">Message</label><textarea id="svMessageText" data-message-text rows="1" maxlength="2000" placeholder="Say something good…" required></textarea><button type="submit" class="svSendMessage">Send ↗</button><p data-message-error role="alert" hidden></p>';
  form.addEventListener('submit',async e=>{e.preventDefault();const input=form.querySelector('textarea'),send=form.querySelector('button'),text=input.value.trim();if(!text||send.disabled)return;send.disabled=true;form.querySelector('[data-message-error]').hidden=true;try{await api('/messages/'+f.id,{body:{text,clientId:crypto.randomUUID?.()||String(Date.now())}});input.value='';await loadThread(false);}catch(failure){error(form.querySelector('[data-message-error]'),failure);}finally{send.disabled=false;}});
  region.append(tools,attachment,form);
 }
 let peopleTimer=0,titleTimer=0;
 function searchPeople(e){clearTimeout(peopleTimer);peopleController?.abort();const epoch=++peopleEpoch,q=e.target.value.trim(),results=content.querySelector('[data-people-results]');results.replaceChildren();if(q.length<2)return;
  peopleTimer=setTimeout(async()=>{peopleController=new AbortController();try{const response=await api('/people?q='+encodeURIComponent(q),{signal:peopleController.signal});if(disposed||epoch!==peopleEpoch)return;if(!response.people.length)results.append(el('p','svConnectEmpty','No matching handles.'));for(const p of response.people){const row=el('div','svPersonResult');row.append(el('span','',p.name+' · @'+p.handle));const b=button(p.relationship==='friend'?'Friends':p.relationship==='pending'?'Requested':p.relationship==='incoming'?'Accept':'Add',async()=>{b.disabled=true;const done=await act(p.relationship==='incoming'?'/friends/'+p.id+'/accept':'/friends/request',p.relationship==='incoming'?{}:{handle:p.handle});b.textContent=done?'Requested':'Try again';b.disabled=done;});b.disabled=['friend','pending'].includes(p.relationship);row.append(b);results.append(row);}}
  catch(failure){if(epoch===peopleEpoch&&failure.name!=='AbortError')results.append(el('p','svConnectError',failure.message));}},220);
 }
 function searchTitles(e){clearTimeout(titleTimer);titleController?.abort();const epoch=++titleEpoch,q=e.target.value.trim(),picker=e.target.closest('.svAttachmentPicker'),results=picker.querySelector('[data-attachment-results]');results.replaceChildren();if(q.length<2)return;
  titleTimer=setTimeout(async()=>{titleController=new AbortController();try{const response=await fetch('/api/discovery/search?q='+encodeURIComponent(q)+'&type=screen',{signal:titleController.signal});if(!response.ok)throw Error('Title search is unavailable. Try again.');const body=await response.json();if(disposed||epoch!==titleEpoch)return;for(const m of body.results.filter(m=>['movie','tv'].includes(m.type)).slice(0,8)){const b=button(m.title,async()=>{b.disabled=true;const ok=await act('/messages/'+selected,{kind:picker.dataset.party==='true'?'party':'title',media:{id:m.id,type:m.type},clientId:crypto.randomUUID?.()||String(Date.now())},picker.querySelector('[data-attachment-status]'));if(ok){picker.hidden=true;await loadThread(false);}else b.disabled=false;});results.append(b);}if(!results.children.length)results.append(el('p','svConnectEmpty','No titles found.'));}catch(failure){if(failure.name!=='AbortError'&&epoch===titleEpoch)error(picker.querySelector('[data-attachment-status]'),failure);}},220);
 }
 function paintRequests(){const region=content.querySelector('[data-friend-requests]');region.replaceChildren();if(data.requests.incoming.length)region.append(el('h3','','Friend requests'));for(const p of data.requests.incoming){const row=el('div','svFriendRequest');row.append(el('strong','',p.name));const b=button('Accept',()=>act('/friends/'+p.id+'/accept'));b.dataset.friendAccept=p.id;row.append(b,button('Decline',()=>act('/friends/'+p.id+'/decline')));region.append(row);}if(data.requests.outgoing.length)region.append(el('p','svConnectEmpty',data.requests.outgoing.length+' friend request'+(data.requests.outgoing.length===1?'':'s')+' sent.'));if(data.blocked?.length){const details=el('details');details.append(el('summary','','Blocked viewers'));for(const p of data.blocked)details.append(button('Unblock @'+p.handle,()=>act('/friends/'+p.id+'/unblock')));region.append(details);}}
 async function inviteHome(){
  if(homeInviting||!data)return;const epoch=homeEpoch,owner=data.user.id;homeInviting=true;paintHome();
  try{const result=await api('/home/invite',{body:{}});if(disposed||epoch!==homeEpoch||data?.user.id!==owner)return;homeInvite={...result,owner,homeId:data.home?.id||null};await refresh();}
  catch(e){if(epoch===homeEpoch)error(status,e);}finally{if(epoch===homeEpoch){homeInviting=false;if(data&&!disposed)paintHome();}}
 }
 function paintHome(){
  const region=content.querySelector('[data-shared-home]'),pendingToken=region.querySelector('[data-home-token]')?.value||new URLSearchParams(location.search).get('invite')||'';region.replaceChildren();
  if(homeInvite&&(homeInvite.owner!==data.user.id||homeInvite.expiresAt<=Date.now()||homeInvite.homeId&&homeInvite.homeId!==data.home?.id||data.home?.members.length>=2))homeInvite=null;
  if(homeInvite&&data.home&&!homeInvite.homeId)homeInvite.homeId=data.home.id;
  const intro=el('div','svHomeIntro');intro.append(el('span','svConnectEyebrow','TWO PEOPLE. ONE MOVIE NIGHT.'),el('h2','','Your shared home.'),el('p','','Keep your own profiles and private conversations. Build a watchlist together, and find something you’ll both love.'));region.append(intro);
  const card=el('div','svHomeCard');
  if(data.home){const members=el('div','svHomeMembers');for(const u of data.home.members){const p=el('div');p.append(avatar(u),el('strong','',u.name));members.append(p);}card.append(members);
   if(data.home.members.length<2){const invite=button(homeInviting?'Creating invitation…':'Invite your person',inviteHome);invite.disabled=homeInviting;card.append(invite);if(homeInvite){const url=location.origin+'/friends?tab=home&invite='+homeInvite.token,output=el('div','svHomeInvite'),label=el('label','','Invitation link · expires in 24 hours'),input=el('input');input.readOnly=true;input.value=url;input.setAttribute('aria-label','Shared home invitation link');input.addEventListener('focus',()=>input.select());label.append(input);output.append(label,button('Copy link',async e=>{try{await navigator.clipboard.writeText(url);e.target.textContent='Copied';}catch{input.select();}}));card.append(output);}}
   card.append(link('Find a film for both of us ↗','/recommendations?for=home','svConnectButton'),button('Leave shared home',()=>{if(confirm('Leave this shared home? Your personal library stays yours.'))act('/home/leave');},'svQuietButton'));
   const taste=el('label','svWatchingPrivacy');taste.innerHTML='<input type="checkbox"><span>Use my likes and list for our shared picks</span>';taste.querySelector('input').checked=!!data.user.settings?.shareTaste;taste.querySelector('input').addEventListener('change',e=>act('/settings',{shareTaste:e.target.checked}));card.append(taste);
   const titles=el('div','svHomeTitles');titles.append(el('h3','','Our watchlist'));if(!data.home.titles.length)titles.append(el('p','svConnectEmpty','Add a title from its share menu to start your shared list.'));for(const m of data.home.titles){const row=el('div','svHomeTitle');row.append(link(m.title,m.href),button('Remove',()=>act('/home/titles',{media:{id:m.id,type:m.type},remove:true})));titles.append(row);}card.append(titles);
  }else{const create=button(homeInviting?'Creating invitation…':'Create an invitation',inviteHome);create.disabled=homeInviting;card.append(create);const form=el('form','svHomeJoin');form.dataset.homeJoin='';form.innerHTML='<label for="svHomeToken">Have an invitation?</label><input id="svHomeToken" data-home-token placeholder="Paste the invitation link or code" autocomplete="off"><button class="svConnectButton" type="submit">Join our home</button><p data-home-error role="alert" hidden></p>';form.querySelector('input').value=pendingToken;form.addEventListener('submit',async e=>{e.preventDefault();let token=form.querySelector('input').value.trim();try{if(token.includes('://'))token=new URL(token).searchParams.get('invite')||'';}catch{}const ok=await act('/home/accept',{token},form.querySelector('[data-home-error]'));if(ok){const u=new URL(location.href);u.searchParams.delete('invite');history.replaceState(null,'',u.pathname+u.search+'#home');}});card.append(form);}
  region.append(card);
  if(localStorage.getItem('swiflytv.deviceState.legacy'))region.append(button('Import my earlier browser library',async()=>{try{await window.SwiflyAccount.importLegacy();error(status,{message:'Your earlier library is now saved to your account.'});}catch(e){error(status,e);}}));
 }
 async function share(media,{party=false}={}){
  const epoch=++shareEpoch;if(!['movie','tv'].includes(media?.type)||!/^\d+$/.test(String(media?.id)))return;
  const d=dialog('svShareDialog'),list=d.querySelector('[data-share-list]'),output=d.querySelector('[data-share-status]');output.textContent='';list.replaceChildren();d.querySelector('#svShareTitle').textContent=party?'Save them a seat.':'Send a little cinema.';
  if(!data){try{await refresh();}catch{}}
  if(epoch!==shareEpoch||!d.open)return;
  if(!data?.user){list.append(link('Sign in to send to a friend','/login?redirect='+encodeURIComponent(location.pathname+location.search),'svConnectButton'));return;}
  shareMedia={id:String(media.id),type:media.type};shareParty=party;
  for(const f of data.friends){const b=button('',async()=>{const payload={kind:party?'party':'title',media:{id:String(media.id),type:media.type},clientId:crypto.randomUUID?.()||String(Date.now())};b.disabled=true;try{const response=await api('/messages/'+f.id,{body:payload});if(epoch!==shareEpoch||!d.open)return;output.replaceChildren(el('span','',party?'Invitation sent. ':'Title sent. '));if(response.message?.partyUrl)output.append(link('Join your party ↗',response.message.partyUrl));else output.append(link('Open conversation ↗','/friends?friend='+f.id));b.textContent='Sent ✓';}catch(e){if(epoch===shareEpoch)error(output,e);b.disabled=false;}});b.dataset.shareFriend=f.id;b.append(avatar(f),el('span','',f.name));list.append(b);}
  if(!data.friends.length)list.append(el('p','svConnectEmpty','Add a friend in your social home, then send them something great.'));
  if(!party&&data.home)list.append(button('＋ Add to our shared watchlist',async()=>{if(await act('/home/titles',{media:shareMedia},output))output.textContent='Added to your shared watchlist.';}));
 }
 function activityUpdate(){
  clearTimeout(presenceTimer);if(disposed||!data?.user.settings?.shareWatching)return;const app=document.querySelector('.svPlayerPage'),video=app?.querySelector('[data-player-video]'),playing=!!video&&!video.paused&&!video.ended&&!document.hidden&&app.dataset.playerMode==='movie';const media=app?{id:app.dataset.playerId,type:app.dataset.playerType}:null;
  const key=playing?media.type+':'+media.id+':'+app.dataset.playerSeason+':'+app.dataset.playerEpisode:'';
  if(key!==lastPresence||playing){lastPresence=key;api('/presence',{body:{playing,media}}).catch(()=>{});}if(playing)presenceTimer=setTimeout(activityUpdate,35000);
 }
 function subscribe(){if(stream||disposed||!window.EventSource)return;stream=new EventSource('/api/connect/events');stream.addEventListener('change',()=>refresh().catch(()=>{}));stream.addEventListener('error',()=>{});}
 async function boot(){
  for(const d of document.querySelectorAll('.svConnectDialog')){d.querySelectorAll('[data-connect-close]').forEach(b=>b.addEventListener('click',()=>d.close()));d.addEventListener('click',e=>{if(e.target===d)d.close();});d.addEventListener('close',()=>{if(d.id==='svShareDialog')shareEpoch++;});}
  document.querySelectorAll('[data-connect-notifications]').forEach(b=>b.addEventListener('click',openNotifications));document.querySelector('[data-notifications-read]')?.addEventListener('click',()=>act('/notifications/read',{all:true},document.querySelector('[data-notification-error]')));
  document.addEventListener('click',e=>{const b=e.target.closest('[data-share-title]');if(!b)return;e.preventDefault();share({id:b.dataset.shareId,type:b.dataset.shareType},{party:b.dataset.shareParty==='true'});});
  const session=await window.SwiflyAccount?.ready;if(disposed)return;
  if(!session?.user){if(content){content.replaceChildren();const box=el('section','svConnectSignin');box.dataset.connectSignin='';box.append(el('h2','',session?.available===false?'Your social home is getting ready.':'Your people are a sign-in away.'),el('p','',session?.available===false?'Account sync needs a persistent database before friends and private messages can open.':'Create a server account to keep friends, private messages and a shared home across devices.'),link('Log in','/login?redirect='+encodeURIComponent(location.pathname+location.search),'svConnectButton svConnectPrimary'),link('Create account','/signup?redirect='+encodeURIComponent(location.pathname+location.search),'svConnectButton'));content.append(box);status.hidden=true;}return;}
  try{await refresh();subscribe();activityUpdate();}catch(e){error(status,e);}
 }
 document.addEventListener('play',activityUpdate,true);document.addEventListener('pause',activityUpdate,true);document.addEventListener('ended',activityUpdate,true);document.addEventListener('visibilitychange',()=>{activityUpdate();if(!document.hidden&&selected)loadThread(false);});
 window.addEventListener('pagehide',()=>{disposed=true;stream?.close();stream=null;clearTimeout(peopleTimer);clearTimeout(titleTimer);clearTimeout(presenceTimer);peopleController?.abort();titleController?.abort();shareEpoch++;threadEpoch++;clearPrivate();});
 document.addEventListener('swifly:account-suspended',()=>{stream?.close();stream=null;clearPrivate();});
 window.addEventListener('pageshow',e=>{if(e.persisted){disposed=false;Promise.resolve(window.SwiflyAccount.revalidate?.()).then(()=>refresh()).then(subscribe).catch(e=>{clearPrivate();if(content)content.append(link('Sign in to open your conversations','/login?redirect=%2Ffriends','svConnectButton svConnectPrimary'));error(status,e);});}});
 window.SwiflyConnect=Object.freeze({share,refresh,openNotifications});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
