'use strict';
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
process.chdir(root);
let server,watcher,stopping=false,restarting=false;
function launch(){
  if(stopping)return;
  server=spawn(process.execPath,['scripts/start-react.cjs'],{cwd:root,stdio:'inherit',env:{...process.env,PORT:process.env.PORT||'4173'}});
  server.on('error',error=>console.error('[dev server]',error.message));
}
function restart(){
  if(stopping||restarting)return;
  if(!server||server.exitCode!==null)return launch();
  restarting=true;server.once('exit',()=>{restarting=false;launch();});server.kill();
}
async function stop(){stopping=true;server?.kill();await watcher?.close();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
(async()=>{
  const {build}=await import('vite');
  // Keep prior assets until a successful build; restart after END so the
  // server renderer and browser entry always use the same source revision.
  watcher=await build({configFile:path.join(root,'vite.config.mjs'),build:{watch:{},emptyOutDir:false}});
  watcher.on('event',event=>{
    if(event.code==='END')restart();
    else if(event.code==='ERROR')console.error('[Vite watch]',event.error?.message||event.error);
  });
})().catch(error=>{console.error(error);process.exitCode=1;});
