'use strict';
// Keep visual QA reproducible in the browser-enabled CI runner. Local
// restricted runtimes still run the same service and controller regressions.
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const files=fs.readdirSync('tests').filter(file=>/\.test\.cjs$/.test(file)&&(
  /^(native-sections-browser|player-layout|study-browser|details-fluidity-rendering|premium-scroll-rendering|hero-glass-backdrop|tv-player-rendering|tv-rendering|tv-xbox-rendering|connected-cinema-rendering)\.test\.cjs$/.test(file)||
  /(catalog-experience|community|audiobook|kids|episode|study-scenic).*(browser|rendering)/.test(file)
)).map(file=>'tests/'+file);
if(files.length<5)throw Error('The required experience browser suites were not found.');
console.log('Experience QA suites: '+files.join(', '));
fs.mkdirSync(process.env.SWIFLY_EXPERIENCE_SCREENSHOT_DIR||'qa-artifacts',{recursive:true});
const result=spawnSync(process.execPath,['--test','--test-concurrency=2',...files],{stdio:'inherit',env:process.env});
process.exit(result.status??1);
