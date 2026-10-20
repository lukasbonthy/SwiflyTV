'use strict';

const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const paths={
  lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  play:'<path d="m9 5 11 7-11 7V5Z"/>',
  together:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m3 9v-2a6 6 0 0 0-2-4"/>',
  screen:'<rect x="3" y="4" width="18" height="13" rx="3"/><path d="M8 21h8m-4-4v4"/>',
  chevron:'<path d="m8 10 4 4 4-4"/>',
  warning:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v.01"/>'
};
const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';

function accessPage(next,invalid=false,limited=false){
  const error=limited?'Too many attempts. Give it a few minutes, then try again.':invalid?'That code doesn’t look right. Check it with your host and try again.':'';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#080b12"><title>You're invited · SwiflyTV</title>
<style>
*{box-sizing:border-box}html{color-scheme:dark;background:#080b12}body{margin:0;color:#f4f6fb;font-family:Inter,"SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}button,input,summary{-webkit-tap-highlight-color:transparent}button,input{font:inherit}svg{display:block;width:20px;height:20px;flex:none}button{cursor:pointer}[hidden]{display:none!important}
.access-shell{position:relative;isolation:isolate;display:flex;flex-direction:column;min-height:100svh;overflow:hidden}
.access-ambient{position:absolute;inset:0;z-index:-2;overflow:hidden;pointer-events:none;background:radial-gradient(ellipse at 77% 42%,#283c632b,transparent 51%),radial-gradient(ellipse at 5% 95%,#18313825,transparent 50%),#080b12}
.access-ambient svg{position:absolute;left:7%;top:-18%;width:125%;height:130%;opacity:.8}.access-ambient:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#080b1280 5%,transparent 60%),linear-gradient(0deg,#080b12 0%,transparent 23%,transparent 80%,#080b12c9 100%)}
.access-header,.access-footer{width:min(100% - 96px,1320px);margin-inline:auto;display:flex;align-items:center;justify-content:space-between;gap:20px;position:relative}
.access-header{padding-block:35px}.access-brand{display:flex;align-items:center;gap:11px;font-size:23px;font-weight:760;letter-spacing:-1.2px;color:#f5f7fc}.access-brand-mark{display:grid;place-items:center;width:31px;height:34px;border-radius:10px;background:linear-gradient(145deg,#d6e8fc,#7199c3);box-shadow:inset 0 1px #fff8,0 0 35px #b6d6ff12;color:#101a29;transform:rotate(-6deg)}.access-brand-mark svg{width:20px;height:20px;fill:currentColor;stroke:none;transform:rotate(6deg) translateX(-1px)}.access-brand span:last-child{font-weight:450;color:#a6b3c7;margin-left:1px}
.access-private{display:flex;align-items:center;gap:8px;color:#8d98aa;font-size:11px;letter-spacing:.02em}.access-private svg{width:13px;height:13px}
.access-stage{width:min(100% - 144px,1120px);margin:auto;flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(350px,420px);align-items:center;gap:clamp(55px,8vw,130px);padding:64px 0 86px}
.access-eyebrow{display:flex;align-items:center;gap:10px;color:#a1b4cc;font-size:10px;font-weight:650;letter-spacing:.19em;text-transform:uppercase;margin:0 0 25px}.access-eyebrow:before{content:"";width:21px;height:1px;background:#9eb8db}
.access-intro h1{margin:0;font-size:clamp(54px,5.7vw,82px);font-weight:580;line-height:1.055;letter-spacing:-.065em}.access-intro h1 span{display:block;color:#9eaec4}.access-description{max-width:345px;margin:26px 0 0;font-size:15px;line-height:1.8;color:#8c98ac;letter-spacing:-.01em}
.access-features{display:flex;flex-wrap:wrap;gap:24px;margin-top:40px;color:#a6b2c2;font-size:10px;letter-spacing:.015em}.access-features span{display:flex;align-items:center;gap:8px}.access-features svg{width:15px;height:15px;color:#99b1d0}
.access-card{position:relative;padding:34px;border:1px solid #c9dfff26;border-top-color:#e5efff42;border-radius:27px;background:linear-gradient(145deg,#c0d8ff0d,#b0c8eb05 65%,#ffffff04),#101722a3;box-shadow:0 30px 90px #0005,inset 0 1px #ffffff0b;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);animation:access-enter .55s cubic-bezier(.2,.7,.2,1) both}
.access-card:before{content:"";position:absolute;left:24%;right:24%;top:-1px;height:1px;background:linear-gradient(90deg,transparent,#c0d9f9aa,transparent)}
.access-invitation{display:flex;align-items:center;gap:12px;margin-bottom:29px}.access-invitation-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:13px;background:linear-gradient(145deg,#d4e5ff1c,#aec5e209);box-shadow:inset 0 0 0 1px #d8e8ff22,inset 0 1px #dbeaff1a;color:#bdd0e8}.access-invitation-icon svg{width:18px;height:18px}.access-invitation p{margin:0;color:#a4b5cd;font-size:9px;font-weight:650;letter-spacing:.17em;text-transform:uppercase}.access-invitation small{display:block;margin-top:5px;color:#6e7f98;font-size:10px;letter-spacing:.01em}
.access-card h2{margin:0;font-size:32px;font-weight:560;letter-spacing:-.045em;line-height:1.18}.access-card-description{margin:11px 0 30px;color:#91a0b5;font-size:12px;line-height:1.75}
.access-field-label{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px}.access-field-label label{font-size:10px;font-weight:550;letter-spacing:.025em;color:#b4c2d5}.access-count{color:#728198;font-size:9px;font-variant-numeric:tabular-nums;letter-spacing:.08em}
.access-code-control{position:relative}.access-code-control input{display:block;width:100%;height:64px;padding:0 15px;border:1px solid #96b3d944;border-radius:12px;background:#070d1699;color:#f3f7ff;outline:none;text-align:center;font-size:27px;letter-spacing:.2em;font-variant-numeric:tabular-nums}.access-code-control input:focus{border-color:#b8d2f0;box-shadow:0 0 0 3px #95b8e41c}.access-code-control input::placeholder{color:#4d5e75}.access-slots{display:none}
.access-enhanced .access-slots{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;pointer-events:none}.access-enhanced .access-code-control input{position:absolute;inset:0;height:100%;padding:0;border:0;background:transparent;color:transparent;caret-color:transparent;box-shadow:none;z-index:2}.access-enhanced .access-code-control input::placeholder{color:transparent}.access-enhanced .access-code-control input::selection{background:transparent;color:transparent}
.access-slot{display:grid;place-items:center;position:relative;height:64px;min-width:0;border:1px solid #b0c9eb2b;border-top-color:#c0d4ee3c;border-radius:11px;background:linear-gradient(145deg,#a7c3eb08,transparent),#060c1594;box-shadow:inset 0 1px 3px #0003;color:#e7f1ff;font-size:27px;font-weight:500;font-variant-numeric:tabular-nums;transition:border-color .16s,box-shadow .16s,background .16s}.access-slot[data-filled]{border-color:#b7d0ef48;background-color:#1826396b}.access-code-control:focus-within .access-slot[data-current]{border-color:#bdd9fc;box-shadow:0 0 0 3px #9ec5f519,inset 0 0 20px #b9d9ff06}.access-code-control:focus-within .access-slot[data-current]:empty:after{content:"";width:1px;height:23px;background:#cbe0fc;animation:access-caret 1.1s step-end infinite}
.access-code-control[data-invalid] .access-slot{border-color:#c37b8b88}.access-code-control[data-invalid] input:not(:focus){border-color:#c37b8b88}.access-error{display:flex;align-items:flex-start;gap:8px;margin:13px 0 0;color:#efacba;font-size:11px;line-height:1.7}.access-error svg{width:14px;height:14px;margin-top:2px}
.access-submit{position:relative;display:flex;align-items:center;justify-content:center;gap:11px;width:100%;min-height:52px;margin-top:23px;padding:14px;border:1px solid #edf6ff70;border-radius:12px;background:linear-gradient(135deg,#e6eef9,#c6d9ed);box-shadow:inset 0 1px #fff9,0 5px 18px #adcfff0a;color:#122033;font-size:14px;font-weight:650;letter-spacing:-.01em;transition:transform .16s,box-shadow .16s,opacity .16s}.access-submit svg{width:17px;height:17px}.access-submit:not(:disabled):hover{transform:translateY(-1px);box-shadow:inset 0 1px #fff9,0 6px 24px #accdfb22}.access-submit:disabled{cursor:default;opacity:.66}.access-submit:focus-visible,.access-help summary:focus-visible{outline:2px solid #c0dfff;outline-offset:5px}.access-spinner{display:none;width:15px;height:15px;border:1.5px solid #19345040;border-top-color:#193450;border-radius:50%;animation:access-spin .7s linear infinite}.access-form[aria-busy="true"] .access-spinner{display:block}.access-form[aria-busy="true"] .access-submit svg{display:none}
.access-remember{display:flex;align-items:center;justify-content:center;gap:6px;color:#6f8097;font-size:9px;margin:14px 0 0}.access-remember svg{width:11px;height:11px}
.access-help{border-top:1px solid #dceaff12;margin-top:27px;padding-top:19px;text-align:center}.access-help summary{display:inline-flex;align-items:center;gap:4px;list-style:none;min-height:44px;color:#9aabc2;font-size:10px;cursor:pointer}.access-help summary::-webkit-details-marker{display:none}.access-help summary svg{width:13px;height:13px;transition:transform .15s}.access-help[open] summary svg{transform:rotate(180deg)}.access-help p{font-size:11px;line-height:1.7;color:#8f9fb5;margin:10px 0 0}
.access-footer{padding:22px 0 25px;border-top:1px solid #b7c8e611;color:#596a83;font-size:9px;letter-spacing:.02em}.access-footer span:first-child{letter-spacing:.12em;text-transform:uppercase}.access-footer span:last-child{display:flex;align-items:center;gap:6px}.access-footer svg{width:11px;height:11px}
@keyframes access-enter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@keyframes access-caret{50%{opacity:0}}@keyframes access-spin{to{transform:rotate(360deg)}}
@media(min-width:1600px){.access-stage{padding-bottom:110px}}
@media(max-width:1000px){.access-stage{width:calc(100% - 88px);gap:40px;grid-template-columns:minmax(0,1fr) minmax(320px,380px)}.access-intro h1{font-size:58px}.access-features{gap:15px;flex-direction:column}.access-card{padding:30px}.access-ambient svg{left:-12%;width:155%;opacity:.65}}
@media(max-width:900px){.access-header,.access-footer{width:calc(100% - 44px)}.access-header{padding-block:25px}.access-brand{font-size:21px}.access-brand-mark{width:27px;height:29px;border-radius:8px}.access-private{font-size:9px}.access-stage{width:min(100% - 40px,420px);display:flex;flex-direction:column;gap:24px;padding:20px 0 28px;justify-content:center}.access-intro{text-align:center}.access-eyebrow{justify-content:center;margin-bottom:15px;font-size:8px;letter-spacing:.15em}.access-eyebrow:before{width:14px}.access-intro h1{font-size:clamp(30px,9vw,38px);letter-spacing:-.055em;line-height:1.08}.access-description{display:none}.access-features{display:none}.access-card{width:100%;padding:27px;border-radius:23px}.access-invitation{margin-bottom:24px}.access-card h2{font-size:28px}.access-card-description{margin-bottom:26px}.access-footer{font-size:8px;padding-block:18px}.access-footer span:first-child{letter-spacing:.05em}.access-ambient svg{width:250%;left:-105%;top:-15%;height:100%}}
@media(max-width:360px){.access-stage{width:calc(100% - 32px);gap:24px;padding-top:17px}.access-header,.access-footer{width:calc(100% - 36px)}.access-private{gap:5px;font-size:8px}.access-intro h1{font-size:30px}.access-card{padding:23px}.access-slots{gap:6px!important}.access-slot{height:58px;font-size:24px}.access-card h2{font-size:27px}.access-footer{flex-direction:column;gap:10px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media(prefers-reduced-transparency:reduce){.access-card{background:#101722;backdrop-filter:none;-webkit-backdrop-filter:none}.access-slot{background:#0a101a}}
</style></head>
<body><div class="access-shell">
<div class="access-ambient" aria-hidden="true"><svg viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="access-ribbon" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#426d9c" stop-opacity="0"/><stop offset=".35" stop-color="#8bb4df" stop-opacity=".2"/><stop offset=".6" stop-color="#8da8d9" stop-opacity=".15"/><stop offset="1" stop-color="#415475" stop-opacity="0"/></linearGradient><linearGradient id="access-rim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b2d3fc" stop-opacity="0"/><stop offset=".5" stop-color="#b2d3fc" stop-opacity=".28"/><stop offset="1" stop-color="#b2d3fc" stop-opacity="0"/></linearGradient></defs><path d="M1180-230C900 90 360 30 415 490s870 80 750 760" fill="none" stroke="url(#access-ribbon)" stroke-width="190"/><path d="M1250-230C970 90 430 30 485 490s870 80 750 760" fill="none" stroke="url(#access-rim)" stroke-width="1"/><path d="M1080-230C800 90 260 30 315 490s870 80 750 760" fill="none" stroke="url(#access-rim)" stroke-width="1"/></svg></div>
<header class="access-header"><div class="access-brand" aria-label="SwiflyTV"><span class="access-brand-mark">${icon('play')}</span><div>Swifly<span>TV</span></div></div><span class="access-private">${icon('lock')}Private access</span></header>
<main class="access-stage">
<section class="access-intro" aria-labelledby="access-title"><p class="access-eyebrow">A little closer to your people</p><h1 id="access-title">Great stories.<span>Better company.</span></h1><p class="access-description">Movies and series. Shared with the people who make them better.</p><div class="access-features" aria-label="SwiflyTV"><span>${icon('screen')}Movies &amp; series</span><span>${icon('together')}Watch together</span></div></section>
<section class="access-card" aria-labelledby="access-card-title"><div class="access-invitation"><span class="access-invitation-icon">${icon('lock')}</span><div><p>Your private cinema</p><small>Good company starts here.</small></div></div><h2 id="access-card-title">You’re invited.</h2><p class="access-card-description">Enter the code from your host.<br>We’ve saved you a seat.</p>
<form class="access-form" method="post" action="/access"${limited?' data-access-limited="true"':''}><input type="hidden" name="next" value="${escapeHtml(next)}"><div class="access-field-label"><label for="code">6-digit access code</label><span class="access-count" aria-hidden="true"><span data-access-count>0</span> / 6</span></div><div class="access-code-control"${error?' data-invalid="true"':''}><input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code" enterkeyhint="go" placeholder="••••••" required autofocus aria-describedby="${error?'access-error ':''}access-remember"${error?' aria-invalid="true"':''}><div class="access-slots" aria-hidden="true">${Array.from({length:6},()=>'<span class="access-slot" data-access-slot></span>').join('')}</div></div><p id="access-error" class="access-error" role="alert"${error?'':' hidden'}>${icon('warning')}<span>${error}</span></p><button class="access-submit" type="submit"><span data-access-submit-label>Enter SwiflyTV</span>${icon('arrow')}<span class="access-spinner" aria-hidden="true"></span></button><p id="access-remember" class="access-remember">${icon('lock')}Your access stays saved on this device.</p></form>
<details class="access-help"><summary>Need a code?${icon('chevron')}</summary><p>Ask the person who invited you for their six-digit access code.</p></details></section>
</main><footer class="access-footer"><span>Some stories are better together.</span><span>${icon('lock')}Just for your circle.</span></footer></div>
<script>
(()=>{'use strict';
const form=document.querySelector('.access-form'),input=form.elements.code;
const slots=[...form.querySelectorAll('[data-access-slot]')],count=form.querySelector('[data-access-count]');
const button=form.querySelector('button[type="submit"]'),label=form.querySelector('[data-access-submit-label]');
const error=form.querySelector('#access-error'),control=form.querySelector('.access-code-control');
let busy=false;
function update(){
 const value=input.value,position=Math.min(input.selectionStart??value.length,5);
 slots.forEach((slot,index)=>{slot.textContent=value[index]||'';slot.toggleAttribute('data-filled',index<value.length);slot.toggleAttribute('data-current',index===position);});
 count.textContent=String(value.length);button.disabled=busy||value.length!==6;
}
function edited(){
 if(form.dataset.accessLimited!=='true'){error.hidden=true;input.removeAttribute('aria-invalid');input.setAttribute('aria-describedby','access-remember');control.removeAttribute('data-invalid');}
 update();
}
input.addEventListener('input',()=>{
 const position=(input.value.slice(0,input.selectionStart??input.value.length).replace(/[^0-9]/g,'')).length;
 input.value=input.value.replace(/[^0-9]/g,'').slice(0,6);input.setSelectionRange(position,position);edited();
});
input.addEventListener('paste',event=>{
 if(!event.clipboardData)return;event.preventDefault();
 const digits=event.clipboardData.getData('text').replace(/[^0-9]/g,'');
 const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
 input.value=(input.value.slice(0,start)+digits+input.value.slice(end)).slice(0,6);
 const cursor=Math.min(start+digits.length,6);input.setSelectionRange(cursor,cursor);edited();
});
input.addEventListener('click',event=>{
 if(event.detail){
  const box=control.getBoundingClientRect();
  if(box.width){
   const index=Math.max(0,Math.min(5,Math.floor((event.clientX-box.left)*6/box.width)));
   const start=Math.min(index,input.value.length);input.setSelectionRange(start,Math.min(start+1,input.value.length));
  }
 }
 update();
});
for(const name of ['focus','keyup','select'])input.addEventListener(name,update);
form.addEventListener('submit',event=>{
 if(busy||!/^[0-9]{6}$/.test(input.value)){event.preventDefault();return;}
 busy=true;form.setAttribute('aria-busy','true');label.textContent='Opening your cinema…';update();
});
window.addEventListener('pageshow',()=>{busy=false;form.removeAttribute('aria-busy');label.textContent='Enter SwiflyTV';update();});
update();form.classList.add('access-enhanced');
})();
</script></body></html>`;
}

module.exports={accessPage};
