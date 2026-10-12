'use strict';
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const glyph = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+({people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M20 21v-2a4 4 0 0 0-3-3.87M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M16 3.13a4 4 0 0 1 0 7.75',close:'m6 6 12 12M18 6 6 18',link:'M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l1.5-1.5',send:'m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13',refresh:'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11.6-2L20 8M4 16l2.4 3A7 7 0 0 0 18 17'}[name])+'"/></svg>';
function joinForm(id) {
 return `<form class="svPartyJoinForm" data-party-join-form><label for="${id}">Join your friends</label><div><input id="${id}" name="invite" placeholder="Paste an invite or room code" required autocomplete="off" maxlength="500"/><button class="dsSecondaryBtn" type="submit">Join</button></div></form>`;
}
function watchPartyMarkup({movieId='',title='Movie'}={}) {
 return `<section class="svInlineParty" data-watch-party data-party-movie-id="${esc(movieId)}" hidden>
  <header class="svInlinePartyHead"><div><span class="dsEyebrow">WATCH TOGETHER</span><h2 data-party-room-name>Movie night</h2></div><button class="dsIconBtn" type="button" data-party-leave aria-label="Leave watch party" title="Leave party">${glyph('close')}</button></header>
  <div class="svInlinePartyConnection"><span data-party-connection role="status">Connecting…</span><span data-party-role>Guest</span></div>
  <div class="svInlinePartyActions"><button class="dsSecondaryBtn" type="button" data-party-invite>${glyph('link')}Invite friends</button><button class="dsIconBtn" type="button" data-party-sync aria-label="Sync with the host" title="Sync with host">${glyph('refresh')}</button></div>
  <details class="svInlinePartyPeople"><summary>${glyph('people')}<span data-party-member-count>Who’s here</span></summary><ul data-party-members></ul></details>
  <div class="svInlinePartyMessages" data-party-messages role="log" aria-label="Party messages" aria-live="polite"><p class="svPartyEmpty">The film’s better with company. Say hello.</p></div>
  <form class="svInlinePartyComposer" data-party-chat-form><label class="svPartySrOnly" for="svInlinePartyMessage">Message your party</label><input id="svInlinePartyMessage" name="message" placeholder="Talk about the film…" autocomplete="off" maxlength="220" disabled/><button type="submit" class="dsIconBtn" aria-label="Send party message" disabled>${glyph('send')}</button></form>
  <p class="svInlinePartyStatus" data-party-status role="status"></p>
 </section>
 <dialog class="svWatchPartyDialog" aria-labelledby="svWatchPartyTitle" aria-describedby="svWatchPartyDescription">
  <header><div><span class="dsEyebrow">A FILM. YOUR PEOPLE.</span><h2 id="svWatchPartyTitle">Watch together</h2></div><button class="dsIconBtn" type="button" data-party-dialog-close aria-label="Close party setup">${glyph('close')}</button></header>
  <p id="svWatchPartyDescription">Same film, same moment. The host controls playback for everyone.</p>
  <form class="svPartyCreateForm" data-party-create-form><div class="svPartySelectedTitle">${glyph('people')}<div><small>TONIGHT’S FILM</small><strong data-party-selected-title>${esc(title)}</strong></div></div><label for="svPartyRoomName">Party name</label><input id="svPartyRoomName" name="roomName" value="Movie night" maxlength="80" required/><button class="dsPrimaryBtn" type="submit">Start watch party</button></form>
  <div class="svPartyFormDivider"><span>or join a party</span></div>${joinForm('svPlayerPartyInvite')}
  <p class="svPartySetupStatus" data-party-setup-status role="status"></p>
 </dialog>`;
}
function partyBrowseMarkup() {
 return `<section class="svPartyBrowse" data-party-browse aria-labelledby="svPartyBrowseTitle"><div class="svPartyBrowseIntro">${glyph('people')}<div><h2 id="svPartyBrowseTitle">Watch together</h2><p>Pick any movie below, then start a party from its details.</p></div></div>${joinForm('svBrowsePartyInvite')}<details class="svPartyDirectory" data-party-directory><summary class="dsSecondaryBtn">Open parties</summary><section><header><h3>Watching now</h3><button class="dsIconBtn" type="button" data-party-refresh aria-label="Refresh open parties">${glyph('refresh')}</button></header><div data-party-rooms><p class="svPartyEmpty">Open the list to find your friends.</p></div><p data-party-directory-status role="status"></p><a class="svPartyCommunityLink" href="/social?tab=chat">Community conversations</a></section></details><p class="svPartyBrowseStatus" data-party-setup-status role="status"></p></section>`;
}
module.exports={watchPartyMarkup,partyBrowseMarkup};
