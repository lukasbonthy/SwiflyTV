'use strict';
function watchroomCallMarkup() {
 return `<section class="svWatchroomCall" data-watchroom-call aria-label="Watchroom call" hidden>
  <header class="svCallHeading"><div><span class="dsEyebrow">Together, live</span><h3>Watchroom call <small data-call-count>0 / 8</small></h3></div><button type="button" class="dsSecondaryBtn" data-call-join>Join call</button><button type="button" class="dsSecondaryBtn" data-call-leave hidden>Leave call</button></header>
  <p class="svCallDescription">Join to listen. Your microphone and camera stay off until you enable them. Enabled devices are shared with people in this watchroom.</p>
  <div class="svCallControls" data-call-controls hidden><button type="button" class="dsSecondaryBtn" data-call-audio aria-pressed="false">Mic off</button><button type="button" class="dsSecondaryBtn" data-call-video aria-pressed="false">Camera off</button><button type="button" class="dsSecondaryBtn" data-call-unlock hidden>Enable call sound</button></div>
  <p class="svCallStatus" data-call-status role="status" aria-live="polite"></p>
  <div class="svCallTiles" data-call-tiles aria-label="Call participants"><article class="svCallTile" data-call-local hidden><video autoplay muted playsinline aria-label="Your camera preview"></video><div class="svCallAvatar" aria-hidden="true">You</div><p><b>You</b><span data-call-local-state>Mic off · Camera off</span></p></article></div>
 </section>`;
}
module.exports={watchroomCallMarkup};
