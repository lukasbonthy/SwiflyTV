'use strict';
const icons = {
  studio:'M12 3 14.7 9.3 21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z',
  look:'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1 1 0 0 1 .7-1.7H17a4 4 0 0 0 4-4 9 9 0 0 0-9-9Z M7 10h.01M10 6.5h.01M15 6.5h.01M18 10h.01',
  layout:'M3 4h18v5H3zM3 13h5v7H3zM11 13h5v7h-5zM19 13h2v7h-2z',
  motion:'M3 7h10M3 12h7M3 17h10M15 5l6 7-6 7',
  close:'m6 6 12 12M18 6 6 18',
  check:'m5 12 4 4L19 6',
  arrow:'M7 17 17 7M7 7h10v10'
};
const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+icons[name]+'"/></svg>';
const choices = (name, values, variant='') => '<div class="stChoices '+variant+'" role="group" aria-label="'+name+'">'+values.map(([value,label,extra])=>'<button type="button" class="stChoice" data-st-field="'+name+'" data-st-value="'+value+'" aria-pressed="false">'+(extra||'')+'<span>'+label+'</span></button>').join('')+'</div>';
const group = (label,description,content) => '<section class="stGroup"><div class="stGroupHead"><h3>'+label+'</h3><p>'+description+'</p></div>'+content+'</section>';
const layoutDemo = value => '<span class="stLayoutDemo stLayoutDemo--'+value+'" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
const preset = (value,title,copy) => '<button type="button" class="stPreset stPreset--'+value+'" data-st-preset="'+value+'" aria-pressed="false"><span class="stPresetArt" aria-hidden="true"><i class="stPresetNav"></i><i class="stPresetTitle"></i><i class="stPresetPoster"></i><i class="stPresetPoster"></i><i class="stPresetPoster"></i><b>'+icon('check')+'</b></span><strong>'+title+'</strong><small>'+copy+'</small></button>';
function studioMarkup() {
  return `<div class="svAuroraBackground" aria-hidden="true"><i class="svAuroraRibbon"></i></div>
  <div class="svAppearanceTexture" aria-hidden="true"></div>
  <dialog id="controlPanel" class="svStudioDialog" aria-labelledby="stTitle" aria-describedby="stDescription">
    <div class="stWorkspace">
      <header class="stHeader">
        <div class="stBrand"><span class="stMark">${icon('studio')}</span><div><h2 id="stTitle">Swifly Studio</h2><p id="stDescription">Your screen. Your style.</p></div></div>
        <span class="stHeaderHint"><kbd>Ctrl / ⌘ E</kbd></span>
        <button type="button" class="stIconButton" data-st-cancel aria-label="Close Studio">${icon('close')}</button>
      </header>
      <div class="stWorkspaceBody">
        <aside class="stSidebar">
          <span class="stSidebarLabel">PERSONALIZE</span>
          <div class="stNavigation" role="tablist" aria-label="Studio sections" aria-orientation="vertical">
            ${[['looks','Appearance','look'],['layout','Layout','layout'],['motion','Motion','motion']].map(([value,label,glyph],index)=>`<button type="button" id="stTab-${value}" role="tab" data-st-tab="${value}" data-st-tab-link="${value}" aria-controls="stPanel-${value}" aria-selected="${index===0}" tabindex="${index===0?0:-1}">${icon(glyph)}<span>${label}</span></button>`).join('')}
          </div>
          <div class="stSidebarNote"><span>Made for movie nights.</span><p>Preview a change.<br>Keep what feels right.</p></div>
          <button type="button" class="stReset" data-st-reset>Restore defaults</button>
        </aside>
        <div class="stContent" data-native-scroll>
          <section id="stPanel-looks" class="stPanel" role="tabpanel" aria-labelledby="stTab-looks">
            <div class="stPanelTitle"><span>01 / APPEARANCE</span><h2>Set the atmosphere.</h2><p>Start with a look, then make it your own.</p></div>
            <div class="stPresets" role="group" aria-label="Curated looks">
              ${preset('pure','Pure','Quiet & minimal')}${preset('cinema','Cinema','Warm & cinematic')}${preset('midnight','Midnight','Cool & glassy')}${preset('focus','Focus','Sharp & simple')}
            </div>
            ${group('Accent','A little color, exactly where it belongs.', choices('theme',[
              ['default','Pearl','<i class="stSwatch" style="--swatch:#ece9e2" aria-hidden="true"></i>'],
              ['red','Ember','<i class="stSwatch" style="--swatch:#e7baa3" aria-hidden="true"></i>'],
              ['blue','Ocean','<i class="stSwatch" style="--swatch:#a9c7ed" aria-hidden="true"></i>'],
              ['green','Sage','<i class="stSwatch" style="--swatch:#b4cbb8" aria-hidden="true"></i>'],
              ['mono','Silver','<i class="stSwatch" style="--swatch:#c1c1c7" aria-hidden="true"></i>']
            ],'stColors'))}
            ${group('Typography','Different personalities. The same readable screen.',choices('font',[
              ['default','Grotesk','<b class="stFontSample">Aa</b>'],['cinema','Cinema','<b class="stFontSample stFontSample--cinema">Aa</b>'],
              ['soft','Soft','<b class="stFontSample stFontSample--soft">Aa</b>'],['wide','Wide','<b class="stFontSample stFontSample--wide">Aa</b>']
            ],'stFonts'))}
            ${group('Glass','Choose how much of the scene shines through.', choices('glass',[['off','Solid'],['subtle','Soft glass'],['liquid','Liquid glass']],'stSegments'))}
            ${group('Atmosphere','Clean, softly textured, or a little northern light.',choices('backdrop',[['aurora','Aurora'],['smooth','Clean'],['grain','Film grain']],'stSegments stAtmosphere'))}
          </section>
          <section id="stPanel-layout" class="stPanel" role="tabpanel" aria-labelledby="stTab-layout" hidden>
            <div class="stPanelTitle"><span>02 / LAYOUT</span><h2>Room for your favorites.</h2><p>Change the gallery without changing what you watch.</p></div>
            ${group('Browse layout','Horizontal rows, larger posters, or the whole wall.',choices('layout',[
              ['default','Classic rows',layoutDemo('rows')],['cinema','Cinema rows',layoutDemo('cinema')],['posterwall','Poster wall',layoutDemo('wall')]
            ],'stLayouts'))}
            ${group('Poster corners','The finishing touch on artwork and history cards.',choices('cardstyle',[['sharp','Crisp'],['rounded','Rounded'],['softglass','Soft']],'stSegments'))}
            ${group('Spacing','Find the right balance for your screen.',choices('density',[['comfy','Comfortable'],['compact','Compact']],'stSegments'))}
          </section>
          <section id="stPanel-motion" class="stPanel" role="tabpanel" aria-labelledby="stTab-motion" hidden>
            <div class="stPanelTitle"><span>03 / MOTION</span><h2>It should feel effortless.</h2><p>Responsive movement, with you in control.</p></div>
            <label class="stToggleRow"><span><b>Smooth wheel scrolling</b><small>A short glide for desktop wheels and row arrows.</small></span><input type="checkbox" data-st-setting="smooth" role="switch"></label>
            <label class="stToggleRow"><span><b>Reduce motion</b><small>Keep scrolling native and turn off decorative movement.</small></span><input type="checkbox" data-st-setting="reduceMotion" role="switch"></label>
            <div class="stMotionNote"><span>${icon('check')}</span><p>Your device's Reduce motion preference always takes priority. Touch scrolling and video controls stay native.</p></div>
          </section>
        </div>
        <aside class="stPreviewColumn">
          <div class="stPreviewLabel"><span>LIVE PREVIEW</span><i></i></div>
          <div class="stPreview" data-st-preview aria-label="Preview of your appearance settings">
            <div class="stPreviewScene" data-st-preview-scene>
              <div class="stPreviewAurora" data-st-preview-aurora aria-hidden="true"><i class="svAuroraRibbon"></i></div>
              <div class="stPreviewNav"><b>SwiflyTV</b><span>Home</span><span>Movies</span><i></i></div>
              <div class="stPreviewCopy"><small>YOUR NEXT GREAT WATCH</small><h3 data-st-preview-title>Movie night, your way.</h3><p>Make yourself comfortable.</p><span class="stPreviewPlay">▶ &nbsp;Play</span></div>
            </div>
            <div class="stPreviewGallery"><h4>Made for your screen</h4><div class="stPreviewPosters">${Array.from({length:4},()=>'<div class="stPreviewPoster"><img alt="" hidden><span aria-hidden="true"></span></div>').join('')}</div><div class="stPreviewLines" aria-hidden="true"><i></i><i></i><i></i></div></div>
          </div>
          <div class="stPreviewSummary"><strong data-st-look-label>Your look</strong><span data-st-preview-description>Changes appear here and on your screen.</span></div>
          <p class="stPreviewFootnote">Preview uses artwork from the page you're browsing. Your library stays yours.</p>
        </aside>
      </div>
      <footer class="stFooter"><p role="status" aria-live="polite" data-st-status>No unsaved changes</p><div><button type="button" class="stCancel" data-st-cancel>Cancel</button><button type="button" class="stSave" data-st-save disabled>Save changes ${icon('arrow')}</button></div></footer>
    </div>
  </dialog>`;
}
module.exports={studioMarkup};
