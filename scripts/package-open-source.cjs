#!/usr/bin/env node
'use strict';
// Reproducible, source-only public preview. No credentials, runtime data or git history.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const output=path.resolve(process.argv[2]||path.join(root,'build','swiflytv-open-source-preview'));
if(output===root||root.startsWith(output+path.sep))throw Error('Refusing to package into a parent of the repo');
const roots=new Set(['public','frontend','lib','ui','scripts','tests','vendor','docs','.github']);
const rootFiles=new Set(['.dockerignore','.env.example','.gitignore','Dockerfile','README.md','CONTRIBUTING.md','SECURITY.md','OPEN_SOURCE_RELEASE.md','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','server.js','render.yaml','vite.config.mjs','LICENSE','LICENSE.md','LICENSE.txt']);
const excluded=[/^docs\\/(?:evidence|superpowers)\\//,/^docs\\/SWIFLYTV_(?:STATUS|REVIEW|NATIVE_REVIEW)\\.md$/,/^docs\\/ai-model-comparison\\.json$/,/^tests\\/.*(?:playwright-report|test-results)\\//,/^\\.github\\/ISSUE_TEMPLATE\\/config\\.yml$/];
function allowed(file){
 const parts=file.split('/');
 if(parts.some(x=>x==='..'||x==='node_modules'||x==='dist'||x==='.git'||x==='.swifly-data'||x==='.qa-data'||x==='.swifly-models'||x==='.superpowers'))return false;
 if(excluded.some(x=>x.test(file)))return false;
 if(/(?:^|\\/)\\.env(?:\\.|$)/.test(file)&&file!=='.env.example')return false;
 if(/(?:^|\\/)(?:id_rsa|id_ed25519|credentials(?:\\.json)?|secrets?\\.json)$/i.test(file))return false;
 if(/\\.(?:key|pem|p12|pfx|sqlite|sqlite3|db|log|zip|tar|tgz|gz)$/i.test(file))return false;
 return parts.length===1?rootFiles.has(file):roots.has(parts[0]);
}
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:20*1024*1024}).toString('utf8').split('\\0').filter(Boolean);
if(tracked.length<100)throw Error('Unexpectedly small checkout; aborting incomplete release');
if(fs.existsSync(output))fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(output,{recursive:true});
const hashes=[],excludedPaths=[],included=[];let size=0;
for(const file of tracked){
 if(!allowed(file)){excludedPaths.push(file);continue;}
 const from=path.join(root,file),stat=fs.lstatSync(from);
 if(!stat.isFile())throw Error('Unexpected non-regular file: '+file);
 const data=fs.readFileSync(from);
 if(data.includes(Buffer.from('-----BEGIN PRIVATE KEY-----'))||data.includes(Buffer.from('-----BEGIN OPENSSH PRIVATE KEY-----')))throw Error('Private key material detected in '+file);
 const to=path.join(output,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,data);
 hashes.push(crypto.createHash('sha256').update(data).digest('hex')+'  '+file);included.push(file);size+=data.length;
}
const required=['server.js','package.json','package-lock.json','README.md','ui/kids.js','public/kids/kids.js','public/kids/kids.css','scripts/start-react.cjs'];
for(const file of required)if(!included.includes(file))throw Error('Required app file absent: '+file);
hashes.sort();fs.writeFileSync(path.join(output,'SHA256SUMS.txt'),hashes.join('\\n')+'\\n');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const report={sourceCommit:commit,files:included.length,uncompressedBytes:size,excludedFiles:excludedPaths.length,notes:['Source ZIP: dependencies and generated dist are not bundled','No .git history, .env secrets, runtime databases, or prior QA screenshots','License is pending maintainer selection: not yet a legally licensed open-source release','Media assets and third-party integrations require rights review before public distribution']};
fs.writeFileSync(path.join(output,'RELEASE_MANIFEST.json'),JSON.stringify(report,null,2)+'\\n');
process.stdout.write(JSON.stringify({output,...report},null,2)+'\\n');
