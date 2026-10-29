'use strict';
const fs=require('node:fs'),path=require('node:path');
const {minify_sync}=require('terser');
// Trusted local code is inlined once so no request or delayed font can flash
// another profile's theme before the first content frame.
// Compile once at startup; the validated config still runs before first paint.
const config=minify_sync(fs.readFileSync(path.join(__dirname,'../public/studio/config.js'),'utf8'),{ecma:2020}).code;
const studioHead=()=>'<script data-sv-studio-config>'+config+'</script>';
const studioPrime=()=>'<script data-sv-studio-prime>try{const C=window.SwiflyStudioConfig;C.apply(C.read(localStorage).values);}catch{window.SwiflyStudioConfig.apply(window.SwiflyStudioConfig.defaults);}</script>';
module.exports={studioHead,studioPrime};
