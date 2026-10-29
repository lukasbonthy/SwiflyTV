'use strict';
const icons = {
  studio:'M12 3 14.7 9.3 21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z',
  look:'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1 1 0 0 1 .7-1.7H17a4 4 0 0 0 4-4 9 9 0 0 0-9-9Z M7 10h.01M10 6.5h.01M15 6.5h.01M18 10h.01',
  layout:'M3 4h18v5H3zM3 13h5v7H3zM11 13h5v7h-5zM19 13h2v7h-2z',
  motion:'M3 7h10M3 12h7M3 17h10M15 5l6 7-6 7',
  navigation:'M4 5h16M4 12h16M4 19h16',player:'M4 4h16v16H4zM10 8l6 4-6 4z',atmosphere:'M3 17c3-10 6 8 9-2s6 8 9-2',hud:'M4 4h16v13H8l-4 4z',devices:'M3 4h18v13H3zM8 21h8M12 17v4',access:'M12 3h.01M4 8h16M12 8v6M8 21l4-7 4 7',themes:'M4 4h7v7H4zM14 4h6v7h-6zM4 14h7v6H4zM14 14h6v6h-6z',
  wallpaper:'M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M16 8h.01',close:'m6 6 12 12M18 6 6 18',
  check:'m5 12 4 4L19 6',
  arrow:'M7 17 17 7M7 7h10v10'
};
const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#stIcon-'+name+'"/></svg>';
const iconDefinitions = () => '<svg width="0" height="0" aria-hidden="true" style="position:absolute;pointer-events:none"><defs>'+Object.entries(icons).map(([name,d])=>'<symbol id="stIcon-'+name+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="'+d+'"/></symbol>').join('')+'</defs></svg>';
const choices = (name, values, variant='') => '<div class="stChoices '+variant+'" role="group" aria-label="'+name+'">'+values.map(([value,label,extra])=>'<button type="button" class="stChoice" data-st-field="'+name+'" data-st-value="'+value+'">'+(extra||'')+'<span>'+label+'</span></button>').join('')+'</div>';
const reset = name => '<button type="button" class="stSectionReset" data-st-reset-section="'+name+'">Reset this section</button>';
const toggle = (name,label,copy='') => '<label class="stToggleRow"><span><b>'+label+'</b><small>'+copy+'</small></span><input type="checkbox" data-st-input="'+name+'" role="switch"></label>';
const select = (name,label,values,copy='') => '<label class="stInputRow"><span><b>'+label+'</b>'+(copy?'<small>'+copy+'</small>':'')+'</span><select data-st-input="'+name+'">'+values.map(v=>'<option value="'+v[0]+'">'+v[1]+'</option>').join('')+'</select></label>';
const advanced = content => '<div data-st-advanced hidden>'+content+'</div>';
const range = (name,label,min,max,unit='%',step=1) => {const markup='<label class="stRangeRow"><span><b>'+label+'</b><output data-st-output="'+name+'"></output></span><input type="range" data-st-input="'+name+'" min="'+min+'" max="'+max+'" step="'+step+'" data-st-unit="'+unit+'"></label>';return ['uiScale','captionSize','tvScale'].includes(name)?markup:advanced(markup);};
const color = (name,label) => advanced('<label class="stInputRow stColorRow"><span><b>'+label+'</b><small>HEX color · #RGB or #RRGGBB</small></span><span><i data-st-color-swatch="'+name+'" aria-hidden="true"></i><input type="text" maxlength="7" spellcheck="false" autocomplete="off" inputmode="text" data-st-input="'+name+'" aria-label="'+label+' HEX color" aria-describedby="stColorError"></span></label>');
const title = (number,name,heading,copy) => '<div class="stPanelTitle"><span>'+number+' / '+name+'</span><h2>'+heading+'</h2><p>'+copy+'</p></div>';
const group = (label,description,content,advancedOnly=false) => '<section class="stGroup"'+(advancedOnly?' data-st-advanced hidden':'')+'><div class="stGroupHead"><h3>'+label+'</h3><p>'+description+'</p></div>'+content+'</section>';
const layoutDemo = value => '<span class="stLayoutDemo stLayoutDemo--'+value+'" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
const preset = (value,title,copy,season='') => '<button type="button" class="stPreset stPreset--'+value+'" data-st-preset="'+value+'" data-st-field="themeId" data-st-value="'+value+'"><span class="stPresetArt" aria-hidden="true"><span class="stThemeScene"></span><span class="stThemeSignature">SWIFLY<span>'+title+'</span></span><span class="stThemePalette"><i></i><i></i><i></i></span><b>'+icon('check')+'</b>'+(season?'<em>'+season+'</em>':'')+'</span><strong>'+title+'</strong><small>'+copy+'</small></button>';
const wallpaper = (value,label,copy) => '<button type="button" class="stWallpaperChoice stWallpaperChoice--'+value+'" data-st-field="wallpaper" data-st-value="'+value+'"><span class="stWallpaperSwatch" aria-hidden="true"><i>'+icon('check')+'</i></span><b>'+label+'</b><small>'+copy+'</small></button>';
function studioMarkup() {
  return `${iconDefinitions()}<div class="svWallpaperBackdrop" aria-hidden="true"></div><div class="svThemeBackdrop" aria-hidden="true"></div>
  <div class="svAuroraBackground" aria-hidden="true"><i class="svAuroraGlow"></i><i class="svAuroraRibbon svAuroraRibbon--first"></i><i class="svAuroraRibbon svAuroraRibbon--second"></i><i class="svAuroraRibbon svAuroraRibbon--third"></i></div>
  <div class="svAppearanceTexture" aria-hidden="true"></div>
  <dialog id="controlPanel" class="svStudioDialog" data-st-editor-mode="simple" aria-labelledby="stTitle" aria-describedby="stDescription">
    <div class="stWorkspace">
      <div class="stStudioAtmosphere" aria-hidden="true"><i class="svAuroraRibbon svAuroraRibbon--first"></i></div>
      <header class="stHeader">
        <div class="stBrand"><span class="stMark">${icon('studio')}</span><div><h2 id="stTitle">Swifly Studio</h2><p id="stDescription">Your screen. Your style.</p></div></div>
        <label class="stModeToggle"><input type="checkbox" data-st-advanced-toggle aria-describedby="stModeNote"><span>Advanced controls</span><i aria-hidden="true"></i></label>
        <button type="button" class="stIconButton" data-st-cancel aria-label="Close Studio">${icon('close')}</button>
      </header>
      <div class="stWorkspaceBody">
        <aside class="stSidebar">
          <span class="stSidebarLabel">PERSONALIZE</span>
          <div class="stNavigation" role="tablist" aria-label="Studio sections" aria-orientation="vertical">
            ${[['looks','Themes','look'],['wallpapers','Wallpapers','wallpaper'],['layout','Homepage','layout'],['navigation','Navigation','navigation'],['player','Player','player'],['atmosphere','Atmosphere','atmosphere'],['hud','Social & AI','hud'],['motion','Motion & loading','motion'],['devices','This screen','devices'],['access','Comfort','access'],['themes','Saved looks','themes']].map(([value,label,glyph],index)=>`<button type="button" id="stTab-${value}" role="tab" data-st-tab="${value}" data-st-tab-link="${value}"${['navigation','atmosphere','hud','motion'].includes(value)?' data-st-advanced-tab hidden':''} aria-controls="stPanel-${value}" aria-selected="${index===0}" tabindex="${index===0?0:-1}">${icon(glyph)}<span>${label}</span></button>`).join('')}
          </div>
          <div class="stSidebarNote"><span data-st-owner-label>This browser · Guest</span><p>Preview a change.<br>Save when it feels right.</p></div>
          <button type="button" class="stReset" data-st-reset>Restore defaults</button>
        </aside>
        <div class="stContent" data-native-scroll>
          <p id="stModeNote" class="stModeNote" data-st-mode-note role="status">Simple view · Pick a theme, adjust what matters, then Save.</p>
          <section id="stPanel-looks" class="stPanel" role="tabpanel" aria-labelledby="stTab-looks">
            <div class="stPanelTitle"><span>MAKE IT YOURS</span><h2>A different kind of movie night.</h2><p>Choose a scene. Your whole screen changes with it.</p></div>
            ${toggle('themeDetails','Theme details','Petals, webs, snow and the finishing touches that make each theme its own.')}
            <div class="stThemeMobilePreview" data-st-theme-mobile-preview aria-hidden="true"><i class="stPreviewAurora"><i class="svAuroraRibbon svAuroraRibbon--first"></i></i><b>SWIFLYTV</b><span>Your theme, brought to life.</span><small>LIVE PREVIEW</small></div>
            <div class="stPresets" role="group" aria-label="Curated themes">
              ${preset('pure','Swifly Original','Pearl accents. Northern light.')}${preset('blossom','Blossom','Falling petals. Flowering branches.')}${preset('halloween','Halloween','Corner webs. Hanging spiders.','SEASONAL')}${preset('winter','Winter Lights','Falling snow. Warm string lights.','SEASONAL')}${preset('cinema','Cinema','Projector dust. Film-frame details.')}${preset('midnight','Midnight','Starlight. A passing meteor.')}${preset('forest','Forest','Drifting leaves. Woodland ferns.')}${preset('focus','Focus','Pure graphite. Nothing in the way.')}
            </div>
            <p class="stThemePromise">Themes keep your library, navigation and comfort settings.</p>
            ${group('Accent','A little color, exactly where it belongs.', choices('theme',[
              ['default','Pearl','<i class="stSwatch" style="--swatch:#ece9e2" aria-hidden="true"></i>'],
              ['red','Red','<i class="stSwatch" style="--swatch:#e7baa3" aria-hidden="true"></i>'],
              ['blue','Blue','<i class="stSwatch" style="--swatch:#a9c7ed" aria-hidden="true"></i>'],
              ['green','Green','<i class="stSwatch" style="--swatch:#b4cbb8" aria-hidden="true"></i>'],
              ['mono','Silver','<i class="stSwatch" style="--swatch:#c1c1c7" aria-hidden="true"></i>'],
              ['purple','Purple','<i class="stSwatch" style="--swatch:#c8b4ee" aria-hidden="true"></i>'],['orange','Orange','<i class="stSwatch" style="--swatch:#edbc8b" aria-hidden="true"></i>'],['pink','Pink','<i class="stSwatch" style="--swatch:#e9b0cd" aria-hidden="true"></i>'],['cyan','Cyan','<i class="stSwatch" style="--swatch:#9fdadf" aria-hidden="true"></i>']
            ],'stColors'))}
            ${group('Typography','Different personalities. The same readable screen.',choices('font',[
              ['default','Grotesk','<b class="stFontSample">Aa</b>'],['cinema','Cinema','<b class="stFontSample stFontSample--cinema">Aa</b>'],
              ['soft','Soft','<b class="stFontSample stFontSample--soft">Aa</b>'],['wide','Wide','<b class="stFontSample stFontSample--wide">Aa</b>']
            ],'stFonts'))}
            ${group('Glass','Choose how much of the scene shines through.', choices('glass',[['off','Solid'],['subtle','Soft glass'],['liquid','Liquid glass']],'stSegments'))}
            ${group('Custom palette','A coordinated accent and dark canvas across your screen.',toggle('customColors','Use custom colors','Turn on to apply your HEX colors instead of the curated accent.')+color('accentColor','Primary accent')+color('accentSecondary','Second accent')+color('canvasColor','Canvas tint')+range('gradientAngle','Gradient direction',0,360,'°')+range('gradientStrength','Gradient intensity',0,30)+reset('theme'),true)}
            <p id="stColorError" class="stInlineMessage" data-st-color-error role="status" aria-live="polite"></p>
            <p class="stInlineMessage" data-st-contrast-warning role="status" aria-live="polite" hidden></p>
            ${group('Glass detail','One material, with safe limits for the whole interface.',range('glassOpacity','Surface opacity',15,95)+range('glassBlur','Blur',0,28,'px')+range('glassEdge','Edge strength',0,100)+range('glassGlow','Highlight intensity',0,30)+reset('glass'),true)}
          </section>
          <section id="stPanel-wallpapers" class="stPanel" role="tabpanel" aria-labelledby="stTab-wallpapers" hidden>
            <div class="stPanelTitle"><span>SET THE SCENE</span><h2>A window into your world.</h2><p>A canvas behind the interface. Your theme adds the finishing touches.</p></div>
            <div class="stWallpaperPreview" aria-label="Wallpaper preview"><small>YOUR SWIFLY, YOUR SCENE</small><strong>Stay a little longer.</strong><span>Soft surfaces. Clear text. A view that feels like you.</span><i aria-hidden="true">▶ &nbsp; Movie night</i></div>
            <div class="stWallpapers" role="group" aria-label="Wallpaper collection">${wallpaper('theme','Match my theme','The original theme canvas')}${wallpaper('aurora','Northern light','The original flowing Aurora')}${wallpaper('moonlit','Moonlit woods','Violet mist and a quiet moon')}${wallpaper('winter','Winter evening','Snow, cabins and warm light')}${wallpaper('velvet','Velvet dusk','Soft color, no photograph')}${wallpaper('upload','Your wallpaper','A picture of your own')}</div>
            <section class="stWallpaperUpload"><div><h3>Bring your own view.</h3><p>PNG, JPG or WebP · up to 8 MB. Optimized here for a faster screen.</p></div><label class="stWallpaperUploadButton">Choose image<input type="file" data-st-wallpaper-file accept="image/png,image/jpeg,image/webp" aria-label="Upload a custom wallpaper"></label><p data-st-wallpaper-status role="status" aria-live="polite">Saved for this profile on this browser. Included in theme exports and account backups.</p><button type="button" class="stTextAction" data-st-wallpaper-remove hidden>Remove uploaded image</button></section>
            ${group('Make room for the story','A darker canvas keeps titles, menus and buttons easy to read.','<div class="stWallpaperTreatments" role="group" aria-label="Wallpaper readability"><button type="button" data-st-wallpaper-treatment="cinema">Cinema <small>Quiet & dark</small></button><button type="button" data-st-wallpaper-treatment="balanced">Balanced <small>A little of both</small></button><button type="button" data-st-wallpaper-treatment="scenic">Scenic <small>More of the view</small></button></div>')}
            ${toggle('wallpaperAurora','Aurora over the wallpaper','Keep the original ribbons above your image. Still on TV and with Reduce motion.')}
            ${toggle('wallpaperTint','Use colors from the wallpaper','Coordinate accents and surfaces. Your manual colors are kept underneath.')}
            ${group('Framing & light','Adjust the picture without moving the interface.',range('wallpaperDim','Wallpaper dimming',40,85)+range('wallpaperBlur','Wallpaper softness',0,12,'px')+range('wallpaperX','Horizontal framing',0,100)+range('wallpaperY','Vertical framing',0,100)+color('wallpaperColor','Wallpaper palette')+reset('wallpaper'),true)}
            <p class="stHelp">Changing themes keeps your wallpaper. High contrast and Minimal mode use a clean canvas while keeping your choice saved.</p>
          </section>
          <section id="stPanel-layout" class="stPanel" role="tabpanel" aria-labelledby="stTab-layout" hidden>
            <div class="stPanelTitle"><span>02 / LAYOUT</span><h2>Room for your favorites.</h2><p>Change the gallery without changing what you watch.</p></div>
            <details class="stSimpleDetails"><summary>Choose and arrange homepage rows</summary>${group('Homepage rows','Hide a row without losing its titles. Use Up / Down or drag.', '<ol class="stOrderList" data-st-order-list="home" aria-label="Homepage row order"></ol><p class="stHelp" data-st-home-help>Rows with no titles return when content becomes available.</p>'+reset('home'))}</details>
            ${select('heroMode','Featured artwork',[['cinematic','Cinematic hero'],['compact','Compact hero'],['banner','Wide banner']],'Uses actual artwork from the catalog.')}
            ${select('heroPosition','Hero placement',[['first','Before content rows'],['after-first','After the first row']])}
            ${range('posterWidth','Poster width',120,260,'px')}${range('homeColumns','Grid columns',3,8,' columns')}
            ${select('rowShape','Content rows',[['rail','Horizontal rail'],['grid','Responsive grid']],'Columns adapt to the available screen width.')}
            ${group('Browse layout','Horizontal rows, larger posters, or the whole wall.',choices('layout',[
              ['default','Classic rows',layoutDemo('rows')],['cinema','Cinema rows',layoutDemo('cinema')],['posterwall','Poster wall',layoutDemo('wall')]
            ],'stLayouts'))}
            ${group('Poster corners','The finishing touch on artwork and history cards.',choices('cardstyle',[['sharp','Crisp'],['rounded','Rounded'],['softglass','Soft']],'stSegments'))}
            ${group('Spacing','Find the right balance for your screen.',choices('density',[['comfy','Comfortable'],['compact','Compact']],'stSegments'))}
            ${group('Poster interactions','Mouse hover and keyboard or controller focus share the same presentation.',select('posterHover','Interaction',[['lift','Subtle lift'],['zoom','Gentle zoom'],['reveal','Info reveal'],['flat','Flat / no effects']])+select('posterActions','Existing quick actions',[['auto','Reveal on hover or focus'],['always','Always visible']])+reset('posters'))}
          </section>
          <section id="stPanel-navigation" class="stPanel" role="tabpanel" aria-labelledby="stTab-navigation" hidden>
            ${title('03','NAVIGATION','Your familiar routes.','Arrange the real navigation while keeping account, search, notifications and Studio in reach.')}
            ${select('navLayout','Navigation placement',[['top','Top navigation'],['sidebar','Sidebar']],'Small screens and TV use top navigation for reliable focus.')}
            ${group('Link order','Move links using Up / Down or drag. All essential routes remain available.','<ol class="stOrderList" data-st-order-list="nav" aria-label="Navigation link order"></ol>')}
            ${toggle('navLabels','Show navigation labels','Accessible names remain available with icons.')}
            ${select('navIcons','Icon treatment',[['line','Outline'],['filled','Filled'],['minimal','Minimal']])}
            ${select('navDensity','Item spacing',[['comfortable','Comfortable'],['compact','Compact']])}
            ${select('navActive','Active link',[['pill','Soft pill'],['underline','Underline'],['accent','Accent color']])}${reset('navigation')}
          </section>
          <section id="stPanel-player" class="stPanel" role="tabpanel" aria-labelledby="stTab-player" hidden>
            ${title('04','PLAYER','Let the film lead.','Changes apply to the existing player without restarting playback.')}
            ${select('playerStyle','Control style',[['cinema','Cinema glass'],['minimal','Minimal'],['classic','Classic']])}
            ${range('playerProgress','Progress thickness',2,7,'px')}${toggle('playerTime','Show timestamps')}
            ${range('playerIconScale','Control icon size',85,125)}${range('playerOpacity','Control opacity',60,100)}
            ${select('playerPosition','Control placement',[['floating','Floating bar'],['bottom','Bottom edge']])}
            ${select('playerAutoHide','Hide idle controls after',[[1800,'1.8 seconds'],[2600,'2.6 seconds'],[4000,'4 seconds'],[6000,'6 seconds']],'Touch, hover and keyboard focus bring the controls back.')}
            ${select('playerBackdrop','Loading player background',[['dark','Neutral dark'],['artwork','Artwork blur'],['ambient','Ambient glow']],'Real loading and playback errors always stay visible.')}${reset('player')}
            ${group('Captions','Styles apply to native text captions when a real track is available. Provider-rendered captions may use their own styling.',range('captionSize','Caption text size',75,200)+color('captionColor','Caption text')+range('captionBg','Caption background',0,100)+select('captionEdge','Text edge',[['shadow','Soft shadow'],['outline','Outline'],['none','None']])+'<div class="stCaptionStage"><p data-st-caption-preview>There is a whole world waiting.</p><small>Caption style preview · no track required</small></div>'+reset('captions'))}
          </section>
          <section id="stPanel-atmosphere" class="stPanel" role="tabpanel" aria-labelledby="stTab-atmosphere" hidden>
            ${title('05','ATMOSPHERE','A quiet cinematic glow.','Familiar Aurora, with artwork-aware color when your device allows it.')}
            ${group('Atmosphere','Clean, softly textured, or a little northern light.',choices('backdrop',[['aurora','Aurora'],['smooth','Clean'],['grain','Film grain']],'stSegments stAtmosphere'))}
            <div class="stAuroraSettings" data-st-aurora-settings>
              <span class="stAuroraHeading">AURORA LAB <small>Fine-tune your northern lights</small></span>
              ${group('Light palette','Choose a color for the floating ribbons.',choices('auroraColor',[
                ['glacier','Glacier','<i class="stAuroraSwatch" style="--aurora-swatch:#6adbcf"></i>'],
                ['violet','Violet','<i class="stAuroraSwatch" style="--aurora-swatch:#a193ec"></i>'],
                ['rose','Rose','<i class="stAuroraSwatch" style="--aurora-swatch:#eb9aba"></i>'],
                ['mint','Mint','<i class="stAuroraSwatch" style="--aurora-swatch:#90d9ab"></i>']
              ],'stAuroraColors'))}
              <section class="stGroup"><div class="stGroupHead"><h3>Light intensity</h3><p>From barely-there to an immersive glow.</p></div>
                <label class="stAuroraRangeLabel" for="stAuroraStrength"><span>Brightness</span><output data-st-aurora-strength-value for="stAuroraStrength">80%</output></label>
                <input type="range" id="stAuroraStrength" data-st-aurora-strength min="0" max="100" step="5" value="80" aria-label="Aurora brightness">
              </section>
              ${group('Movement','Subtle motion, a slower drift, or still light.',choices('auroraMotion',[['drift','Drift'],['slow','Slow'],['still','Still']],'stSegments'))}
            </div>
            ${toggle('adaptiveCinema','Adaptive cinema','Soften surrounding chrome with colors sampled once from the current artwork. Unavailable artwork uses a safe fallback.')}
            ${range('adaptiveStrength','Adaptive color intensity',0,65)}
            <p class="stHelp">Adaptive effects simplify during playback, reduced motion and lightweight modes.</p>${reset('atmosphere')}
          </section>
          <section id="stPanel-hud" class="stPanel" role="tabpanel" aria-labelledby="stTab-hud" hidden>
            ${title('06','SOCIAL & AI','Everything in its place.','Adjust presentation while keeping conversations, notifications and every AI form control intact.')}
            ${group('Notification HUD','The current notification panel adapts to your layout.',select('hudPosition','Panel side',[['right','Right'],['left','Left']])+range('hudWidth','Panel width',280,480,'px')+select('hudDensity','Density',[['comfortable','Comfortable'],['compact','Compact']])+range('hudTransparency','Panel opacity',65,100)+select('hudIcons','Icons',[['line','Outline'],['solid','Solid']])+select('hudMotion','Motion',[['subtle','Subtle'],['none','None']])+select('notificationPreview','Notification preview',[['expanded','Expanded'],['compact','Compact']])+select('toastPosition','Toast placement',[['bottom','Bottom'],['top','Top']])+reset('hud'))}
            ${group('AI workspace','Presentation only. Your inputs, actions and recommendation connections keep working.',select('aiSpacing','Spacing',[['comfortable','Comfortable'],['compact','Compact']])+range('aiWidth','Panel width',560,880,'px')+select('aiCards','Preview cards',[['list','List'],['grid','Grid']])+select('aiGlass','Panel material',[['inherit','Use theme glass'],['solid','Solid'],['soft','Soft glass']])+toggle('aiOptions','Expand supporting options','Keep optional supporting panels expanded when you open AI.')+reset('ai'))}
          </section>
          <section id="stPanel-motion" class="stPanel" role="tabpanel" aria-labelledby="stTab-motion" hidden>
            ${title('07','MOTION & LOADING','It should feel effortless.','Responsive movement, with you in control.')}
            <label class="stToggleRow"><span><b>Smooth wheel scrolling</b><small>A short glide for desktop wheels and row arrows.</small></span><input type="checkbox" data-st-setting="smooth" role="switch"></label>
            <label class="stToggleRow"><span><b>Reduce motion</b><small>Keep scrolling native and turn off decorative movement.</small></span><input type="checkbox" data-st-setting="reduceMotion" role="switch"></label>
            ${toggle('pageMotion','Page transitions','A short, cancellable entrance; no changes to scroll speed.')}
            ${group('Loading experience','Honest indeterminate loading ends as soon as content is ready.',select('loaderStyle','Style',[['cinematic','Cinematic fade'],['minimal','Minimal brand'],['artwork','Artwork reveal'],['aurora','Aurora'],['basic','Basic / still']])+range('transitionSpeed','Transition duration',100,400,'ms')+range('loaderDim','Dimming',70,98)+reset('motion'))}
            <div class="stMotionNote"><span>${icon('check')}</span><p>Your device's Reduce motion preference always takes priority. Touch scrolling and video controls stay native.</p></div>
          </section>
          <section id="stPanel-devices" class="stPanel" role="tabpanel" aria-labelledby="stTab-devices" hidden>
            ${title('08','TV & DEVICES','Made for this screen.','Device settings stay in this browser and are excluded from shared themes.')}
            ${select('performancePreset','Performance preset',[['auto','Auto'],['desktop','Desktop Cinematic'],['mobile','Mobile Balanced'],['xbox','Xbox / TV Lightweight'],['minimal','Minimal / Low Power']])}
            <p class="stDeviceSummary" data-st-device-summary role="status"></p>
            ${range('tvScale','TV interface scale',100,130)}
            ${select('tvControls','TV control targets',[['standard','Standard'],['large','Large']],'Applies when TV mode is enabled. Existing A / B and LB / RB controls remain available.')}
            <div class="stMotionNote"><span>${icon('check')}</span><p>Auto uses the screen and TV mode. Lightweight presets flatten glass and keep Aurora still; video quality is unchanged.</p></div>${reset('devices')}
          </section>
          <section id="stPanel-access" class="stPanel" role="tabpanel" aria-labelledby="stTab-access" hidden>
            ${title('09','COMFORT','Comfort comes first.','Keep every surface readable and every control in reach.')}
            <label class="stToggleRow"><span><b>Reduce decorative motion</b><small>Keep scrolling native and turn off decorative movement. Your device preference always takes priority.</small></span><input type="checkbox" data-st-comfort-motion role="switch"></label>
            ${range('uiScale','Interface text size',90,120)}${toggle('highContrast','High contrast','Use a black canvas and bright accents for stronger separation.')}
            ${toggle('reduceTransparency','Reduce transparency','Use opaque surfaces. Your device preference always takes priority.')}
            ${toggle('largeTargets','Larger hit targets','Increase interactive targets to at least 44 pixels where layout permits.')}
            ${select('focusStyle','Focus indicator',[['ring','Clear ring'],['frame','Larger frame']])}
            <p class="stHelp" data-st-access-summary role="status"></p>
            <button type="button" class="stTextAction" data-st-go="player">Open caption settings</button>${reset('access')}
          </section>
          <section id="stPanel-themes" class="stPanel" role="tabpanel" aria-labelledby="stTab-themes" hidden>
            ${title('10','THEMES & PROFILES','Keep your favorite looks.','Named looks, portable files and preferences for each real profile.')}
            <p class="stProfileNotice" data-st-profile-notice>Cross-device sync is unavailable. Looks are saved for this profile in this browser. Export or import to move them to another device.</p>
            ${group('Save a named look','Keep up to 12 looks. Library edits are staged until Save changes.','<label class="stTextLabel">Look name<input type="text" data-st-look-name maxlength="64" placeholder="Late-night cinema" autocomplete="off"></label><label class="stTextLabel">Description<textarea data-st-look-description maxlength="160" rows="2" placeholder="A little warmer, a little quieter."></textarea></label><button type="button" class="stTextAction" data-st-look-add>Save draft as a named look</button><div class="stSavedLooks" data-st-looks aria-label="Named looks"></div>')}
            ${group('Export this look','Move this look to another browser. Device options and private data are excluded.','<div class="stActionRow"><button type="button" class="stTextAction" data-st-export-download>Download theme file</button><button type="button" class="stTextAction" data-st-export-copy>Copy theme JSON</button></div>'+advanced('<details class="stJSONDetails"><summary>View portable JSON</summary><textarea data-st-export-output readonly rows="6" aria-label="Portable theme JSON"></textarea></details>'))}
            ${group('Import a theme','Choose a Swifly Studio theme file, then review it before previewing.','<label class="stTextLabel">Theme file<input type="file" data-st-import-file accept="application/json,.json"></label>'+advanced('<label class="stTextLabel">Or paste theme JSON<textarea data-st-import-text rows="5" spellcheck="false" placeholder="Paste exported theme JSON"></textarea></label><button type="button" class="stTextAction" data-st-import-read>Review pasted JSON</button>')+'<div class="stImportConfirmation" data-st-import-confirm hidden><p data-st-import-summary role="status"></p><div class="stActionRow"><button type="button" class="stTextAction" data-st-import-preview disabled>Preview imported look</button><button type="button" class="stTextAction" data-st-import-dismiss>Dismiss import</button></div><p class="stHelp">Preview is reversible. Use Save changes to keep it.</p></div>')}
          </section>
        </div>
        <aside class="stPreviewColumn">
          <div class="stPreviewLabel"><span data-st-context-label>LIVE PREVIEW</span><i></i></div>
          <div class="stPreview" data-st-preview aria-label="Preview of your appearance settings">
            <div class="stPreviewScene" data-st-preview-scene>
              <div class="stPreviewAurora" data-st-preview-aurora aria-hidden="true"><i class="svAuroraGlow"></i><i class="svAuroraRibbon svAuroraRibbon--first"></i><i class="svAuroraRibbon svAuroraRibbon--second"></i><i class="svAuroraRibbon svAuroraRibbon--third"></i></div>
              <div class="stPreviewNav"><b>SwiflyTV</b><span>Home</span><span>Movies</span><i></i></div>
              <div class="stPreviewCopy"><small>YOUR NEXT GREAT WATCH</small><h3 data-st-preview-title>Movie night, your way.</h3><p>Make yourself comfortable.</p><span class="stPreviewPlay">▶ &nbsp;Play</span></div>
            </div>
            <div class="stPreviewGallery"><h4>Made for your screen</h4><div class="stPreviewPosters">${Array.from({length:4},()=>'<div class="stPreviewPoster"><img alt="" hidden><span aria-hidden="true"></span></div>').join('')}</div><div class="stPreviewLines" aria-hidden="true"><i></i><i></i><i></i></div></div>
          </div>
          <div class="stContextPreview" data-st-context-preview hidden><div data-st-context-nav></div><div data-st-context-player hidden><div class="stMiniProgress"></div><span>▶ &nbsp; 12:34 / 1:42:00 &nbsp; ◉</span><p class="stCaptionMini" data-st-caption-mini>There is a whole world waiting.</p></div><div data-st-context-hud hidden><b>Notifications</b><p>Your new notifications appear here.</p><small>Style preview</small></div><div data-st-context-loader hidden><span class="stMiniLoader">S</span><p>Loading your next watch</p><small>Indeterminate style preview</small></div></div>
          <div class="stPreviewSummary"><strong data-st-look-label>Your look</strong><span data-st-preview-description>Changes appear here and on your screen.</span></div>
          <p class="stPreviewFootnote">Preview uses artwork from the page you're browsing. Your library stays yours.</p>
        </aside>
      </div>
      <footer class="stFooter"><p role="status" aria-live="polite" data-st-status>No unsaved changes</p><div><button type="button" class="stTextAction" data-st-reload hidden>Reload saved</button><button type="button" class="stCancel" data-st-cancel>Cancel</button><button type="button" class="stSave" data-st-save disabled>Save changes ${icon('arrow')}</button></div></footer>
    </div>
  </dialog>`.replace(/>\s+</g,'><').trim();
}
module.exports={studioMarkup};
