'use strict';
const {icon}=require('./feature-kit');
function toggle(name,title,description){return `<label class="svPreferenceRow"><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" data-preference="${name}"><span class="svPreferenceSwitch" aria-hidden="true"></span></label>`;}
function settingsMarkup(){return `<main class="svSettingsPage dsPlainPage" data-settings-page>
 <header class="svSettingsHero"><div><span class="svSettingsEyebrow">MAKE YOURSELF AT HOME</span><h1>Your settings.</h1><p>The little things that make watching feel like you.</p></div><a href="/profiles">${icon('people')}Manage profiles${icon('arrow')}</a></header>
 <div class="svSettingsLayout"><nav class="svSettingsNav" aria-label="Settings sections"><a href="#appearance" aria-current="page">${icon('spark')}Appearance & playback</a><a href="#connections">${icon('shield')}Connections</a></nav>
 <div class="svSettingsSections"><section id="appearance" class="svSettingsCard" aria-labelledby="appearanceTitle"><header><span class="svSettingsSectionIcon">${icon('spark')}</span><div><h2 id="appearanceTitle">Appearance & playback</h2><p>Saved for your active profile.</p></div></header>
 ${toggle('spoilerMode','Hide spoilers','Soften episode images and summaries until you choose to reveal them.')}
 ${toggle('hideWatched','Hide watched titles','Dim completed titles and show a Watched badge.')}
 ${toggle('hideEpisodeBell','Hide the episode bell','Keep new episode notifications out of your navigation.')}
 ${toggle('autoSkipIntro','Skip intros automatically','Skip when a verified intro timestamp is available.')}
 ${toggle('rememberLastServer','Remember my last server','Try your previous server the next time you watch.')}
 <label class="svPreferenceRow svPreferenceSelect"><span><strong>Episode layout</strong><small>Choose how a season’s episodes appear.</small></span><select data-preference="episodeView"><option value="grid">Grid</option><option value="rows">Rows</option></select></label>
 <label class="svPreferenceRow svPreferenceSelect"><span><strong>Episode order</strong><small>Start from the beginning or find the latest.</small></span><select data-preference="episodeSort"><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
 <p class="svSettingsFootnote" data-preference-status role="status" aria-live="polite">Changes save automatically.</p></section>
 <section id="connections" class="svSettingsCard svTraktCard" aria-labelledby="traktTitle"><header><span class="svTraktMark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="15" stroke="currentColor" stroke-width="2.4"/><path d="m10 21 8 8 15-15M14 17l5 5 11-11" stroke="currentColor" stroke-width="2.6"/></svg></span><div><h2 id="traktTitle">Trakt</h2><p>Your watchlist and watched history, together.</p></div><span class="svTraktBadge" data-trakt-badge>Checking</span></header>
 <p class="svTraktStatus" data-trakt-status role="status">Checking your connection…</p>
 <p class="svTraktExplanation">Connect Trakt to send watchlist changes and watched movies or episodes from SwiflyTV. Choose <strong>Sync from Trakt</strong> to merge your Trakt watchlist and watched history into the active profile.</p>
 <a class="svSettingsButton svSettingsPrimary" data-trakt-signin href="/login?redirect=%2Fsettings" hidden>Sign in to connect${icon('arrow')}</a>
 <div class="svTraktActions"><button class="svSettingsButton svSettingsPrimary" type="button" data-trakt-link disabled>Connect Trakt${icon('arrow')}</button><button class="svSettingsButton svSettingsPrimary" type="button" data-trakt-sync hidden>${icon('check')}Sync from Trakt</button><button class="svSettingsButton" type="button" data-trakt-unlink hidden>Disconnect</button></div>
 <p class="svTraktMessage" data-trakt-message role="status" aria-live="polite"></p><p class="svSettingsFootnote">Imports keep your existing titles, folders and preferences. Trakt ratings, collections and playback position are not synced.</p></section>
 </div></div></main>`;}
module.exports={settingsMarkup};
