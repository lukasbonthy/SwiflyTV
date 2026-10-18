'use strict';
const {playerMarkup}=require('./player');
const {watchroomCallMarkup}=require('./watchroom-call');
const paths={film:'M4 3h16v18H4zM4 7h16M4 17h16M8 3v4M16 3v4M8 17v4M16 17v4',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M20 21v-2a4 4 0 0 0-3-3.87M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M16 3.13a4 4 0 0 1 0 7.75',chat:'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',plus:'M12 5v14M5 12h14',link:'M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l1.5-1.5',arrow:'M5 12h14M12 5l7 7-7 7',back:'M19 12H5M12 5l-7 7 7 7',send:'m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13',refresh:'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11.6-2L20 8M4 16l2.4 3A7 7 0 0 0 18 17',play:'m9 5 11 7-11 7V5Z',pause:'M7 4v16M17 4v16',search:'M21 21l-4.4-4.4M10.5 3a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15',close:'m6 6 12 12M18 6 6 18',camera:'M15 10l6-4v12l-6-4M3 5h12v14H3z',mic:'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',screen:'M3 3h18v14H3zM8 21h8M12 17v4',home:'m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8'};
const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function partyMarkup(options={}){
 const rooms=options.initialTab==='rooms';
 return `<main class="svPartyHub svPartyPage" data-party-view="${rooms?'rooms':'chat'}" data-party-room="lobby" data-initial-tab="${esc(options.initialTab)}" data-room-id="${esc(options.requestedRoomId)}" data-room-name="${esc(options.initialRoomName)}" data-room-kind="${esc(options.initialKind)}" data-room-video-id="${esc(options.initialVideoId)}" data-room-embed-url="${esc(options.initialEmbedUrl)}" data-selected-movie-id="${esc(options.selectedMovieId||'')}" data-denied="${esc(options.denied)}" data-allowed-creators="${esc((options.allowedCreators||[]).join(','))}" data-open-room-creation="${options.openRoomCreation?'true':'false'}">
   <div class="partyPageAtmosphere" aria-hidden="true"><div class="partyHeroBackdrop" data-party-hero-art hidden></div><div class="partyHeroShade"></div></div>
   <header class="partyPageHeader">
     <div class="partyPageIdentity">
       <a href="/movies" class="partyBrowseLink" data-party-return>${icon('back')}Back to browsing</a>
       <span id="sv100Kind" class="partySrOnly">${rooms?'Watch together':'Community'}</span>
       <h1 id="sv100Title">${rooms?'Party Hub':'Community'}</h1>
       <p class="partyPageLead">${rooms?'Good films. Better company.':'For the love of a good film.'}</p>
     </div>
     <nav class="sv100ModeTabs partyNavigation partyModeNav" aria-label="Party Hub navigation">
       <button type="button" class="partySecondaryBtn ${rooms?'active':''}" data-tab="rooms">${icon('people')}Watch parties</button>
       <button type="button" class="partySecondaryBtn ${rooms?'':'active'}" data-tab="chat">${icon('chat')}Community</button>
       <span id="sv100RoleText" class="partySrOnly">Checking access</span>
     </nav>
     <div class="sv100ProfilePill"><span id="sv100Avatar">S</span><div><b id="sv100Name">Guest</b><small id="sv100Status" role="status">Connecting…</small></div><i class="partyConnectionDot" aria-hidden="true"></i></div>
   </header>
   <header class="sv103RoomHeader">
     <div class="partyRoomIdentity">
       <div class="partyRoomHeading"><h1 id="sv103RoomTitle">Party Hub</h1><span id="sv103HostStatus" class="partyHostBadge" role="status">Joining…</span></div>
       <p id="sv103RoomSub" class="partySrOnly" role="status">Make yourself comfortable.</p>
       <div class="partyRoomFacts"><span>${icon('people')}<b id="sv103ViewerCount">0</b> watching</span><button type="button" id="sv103RoomCode" data-action="copy-room-code" title="Copy room code">—</button><span class="partySrOnly">Playback <b id="sv103Timer">0:00</b></span></div>
     </div>
     <nav class="partyRoomActions" aria-label="Room actions">
       <details class="partyChecks"><summary class="partyIconBtn" aria-label="Check your camera or microphone" title="Device check">${icon('camera')}</summary><div><button class="partySecondaryBtn" type="button" data-action="voice">${icon('mic')}Mic check</button><button class="partySecondaryBtn" type="button" data-action="video">${icon('camera')}Camera check</button></div></details>
       <button class="partyPrimaryBtn" type="button" data-action="copy-room-link">${icon('link')}Invite friends</button>
       <button class="partySecondaryBtn" type="button" data-action="leave-native-room">Leave</button>
     </nav>
   </header>
   <div class="partyLayout">
     <nav class="partyCommunityNav" data-nav-panel="chat" aria-label="Conversations">
       <div class="partyCommunityHeading">${icon('chat')}<h2>Your conversations</h2></div>
       <section class="sv100ChannelGroup"><header><span>Social Lounges</span><button type="button" class="partyIconBtn" data-action="new-channel" data-requires="channels" aria-label="Create a community channel">${icon('plus')}</button></header><button type="button" class="sv100Channel active" data-room="channel-general" data-title="General" aria-current="true"><span class="partyChannelGlyph" aria-hidden="true">#</span><span>General<small>All things film</small></span></button><button type="button" class="sv100Channel" data-room="channel-recommendations" data-title="Recommendations" aria-current="false"><span class="partyChannelGlyph" aria-hidden="true">#</span><span>Recommendations<small>Your next great watch</small></span></button></section>
       <section class="sv100ChannelGroup"><header><span>Private Rooms</span><button type="button" class="partyIconBtn" data-action="new-group" data-requires="groups" aria-label="Create a private group">${icon('plus')}</button></header><button type="button" class="sv100Channel" data-room="group-watchparty" data-title="Movie night" aria-current="false">${icon('people')}<span>Movie night<small>Your private conversation</small></span></button></section>
       <a class="partyCommunityWatch" href="/social?tab=watchrooms">${icon('film')}<span>Make it a movie night<small>Start a watch party</small></span>${icon('arrow')}</a>
     </nav>
     <section class="sv100Main partyMain">
       <section id="sv100RoomsPanel" class="sv100Panel sv100RoomsPanel ${rooms?'active':''}" aria-label="Watch parties">
         <div class="sv103RoomShell">
           <section id="sv103NativeRoom" class="sv103NativeRoom" hidden>
             <div class="sv103Stage"><div id="sv103Player" class="sv103Player"><div class="sv103EmptyPlayer">${icon('screen')}<b>Choose the first film.</b><span>The host can choose a movie, TV show or video link below.</span></div></div></div>
             ${watchroomCallMarkup()}
             <div class="partyNowWatching" data-party-now-watching hidden><img data-party-now-art alt="" hidden/><div><span class="partyEyebrow" data-party-now-label>Selected film</span><a data-party-now-link><b data-party-now-title></b>${icon('arrow')}</a></div></div>
             <div class="partyRoomEpisodes" data-party-room-episodes hidden></div>
             <div id="sv103ControlDock" class="sv103ControlDock" role="note" hidden><p>Use the video’s own controls. Link playback is manual and isn’t synchronized.</p></div>
             <details class="partyMediaTools hostOnly">
               <summary>${icon('film')}Change what’s playing <span>Movies, TV shows or video link</span>${icon('plus')}</summary>
               <section class="sv103ToolsGrid">
                 <form id="sv103MovieForm" class="sv103ToolCard"><label for="partyMovieQuery">Find something to watch</label><label class="partyMediaTypeLabel">Choose from<select data-party-room-media-type aria-label="Room search category"><option value="movie">Movies</option><option value="tv">TV shows</option></select></label><div class="partyInputAction"><input id="partyMovieQuery" name="movieId" type="search" placeholder="Search titles" autocomplete="off" maxlength="120"/><button type="submit" class="partyIconBtn" aria-label="Search titles">${icon('search')}</button></div><div id="partyMovieResults" class="partyMovieResults" aria-live="polite"></div></form>
                 <form id="partyRoomEpisodeForm" class="sv103ToolCard partyEpisodeChoice" hidden><h3 data-party-room-choice-title></h3><div data-party-room-choice-fields></div><button type="submit" class="partyPrimaryBtn">Watch episode ${icon('play')}</button><p data-party-room-choice-status role="status"></p></form>
                 <form id="sv103SetMediaForm" class="sv103ToolCard"><label for="partyMediaUrl">Use a video link</label><div class="partyInputAction"><input id="partyMediaUrl" name="mediaUrl" type="url" placeholder="YouTube or video page URL" maxlength="1000"/><button type="submit" class="partyIconBtn" aria-label="Set video link">${icon('arrow')}</button></div><p>Video pages open in their embedded player.</p></form>
               </section>
             </details>
           </section>
           <section id="sv103RoomLobby" class="sv103RoomLobby">
             <div class="partyLobbyStart">
               <section class="partyHero" aria-labelledby="partyHeroTitle">
                 <div class="partyHeroCopy"><span class="partyHeroLabel" data-party-hero-label>Your next shared screen</span><h2 id="partyHeroTitle">Make it a movie night.</h2><p class="partyHeroOverview" data-party-hero-copy>Pick a film. Bring your people.</p></div>
                 <button class="partyHeroPick" data-party-featured-host type="button" hidden>${icon('play')}<span><b>Host with this film</b><small data-party-hero-film></small></span>${icon('arrow')}</button>
               </section>
               <div class="partySetup" id="partySetup">
                 <div class="partyEntryTabs" role="tablist" aria-label="Start or join a watch party" data-party-entry-tabs hidden>
                   <button type="button" id="partyHostTab" role="tab" aria-selected="true" aria-controls="partyHostPanel" data-party-entry="create">Host a party</button>
                   <button type="button" id="partyJoinTab" role="tab" aria-selected="false" aria-controls="partyJoinPanel" tabindex="-1" data-party-entry="join">Join a party</button>
                 </div>
                 <div id="partyHostPanel" class="partyEntryPanel" data-party-entry-panel="create" role="tabpanel" aria-labelledby="partyHostTab">
                   <form class="partyEntryForm creatorOnly partyCreateCard" method="get" action="/watchrooms/new" id="sv100CreateRoomForm">
                     <input type="hidden" name="creator" id="sv100CreatorInput" value=""/><input type="hidden" name="social" value="1"/>
                     <div id="partySelectedMovie" class="partySelectedMovie" hidden aria-live="polite"></div>
                     <div class="partyEpisodeChoice" data-party-lobby-episode-choice hidden></div>
                     <div class="partyCardHeading"><h3>Your movie night.</h3><p>Name your party. Pick a movie or TV show, or decide together.</p></div>
                     <label for="partyRoomName">Party name<input id="partyRoomName" name="name" placeholder="Friday movie night" maxlength="80" autocomplete="off"/></label>
                     <details class="partyLinkChoice"><summary>Use a video link</summary><label for="partyStartLink">Video link<input id="partyStartLink" name="watchLink" type="url" placeholder="YouTube or a video page" maxlength="1000"/></label></details>
                     <button class="partyPrimaryBtn" type="submit">Create watch party ${icon('arrow')}</button>
                     <p data-party-create-status class="partyFormStatus" role="status"></p><p id="sv100PermText" class="partyAccess partySrOnly">Checking room access…</p>
                   </form>
                   <div class="lockedOnly partyLocked" hidden><h3>Join your friends</h3><p>Hosting is unavailable here. Use a room code or invite to join your friends.</p></div>
                 </div>
                 <div id="partyJoinPanel" class="partyEntryPanel" data-party-entry-panel="join" role="tabpanel" aria-labelledby="partyJoinTab">
                   <form class="partyEntryForm partyJoinCard" method="get" action="/watchrooms/join" id="partyJoinForm">
                     <div class="partyCardHeading"><h3>Find your people.</h3><p>Use the room code or link your host shared.</p></div>
                     <label for="partyInvite">Room code or invite link<input id="partyInvite" name="code" placeholder="Paste a room code or invite" maxlength="1600" autocomplete="off" spellcheck="false"/></label>
                     <button class="partyPrimaryBtn" type="submit">Join watch party ${icon('arrow')}</button><p data-party-join-status class="partyFormStatus" role="status"></p>
                   </form>
                 </div>
               </div>
             </div>
             <section class="partyFilmSection" aria-labelledby="partyFilmTitle">
               <header class="partySectionHead"><div><span class="partyEyebrow">The hardest part is choosing</span><h2 id="partyFilmTitle">Worth watching together.</h2></div><a class="partyTextLink" href="/movies">Browse movies ${icon('arrow')}</a></header>
               <form id="partyLobbyMovieForm" class="partyLobbySearch"><label for="partyLobbyMovieQuery" class="partySrOnly">Find a movie or TV show for your party</label>${icon('search')}<select data-party-lobby-media-type aria-label="Search category"><option value="movie">Movies</option><option value="tv">TV shows</option></select><input id="partyLobbyMovieQuery" type="search" placeholder="Search titles" autocomplete="off" maxlength="120"/><button type="submit" class="partySecondaryBtn">Search</button></form>
               <div id="partyLobbyMovieResults" class="partyFilmRail" aria-live="polite"></div><div id="partyFeaturedMovies" class="partyFilmRail"><p class="partyFilmStatus" role="status">Finding films for tonight…</p></div>
             </section>
             <section class="partyFilmSection partyShowSection" aria-labelledby="partyShowTitle">
               <header class="partySectionHead"><div><span class="partyEyebrow">One more episode, together</span><h2 id="partyShowTitle">Shows worth sharing.</h2><p>Choose a show, then pick your season and episode.</p></div><a class="partyTextLink" href="/tv">Browse TV shows ${icon('arrow')}</a></header>
               <div id="partyFeaturedShows" class="partyFilmRail" aria-live="polite" aria-busy="true"><p class="partyFilmStatus" role="status">Finding shows for your next series night…</p></div>
             </section>
             <section class="sv100ActiveRooms partyRoomDirectory" aria-labelledby="partyDirectoryTitle">
               <header class="partySectionHead"><div><h2 id="partyDirectoryTitle">Open parties <small id="partyRoomCount"></small></h2><p>A seat at someone’s movie night.</p></div><button type="button" class="partyIconBtn" data-action="refresh-rooms" aria-label="Refresh party list">${icon('refresh')}</button></header>
               <div id="sv100RoomsList" class="sv100RoomsList" aria-live="polite"><p class="partyEmpty">Finding open parties…</p></div>
             </section>
           </section>
         </div>
       </section>
       <div data-party-main-chat-slot>
         <section id="sv100ChatPanel" class="sv100Panel ${rooms?'':'active'}" aria-label="Chat"><header class="partyCommunityHeader"><span class="partyChannelMark" aria-hidden="true">#</span><div><small data-party-channel-kind>Community channel</small><h2 data-party-channel-title>General</h2><p data-party-chat-description>Talk films with the community.</p></div></header><div id="sv100Messages" class="sv100Messages" role="log" aria-label="Messages" aria-live="polite"></div><form id="sv100Composer" class="sv100Composer"><label for="sv100Input" class="partySrOnly">Chat message</label><input id="sv100Input" placeholder="Message General…" autocomplete="off" maxlength="220"/><button type="submit" class="partyIconBtn" aria-label="Send message">${icon('send')}</button></form></section>
       </div>
     </section>
     <aside class="partyConversation" data-party-conversation hidden>
       <header class="partyChatHeader"><div>${icon('chat')}<h2>Room chat</h2></div><span id="sv100MemberCount">Connecting…</span></header>
       <details class="partyPeople"><summary>${icon('people')}Who’s here <span aria-hidden="true">+</span></summary><div id="sv100MembersList"><p>Waiting for the room…</p></div></details>
       <div data-party-chat-dock></div>
     </aside>
   </div>
   <dialog id="sv100CallModal" class="sv100CallModal" aria-labelledby="sv100CallTitle" aria-describedby="partyDeviceNote"><div class="sv100CallCard"><header><div><span id="sv100CallType">Device check</span><h2 id="sv100CallTitle">Preview</h2></div><button type="button" class="partyIconBtn" data-action="close-call" aria-label="Close device check">${icon('close')}</button></header><div class="sv100CallStage"><video id="sv100LocalVideo" autoplay muted playsinline></video><div>${icon('camera')}<b id="sv100CallStatus">Ready</b></div></div><p id="partyDeviceNote" class="partyDeviceNote">This is a local preview. Your camera and microphone are not sent to other people.</p><footer><button type="button" class="partySecondaryBtn" data-action="mute">${icon('mic')}Toggle mic</button><button type="button" class="partySecondaryBtn" data-action="camera">${icon('camera')}Toggle camera</button><button type="button" class="partyPrimaryBtn" data-action="close-call">Done</button></footer></div></dialog>
   <template id="partyPlayerTemplate">${playerMarkup({embedded:true,managed:true,videoId:'sv103Video',title:'Party playback'})}</template>
   <div id="sv100Toast" class="sv100Toast" hidden role="status"></div><div id="sv100Error" class="sv100Error" hidden role="alert"></div>
 </main>`;
}
module.exports={partyMarkup};
