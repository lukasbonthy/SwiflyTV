'use strict';
// Keep visual QA reproducible in the browser-enabled CI runner. Local
// restricted runtimes still run the same service and controller regressions.
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const group=process.argv[2]||'all';
if(!['all','screening','native','cinema'].includes(group))throw Error('Choose a known experience group.');
const cinema=/(player-layout|details-fluidity|premium-scroll|hero-glass|tv-player|tv-rendering|tv-xbox|connected-cinema|episode)/;
const files=fs.readdirSync('tests').filter(file=>/\.test\.cjs$/.test(file)&&(
  /^(native-sections-browser|player-layout|study-browser|details-fluidity-rendering|premium-scroll-rendering|hero-glass-backdrop|tv-player-rendering|tv-rendering|tv-xbox-rendering|connected-cinema-rendering)\.test\.cjs$/.test(file)||
  /(movie-nights|catalog-experience|community|audiobook|kids|episode|study-scenic).*(browser|rendering)/.test(file)
)).filter(file=>group==='all'||(group==='screening'?/movie-nights/.test(file):group==='cinema'?cinema.test(file):!/movie-nights/.test(file)&&!cinema.test(file))).map(file=>'tests/'+file);
if(!files.length||group==='all'&&files.length<5)throw Error('The required experience browser suites were not found.');
console.log('Experience QA suites: '+files.join(', '));
fs.mkdirSync(process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR||'qa-artifacts',{recursive:true});
const result=spawnSync(process.execPath,['--test','--test-concurrency=2',...files],{stdio:'inherit',env:process.env});
process.exit(result.status??1);
